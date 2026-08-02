import type { JobType } from "./processing-queue";

export type PeriodicSkipReason =
  | "no_eligible_clients_or_articles"
  | "no_due_briefings"
  | "no_data_to_retain"
  | "no_eligible_monitoring_scope";

export type PeriodicJobEligibilitySnapshot = {
  activeClientCount: number;
  activeWorkspaceCount: number;
  activeArticleCount: number;
  activeSourceCount: number;
  dueBriefingCount: number;
  retentionCandidateCount: number;
};

export type PeriodicJobEligibility = {
  jobType: JobType;
  eligible: boolean;
  status: "eligible" | "skipped";
  reason?: PeriodicSkipReason;
  snapshot: PeriodicJobEligibilitySnapshot;
};

export type SkippedPeriodicJobResult = {
  status: "skipped";
  reason: PeriodicSkipReason;
  processed: 0;
};

export function evaluatePeriodicJobEligibility(
  jobType: JobType,
  snapshot: PeriodicJobEligibilitySnapshot,
): PeriodicJobEligibility {
  const skipped = (reason: PeriodicSkipReason): PeriodicJobEligibility => ({
    jobType,
    eligible: false,
    status: "skipped",
    reason,
    snapshot,
  });

  switch (jobType) {
    case "COMPUTE_ANALYTICS":
      if (snapshot.activeClientCount === 0 || snapshot.activeArticleCount === 0) {
        return skipped("no_eligible_clients_or_articles");
      }
      break;
    case "DELIVER_BRIEFINGS":
      if (snapshot.activeClientCount === 0 || snapshot.dueBriefingCount === 0) {
        return skipped("no_due_briefings");
      }
      break;
    case "DATA_RETENTION":
      if (snapshot.retentionCandidateCount === 0) {
        return skipped("no_data_to_retain");
      }
      break;
    case "INTELLIGENCE_PIPELINE":
      if (snapshot.activeClientCount === 0 || snapshot.activeWorkspaceCount === 0) {
        return skipped("no_eligible_monitoring_scope");
      }
      break;
    default:
      break;
  }

  return {
    jobType,
    eligible: true,
    status: "eligible",
    snapshot,
  };
}

export function skippedPeriodicJobResult(eligibility: PeriodicJobEligibility): SkippedPeriodicJobResult {
  if (eligibility.eligible || !eligibility.reason) {
    throw new Error(`Cannot build skipped result for eligible job ${eligibility.jobType}`);
  }
  return {
    status: "skipped",
    reason: eligibility.reason,
    processed: 0,
  };
}

export async function runPeriodicJobWithEligibility<T>(
  eligibility: PeriodicJobEligibility,
  handler: () => Promise<T>,
): Promise<T | SkippedPeriodicJobResult> {
  if (!eligibility.eligible) {
    return skippedPeriodicJobResult(eligibility);
  }
  return handler();
}
