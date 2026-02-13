import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import type { Article, InsertArticleAiAnalysis, InsertEntityMention, InsertDetectedEvent, InsertTrendPrediction } from "@shared/schema";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).replace(/\s+\S*$/, "") + "...";
}

export async function deepAnalyzeArticle(article: Article): Promise<InsertArticleAiAnalysis | null> {
  try {
    const textToAnalyze = truncate(`${article.title}. ${article.content || ""}`, 3000);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a news intelligence analyst. Analyze this article and return JSON with:
"main_topic": primary topic (1-3 words),
"subtopics": array of 2-4 related subtopics,
"entities": array of objects with {"name", "type"} where type is "person", "organization", "location", or "other",
"event_type": one of: political, economic, conflict, social, legal, technological, environmental, health, diplomatic, cultural,
"importance_score": 0-100 integer rating newsworthiness,
"narrative_summary": 2-3 sentences explaining what actually happened and its significance (interpret, don't paraphrase),
"confidence_score": 0-100 your confidence in this analysis.
Respond ONLY with valid JSON.`
        },
        { role: "user", content: textToAnalyze },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    return {
      articleId: article.id,
      mainTopic: result.main_topic || article.topics?.[0] || "general",
      subtopics: Array.isArray(result.subtopics) ? result.subtopics : [],
      entities: Array.isArray(result.entities) ? result.entities : [],
      eventType: result.event_type || "general",
      importanceScore: typeof result.importance_score === "number" ? Math.min(100, Math.max(0, result.importance_score)) : 50,
      narrativeSummary: result.narrative_summary || article.summary || "",
      confidenceScore: typeof result.confidence_score === "number" ? Math.min(100, Math.max(0, result.confidence_score)) : 70,
    };
  } catch (e) {
    console.error(`[AI Intelligence] Deep analysis failed for article ${article.id}:`, e);
    return null;
  }
}

export async function processUnanalyzedArticles(batchSize = 10, clientId?: number | null): Promise<number> {
  const unanalyzedIds = await storage.getUnanalyzedArticleIds(batchSize, clientId ?? undefined);
  if (unanalyzedIds.length === 0) return 0;

  let processed = 0;
  for (const articleId of unanalyzedIds) {
    const article = await storage.getArticle(articleId);
    if (!article) continue;
    if (clientId && article.clientId !== clientId) continue;

    const analysis = await deepAnalyzeArticle(article);
    if (analysis) {
      await storage.upsertArticleAiAnalysis(analysis);

      if (Array.isArray(analysis.entities)) {
        const entityData = analysis.entities as { name: string; type: string }[];
        const mentions: InsertEntityMention[] = entityData
          .filter(e => e.name && e.type)
          .map(entity => ({
            entityName: entity.name,
            entityType: entity.type,
            articleId: article.id,
            sourceId: article.sourceId,
            sentiment: article.sentimentLabel,
            sentimentScore: article.sentimentScore,
            context: truncate(article.title, 200),
            mentionDate: article.publishedAt || article.ingestedAt || new Date(),
            clientId: article.clientId ?? null,
          }));

        if (mentions.length > 0) {
          await storage.createEntityMentionsBatch(mentions);
        }
      }
      processed++;
    }
  }

  console.log(`[AI Intelligence] Processed ${processed}/${unanalyzedIds.length} articles for deep analysis`);
  return processed;
}

export async function clusterArticles(clientId?: number | null): Promise<number> {
  const recentArticles = await storage.getArticles({ limit: 100, clientId: clientId ?? undefined });
  if (recentArticles.items.length === 0) return 0;

  const analysisMap = new Map<number, any>();
  for (const article of recentArticles.items) {
    const analysis = await storage.getArticleAiAnalysis(article.id);
    if (analysis && !analysis.clusterId) {
      analysisMap.set(article.id, { article, analysis });
    }
  }

  if (analysisMap.size === 0) return 0;

  const topicGroups = new Map<string, { article: Article; analysis: any }[]>();
  Array.from(analysisMap.values()).forEach(entry => {
    const topic = (entry.analysis.mainTopic || "").toLowerCase().trim();
    if (!topic) return;
    const existing = topicGroups.get(topic) || [];
    existing.push(entry);
    topicGroups.set(topic, existing);
  });

  const unclustered: { article: Article; analysis: any }[] = [];
  for (const [topic, entries] of Array.from(topicGroups.entries())) {
    if (entries.length >= 2) {
      continue;
    }
    unclustered.push(...entries);
    topicGroups.delete(topic);
  }

  if (unclustered.length >= 3) {
    try {
      const summaries = unclustered.slice(0, 20).map((e, i) =>
        `[${i}] Topic: ${e.analysis.mainTopic} | Title: ${e.article.title}`
      ).join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Group these articles by related real-world events. Return JSON: {"groups": [{"indices": [0,2,5], "topic": "shared topic name"}]}. Only group articles about the SAME event or closely related developments. Articles that don't belong to any group should be omitted.`
          },
          { role: "user", content: summaries },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 500,
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      if (Array.isArray(result.groups)) {
        for (const group of result.groups) {
          if (Array.isArray(group.indices) && group.indices.length >= 2) {
            const groupEntries = group.indices
              .filter((i: number) => i >= 0 && i < unclustered.length)
              .map((i: number) => unclustered[i]);
            if (groupEntries.length >= 2) {
              topicGroups.set(group.topic || `cluster_${Date.now()}`, groupEntries);
            }
          }
        }
      }
    } catch (e) {
      console.error("[AI Intelligence] AI clustering failed:", e);
    }
  }

  let clustersCreated = 0;
  for (const [topic, entries] of Array.from(topicGroups.entries())) {
    if (entries.length < 2) continue;

    const sources = new Set(entries.map(e => e.article.sourceId).filter(Boolean));
    const avgImportance = Math.round(
      entries.reduce((sum: number, e: {article: Article; analysis: any}) => sum + (e.analysis.importanceScore || 50), 0) / entries.length
    );
    const avgSentiment = Math.round(
      entries.reduce((sum: number, e: {article: Article; analysis: any}) => sum + (e.article.sentimentScore || 0), 0) / entries.length
    );

    const clusterClientId = entries[0].article.clientId ?? null;
    const cluster = await storage.createStoryCluster({
      title: entries[0].article.title,
      mainTopic: topic,
      subtopics: Array.from(new Set(entries.flatMap(e => e.analysis.subtopics || []))).slice(0, 5),
      importanceScore: avgImportance,
      articleCount: entries.length,
      sourceCount: sources.size,
      avgSentiment,
      firstSeen: entries.reduce((min: Date, e: {article: Article; analysis: any}) => {
        const d = e.article.publishedAt || e.article.ingestedAt;
        return d && d < min ? d : min;
      }, new Date()),
      lastUpdated: new Date(),
      clientId: clusterClientId,
    });

    for (const entry of entries) {
      await storage.upsertArticleAiAnalysis({
        ...entry.analysis,
        articleId: entry.article.id,
        clusterId: cluster.id,
      });
    }

    clustersCreated++;
  }

  console.log(`[AI Intelligence] Created ${clustersCreated} story clusters`);
  return clustersCreated;
}

