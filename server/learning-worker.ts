import { storage } from "./storage";

const LEARNING_INTERVAL = 7 * 24 * 60 * 60 * 1000;
const ALERT_TYPES = ["volume_spike", "sentiment_shift", "emerging_topic", "narrative_change"];

async function analyzeFeedback() {
  console.log("[Learning] Analyzing user feedback...");
  const feedback = await storage.getUserFeedback({});
  if (feedback.length === 0) {
    console.log("[Learning] No feedback to analyze");
    return;
  }

  const featureStats: Record<string, { useful: number; unclear: number; wrong: number; total: number }> = {};
  for (const f of feedback) {
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

  console.log("[Learning] Feedback analysis:", JSON.stringify(featureStats));
  return featureStats;
}

async function recalibrateAlertThresholds() {
  console.log("[Learning] Recalibrating alert thresholds...");
  const engagement = await storage.getInsightEngagement({ insightType: "alert" });
  if (engagement.length === 0) {
    console.log("[Learning] No alert engagement data to recalibrate");
    return;
  }

  const clients = await storage.getClients();
  for (const client of clients) {
    const feedback = await storage.getUserFeedback({ feature: "alert" });
    const clientFeedback = feedback.filter((f: any) => f.targetType === "alert");

    for (const alertType of ALERT_TYPES) {
      const relevantFeedback = clientFeedback.filter((f: any) => {
        return f.comment?.includes(alertType) || f.targetType === alertType;
      });

      if (relevantFeedback.length < 3) continue;

      const helpfulCount = relevantFeedback.filter((f: any) => f.rating === "helpful" || f.rating === "useful").length;
      const noisyCount = relevantFeedback.filter((f: any) => f.rating === "noisy" || f.rating === "wrong").length;
      const total = helpfulCount + noisyCount;
      if (total === 0) continue;

      const helpfulRatio = helpfulCount / total;
      let newSensitivity = 50;
      if (helpfulRatio > 0.7) {
        newSensitivity = Math.min(80, 50 + Math.round((helpfulRatio - 0.5) * 60));
      } else if (helpfulRatio < 0.3) {
        newSensitivity = Math.max(20, 50 - Math.round((0.5 - helpfulRatio) * 60));
      }

      await storage.upsertAlertPreference({
        clientId: client.id,
        alertType,
        sensitivityScore: newSensitivity,
        autoTuned: true,
      });
      console.log(`[Learning] Updated ${alertType} sensitivity for client ${client.id}: ${newSensitivity}`);
    }
  }
}

async function refreshRecommendations() {
  console.log("[Learning] Refreshing dashboard recommendations...");
  const engagement = await storage.getInsightEngagement({});
  if (engagement.length === 0) return;

  const userTopicInteractions: Record<number, Record<string, number>> = {};
  for (const e of engagement) {
    if (!userTopicInteractions[e.userId]) {
      userTopicInteractions[e.userId] = {};
    }
    const key = `${e.insightType}:${e.insightId}`;
    userTopicInteractions[e.userId][key] = (userTopicInteractions[e.userId][key] || 0) + (e.clicked ? 2 : 1);
  }

  for (const [userIdStr, interactions] of Object.entries(userTopicInteractions)) {
    const userId = parseInt(userIdStr);
    const sorted = Object.entries(interactions).sort((a, b) => b[1] - a[1]);
    const topInteractions = sorted.slice(0, 5).map(([key]) => key.split(":")[0]);
    const uniqueTypes = Array.from(new Set(topInteractions));

    const existing = await storage.getDashboardPreferences(userId);
    if (!existing) {
      await storage.upsertDashboardPreferences({
        userId,
        recommendedPanels: uniqueTypes.map(t => ({ type: t, reason: "Based on your engagement" })),
        autoSuggested: true,
      });
      console.log(`[Learning] Created recommendations for user ${userId}`);
    }
  }
}

async function growKnowledgeBase() {
  console.log("[Learning] Growing knowledge base from corrections...");
  const corrections = await storage.getAiCorrections({ status: "accepted" });
  if (corrections.length === 0) return;

  const correctionPatterns: Record<string, { count: number; oldValues: string[]; newValues: string[] }> = {};
  for (const c of corrections) {
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
      console.log(`[Learning] Added knowledge entry: ${pattern} (${data.count} corrections)`);
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
  const reportMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  for (const client of clients) {
    const existing = await storage.getValueReports(client.id);
    if (existing.some((r: any) => r.reportMonth === reportMonth)) continue;

    const articleResult = await storage.getArticles({});
    const briefs = await storage.getDailyBriefs(30);
    const events = await storage.getDetectedEvents({ limit: 100 });

    await storage.createValueReport({
      clientId: client.id,
      reportMonth,
      alertsDetected: events.length,
      emergingTopicsCaught: briefs.reduce((sum: number, b: any) => sum + ((b.emergingTopics as any[])?.length || 0), 0),
      sentimentChanges: articleResult.items.filter((a: any) => a.sentimentLabel && a.sentimentLabel !== "neutral").length,
      estimatedTimeSavedMinutes: Math.round(articleResult.total * 2.5),
      articlesProcessed: articleResult.total,
      briefsGenerated: briefs.length,
      reportData: { generatedAt: now.toISOString(), period: reportMonth, automated: true },
    });
    console.log(`[Learning] Generated value report for client ${client.id}: ${reportMonth}`);
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
