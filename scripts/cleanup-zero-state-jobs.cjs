#!/usr/bin/env node
require("dotenv/config");
const pg = require("pg");

const PERIODIC_TYPES = [
  "COMPUTE_ANALYTICS",
  "DATA_RETENTION",
  "DELIVER_BRIEFINGS",
  "INTELLIGENCE_PIPELINE",
];

function parseArgs(argv) {
  const options = { apply: false, windowMinutes: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--window-minutes") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--window-minutes must be a positive number");
      options.windowMinutes = value;
      i += 1;
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    application_name: "nws360-cleanup-zero-state-jobs",
  });
  await client.connect();
  try {
    const clientCountResult = await client.query("SELECT count(*)::int AS count FROM public.clients");
    const clientCount = clientCountResult.rows[0]?.count ?? 0;
    if (clientCount !== 0) {
      console.log(JSON.stringify({
        mode: options.apply ? "apply" : "dry-run",
        readyForApply: false,
        reason: "clients_exist",
        clientCount,
        jobs: [],
      }, null, 2));
      return;
    }

    const auditResult = await client.query(`
      SELECT id, created_at
        FROM public.platform_reset_audit
       WHERE result = 'success'
       ORDER BY created_at DESC
       LIMIT 1
    `);
    const audit = auditResult.rows[0];
    if (!audit) {
      throw new Error("No successful platform reset audit was found");
    }

    const firstBatchResult = await client.query(`
      SELECT min(created_at) AS first_created_at
        FROM public.processing_jobs
       WHERE created_at > $1
         AND type = ANY($2)
         AND status IN ('completed', 'failed')
    `, [audit.created_at, PERIODIC_TYPES]);
    const firstCreatedAt = firstBatchResult.rows[0]?.first_created_at;
    const windowEnd = firstCreatedAt
      ? new Date(new Date(firstCreatedAt).getTime() + options.windowMinutes * 60 * 1000)
      : null;

    const jobsResult = firstCreatedAt ? await client.query(`
      SELECT id, type, status, created_at, completed_at, last_error
        FROM public.processing_jobs
       WHERE created_at > $1
         AND type = ANY($2)
         AND status IN ('completed', 'failed')
         AND created_at >= $3
         AND created_at <= $4
       ORDER BY id
    `, [audit.created_at, PERIODIC_TYPES, firstCreatedAt, windowEnd]) : { rows: [] };
    const blockedResult = await client.query(`
      SELECT id, type, status, created_at
        FROM public.processing_jobs
       WHERE created_at > $1
         AND type = ANY($2)
         AND status IN ('pending', 'running')
       ORDER BY id
    `, [audit.created_at, PERIODIC_TYPES]);

    const jobs = jobsResult.rows;
    if (options.apply && jobs.length > 0) {
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM public.processing_jobs WHERE id = ANY($1)", [jobs.map((job) => job.id)]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log(JSON.stringify({
      mode: options.apply ? "apply" : "dry-run",
      readyForApply: true,
      resetAudit: {
        id: audit.id,
        createdAt: audit.created_at,
      },
      selection: {
        type: "first_post_reset_periodic_batch",
        windowMinutes: options.windowMinutes,
        firstCreatedAt,
        windowEnd,
      },
      deleted: options.apply ? jobs.length : 0,
      jobs,
      protectedPendingOrRunningJobs: blockedResult.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
