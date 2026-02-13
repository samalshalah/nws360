import { storage } from "./storage";

const LEARNING_INTERVAL = 7 * 24 * 60 * 60 * 1000;
const ALERT_TYPES = ["volume_spike", "sentiment_shift", "emerging_topic", "narrative_change"];

async function analyzeFeedback() {
  console.log("[Learning] Analyzing user feedback...");
  const clients = await storage.getClients();

  for (const client of clients) {
    const users = await storage.getUsersByClientId(client.id);
    const userIds = users.map(u => u.id);
    if (userIds.length === 0) continue;

    let clientFeedback: any[] = [];
    for (const uid of userIds) {
      const fb = await storage.getUserFeedback({ userId: uid });
      clientFeedback.push(...fb);
    }
    if (clientFeedback.length === 0) continue;

    const featureStats: Record<string, { useful: number; unclear: number; wrong: number; total: number }> = {};
    for (const f of clientFeedback) {
      if (!featureStats[f.feature]) {
        featureStats[f.feature] = { useful: 0, unclear: 0, wrong: 0, total: 0 };
      }
      featureStats[f.feature].total++;
      if (f.rating === "useful" || f.rating === "helpful" || f.rating === "accurate") {
        featureStats[f.feature].useful++;
      } else if (f.rating === "unclear") {
        featureStats[f.feature].unclear++;
      } else {
        featureStats[f.feature].wrong++;
      }
    }

    console.log(`[Learning] Feedback analysis (client=${client.id}):`, JSON.stringify(featureStats));
  }
}

async function recalibrateAlertThresholds() {
  console.log("[Learning] Recalibrating alert thresholds...");
  const clients = await storage.getClients();

  for (const client of clients) {
    const users = await storage.getUsersByClientId(client.id);
    const userIds = users.map(u => u.id);
    if (userIds.length === 0) continue;

    let clientEngagement: any[] = [];
    for (const uid of userIds) {
      const eng = await storage.getInsightEngagement({ userId: uid, insightType: "alert" });
      clientEngagement.push(...eng);
    }
    if (clientEngagement.length === 0) {
      console.log(`[Learning] No alert engagement data for client ${client.id}, skipping recalibration`);
      continue;
    }

    let clientFeedback: any[] = [];
    for (const uid of userIds) {
      const fb = await storage.getUserFeedback({ userId: uid, feature: "alert" });
      clientFeedback.push(...fb);
    }
    const alertFeedback = clientFeedback.filter((f: any) => f.targetType === "alert");

    const DAMPENING_FACTOR = 0.3;
    const existingPrefs = await storage.getAlertPreferences(client.id);
    const prefMap: Record<string, number> = {};
    for (const p of existingPrefs) {
      if (p.alertType) prefMap[p.alertType] = p.sensitivityScore ?? 50;
    }

    for (const alertType of ALERT_TYPES) {
      const relevantFeedback = alertFeedback.filter((f: any) => {
        return f.comment?.includes(alertType) || f.targetType === alertType;
      });

      if (relevantFeedback.length < 5) continue;

      const helpfulCount = relevantFeedback.filter((f: any) => f.rating === "helpful" || f.rating === "useful").length;
      const noisyCount = relevantFeedback.filter((f: any) => f.rating === "noisy" || f.rating === "wrong").length;
      const total = helpfulCount + noisyCount;
      if (total === 0) continue;

      const helpfulRatio = helpfulCount / total;
      let targetSensitivity = 50;
      if (helpfulRatio > 0.7) {
        targetSensitivity = Math.min(80, 50 + Math.round((helpfulRatio - 0.5) * 60));
      } else if (helpfulRatio < 0.3) {
        targetSensitivity = Math.max(20, 50 - Math.round((0.5 - helpfulRatio) * 60));
      }

      const currentSensitivity = prefMap[alertType] ?? 50;
      const newSensitivity = Math.round(currentSensitivity + DAMPENING_FACTOR * (targetSensitivity - currentSensitivity));
      const clampedSensitivity = Math.max(20, Math.min(80, newSensitivity));

      if (Math.abs(clampedSensitivity - currentSensitivity) < 2) {
        console.log(`[Learning] ${alertType} sensitivity for client ${client.id} stable at ${currentSensitivity}, skipping`);
        continue;
      }

      await storage.upsertAlertPreference({
        clientId: client.id,
        alertType,
        sensitivityScore: clampedSensitivity,
        autoTuned: true,
      });
      console.log(`[Learning] Updated ${alertType} sensitivity for client ${client.id}: ${currentSensitivity} -> ${clampedSensitivity} (target: ${targetSensitivity}, dampened)`);
    }
  }
}

