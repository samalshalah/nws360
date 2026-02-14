import { execSync } from "child_process";
import { readFileSync } from "fs";

const APPROVED_FILES = new Set([
  "server/ai/ai-gateway.ts",
]);

const APPROVED_DIRS = [
  "server/replit_integrations/",
];

const PATTERNS = [
  { regex: /from\s+["']openai["']/g, label: 'import from "openai"' },
  { regex: /require\s*\(\s*["']openai["']\s*\)/g, label: 'require("openai")' },
  { regex: /import\s*\(\s*["']openai["']\s*\)/g, label: 'dynamic import("openai")' },
  { regex: /new\s+OpenAI\s*\(/g, label: "new OpenAI() construction" },
  { regex: /OpenAI\s*\.\s*default/g, label: "OpenAI.default access" },
];

const UTILITY_ALLOWLIST = [
  /openaiLimiter/,
];

function isUtilityReference(line: string): boolean {
  return UTILITY_ALLOWLIST.some(p => p.test(line));
}

function scanFiles(): { violations: string[]; scanned: number; importCensus: Map<string, string[]> } {
  const violations: string[] = [];
  const importCensus = new Map<string, string[]>();
  let scanned = 0;

  const files = execSync("find server -name '*.ts' -not -path '*/node_modules/*'", { encoding: "utf-8" })
    .trim()
    .split("\n")
    .filter(Boolean);

  for (const filePath of files) {
    const normalized = filePath.replace(/^\.\//, "");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const hasOpenAIImport = lines.some(l =>
      /from\s+["']openai["']/.test(l) ||
      /require\s*\(\s*["']openai["']\s*\)/.test(l) ||
      /import\s*\(\s*["']openai["']\s*\)/.test(l)
    );
    if (hasOpenAIImport) {
      const matches = lines
        .map((l, i) => ({ line: l, num: i + 1 }))
        .filter(({ line }) =>
          /from\s+["']openai["']/.test(line) ||
          /require\s*\(\s*["']openai["']\s*\)/.test(line) ||
          /import\s*\(\s*["']openai["']\s*\)/.test(line)
        )
        .map(({ line, num }) => `L${num}: ${line.trim()}`);
      importCensus.set(normalized, matches);
    }

    if (APPROVED_FILES.has(normalized)) continue;
    if (APPROVED_DIRS.some(d => normalized.startsWith(d))) continue;
    scanned++;

    if (isUtilityReference(content)) {
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (isUtilityReference(lines[i])) continue;

      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(lines[i])) {
          violations.push(`  ${normalized}:${i + 1} — ${pattern.label}\n    > ${trimmed}`);
        }
      }
    }
  }

  return { violations, scanned, importCensus };
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
      return { tested: true, safe: true, detail: `Confirmed: ${body.reason || body.error}` };
    }

    return { tested: true, safe: false, detail: `Ambiguous response (treating as UNSAFE): ${JSON.stringify(body)}` };
  } catch (err: any) {
    return { tested: false, safe: false, detail: `Server not reachable: ${err.message}` };
  }
}

function checkProductionLockdown(): { safe: boolean; detail: string } {
  const routesContent = readFileSync("server/routes.ts", "utf-8");

  const hasCondition = /NODE_ENV\s*===?\s*["']production["']/.test(routesContent);
  const blocksReplit = /app\.use\s*\(\s*["']\/replit_integrations["']/.test(routesContent);
  const blocksApiReplit = /app\.use\s*\(\s*["']\/api\/replit_integrations["']/.test(routesContent);
  const returns404 = /res\.sendStatus\s*\(\s*404\s*\)/.test(routesContent);

  if (hasCondition && blocksReplit && blocksApiReplit && returns404) {
    return { safe: true, detail: "routes.ts contains production lockdown: /replit_integrations and /api/replit_integrations → 404" };
  }

  const missing: string[] = [];
  if (!hasCondition) missing.push("NODE_ENV=production guard");
  if (!blocksReplit) missing.push("/replit_integrations block");
  if (!blocksApiReplit) missing.push("/api/replit_integrations block");
  if (!returns404) missing.push("404 response");
  return { safe: false, detail: `Missing production lockdown components: ${missing.join(", ")}` };
}

async function main() {
  let failed = false;

  console.log("=======================================================");
  console.log("  AI FIREWALL SECURITY REPORT");
  console.log("  Date: " + new Date().toISOString());
  console.log("=======================================================");

  console.log("\n[Phase 1] Static Import Census...");
  const { violations, scanned, importCensus } = scanFiles();

  console.log(`  Files importing "openai": ${importCensus.size}`);
  for (const [file, refs] of importCensus) {
    const approved = APPROVED_FILES.has(file) || APPROVED_DIRS.some(d => file.startsWith(d));
    const tag = approved ? "[APPROVED]" : "[VIOLATION]";
    console.log(`    ${tag} ${file}`);
    refs.forEach(r => console.log(`      ${r}`));
  }

  const unauthorizedImporters = [...importCensus.keys()].filter(
    f => !APPROVED_FILES.has(f) && !APPROVED_DIRS.some(d => f.startsWith(d))
  );
  if (unauthorizedImporters.length > 0) {
    console.error(`\n  CRITICAL: ${unauthorizedImporters.length} unauthorized file(s) import "openai"`);
  } else {
    console.log(`  0 user-managed files import "openai" directly — COMPLIANT`);
  }

  console.log(`\n[Phase 2] Static Pattern Scan (${scanned} files)...`);
  if (violations.length > 0) {
    console.error(`  VIOLATIONS FOUND (${violations.length}):`);
    violations.forEach(v => console.error(v));
    console.error(`\n  All OpenAI calls must go through server/ai/ai-gateway.ts`);
    failed = true;
  } else {
    console.log("  0 violations — no unauthorized OpenAI patterns detected");
  }

  console.log("\n[Phase 3] Runtime Bypass Endpoint...");
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
    failed = true;
  }

  console.log("\n[Phase 4] Production Lockdown (/replit_integrations)...");
  const lockdown = checkProductionLockdown();
  if (lockdown.safe) {
    console.log(`  [PASS] ${lockdown.detail}`);
  } else {
    console.error(`  [CRITICAL] ${lockdown.detail}`);
    failed = true;
  }

  console.log("\n=======================================================");
  if (failed) {
    console.error("  FINAL STATUS: *** UNSAFE ***");
    process.exit(1);
  }
  console.log("  FINAL STATUS: ALL CHECKS PASSED");
  console.log("=======================================================");
}

main();
