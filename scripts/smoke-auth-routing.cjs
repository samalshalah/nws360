#!/usr/bin/env node

const BASE_URL = (process.env.BASE_URL || "https://nws360.com").replace(/\/$/, "");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin@nws360.com";
const CLIENT_USERNAME = process.env.CLIENT_USERNAME || "test@nws360.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const CLIENT_PASSWORD = process.env.CLIENT_PASSWORD;
const TENANT_ID = Number(process.env.TENANT_ID || 1);

if (!ADMIN_PASSWORD || !CLIENT_PASSWORD) {
  console.error("Missing ADMIN_PASSWORD or CLIENT_PASSWORD.");
  console.error("Example: ADMIN_PASSWORD='...' CLIENT_PASSWORD='...' npm run smoke:auth");
  process.exit(1);
}

function makeJar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    store(response) {
      const setCookie = response.headers.getSetCookie?.() || [];
      for (const raw of setCookie) {
        const [pair] = raw.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
  };
}

async function request(jar, path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(jar.header() ? { Cookie: jar.header() } : {}),
    ...options.headers,
  };
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
  jar.store(response);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function login(username, password) {
  const jar = makeJar();
  const { response, body } = await request(jar, "/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  assert(response.status === 200, `login ${username} expected 200, got ${response.status}: ${JSON.stringify(body)}`);
  return jar;
}

async function get(jar, path) {
  return request(jar, path);
}

async function post(jar, path, body) {
  return request(jar, path, { method: "POST", body: JSON.stringify(body) });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasCap(body, cap) {
  return Array.isArray(body?.capabilities) && body.capabilities.includes(cap);
}

async function main() {
  const admin = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

  let result = await get(admin, "/api/auth/capabilities");
  assert(result.response.status === 200, "admin capabilities should return 200");
  assert(result.body.userScope === "platform", `admin should be platform scoped, got ${result.body.userScope}`);
  assert(result.body.tenantId === null, `admin platform tenantId should be null, got ${result.body.tenantId}`);
  assert(hasCap(result.body, "admin_system_dashboard"), "admin platform should have admin_system_dashboard");
  assert(!hasCap(result.body, "feed_view"), "admin platform should not have feed_view without tenant context");

  result = await get(admin, "/api/admin/users");
  assert(result.response.status === 200, "admin platform should read platform users");
  assert(Array.isArray(result.body) && result.body.length === 1, `platform users should contain only admin, got ${result.body.length}`);

  result = await get(admin, "/api/users");
  assert(result.response.status === 200, "admin platform tenant users endpoint should return empty array");
  assert(Array.isArray(result.body) && result.body.length === 0, `admin platform tenant users should be empty, got ${result.body.length}`);

  result = await get(admin, "/api/knowledge");
  assert(result.response.status === 403, `admin platform knowledge should be blocked, got ${result.response.status}`);

  result = await post(admin, "/api/admin/select-tenant", { tenantId: TENANT_ID });
  assert(result.response.status === 200, `select tenant should return 200, got ${result.response.status}`);

  result = await get(admin, "/api/auth/capabilities");
  assert(result.response.status === 200, "admin selected tenant capabilities should return 200");
  assert(result.body.tenantId === TENANT_ID, `admin selected tenantId should be ${TENANT_ID}, got ${result.body.tenantId}`);
  assert(hasCap(result.body, "feed_view"), "admin selected tenant should have tenant feed_view");

  result = await get(admin, "/api/sources");
  assert(result.response.status === 200, "admin selected tenant should read tenant sources");
  assert(Array.isArray(result.body), "admin selected tenant sources should be an array");

  const client = await login(CLIENT_USERNAME, CLIENT_PASSWORD);

  result = await get(client, "/api/auth/capabilities");
  assert(result.response.status === 200, "client capabilities should return 200");
  assert(result.body.userScope === "tenant", `client should be tenant scoped, got ${result.body.userScope}`);
  assert(result.body.tenantId === TENANT_ID, `client tenantId should be ${TENANT_ID}, got ${result.body.tenantId}`);
  assert(hasCap(result.body, "feed_view"), "client should have feed_view");
  assert(!hasCap(result.body, "admin_system_dashboard"), "client should not have admin_system_dashboard");

  result = await get(client, "/api/admin/users");
  assert(result.response.status === 403, `client admin users should be blocked, got ${result.response.status}`);

  result = await get(client, "/api/sources");
  assert(result.response.status === 200, "client should read tenant sources");
  assert(Array.isArray(result.body), "client sources should be an array");

  result = await get(client, "/api/analytics/stats");
  assert(result.response.status === 200, `client analytics stats should return 200, got ${result.response.status}`);
  assert(typeof result.body?.totalArticles === "number", "client analytics stats should include totalArticles");

  console.log(`Auth routing smoke passed against ${BASE_URL}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
