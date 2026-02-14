import { openai } from "../replit_integrations/image/client";
import { storage } from "../storage";
import { openaiLimiter } from "../processing-queue";
import type { InsightJob } from "@shared/schema";

export type InsightType = "summary" | "brief" | "prediction" | "classification" | "qa";

export interface RunInsightAIParams {
  jobId: number;
  clientId: number;
  type: InsightType;
  payload: {
    systemPrompt: string;
    userContent: string;
    responseFormat?: { type: "json_object" } | { type: "text" };
  };
  maxTokens?: number;
}

export interface InsightAIResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_EXPIRY_MS = 10 * 60 * 1000;

export async function checkClientAiBudget(clientId: number): Promise<{ allowed: boolean; reason?: string }> {
  const client = await storage.getClient(clientId);
  if (!client) return { allowed: false, reason: "Client not found" };
  if (!client.aiEnabled) return { allowed: false, reason: `AI disabled for client ${client.name} (id=${clientId})` };

  const budget = client.dailyTokenBudget ?? 0;
  const limit = client.dailyJobLimit ?? 0;

  if (budget <= 0 && limit <= 0) {
    return { allowed: false, reason: `Client ${clientId} has no AI budget configured (dailyTokenBudget=0, dailyJobLimit=0)` };
  }

  const usage = await storage.getDailyAiUsage(clientId);

  if (limit > 0 && usage.jobCount >= limit) {
    return { allowed: false, reason: `Daily job limit reached: ${usage.jobCount}/${limit}` };
  }
  if (budget > 0 && usage.totalTokens >= budget) {
    return { allowed: false, reason: `Daily token budget exhausted: ${usage.totalTokens}/${budget}` };
  }

  return { allowed: true };
}

export async function createInsightJob(clientId: number, type: InsightType): Promise<InsightJob> {
  const budgetCheck = await checkClientAiBudget(clientId);
  if (!budgetCheck.allowed) {
    console.warn(`[AI Gateway] Job rejected for client ${clientId}: ${budgetCheck.reason}`);
    throw new Error(`[AI Gateway] Budget rejected: ${budgetCheck.reason}`);
  }

  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_MS);
  return storage.createInsightJob({ clientId, type, status: "queued", expiresAt });
}

export async function startInsightJob(jobId: number): Promise<InsightJob> {
  const job = await storage.getInsightJob(jobId);
  if (!job) throw new Error(`[AI Gateway] Insight job ${jobId} not found`);
  if (job.status !== "queued") throw new Error(`[AI Gateway] Job ${jobId} cannot start — status is "${job.status}"`);
  if (new Date() > job.expiresAt) {
    await storage.updateInsightJobStatus(jobId, "failed");
    throw new Error(`[AI Gateway] Job ${jobId} expired before starting`);
  }
  const updated = await storage.updateInsightJobStatus(jobId, "running", { startedAt: new Date() });
  if (!updated) throw new Error(`[AI Gateway] Failed to start job ${jobId}`);
  return updated;
}

export async function completeInsightJob(jobId: number): Promise<InsightJob> {
  const updated = await storage.updateInsightJobStatus(jobId, "completed", { completedAt: new Date() });
  if (!updated) throw new Error(`[AI Gateway] Failed to complete job ${jobId}`);
  return updated;
}

export async function failInsightJob(jobId: number): Promise<void> {
  await storage.updateInsightJobStatus(jobId, "failed", { completedAt: new Date() });
}

export async function runInsightAI(params: RunInsightAIParams): Promise<InsightAIResult> {
  const { jobId, clientId, type, payload, maxTokens } = params;

  if (!jobId) {
    const msg = "[AI Gateway] BLOCKED: AI call attempted without jobId";
    console.error(msg);
    if (process.env.NODE_ENV === "development") {
      throw new Error(msg);
    }
    throw new Error(msg);
  }

  const job = await storage.getInsightJob(jobId);
  if (!job) {
    throw new Error(`[AI Gateway] Job ${jobId} does not exist`);
  }

  if (job.status !== "running") {
    throw new Error(`[AI Gateway] Job ${jobId} is not running (status="${job.status}")`);
  }

  if (job.clientId !== clientId) {
    throw new Error(`[AI Gateway] Client mismatch: job belongs to client ${job.clientId}, request from client ${clientId}`);
  }

  if (new Date() > job.expiresAt) {
    await storage.updateInsightJobStatus(jobId, "failed");
    throw new Error(`[AI Gateway] Job ${jobId} has expired`);
  }

  const result = await openaiLimiter.run(async () => {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: payload.systemPrompt },
        { role: "user", content: payload.userContent },
      ],
      ...(payload.responseFormat ? { response_format: payload.responseFormat } : {}),
      max_completion_tokens: maxTokens || 500,
    });

    const usage = completion.usage;
    return {
      content: completion.choices[0]?.message?.content || "",
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
    };
  });

  await storage.createAiUsageLog({
    jobId,
    clientId,
    type,
    model: "gpt-4o-mini",
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
  });

  return result;
}