async function refreshRecommendations() {
  console.log("[Learning] Refreshing dashboard recommendations...");
  const clients = await storage.getClients();

  for (const client of clients) {
    const users = await storage.getUsersByClientId(client.id);

    for (const user of users) {
      const engagement = await storage.getInsightEngagement({ userId: user.id });
      if (engagement.length === 0) continue;

      const interactions: Record<string, number> = {};
      for (const e of engagement) {
        const key = `${e.insightType}:${e.insightId}`;
        interactions[key] = (interactions[key] || 0) + (e.clicked ? 2 : 1);
      }

      const sorted = Object.entries(interactions).sort((a, b) => b[1] - a[1]);
      const topInteractions = sorted.slice(0, 5).map(([key]) => key.split(":")[0]);
      const uniqueTypes = Array.from(new Set(topInteractions));

      const existing = await storage.getDashboardPreferences(user.id);
      if (!existing) {
        await storage.upsertDashboardPreferences({
          userId: user.id,
          recommendedPanels: uniqueTypes.map(t => ({ type: t, reason: "Based on your engagement" })),
          autoSuggested: true,
        });
        console.log(`[Learning] Created recommendations for user ${user.id} (client=${client.id})`);
      }
    }
  }
}

async function growKnowledgeBase() {
  console.log("[Learning] Growing knowledge base from corrections...");
  const clients = await storage.getClients();

  for (const client of clients) {
    const users = await storage.getUsersByClientId(client.id);

    let clientCorrections: any[] = [];
    for (const user of users) {
      const corr = await storage.getAiCorrections({ userId: user.id, status: "accepted" });
      clientCorrections.push(...corr);
    }
    if (clientCorrections.length === 0) continue;

    const correctionPatterns: Record<string, { count: number; oldValues: string[]; newValues: string[] }> = {};
    for (const c of clientCorrections) {
      const pattern = `${c.field} correction`;
      if (!correctionPatterns[pattern]) {
        correctionPatterns[pattern] = { count: 0, oldValues: [], newValues: [] };
      }
      correctionPatterns[pattern].count++;
      if (c.oldValue) correctionPatterns[pattern].oldValues.push(c.oldValue);
      correctionPatterns[pattern].newValues.push(c.newValue);
    }

    for (const [pattern, data] of Object.entries(correctionPatterns)) {
      if (data.count >= 3) {
        const mostCommonNew = getMostCommon(data.newValues);
        await storage.upsertKnowledgeEntry({
          questionPattern: `Common ${pattern}`,
          answerSummary: `Users frequently correct ${pattern}. Most common correction: "${mostCommonNew}" (${data.count} corrections)`,
          queryCount: data.count,
        });
        console.log(`[Learning] Added knowledge entry: ${pattern} (${data.count} corrections, client=${client.id})`);
      }
    }
  }
}

function getMostCommon(arr: string[]): string {
  const counts: Record<string, number> = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

async function generateMonthlyValueReports() {
  console.log("[Learning] Generating monthly value reports...");
  const clients = await storage.getClients();
  const now = new Date();

  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const reportMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = prevMonthDate;
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

  if (now.getDate() < 2) {
    console.log("[Learning] Too early in the month to generate previous month report, skipping");
    return;
  }

  for (const client of clients) {
    const existing = await storage.getValueReports(client.id);
    if (existing.some((r: any) => r.reportMonth === reportMonth)) continue;

    const articleResult = await storage.getArticles({
      clientId: client.id,
      startDate: monthStart.toISOString(),
      endDate: monthEnd.toISOString(),
    });
    const briefs = await storage.getDailyBriefs(31, client.id);
    const monthBriefs = briefs.filter((b: any) => {
      const d = new Date(b.date);
      return d >= monthStart && d < monthEnd;
    });
    const events = await storage.getDetectedEvents({ limit: 500, clientId: client.id });
    const monthEvents = events.filter((e: any) => {
      const d = new Date(e.detectedAt);
      return d >= monthStart && d < monthEnd;
    });

    await storage.createValueReport({
      clientId: client.id,
      reportMonth,
      alertsDetected: monthEvents.length,
      emergingTopicsCaught: monthBriefs.reduce((sum: number, b: any) => sum + ((b.emergingTopics as any[])?.length || 0), 0),
      sentimentChanges: articleResult.items.filter((a: any) => a.sentimentLabel && a.sentimentLabel !== "neutral").length,
      estimatedTimeSavedMinutes: Math.round(articleResult.total * 2.5),
      articlesProcessed: articleResult.total,
      briefsGenerated: monthBriefs.length,
      reportData: { generatedAt: now.toISOString(), period: reportMonth, automated: true, finalized: true },
    });
    console.log(`[Learning] Generated value report for client ${client.id}: ${reportMonth} (finalized previous month)`);
  }
}

async function runLearningCycle() {
  console.log("[Learning] Starting weekly learning cycle...");
  const start = Date.now();

  try {
    await analyzeFeedback();
    await recalibrateAlertThresholds();
    await refreshRecommendations();
    await growKnowledgeBase();
    await generateMonthlyValueReports();

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Learning] Weekly learning cycle completed in ${duration}s`);
  } catch (error) {
    console.error("[Learning] Error in learning cycle:", error);
  }
}

export function startLearningWorker() {
  console.log("[Learning] Starting learning worker (weekly cycle)");
  setTimeout(() => runLearningCycle(), 60000);
  setInterval(runLearningCycle, LEARNING_INTERVAL);
}

export { runLearningCycle };
