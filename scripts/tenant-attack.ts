import { db } from "../server/db";
import { users, clients, sources, articles, keywords, tasks, knowledgeEntries } from "../shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

interface AttackResult {
  endpoint: string;
  method: string;
  status: number;
  body: string;
  passed: boolean;
  reason: string;
}

interface TenantData {
  sourceId: number;
  articleId: number;
  keywordId: number;
  taskId: number;
  knowledgeId: number;
  userId: number;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

async function setupTestTenants(): Promise<{
  tenantA: { username: string; password: string; clientId: number; userId: number };
  tenantB: { username: string; password: string; clientId: number; userId: number };
}> {
  const suffix = randomBytes(4).toString("hex");
  const passwordA = `testpass_a_${suffix}`;
  const passwordB = `testpass_b_${suffix}`;

  let [clientA] = await db
    .select()
    .from(clients)
    .where(eq(clients.name, `__pentest_tenant_a_${suffix}`))
    .limit(1);
  if (!clientA) {
    [clientA] = await db
      .insert(clients)
      .values({ name: `__pentest_tenant_a_${suffix}` })
      .returning();
  }

  let [clientB] = await db
    .select()
    .from(clients)
    .where(eq(clients.name, `__pentest_tenant_b_${suffix}`))
    .limit(1);
  if (!clientB) {
    [clientB] = await db
      .insert(clients)
      .values({ name: `__pentest_tenant_b_${suffix}` })
      .returning();
  }

  const hashedA = await hashPassword(passwordA);
  const hashedB = await hashPassword(passwordB);
  const usernameA = `pentest_a_${suffix}`;
  const usernameB = `pentest_b_${suffix}`;

  const [userA] = await db
    .insert(users)
    .values({ username: usernameA, password: hashedA, role: "client_user", clientId: clientA.id })
    .returning();

  const [userB] = await db
    .insert(users)
    .values({ username: usernameB, password: hashedB, role: "client_user", clientId: clientB.id })
    .returning();

  return {
    tenantA: { username: usernameA, password: passwordA, clientId: clientA.id, userId: userA.id },
    tenantB: { username: usernameB, password: passwordB, clientId: clientB.id, userId: userB.id },
  };
}

async function createTenantBData(clientId: number, userId: number, suffix: string): Promise<TenantData> {
  const [source] = await db
    .insert(sources)
    .values({
      name: `__pentest_source_b_${suffix}`,
      url: `https://pentest-b-${suffix}.example.com/rss`,
      type: "rss",
      clientId,
      userId,
    })
    .returning();

  const [article] = await db
    .insert(articles)
    .values({
      title: `__pentest_article_b_${suffix}`,
      content: "Pentest article content for tenant B",
      url: `https://pentest-b-${suffix}.example.com/article`,
      sourceId: source.id,
      clientId,
    })
    .returning();

  const [keyword] = await db
    .insert(keywords)
    .values({ term: `__pentest_kw_b_${suffix}`, clientId })
    .returning();

  const [task] = await db
    .insert(tasks)
    .values({
      title: `__pentest_task_b_${suffix}`,
      createdBy: userId,
      clientId,
    })
    .returning();

  const [knowledge] = await db
    .insert(knowledgeEntries)
    .values({
      questionPattern: `__pentest_q_b_${suffix}`,
      answerSummary: "Pentest answer for tenant B",
      clientId,
    })
    .returning();

  return {
    sourceId: source.id,
    articleId: article.id,
    keywordId: keyword.id,
    taskId: task.id,
    knowledgeId: knowledge.id,
    userId,
  };
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    redirect: "manual",
  });

  if (res.status !== 200) {
    throw new Error(`Login failed for ${username}: ${res.status} ${await res.text()}`);
  }

  const cookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = cookies.find((c) => c.startsWith("connect.sid="));
  if (!sessionCookie) {
    throw new Error(`No session cookie returned for ${username}`);
  }
  return sessionCookie.split(";")[0];
}

