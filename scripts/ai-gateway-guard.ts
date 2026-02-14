import { execSync } from "child_process";
import { readFileSync } from "fs";

const APPROVED_FILES = new Set([
  "server/ai/ai-gateway.ts",
]);

const APPROVED_DIRS = [
  "server/replit_integrations/",
];

const PATTERNS = [
  { regex: /openai\.chat\.completions\.create/g, label: "direct openai.chat.completions.create call" },
  { regex: /new OpenAI\(\)/g, label: "new OpenAI() instantiation" },
  { regex: /from\s+["']openai["']/g, label: "direct import from 'openai'" },
  { regex: /import\s+OpenAI/g, label: "direct OpenAI import" },
];

const UTILITY_ALLOWLIST = [
  /openaiLimiter/,
];

const SENTINEL_START = "// AI_BYPASS_TEST_START";
const SENTINEL_END = "// AI_BYPASS_TEST_END";

function isUtilityReference(line: string): boolean {
  return UTILITY_ALLOWLIST.some(p => p.test(line));
}

function scanFiles(): { violations: string[]; scanned: number } {
  const violations: string[] = [];
  let scanned = 0;

  const files = execSync("find server -name '*.ts' -not -path '*/node_modules/*'", { encoding: "utf-8" })
    .trim()
    .split("\n")
    .filter(Boolean);

  for (const filePath of files) {
    const normalized = filePath.replace(/^\.\//, "");
    if (APPROVED_FILES.has(normalized)) continue;
    if (APPROVED_DIRS.some(d => normalized.startsWith(d))) continue;

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    scanned++;

    let inBypassBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (trimmed === SENTINEL_START) {
        inBypassBlock = true;
        continue;
      }
      if (trimmed === SENTINEL_END) {
        inBypassBlock = false;
        continue;
      }
      if (inBypassBlock) continue;

      if (isUtilityReference(lines[i])) continue;

      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(lines[i])) {
          violations.push(`  ${normalized}:${i + 1} — ${pattern.label}\n    > ${trimmed}`);
        }
      }
    }
  }

  return { violations, scanned };
}

async function hitBypassEndpoint(): Promise<{ tested: boolean; safe: boolean; detail: string }> {
  const port = process.env.PORT || "5000";
  const url = `http://localhost:${port}/dev/ai-bypass-test`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      return { tested: true, safe: true, detail: `HTTP ${resp.status} — route blocked or unavailable` };
    }
    const body = await resp.json() as any;

    if (body.ok === true && body.blocked === false) {
      return { tested: true, safe: false, detail: `CRITICAL: Direct OpenAI call SUCCEEDED without gateway! Response: ${JSON.stringify(body)}` };
    }

    if (body.ok === false && body.blocked === true) {
      return { tested: true, safe: true, detail: `Blocked correctly: ${body.error}` };
    }

    return { tested: true, safe: false, detail: `Ambiguous response (treating as UNSAFE): ${JSON.stringify(body)}` };
  } catch (err: any) {
    return { tested: false, safe: false, detail: `Server not reachable: ${err.message}` };
  }
}

async function main() {
  let failed = false;

  console.log("[AI Gateway Guard] Phase 1: Static scan...");
  const { violations, scanned } = scanFiles();

  console.log(`  Scanned ${scanned} files (excluding ${APPROVED_FILES.size} approved files + replit_integrations)`);

  if (violations.length > 0) {
    console.error(`\n  STATIC VIOLATIONS FOUND (${violations.length}):`);
    violations.forEach(v => console.error(v));
    console.error(`\n  All OpenAI calls must go through server/ai/ai-gateway.ts`);
    failed = true;
  } else {
    console.log("  No unauthorized OpenAI usage found");
  }

  console.log("\n[AI Gateway Guard] Phase 2: Runtime bypass endpoint test...");
  const runtime = await hitBypassEndpoint();
  if (runtime.tested) {
    if (runtime.safe) {
      console.log(`  [PASS] ${runtime.detail}`);
    } else {
      console.error(`  [CRITICAL] ${runtime.detail}`);
      failed = true;
    }
  } else {
    console.error(`  [FAIL] ${runtime.detail}`);
    console.error(`  Runtime test could not reach the server — cannot verify bypass protection`);
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }
  console.log("\n  All checks passed");
}

main();