export async function analyzeNarratives(clusterId: number): Promise<any> {
  const cluster = await storage.getStoryCluster(clusterId);
  if (!cluster) return null;

  const clusterArticles = await storage.getClusterArticles(clusterId);
  if (clusterArticles.length < 2) return null;

  const articleSummaries = clusterArticles.slice(0, 10).map(a => ({
    source: a.subSource || `Source ${a.sourceId}`,
    title: a.title,
    sentiment: a.sentimentLabel,
    score: a.sentimentScore,
    summary: truncate(a.summary || a.content, 200),
  }));

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze how different sources cover the same story. Return JSON with:
"variations": array of {"source": name, "framing": "positive"|"neutral"|"negative"|"mixed", "emphasis": what they emphasize, "tone": brief description},
"consensus": what all sources agree on,
"divergence": key areas of disagreement,
"confidence_score": 0-100`
        },
        { role: "user", content: JSON.stringify(articleSummaries) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    await storage.updateStoryCluster(clusterId, {
      narrativeVariations: result,
    });
    return result;
  } catch (e) {
    console.error(`[AI Intelligence] Narrative analysis failed for cluster ${clusterId}:`, e);
    return null;
  }
}

export async function detectEvents(clientId?: number | null): Promise<number> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const recentArticles = await storage.getArticles({
    startDate: oneDayAgo.toISOString(),
    limit: 500,
    clientId: clientId ?? undefined,
  });

  const olderArticles = await storage.getArticles({
    startDate: twoDaysAgo.toISOString(),
    endDate: oneDayAgo.toISOString(),
    limit: 500,
    clientId: clientId ?? undefined,
  });

  const recentTopics = new Map<string, number>();
  const olderTopics = new Map<string, number>();
  const recentSentiments = new Map<string, number[]>();

  for (const a of recentArticles.items) {
    for (const t of (a.topics || [])) {
      recentTopics.set(t, (recentTopics.get(t) || 0) + 1);
      const scores = recentSentiments.get(t) || [];
      scores.push(a.sentimentScore || 0);
      recentSentiments.set(t, scores);
    }
  }

  for (const a of olderArticles.items) {
    for (const t of (a.topics || [])) {
      olderTopics.set(t, (olderTopics.get(t) || 0) + 1);
    }
  }

  const events: InsertDetectedEvent[] = [];

  for (const [topic, count] of Array.from(recentTopics.entries())) {
    const oldCount = olderTopics.get(topic) || 0;
    if (oldCount > 0 && count / oldCount >= 3) {
      events.push({
        type: "volume_spike",
        topic,
        severity: count / oldCount >= 5 ? "high" : "medium",
        explanation: `Coverage of "${topic}" increased ${Math.round(count / oldCount * 100)}% (from ${oldCount} to ${count} articles in 24h)`,
        triggerValue: String(count),
        baselineValue: String(oldCount),
        articleCount: count,
        sourceCount: new Set(recentArticles.items.filter(a => a.topics?.includes(topic)).map(a => a.sourceId)).size,
        confidenceScore: Math.min(90, 50 + count * 5),
      });
    }

    if (oldCount === 0 && count >= 3) {
      events.push({
        type: "new_topic",
        topic,
        severity: count >= 5 ? "high" : "medium",
        explanation: `New topic "${topic}" appeared with ${count} articles in 24h — not seen in previous period`,
        triggerValue: String(count),
        baselineValue: "0",
        articleCount: count,
        sourceCount: new Set(recentArticles.items.filter(a => a.topics?.includes(topic)).map(a => a.sourceId)).size,
        confidenceScore: Math.min(85, 40 + count * 8),
      });
    }
  }

  for (const [topic, scores] of Array.from(recentSentiments.entries())) {
    if (scores.length < 3) continue;
    const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    if (Math.abs(avg) > 40) {
      events.push({
        type: "sentiment_shift",
        topic,
        severity: Math.abs(avg) > 60 ? "high" : "medium",
        explanation: `Strong ${avg > 0 ? "positive" : "negative"} sentiment (avg ${Math.round(avg)}) detected for "${topic}" across ${scores.length} articles`,
        triggerValue: String(Math.round(avg)),
        baselineValue: "0",
        articleCount: scores.length,
        sourceCount: new Set(recentArticles.items.filter(a => a.topics?.includes(topic)).map(a => a.sourceId)).size,
        confidenceScore: Math.min(80, 50 + scores.length * 3),
      });
    }
  }

  for (const event of events) {
    await storage.createDetectedEvent({ ...event, clientId: clientId ?? null });
  }

  console.log(`[AI Intelligence] Detected ${events.length} events`);
  return events.length;
}

export async function generateDailyBrief(clientId?: number | null): Promise<any> {
  const today = new Date().toISOString().split("T")[0];
  const existing = await storage.getDailyBrief(today, clientId ?? undefined);
  if (existing) return existing;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentArticles = await storage.getArticles({
    startDate: oneDayAgo.toISOString(),
    limit: 200,
    clientId: clientId ?? undefined,
  });

  if (recentArticles.items.length < 3) {
    console.log("[AI Intelligence] Not enough articles for daily brief");
    return null;
  }

  const topArticles = recentArticles.items.slice(0, 30);
  const recentEvents = await storage.getDetectedEvents({ limit: 10, clientId: clientId ?? undefined });
  const topEntities = await storage.getTopEntities({ limit: 10, days: 1, clientId: clientId ?? undefined });

  const briefInput = {
    articles: topArticles.map(a => ({
      title: a.title,
      source: a.subSource || `Source ${a.sourceId}`,
      sentiment: a.sentimentLabel,
      topics: a.topics,
      category: a.category,
      summary: truncate(a.summary || a.content, 150),
    })),
    events: recentEvents.map(e => ({
      type: e.type,
      topic: e.topic,
      severity: e.severity,
      explanation: e.explanation,
    })),
    topEntities: topEntities.map(e => ({
      name: e.entityName,
      mentions: e.mentionCount,
      sentiment: e.avgSentiment,
    })),
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a senior intelligence analyst writing a daily briefing. Write a professional, insightful brief that reads like an analyst report — NOT bullet points. Return JSON with:
"content": the full briefing text (3-5 paragraphs, professional analyst tone),
"major_developments": array of {title, summary} for top 3-5 stories,
"emerging_topics": array of topic strings that are gaining attention,
"tone_shifts": array of {topic, direction, explanation} for any notable sentiment changes,
"key_stories": array of article titles that are most significant.
Make the content insightful and interpretive, not just a recap.`
        },
        { role: "user", content: JSON.stringify(briefInput) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const sources = new Set(topArticles.map(a => a.sourceId).filter(Boolean));

    const brief = await storage.upsertDailyBrief({
      date: today,
      content: result.content || "Brief generation incomplete.",
      keyStories: result.key_stories || [],
      majorDevelopments: result.major_developments || [],
      emergingTopics: result.emerging_topics || [],
      toneShifts: result.tone_shifts || [],
      articleCount: recentArticles.items.length,
      sourceCount: sources.size,
      confidenceScore: Math.min(90, 40 + topArticles.length * 2),
      clientId: clientId ?? null,
    });

    console.log(`[AI Intelligence] Generated daily brief for ${today}`);
    return brief;
  } catch (e) {
    console.error("[AI Intelligence] Daily brief generation failed:", e);
    return null;
  }
}