async function attackEndpoint(
  cookie: string,
  method: string,
  path: string,
  foreignId: number,
  body?: object,
): Promise<AttackResult> {
  const url = `${BASE_URL}${path.replace(":id", String(foreignId))}`;

  const opts: RequestInit = {
    method: method.toUpperCase(),
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    redirect: "manual",
  };

  if (body && method !== "GET" && method !== "DELETE") {
    opts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, opts);
    const text = await res.text();

    let hasDataLeak = false;
    if (res.status === 200) {
      try {
        const json = JSON.parse(text);
        if (json && typeof json === "object" && !json.message) {
          if (Array.isArray(json) && json.length > 0) hasDataLeak = true;
          else if (!Array.isArray(json) && Object.keys(json).length > 2) hasDataLeak = true;
        }
      } catch {
        if (text.length > 50) hasDataLeak = true;
      }
    }

    let reason = "";
    if (hasDataLeak) {
      reason = `CRITICAL: Returned data from foreign tenant (status=${res.status}, body_length=${text.length})`;
    } else if (res.status === 403) {
      reason = `INFO: Returned 403 instead of 404 (reveals resource existence)`;
    }

    return {
      endpoint: `${method.toUpperCase()} ${path}`,
      method: method.toUpperCase(),
      status: res.status,
      body: text.substring(0, 200),
      passed: !hasDataLeak,
      reason,
    };
  } catch (err: any) {
    return {
      endpoint: `${method.toUpperCase()} ${path}`,
      method: method.toUpperCase(),
      status: 0,
      body: err.message,
      passed: true,
      reason: `Network error (endpoint may not exist): ${err.message.substring(0, 100)}`,
    };
  }
}

async function cleanup(suffix: string, tenantBData?: TenantData): Promise<void> {
  try {
    if (tenantBData) {
      await db.delete(knowledgeEntries).where(eq(knowledgeEntries.questionPattern, `__pentest_q_b_${suffix}`));
      await db.delete(tasks).where(eq(tasks.title, `__pentest_task_b_${suffix}`));
      await db.delete(keywords).where(eq(keywords.term, `__pentest_kw_b_${suffix}`));
      await db.delete(articles).where(eq(articles.title, `__pentest_article_b_${suffix}`));
      await db.delete(sources).where(eq(sources.name, `__pentest_source_b_${suffix}`));
    }
    await db.delete(users).where(eq(users.username, `pentest_a_${suffix}`));
    await db.delete(users).where(eq(users.username, `pentest_b_${suffix}`));
    await db.delete(clients).where(eq(clients.name, `__pentest_tenant_a_${suffix}`));
    await db.delete(clients).where(eq(clients.name, `__pentest_tenant_b_${suffix}`));
  } catch {}
}

