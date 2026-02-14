import { execSync } from "child_process";
import { readFileSync } from "fs";

const SOLE_APPROVED_FILE = "server/ai/ai-gateway.ts";

const PATTERNS = [
  { regex: /from\s+["']openai["']/g, label: 'import from "openai"' },
  { regex: /require\s*\(\s*["']openai["']\s*\)/g, label: 'require("openai")' },
  { regex: /import\s*\(\s*["']openai["']\s*\)/g, label: 'dynamic import("openai")' },
  { regex: /new\s+OpenAI\s*\(/g, label: "new OpenAI() construction" },
];

interface ScanResult {
  violations: string[];
  scanned: number;
  importCensus: Map<string, string[]>;
}

function scanFiles(): ScanResult {
  const violations: string[] = [];
  const importCensus = new Map<string, string[]>();
  let scanned = 0;

  const serverFiles = execSync("find server -name '*.ts' -not -path '*/node_modules/*'", { encoding: "utf-8" })
    .trim().split("\n").filter(Boolean);

  const scriptFiles = execSync("find scripts -name '*.ts' -not -path '*/node_modules/*'", { encoding: "utf-8" })
    .trim().split("\n").filter(Boolean);

  const allFiles = [...serverFiles, ...scriptFiles];

  for (const filePath of allFiles) {
    const normalized = filePath.replace(/^\.\//, "");
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    scanned++;

    let inTemplateLiteral = false;
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (inBlockComment) {
        if (trimmed.includes("*/")) inBlockComment = false;
        continue;
      }
      if (trimmed.startsWith("/*")) {
        inBlockComment = true;
        if (trimmed.includes("*/")) inBlockComment = false;
        continue;
      }
      if (trimmed.startsWith("//")) continue;

      const backtickCount = (line.match(/(?<!\\)`/g) || []).length;
      if (backtickCount % 2 === 1) inTemplateLiteral = !inTemplateLiteral;
      if (inTemplateLiteral && backtickCount === 0) continue;

      if (/^\s*\{?\s*regex\s*:/.test(trimmed)) continue;

      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (!pattern.regex.test(line)) continue;

        if (normalized === SOLE_APPROVED_FILE) {
          if (!importCensus.has(normalized)) importCensus.set(normalized, []);
          importCensus.get(normalized)!.push(`L${i + 1}: ${trimmed}`);
        } else {
          if (!importCensus.has(normalized)) importCensus.set(normalized, []);
          importCensus.get(normalized)!.push(`L${i + 1}: ${trimmed}`);
          violations.push(`  ${normalized}:${i + 1} — ${pattern.label}\n    > ${trimmed}`);
        }
      }
    }
  }

  return { violations, scanned, importCensus };
}

function checkProductionLockdown(): { safe: boolean; details: string[] } {
  const content = readFileSync("server/routes.ts", "utf-8");
  const details: string[] = [];
  let safe = true;

  const hasEnvGuard = /NODE_ENV\s*===?\s*["']production["']/.test(content);
  if (hasEnvGuard) {
    details.push("[PASS] NODE_ENV === 'production' guard present");
  } else {
    details.push("[CRITICAL] Missing NODE_ENV === 'production' guard");
    safe = false;
  }

  const blocksReplit = /app\.use\s*\(\s*["']\/replit_integrations["']/.test(content);
  if (blocksReplit) {
    details.push("[PASS] /replit_integrations route blocked");
  } else {
    details.push("[CRITICAL] /replit_integrations route NOT blocked");
    safe = false;
  }

  const blocksApiReplit = /app\.use\s*\(\s*["']\/api\/replit_integrations["']/.test(content);
  if (blocksApiReplit) {
    details.push("[PASS] /api/replit_integrations route blocked");
  } else {
    details.push("[CRITICAL] /api/replit_integrations route NOT blocked");
    safe = false;
  }

  const returns404 = /res\.sendStatus\s*\(\s*404\s*\)/.test(content);
  if (returns404) {
    details.push("[PASS] Returns 404 for blocked routes");
  } else {
    details.push("[CRITICAL] No 404 response for blocked routes");
    safe = false;
  }

  return { safe, details };
}

function main() {
  let failed = false;

  console.log("=======================================================");
  console.log("  AI SECURITY REPORT — Strict Single-Import Enforcement");
  console.log("  Date: " + new Date().toISOString());
  console.log("  Rule: ONLY server/ai/ai-gateway.ts may import openai");
  console.log("  Scope: server/**/*.ts + scripts/**/*.ts");
  console.log("=======================================================");

  console.log("\n[Phase 1] Static Import Census");
  console.log("  Scanning server/ and scripts/ for OpenAI SDK usage...\n");

  const { violations, scanned, importCensus } = scanFiles();

  const approvedCount = importCensus.has(SOLE_APPROVED_FILE) ? 1 : 0;
  const violatingFiles = [...importCensus.keys()].filter(f => f !== SOLE_APPROVED_FILE);

  console.log(`  Files scanned: ${scanned}`);
  console.log(`  Files importing openai: ${importCensus.size}`);
  console.log(`  Approved (${SOLE_APPROVED_FILE}): ${approvedCount}`);
  console.log(`  Violations: ${violatingFiles.length}\n`);

  for (const [file, refs] of importCensus) {
    const tag = file === SOLE_APPROVED_FILE ? "[APPROVED]" : "[VIOLATION]";
    console.log(`  ${tag} ${file}`);
    refs.forEach(r => console.log(`    ${r}`));
  }

  if (approvedCount === 0) {
    console.log(`\n  WARNING: ${SOLE_APPROVED_FILE} does not import openai — gateway may be broken`);
  }

  console.log(`\n[Phase 2] Violation Report`);
  if (violations.length > 0) {
    console.error(`  CRITICAL: ${violations.length} unauthorized OpenAI pattern(s) detected:\n`);
    violations.forEach(v => console.error(v));
    console.error(`\n  All OpenAI SDK access MUST go through ${SOLE_APPROVED_FILE}`);
    failed = true;
  } else {
    console.log("  0 violations — strict single-import rule enforced");
  }

  console.log("\n[Phase 3] Production Lockdown Verification");
  const lockdown = checkProductionLockdown();
  lockdown.details.forEach(d => console.log(`  ${d}`));
  if (!lockdown.safe) {
    failed = true;
  }

  console.log("\n=======================================================");
  console.log("  AI SECURITY REPORT SUMMARY");
  console.log("-------------------------------------------------------");
  console.log(`  OpenAI import count:     ${importCensus.size} file(s)`);
  console.log(`  Approved imports:        ${approvedCount}`);
  console.log(`  Violations:              ${violations.length}`);
  console.log(`  Production lockdown:     ${lockdown.safe ? "ENFORCED" : "MISSING"}`);
  console.log("-------------------------------------------------------");

  if (failed) {
    console.error("  FINAL STATUS: *** UNSAFE — VIOLATIONS DETECTED ***");
    console.log("=======================================================");
    process.exit(1);
  }
  console.log("  FINAL STATUS: SECURE — ALL CHECKS PASSED");
  console.log("=======================================================");
}

main();
