import * as fs from "fs";
import * as path from "path";

const SERVER_DIR = path.resolve(import.meta.dirname, "..", "server");

interface Violation {
  level: "FAIL" | "WARN";
  file: string;
  line: number;
  message: string;
  reason: string;
}

const STORAGE_METHODS_NEEDING_TENANT = [
  "getKeywords",
  "createKeyword",
  "deleteKeyword",
  "getWebhook",
  "deleteWebhook",
  "getKnowledgeEntries",
  "upsertKnowledgeEntry",
  "getTasks",
  "getTask",
  "getActivityFeed",
  "getArticle",
  "getArticles",
  "getSource",
  "updateSource",
  "deleteSource",
  "deleteNotificationSetting",
  "getWebhookDeliveries",
  "getArticleTranslation",
  "updateArticleTranslation",
  "getContentVolume",
  "getTrendingTopics",
  "getKeywordAnalysis",
  "getSentimentReports",
  "getSourceBehavior",
];

const ADMIN_ROUTE_PREFIXES = [
  "/api/admin/",
  "/api/v1/",
  "/api/auth/",
  "/api/demo",
  "/api/login",
  "/api/logout",
  "/api/register",
  "/api/ops/",
];

const KNOWN_SAFE_PATTERNS = [
  "resolveClientId(",
  "getUserSourceIds(",
  "requireSystemAdmin(",
  "requireAdmin(",
  "assertTenant(",
  "isSystemAdmin(",
  "scopedSourceIds",
];

function collectTsFiles(dir: string, prefix = ""): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".ts")) {
      results.push(rel);
    }
  }
  return results;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const relPath = path.relative(process.cwd(), filePath);

  let currentRoute: { method: string; path: string; startLine: number } | null = null;
  let routeBlock: string[] = [];
  let braceDepth = 0;
  let inRouteHandler = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/req\.user\.clientId/.test(line) && !/resolveClientId/.test(line)) {
      violations.push({
        level: "WARN",
        file: relPath,
        line: lineNum,
        message: "direct user.clientId usage",
        reason: "Use resolveClientId() to properly resolve tenant context with impersonation support",
      });
    }

    const routeMatch = line.match(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/);
    if (routeMatch) {
      if (inRouteHandler && currentRoute) {
        analyzeRouteBlock(relPath, currentRoute, routeBlock.join("\n"), violations);
      }
      currentRoute = { method: routeMatch[1], path: routeMatch[2], startLine: lineNum };
      routeBlock = [line];
      braceDepth = 0;
      inRouteHandler = true;
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      continue;
    }

    if (inRouteHandler) {
      routeBlock.push(line);
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth <= 0 && routeBlock.length > 1) {
        if (currentRoute) {
          analyzeRouteBlock(relPath, currentRoute, routeBlock.join("\n"), violations);
        }
        inRouteHandler = false;
        currentRoute = null;
        routeBlock = [];
      }
    }
  }

  if (inRouteHandler && currentRoute) {
    analyzeRouteBlock(relPath, currentRoute, routeBlock.join("\n"), violations);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const sqlMatch = line.match(/sql`[^`]*WHERE\s+[^`]*\bid\s*=\s*/i);
    if (sqlMatch && !/client_id/i.test(line) && !/source_id/i.test(line) && !/user_id/i.test(line)) {
      const surroundingLines = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join("\n");
      if (!/client_id/i.test(surroundingLines) && !/clientId/i.test(surroundingLines)) {
        if (!ADMIN_ROUTE_PREFIXES.some((p) => surroundingLines.includes(p))) {
          violations.push({
            level: "FAIL",
            file: relPath,
            line: lineNum,
            message: "SQL query filters by id but not clientId",
            reason: "SQL WHERE clause uses id without tenant scoping - potential cross-tenant access",
          });
        }
      }
    }
  }

  return violations;
}

function analyzeRouteBlock(
  file: string,
  route: { method: string; path: string; startLine: number },
  block: string,
  violations: Violation[],
): void {
  if (ADMIN_ROUTE_PREFIXES.some((p) => route.path.startsWith(p))) {
    return;
  }

  if (/sendStatus\(401\)|status\(401\)|"Not authenticated"/.test(block) === false) {
    return;
  }

  const hasTenantContext = KNOWN_SAFE_PATTERNS.some((p) => block.includes(p));

  const storageCallRegex = /storage\.(get|update|delete|find|create|upsert)\w+\(/g;
  let match;
  while ((match = storageCallRegex.exec(block)) !== null) {
    const methodName = block.slice(match.index + 8, block.indexOf("(", match.index));

    if (!STORAGE_METHODS_NEEDING_TENANT.includes(methodName)) {
      continue;
    }

    const callStart = match.index;
    let parenDepth = 0;
    let callEnd = callStart;
    for (let j = block.indexOf("(", callStart); j < block.length; j++) {
      if (block[j] === "(") parenDepth++;
      if (block[j] === ")") parenDepth--;
      if (parenDepth === 0) {
        callEnd = j;
        break;
      }
    }
    const callArgs = block.slice(block.indexOf("(", callStart), callEnd + 1);

    if (!/clientId|scopedSourceIds|user\.id/.test(callArgs) && !hasTenantContext) {
      const blockLines = block.substring(0, match.index).split("\n");
      const callLine = route.startLine + blockLines.length - 1;

      violations.push({
        level: "FAIL",
        file,
        line: callLine,
        message: `missing tenant filter on storage.${methodName}()`,
        reason: `Route ${route.method.toUpperCase()} ${route.path} calls storage.${methodName}() without clientId parameter`,
      });
    }
  }
}

function main(): void {
  const files = collectTsFiles(SERVER_DIR);
  const allViolations: Violation[] = [];

  for (const file of files) {
    const filePath = path.join(SERVER_DIR, file);
    const violations = scanFile(filePath);
    allViolations.push(...violations);
  }

  const fails = allViolations.filter((v) => v.level === "FAIL");
  const warns = allViolations.filter((v) => v.level === "WARN");

  console.log("\n=== NWS360 Tenant Guard Scanner ===\n");

  if (allViolations.length === 0) {
    console.log("[PASS] no violations\n");
    process.exit(0);
  }

  for (const v of fails) {
    console.log(`[FAIL] ${v.file}:${v.line} -> ${v.message} -> ${v.reason}`);
  }

  for (const v of warns) {
    console.log(`[WARN] ${v.file}:${v.line} -> ${v.message} -> ${v.reason}`);
  }

  console.log(`\nSummary: ${fails.length} FAIL, ${warns.length} WARN\n`);

  if (fails.length > 0) {
    process.exit(1);
  }
}

main();