async function main(): Promise<void> {
  console.log("\n=== NWS360 Tenant Attack Penetration Test ===\n");

  const { tenantA, tenantB } = await setupTestTenants();
  const suffix = tenantA.username.replace("pentest_a_", "");
  let tenantBData: TenantData | undefined;

  try {
    console.log(`[SETUP] Created tenant A (clientId=${tenantA.clientId}) and tenant B (clientId=${tenantB.clientId})`);

    tenantBData = await createTenantBData(tenantB.clientId, tenantB.userId, suffix);
    console.log(`[SETUP] Created tenant B data: source=${tenantBData.sourceId}, article=${tenantBData.articleId}, keyword=${tenantBData.keywordId}, task=${tenantBData.taskId}, knowledge=${tenantBData.knowledgeId}`);

    const cookieA = await login(tenantA.username, tenantA.password);
    console.log(`[AUTH] Logged in as tenant A: ${tenantA.username}`);

    const endpoints: Array<{ method: string; path: string; foreignId: number; body?: object; label: string }> = [
      { method: "POST", path: "/api/sources/:id/fetch", foreignId: tenantBData.sourceId, label: "source fetch" },
      { method: "GET", path: "/api/articles/:id", foreignId: tenantBData.articleId, label: "article read" },
      { method: "POST", path: "/api/articles/:id/translate", foreignId: tenantBData.articleId, body: { targetLanguage: "ar" }, label: "article translate" },
      { method: "DELETE", path: "/api/keywords/:id", foreignId: tenantBData.keywordId, label: "keyword delete" },
      { method: "PATCH", path: "/api/users/:id/role", foreignId: tenantBData.userId, body: { role: "client_admin" }, label: "user role change" },
      { method: "DELETE", path: "/api/users/:id", foreignId: tenantBData.userId, label: "user delete" },
      { method: "DELETE", path: "/api/collaboration/tasks/:id", foreignId: tenantBData.taskId, label: "task delete" },
      { method: "PATCH", path: "/api/collaboration/tasks/:id", foreignId: tenantBData.taskId, body: { status: "resolved" }, label: "task update" },
      { method: "GET", path: "/api/knowledge/timelines/:id", foreignId: tenantBData.knowledgeId, label: "timeline read" },
      { method: "PATCH", path: "/api/knowledge/timelines/:id", foreignId: tenantBData.knowledgeId, body: { name: "hacked" }, label: "timeline update" },
      { method: "DELETE", path: "/api/knowledge/timelines/:id", foreignId: tenantBData.knowledgeId, label: "timeline delete" },
      { method: "GET", path: "/api/knowledge/timelines/:id/events", foreignId: tenantBData.knowledgeId, label: "timeline events" },
      { method: "PATCH", path: "/api/knowledge/entity-memory/:id", foreignId: tenantBData.knowledgeId, body: { name: "hacked" }, label: "entity memory update" },
      { method: "DELETE", path: "/api/knowledge/entity-memory/:id", foreignId: tenantBData.knowledgeId, label: "entity memory delete" },
      { method: "DELETE", path: "/api/knowledge/org-notes/:id", foreignId: tenantBData.knowledgeId, label: "org notes delete" },
      { method: "DELETE", path: "/api/knowledge/trends/:id", foreignId: tenantBData.knowledgeId, label: "trends delete" },
      { method: "DELETE", path: "/api/forecast/topics/:id", foreignId: tenantBData.knowledgeId, label: "forecast topics delete" },
      { method: "DELETE", path: "/api/forecast/signals/:id", foreignId: tenantBData.knowledgeId, label: "forecast signals delete" },
      { method: "DELETE", path: "/api/forecast/risks/:id", foreignId: tenantBData.knowledgeId, label: "forecast risks delete" },
      { method: "GET", path: "/api/integrations/webhooks/:id/deliveries", foreignId: tenantBData.sourceId, label: "webhook deliveries" },
    ];

    const results: AttackResult[] = [];
    let criticalCount = 0;

    for (const ep of endpoints) {
      const result = await attackEndpoint(cookieA, ep.method, ep.path, ep.foreignId, ep.body);
      results.push(result);

      if (!result.passed) {
        criticalCount++;
        console.log(`[CRITICAL] ${ep.label}: ${result.endpoint} (id=${ep.foreignId}) -> ${result.reason}`);
      }
    }

    console.log("\n--- Results ---\n");

    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);
    const info = results.filter((r) => r.passed && r.reason.startsWith("INFO"));

    for (const r of failed) {
      console.log(`[CRITICAL] ${r.endpoint} -> status=${r.status} -> ${r.reason}`);
    }

    for (const r of info) {
      console.log(`[INFO] ${r.endpoint} -> status=${r.status} -> ${r.reason}`);
    }

    console.log(`\nTotal probes: ${results.length}`);
    console.log(`Passed: ${passed.length}`);
    console.log(`Critical: ${failed.length}`);
    console.log(`Info: ${info.length}\n`);

    if (criticalCount > 0) {
      console.log("[RESULT] FAIL - Cross-tenant data leakage detected\n");
      process.exit(1);
    } else {
      console.log("[RESULT] PASS - No cross-tenant data leakage detected\n");
      process.exit(0);
    }
  } finally {
    await cleanup(suffix, tenantBData);
    console.log("[CLEANUP] Test tenants and data removed");
  }
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
