import OpenAI from "openai";
import { storage } from "../storage";
import { openaiLimiter } from "../processing-queue";
import type { InsightJob } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

export type InsightType = "summary" | "brief" | "prediction" | "classification" | "qa";

export interface AIJobPayload {
  systemPrompt: string;
  userContent: string;
  responseFormat?: { type: "json_object" } | { type: "text" };
}

export interface RunInsightAIParams {
  jobId: number;
  clientId: number;
  type: InsightType;
  payload: AIJobPayload;
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

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const AWAIT_POLL_INTERVAL_MS = 500;
const AWAIT_DEFAULT_TIMEOUT_MS = 120_000;

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

export async function createInsightJob(
  clientId: number,
  type: InsightType,
  jobPayload?: AIJobPayload,
  maxTokens?: number,
): Promise<InsightJob> {
  const budgetCheck = await checkClientAiBudget(clientId);
  if (!budgetCheck.allowed) {
    console.warn(`[AI Gateway] Job rejected for client ${clientId}: ${budgetCheck.reason}`);
    throw new Error(`[AI Gateway] Budget rejected: ${budgetCheck.reason}`);
  }

  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_MS);
  return storage.createInsightJob({
    clientId,
    type,
    status: "queued",
    expiresAt,
    payload: jobPayload || null,
    maxTokens: maxTokens || 500,
  });
}

export async function enqueueAIJob(
  clientId: number,
  type: InsightType,
  payload: AIJobPayload,
  maxTokens?: number,
): Promise<InsightJob> {
  return createInsightJob(clientId, type, payload, maxTokens);
}

export async function awaitJobResult(jobId: number, timeoutMs?: number): Promise<InsightAIResult> {
  const timeout = timeoutMs || AWAIT_DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const job = await storage.getInsightJob(jobId);
    if (!job) throw new Error(`[AI Gateway] Job ${jobId} not found while awaiting result`);

    if (job.status === "completed" && job.result) {
      return job.result as InsightAIResult;
    }
    if (job.status === "failed") {
      throw new Error(`[AI Gateway] Job ${jobId} failed during execution`);
    }
    if (job.status === "expired") {
      throw new Error(`[AI Gateway] Job ${jobId} expired before execution`);
    }
    if (job.status === "blocked_budget") {
      throw new Error(`[AI Gateway] Job ${jobId} blocked — tenant budget exceeded`);
    }

    await new Promise(resolve => setTimeout(resolve, AWAIT_POLL_INTERVAL_MS));
  }

  throw new Error(`[AI Gateway] Timeout waiting for job ${jobId} after ${timeout}ms`);
}

export async function startInsightJob(jobId: number): Promise<InsightJob> {
  const job = await storage.getInsightJob(jobId);
  if (!job) throw new Error(`[AI Gateway] Insight job ${jobId} not found`);
  if (job.status !== "scheduled") throw new Error(`[AI Gateway] Job ${jobId} cannot start — status is "${job.status}" (must be "scheduled")`);
  if (new Date() > job.expiresAt) {
    await storage.updateInsightJobStatus(jobId, "expired");
    throw new Error(`[AI Gateway] Job ${jobId} expired before starting`);
  }
  const nextAttempt = (job.attempt ?? 0) + 1;
  const updated = await storage.updateInsightJobIfStatus(jobId, "scheduled", "running", { startedAt: new Date(), attempt: nextAttempt });
  if (!updated) throw new Error(`[AI Gateway] Failed to atomically start job ${jobId} — race condition`);
  return updated;
}

export async function completeInsightJob(jobId: number, result?: InsightAIResult): Promise<InsightJob> {
  const extra: Partial<InsightJob> = { completedAt: new Date() };
  if (result) {
    (extra as any).result = {
      content: result.content,
      usage: result.usage,
    };
  }
  const updated = await storage.updateInsightJobStatus(jobId, "completed", extra);
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
    throw new Error(msg);
  }

  const job = await storage.getInsightJob(jobId);
  if (!job) {
    throw new Error(`[AI Gateway] Job ${jobId} does not exist`);
  }

  if (job.status !== "running") {
    throw new Error(`[AI Gateway] HARD ERROR: Job ${jobId} is not running (status="${job.status}"). AI execution BLOCKED — only scheduler-controlled jobs may run.`);
  }

  if (job.clientId !== clientId) {
    throw new Error(`[AI Gateway] Client mismatch: job belongs to client ${job.clientId}, request from client ${clientId}`);
  }

  if (new Date() > job.expiresAt) {
    await storage.updateInsightJobStatus(jobId, "expired");
    throw new Error(`[AI Gateway] Job ${jobId} has expired`);
  }

  const dryRun = process.env.AI_DRY_RUN === "1";

  let result: InsightAIResult;

  if (dryRun) {
    const simPrompt = 800;
    const simCompletion = 200;
    const stubContent = payload.responseFormat?.type === "json_object"
      ? JSON.stringify({ sentiment: "neutral", score: 0, keywords: ["dry-run"], topics: ["test"], summary: "Dry-run stub response", category: "general", country: null })
      : "Dry-run stub response";
    result = {
      content: stubContent,
      usage: { promptTokens: simPrompt, completionTokens: simCompletion, totalTokens: simPrompt + simCompletion },
    };
    console.log(`[AI Gateway] DRY_RUN: job=${jobId} client=${clientId} type=${type} simTokens=${simPrompt + simCompletion}`);
  } else {
    result = await openaiLimiter.run(async () => {
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
  }

  const currentJob = await storage.getInsightJob(jobId);
  const jobAttempt = currentJob?.attempt ?? 1;

  await storage.createAiUsageLog({
    jobId,
    attempt: jobAttempt,
    clientId,
    type,
    model: dryRun ? "gpt-4o-mini-dry-run" : "gpt-4o-mini",
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
  });

  return result;
}