export async function generateTrendPredictions(clientId?: number | null): Promise<number> {
  const topEntities = await storage.getTopEntities({ limit: 10, days: 7, clientId: clientId ?? undefined });
  const recentEvents = await storage.getDetectedEvents({ limit: 20, clientId: clientId ?? undefined });

  if (topEntities.length === 0 && recentEvents.length === 0) return 0;

  const trendInput = {
    topEntities: topEntities.map(e => ({
      name: e.entityName,
      type: e.entityType,
      mentions: e.mentionCount,
      avgSentiment: e.avgSentiment,
    })),
    recentEvents: recentEvents.map(e => ({
      type: e.type,
      topic: e.topic,
      severity: e.severity,
      explanation: e.explanation,
    })),
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Based on recent news patterns, generate trend predictions. Return JSON with:
"predictions": array of {
  "topic": the topic/entity,
  "prediction_type": one of "escalation", "attention_decay", "media_amplification", "sentiment_shift",
  "probability": 0-100,
  "reasoning": 1-2 sentence explanation,
  "timeframe": "24h" | "48h" | "1_week",
  "confidence_score": 0-100
}
Generate 3-5 most likely predictions based on the data.`
        },
        { role: "user", content: JSON.stringify(trendInput) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const predictions: InsertTrendPrediction[] = [];

    if (Array.isArray(result.predictions)) {
      for (const p of result.predictions) {
        predictions.push({
          topic: p.topic || "unknown",
          predictionType: p.prediction_type || "escalation",
          probability: typeof p.probability === "number" ? Math.min(100, Math.max(0, p.probability)) : 50,
          reasoning: p.reasoning || "",
          timeframe: p.timeframe || "48h",
          confidenceScore: typeof p.confidence_score === "number" ? Math.min(100, Math.max(0, p.confidence_score)) : 60,
          basedOnArticleCount: topEntities.reduce((sum, e) => sum + e.mentionCount, 0),
          basedOnSourceDiversity: topEntities.length,
          expiresAt: new Date(Date.now() + (p.timeframe === "24h" ? 24 : p.timeframe === "1_week" ? 168 : 48) * 60 * 60 * 1000),
          clientId: clientId ?? null,
        });
      }
    }

    for (const pred of predictions) {
      await storage.createTrendPrediction(pred);
    }

    console.log(`[AI Intelligence] Generated ${predictions.length} trend predictions`);
    return predictions.length;
  } catch (e) {
    console.error("[AI Intelligence] Trend predictions failed:", e);
    return 0;
  }
}

export async function answerIntelligenceQuery(question: string, clientId?: number | null): Promise<{
  answer: string;
  sources: string[];
  confidence: number;
  basedOnArticleCount: number;
  basedOnSourceDiversity: number;
}> {
  const recentArticles = await storage.getArticles({ limit: 50, clientId: clientId ?? undefined });
  const topEntities = await storage.getTopEntities({ limit: 15, days: 7, clientId: clientId ?? undefined });
  const recentEvents = await storage.getDetectedEvents({ limit: 10, clientId: clientId ?? undefined });
  const latestBriefs = await storage.getDailyBriefs(3, clientId ?? undefined);

  const context = {
    recentArticles: recentArticles.items.slice(0, 20).map(a => ({
      title: a.title,
      source: a.subSource || `Source ${a.sourceId}`,
      sentiment: a.sentimentLabel,
      topics: a.topics,
      summary: truncate(a.summary || a.content, 100),
      date: a.publishedAt?.toISOString?.() || "",
    })),
    topEntities: topEntities.map(e => ({
      name: e.entityName,
      mentions: e.mentionCount,
      avgSentiment: e.avgSentiment,
    })),
    recentEvents: recentEvents.map(e => ({
      type: e.type,
      topic: e.topic,
      explanation: e.explanation,
    })),
    latestBrief: latestBriefs[0]?.content || "",
  };

  const uniqueSources = new Set(recentArticles.items.map(a => a.sourceId).filter(Boolean));

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an intelligence analyst assistant. Answer user questions using ONLY the provided ground-truth data (articles, entities, events). Do NOT use external knowledge. Do NOT speculate beyond what the data shows. If the data doesn't contain enough info to answer, say so honestly. Be specific, cite sources when possible, and give actionable insights. Return JSON with:
"answer": your detailed answer (2-4 paragraphs),
"sources": array of source names referenced,
"confidence": 0-100 how confident you are in this answer based on available data`
        },
        {
          role: "user",
          content: `Question: ${question}\n\nAvailable Data:\n${JSON.stringify(context)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return {
      answer: result.answer || "Unable to generate an answer from available data.",
      sources: Array.isArray(result.sources) ? result.sources : [],
      confidence: typeof result.confidence === "number" ? result.confidence : 50,
      basedOnArticleCount: recentArticles.items.length,
      basedOnSourceDiversity: uniqueSources.size,
    };
  } catch (e) {
    console.error("[AI Intelligence] Query failed:", e);
    return {
      answer: "An error occurred while processing your question. Please try again.",
      sources: [],
      confidence: 0,
      basedOnArticleCount: 0,
      basedOnSourceDiversity: 0,
    };
  }
}

export async function runIntelligencePipeline(): Promise<void> {
  console.log("[AI Intelligence] Starting intelligence pipeline...");

  const clientIds = await storage.getDistinctClientIds();
  for (const cId of clientIds) {
    const analyzed = await processUnanalyzedArticles(50, cId);
    console.log(`[AI Intelligence] Deep analysis (client=${cId}): ${analyzed} articles processed`);

    const clusters = await clusterArticles(cId);
    console.log(`[AI Intelligence] Clustering (client=${cId}): ${clusters} clusters created`);

    const eventCount = await detectEvents(cId);
    console.log(`[AI Intelligence] Event detection (client=${cId}): ${eventCount} events detected`);

    await generateDailyBrief(cId);
    await generateTrendPredictions(cId);
  }

  console.log("[AI Intelligence] Pipeline complete");
}
