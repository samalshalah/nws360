import { and, eq, isNull, sql } from "drizzle-orm";
import { articles, clients, emailSubscriptions, sourceFetchLogs, sources, systemErrors, workspaces } from "@shared/schema";
import { db } from "./db";
import { isScheduleDue } from "./briefing-delivery";
import type { JobType } from "./processing-queue";
import {
  evaluatePeriodicJobEligibility,
  runPeriodicJobWithEligibility,
  type PeriodicJobEligibility,
  type PeriodicJobEligibilitySnapshot,
} from "./periodic-job-rules";

async function scalarCount(query: Promise<Array<{ count: number }>>) {
  const [row] = await query;
  return Number(row?.count ?? 0);
}

export async function getPeriodicJobEligibilitySnapshot(): Promise<PeriodicJobEligibilitySnapshot> {
  const activeClientRows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.active, true));
  const activeClientIds = new Set(activeClientRows.map((row) => row.id));

  const activeClientCount = activeClientRows.length;
  const activeWorkspaceCount = await scalarCount(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaces)
      .innerJoin(clients, eq(workspaces.clientId, clients.id))
      .where(eq(clients.active, true)),
  );
  const activeArticleCount = await scalarCount(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(articles)
      .innerJoin(clients, eq(articles.clientId, clients.id))
      .where(eq(clients.active, true)),
  );
  const activeSourceCount = await scalarCount(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sources)
      .innerJoin(clients, eq(sources.clientId, clients.id))
      .where(and(eq(clients.active, true), eq(sources.active, true), isNull(sources.deletedAt))),
  );

  const briefingSchedules = await db
    .select()
    .from(emailSubscriptions)
    .where(and(
      sql`${emailSubscriptions.active} IS NOT FALSE`,
      sql`${emailSubscriptions.sendBriefing} IS NOT FALSE`,
    ));
  const dueBriefingCount = briefingSchedules.filter(
    (schedule) => activeClientIds.has(schedule.clientId) && isScheduleDue(schedule),
  ).length;

  const sourceCount = await scalarCount(db.select({ count: sql<number>`count(*)::int` }).from(sources));
  const articleCount = await scalarCount(db.select({ count: sql<number>`count(*)::int` }).from(articles));
  const sourceFetchLogCount = await scalarCount(db.select({ count: sql<number>`count(*)::int` }).from(sourceFetchLogs));
  const systemErrorCount = await scalarCount(db.select({ count: sql<number>`count(*)::int` }).from(systemErrors));

  return {
    activeClientCount,
    activeWorkspaceCount,
    activeArticleCount,
    activeSourceCount,
    dueBriefingCount,
    retentionCandidateCount: sourceCount + articleCount + sourceFetchLogCount + systemErrorCount,
  };
}

export async function shouldSchedulePeriodicJob(jobType: JobType): Promise<PeriodicJobEligibility> {
  return evaluatePeriodicJobEligibility(jobType, await getPeriodicJobEligibilitySnapshot());
}

export async function runPeriodicJobIfEligible<T>(
  jobType: JobType,
  handler: () => Promise<T>,
): Promise<T | { status: "skipped"; reason: string; processed: 0 }> {
  return runPeriodicJobWithEligibility(await shouldSchedulePeriodicJob(jobType), handler);
}
