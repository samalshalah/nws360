import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isUtilityReference(line)) continue;

      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(line)) {
          violations.push(`  ${normalized}:${i + 1} — ${pattern.label}\n    > ${line.trim()}`);
        }
      }
    }
  }

  return { violations, scanned };
}

console.log("[AI Gateway Guard] Scanning for unauthorized OpenAI usage...");
const { violations, scanned } = scanFiles();

console.log(`  Scanned ${scanned} files (excluding ${APPROVED_FILES.size} approved files)`);

if (violations.length > 0) {
  console.error(`\n  VIOLATIONS FOUND (${violations.length}):`);
  violations.forEach(v => console.error(v));
  console.error(`\n  All OpenAI calls must go through server/ai/ai-gateway.ts`);
  process.exit(1);
} else {
  console.log("  No unauthorized OpenAI usage found");
}
