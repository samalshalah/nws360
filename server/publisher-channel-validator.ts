import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { IncomingMessage } from "node:http";
import type { PublisherChannel, PublisherProfile } from "@shared/schema";
import { normalizeDomain, parseUrl, urlHasCredentials, type PublisherChannelType } from "@shared/publisher-catalog";

export type ChannelValidationStatus = "valid" | "invalid" | "unreachable" | "needs_review";

export type ChannelValidationResult = {
  validationStatus: ChannelValidationStatus;
  reason: string;
  errorCode?: string;
  evidence: Record<string, unknown>;
};

export type ResolvedAddress = {
  address: string;
  family?: 4 | 6;
};

export type ValidatorHeaders = {
  get(name: string): string | null;
};

export type ValidatorHttpResponse = {
  status: number;
  headers: ValidatorHeaders;
  body?: AsyncIterable<Uint8Array | Buffer | string>;
  abort?: () => void;
};

export type PinnedHttpRequest = {
  url: URL;
  hostname: string;
  approvedAddress: string;
  family?: 4 | 6;
  signal: AbortSignal;
  accept?: string;
};

export type ChannelValidatorDeps = {
  resolveHost?: (hostname: string, signal: AbortSignal) => Promise<Array<string | ResolvedAddress>>;
  requestUrl?: (request: PinnedHttpRequest) => Promise<ValidatorHttpResponse>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  truncateOnLimit?: boolean;
};

const NETWORK_CHANNEL_TYPES = new Set<PublisherChannelType>(["website", "rss"]);
const SOCIAL_CHANNEL_TYPES = new Set<PublisherChannelType>(["telegram", "facebook", "x", "youtube", "instagram", "tiktok", "linkedin"]);
const MANUAL_CHANNEL_TYPES = new Set<PublisherChannelType>(["television", "radio", "other"]);
const METADATA_HOSTS = new Set(["metadata", "metadata.google.internal", "169.254.169.254", "169.254.170.2"]);

type NormalizedResolvedAddress = {
  address: string;
  family: 4 | 6;
};

class ValidationDeadline {
  private controller = new AbortController();
  private timeout: NodeJS.Timeout;

  constructor(private readonly timeoutMs: number) {
    this.timeout = setTimeout(() => {
      this.controller.abort(Object.assign(new Error("Validation timed out."), { code: "timeout" }));
    }, timeoutMs);
  }

  get signal() {
    return this.controller.signal;
  }

  clear() {
    clearTimeout(this.timeout);
  }
}

function validationError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

export function sanitizeUrlForEvidence(value: string): string {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.toString().slice(0, 700);
}

function stripIpv6Brackets(value: string): string {
  return value.trim().replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

function parseNumberPart(part: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(part)) return Number.parseInt(part.slice(2), 16);
  if (/^0[0-7]+$/.test(part) && part.length > 1) return Number.parseInt(part, 8);
  if (/^\d+$/.test(part)) return Number.parseInt(part, 10);
  return null;
}

function intToIpv4(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function normalizeIpv4Address(input: string): string | null {
  const value = stripIpv6Brackets(input);
  if (net.isIP(value) === 4) return value;
  const wholeNumber = parseNumberPart(value);
  if (wholeNumber !== null && !value.includes(".")) return intToIpv4(wholeNumber);

  const parts = value.split(".");
  if (parts.length >= 2 && parts.length <= 4) {
    const numbers = parts.map(parseNumberPart);
    if (numbers.some((part) => part === null)) return null;
    const nums = numbers as number[];
    if (nums.some((part) => part < 0 || part > 255)) return null;
    while (nums.length < 4) nums.push(0);
    return nums.join(".");
  }
  return null;
}

function embeddedIpv4FromIpv6(input: string): string | null {
  const value = stripIpv6Brackets(input);
  const dotted = value.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return normalizeIpv4Address(dotted[1]);

  const mapped = value.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!mapped) return null;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null;
  return [
    (high >>> 8) & 255,
    high & 255,
    (low >>> 8) & 255,
    low & 255,
  ].join(".");
}

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((sum, part) => (sum << 8) + Number(part), 0) >>> 0;
}

function ipv4InCidr(address: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(base) & mask);
}

function isPublicIpv4(address: string): boolean {
  return ![
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([base, bits]) => ipv4InCidr(address, String(base), Number(bits)));
}

function firstIpv6Hextet(address: string): number | null {
  const first = stripIpv6Brackets(address).split(":")[0];
  if (!first) return null;
  const value = Number.parseInt(first, 16);
  return Number.isFinite(value) ? value : null;
}

function isPublicIpv6(address: string): boolean {
  const value = stripIpv6Brackets(address);
  const embeddedIpv4 = embeddedIpv4FromIpv6(value);
  if (embeddedIpv4) return isPublicIpv4(embeddedIpv4);
  if (value === "::" || value === "::1") return false;
  const hextet = firstIpv6Hextet(value);
  if (hextet === null) return false;
  if (hextet === 0) return false;
  if (hextet >= 0xfc00 && hextet <= 0xfdff) return false;
  if (hextet >= 0xfe80 && hextet <= 0xfebf) return false;
  if (hextet >= 0xff00 && hextet <= 0xffff) return false;
  if (value.startsWith("2001:db8:")) return false;
  if (value.startsWith("2001:") || value.startsWith("2002:")) return false;
  return true;
}

export function isGloballyRoutableAddress(address: string): boolean {
  const value = stripIpv6Brackets(address);
  const normalizedIpv4 = normalizeIpv4Address(value);
  if (normalizedIpv4) return isPublicIpv4(normalizedIpv4);
  if (net.isIP(value) === 6) return isPublicIpv6(value);
  return false;
}

export function isBlockedNetworkAddress(address: string): boolean {
  const value = stripIpv6Brackets(address);
  if (value === "localhost" || value.endsWith(".localhost")) return true;
  if (METADATA_HOSTS.has(value)) return true;
  if (net.isIP(value) || normalizeIpv4Address(value)) return !isGloballyRoutableAddress(value);
  return false;
}

function normalizeResolvedAddress(value: string | ResolvedAddress): NormalizedResolvedAddress | null {
  const raw = typeof value === "string" ? value : value.address;
  const normalizedIpv4 = normalizeIpv4Address(raw);
  if (normalizedIpv4) return { address: normalizedIpv4, family: 4 };
  const stripped = stripIpv6Brackets(raw);
  if (net.isIP(stripped) === 6) return { address: stripped, family: 6 };
  return null;
}

async function withAbort<T>(operation: Promise<T>, signal: AbortSignal, code = "timeout"): Promise<T> {
  if (signal.aborted) throw validationError("Validation timed out.", code);
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      const onAbort = () => reject(validationError("Validation timed out.", code));
      signal.addEventListener("abort", onAbort, { once: true });
      operation.finally(() => signal.removeEventListener("abort", onAbort)).catch(() => signal.removeEventListener("abort", onAbort));
    }),
  ]);
}

async function defaultResolveHost(hostname: string, signal: AbortSignal): Promise<ResolvedAddress[]> {
  const rows = await withAbort(lookup(hostname, { all: true, verbatim: false }), signal, "dns_timeout");
  return rows.map((row) => ({ address: row.address, family: row.family as 4 | 6 }));
}

function incomingHeaders(headers: IncomingMessage["headers"]): ValidatorHeaders {
  return {
    get(name: string) {
      const value = headers[name.toLowerCase()];
      if (Array.isArray(value)) return value.join(", ");
      return value == null ? null : String(value);
    },
  };
}

async function defaultRequestUrl(request: PinnedHttpRequest): Promise<ValidatorHttpResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = request.url.protocol === "https:";
    const transport = isHttps ? https : http;
    const req = transport.request({
      protocol: request.url.protocol,
      hostname: request.approvedAddress,
      family: request.family,
      port: request.url.port ? Number(request.url.port) : isHttps ? 443 : 80,
      method: "GET",
      path: `${request.url.pathname}${request.url.search}`,
      headers: {
        Host: request.url.host,
        "User-Agent": "NWS360-PublisherChannelValidator/1.0",
        Accept: request.accept || (request.url.pathname.toLowerCase().includes("rss") || request.url.pathname.toLowerCase().includes("feed")
          ? "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5"
          : "text/html, application/xhtml+xml, */*;q=0.5"),
      },
      servername: request.hostname,
      agent: false,
      timeout: 0,
    }, (res) => {
      resolve({
        status: res.statusCode || 0,
        headers: incomingHeaders(res.headers),
        body: res,
        abort: () => res.destroy(validationError("Validation body read aborted.", "validation_aborted")),
      });
    });
    const abort = () => req.destroy(validationError("Validation timed out.", "timeout"));
    request.signal.addEventListener("abort", abort, { once: true });
    req.on("error", reject);
    req.on("close", () => request.signal.removeEventListener("abort", abort));
    req.end();
  });
}

function assertValidValidationUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw validationError("Only HTTP and HTTPS URLs can be validated.", "unsupported_protocol");
  }
  if (urlHasCredentials(url)) {
    throw validationError("URL credentials are not allowed for channel validation.", "url_credentials_not_allowed");
  }
  if (isBlockedNetworkAddress(url.hostname)) {
    throw validationError("Unsafe validation target.", "blocked_network_target");
  }
}

async function resolveApprovedAddress(url: URL, deps: Required<ChannelValidatorDeps>, signal: AbortSignal): Promise<NormalizedResolvedAddress> {
  assertValidValidationUrl(url);
  const rows = await withAbort(Promise.resolve(deps.resolveHost(url.hostname, signal)), signal, "dns_timeout");
  const addresses = rows.map(normalizeResolvedAddress).filter((row): row is NormalizedResolvedAddress => Boolean(row));
  if (!addresses.length) throw validationError("Validation target did not resolve.", "dns_no_records");
  const nonPublic = addresses.find((row) => !isGloballyRoutableAddress(row.address));
  if (nonPublic) {
    throw validationError("Validation target resolved to a non-public network address.", "blocked_resolved_address");
  }
  return addresses[0];
}

async function fetchWithSafeRedirects(initialUrl: URL, deps: Required<ChannelValidatorDeps>, signal: AbortSignal, accept?: string) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= deps.maxRedirects; redirectCount += 1) {
    const approved = await resolveApprovedAddress(currentUrl, deps, signal);
    const response = await withAbort(
      Promise.resolve(deps.requestUrl({
        url: currentUrl,
        hostname: currentUrl.hostname,
        approvedAddress: approved.address,
        family: approved.family,
        signal,
        accept,
      })),
      signal,
      "connection_timeout",
    );
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      response.abort?.();
      if (!location) return { response, finalUrl: currentUrl, redirectCount, approvedAddress: approved.address };
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    return { response, finalUrl: currentUrl, redirectCount, approvedAddress: approved.address };
  }
  throw validationError("Validation redirect limit exceeded.", "redirect_limit_exceeded");
}

export function safeNetworkErrorCode(error: unknown): string {
  const anyError = error as any;
  return typeof anyError?.code === "string" ? anyError.code : anyError?.name === "AbortError" ? "timeout" : "validation_error";
}

function errorResult(error: unknown, fallbackStatus: ChannelValidationStatus = "unreachable"): ChannelValidationResult {
  const code = safeNetworkErrorCode(error);
  const invalid = code.startsWith("blocked")
    || code === "unsupported_protocol"
    || code === "url_credentials_not_allowed"
    || code === "response_too_large";
  return {
    validationStatus: invalid ? "invalid" : fallbackStatus,
    reason: code === "response_too_large" ? "response_too_large" : invalid ? "unsafe_validation_target" : "validation_failed",
    errorCode: code,
    evidence: { networkTested: code === "response_too_large", errorCode: code },
  };
}

function publisherDomainCompatible(finalUrl: URL, publisher: PublisherProfile): boolean {
  const publisherDomain = publisher.normalizedPrimaryDomain || normalizeDomain(publisher.primaryDomain || publisher.websiteUrl || "");
  if (!publisherDomain) return true;
  const finalDomain = normalizeDomain(finalUrl.toString());
  return Boolean(finalDomain && (finalDomain === publisherDomain || finalDomain.endsWith(`.${publisherDomain}`)));
}

type LimitedReadResult = {
  text: string;
  bytesRead: number;
  truncated: boolean;
  declaredContentLength: number | null;
};

function declaredContentLength(response: ValidatorHttpResponse): number | null {
  const contentLength = response.headers.get("content-length");
  const parsed = contentLength ? Number(contentLength) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readResponseTextLimited(response: ValidatorHttpResponse, maxBytes: number, signal: AbortSignal, truncateOnLimit = false): Promise<LimitedReadResult> {
  const declaredLength = declaredContentLength(response);
  if (declaredLength !== null && declaredLength > maxBytes && !truncateOnLimit) {
    response.abort?.();
    throw validationError("Validation response is too large.", "response_too_large");
  }

  if (response.body) {
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = Boolean(declaredLength !== null && declaredLength > maxBytes && truncateOnLimit);
    const abort = () => response.abort?.();
    signal.addEventListener("abort", abort, { once: true });
    try {
      for await (const chunk of response.body) {
        if (signal.aborted) throw validationError("Validation timed out.", "timeout");
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (total + buffer.length > maxBytes) {
          if (!truncateOnLimit) {
            response.abort?.();
            throw validationError("Validation response exceeded size limit.", "response_too_large");
          }
          const remaining = Math.max(0, maxBytes - total);
          if (remaining > 0) {
            chunks.push(buffer.subarray(0, remaining));
            total += remaining;
          }
          truncated = true;
          response.abort?.();
          break;
        }
        total += buffer.length;
        chunks.push(buffer);
      }
      return {
        text: Buffer.concat(chunks, total).toString("utf8"),
        bytesRead: total,
        truncated,
        declaredContentLength: declaredLength,
      };
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  return {
    text: "",
    bytesRead: 0,
    truncated: Boolean(declaredLength !== null && declaredLength > maxBytes && truncateOnLimit),
    declaredContentLength: declaredLength,
  };
}

export type SafeTextFetchResult = {
  text: string;
  statusCode: number;
  finalUrl: string;
  redirectCount: number;
  approvedAddressFamily: number;
  contentType: string | null;
  elapsedMs: number;
  bytesRead: number;
  truncated: boolean;
  declaredContentLength: number | null;
};

export async function fetchPublicUrlText(
  value: string,
  deps: ChannelValidatorDeps & { accept?: string } = {},
): Promise<SafeTextFetchResult> {
  const mergedDeps: Required<ChannelValidatorDeps> = {
    resolveHost: deps.resolveHost || defaultResolveHost,
    requestUrl: deps.requestUrl || defaultRequestUrl,
    timeoutMs: deps.timeoutMs ?? 8000,
    maxRedirects: deps.maxRedirects ?? 3,
    maxBytes: deps.maxBytes ?? 256 * 1024,
    truncateOnLimit: deps.truncateOnLimit ?? false,
  };
  const deadline = new ValidationDeadline(mergedDeps.timeoutMs);
  const started = Date.now();
  try {
    const parsed = parseUrl(value);
    if (!parsed) throw validationError("Invalid validation URL.", "invalid_url");
    const { response, finalUrl, redirectCount, approvedAddress } = await fetchWithSafeRedirects(parsed, mergedDeps, deadline.signal, deps.accept);
    const body = await readResponseTextLimited(response, mergedDeps.maxBytes, deadline.signal, mergedDeps.truncateOnLimit);
    return {
      text: body.text,
      statusCode: response.status,
      finalUrl: sanitizeUrlForEvidence(finalUrl.toString()),
      redirectCount,
      approvedAddressFamily: net.isIP(approvedAddress),
      contentType: response.headers.get("content-type"),
      elapsedMs: Date.now() - started,
      bytesRead: body.bytesRead,
      truncated: body.truncated,
      declaredContentLength: body.declaredContentLength,
    };
  } finally {
    deadline.clear();
  }
}

export async function validatePublisherChannel(
  publisher: PublisherProfile,
  channel: PublisherChannel,
  deps: ChannelValidatorDeps = {},
): Promise<ChannelValidationResult> {
  const channelType = channel.channelType as PublisherChannelType;
  const mergedDeps: Required<ChannelValidatorDeps> = {
    resolveHost: deps.resolveHost || defaultResolveHost,
    requestUrl: deps.requestUrl || defaultRequestUrl,
    timeoutMs: deps.timeoutMs ?? 5000,
    maxRedirects: deps.maxRedirects ?? 3,
    maxBytes: deps.maxBytes ?? 64 * 1024,
    truncateOnLimit: false,
  };
  const deadline = new ValidationDeadline(mergedDeps.timeoutMs);

  try {
    if (MANUAL_CHANNEL_TYPES.has(channelType)) {
      return {
        validationStatus: "needs_review",
        reason: "manual_review_required",
        evidence: { networkTested: false, channelType },
      };
    }

    if (SOCIAL_CHANNEL_TYPES.has(channelType)) {
      const parsed = parseUrl(channel.normalizedUrl || channel.url || "");
      if (!parsed || !channel.normalizedUrl) {
        return {
          validationStatus: "invalid",
          reason: "missing_public_social_url",
          errorCode: "missing_public_social_url",
          evidence: { networkTested: false, channelType },
        };
      }
      try {
        await resolveApprovedAddress(parsed, mergedDeps, deadline.signal);
        return {
          validationStatus: "needs_review",
          reason: "social_network_review_required",
          evidence: {
            networkTested: false,
            safetyChecked: true,
            channelType,
            normalizedUrl: sanitizeUrlForEvidence(parsed.toString()),
            handle: channel.handle || null,
          },
        };
      } catch (error) {
        return errorResult(error, "invalid");
      }
    }

    if (!NETWORK_CHANNEL_TYPES.has(channelType)) {
      return {
        validationStatus: "needs_review",
        reason: "manual_review_required",
        evidence: { networkTested: false, channelType },
      };
    }

    const parsed = parseUrl(channel.normalizedUrl || channel.url || "");
    if (!parsed) {
      return {
        validationStatus: "invalid",
        reason: "missing_or_invalid_url",
        errorCode: "invalid_url",
        evidence: { networkTested: false, channelType },
      };
    }

    const { response, finalUrl, redirectCount, approvedAddress } = await fetchWithSafeRedirects(parsed, mergedDeps, deadline.signal);
    const commonEvidence = {
      networkTested: true,
      channelType,
      statusCode: response.status,
      finalUrl: sanitizeUrlForEvidence(finalUrl.toString()),
      redirectCount,
      approvedAddressFamily: net.isIP(approvedAddress),
    };
    if (response.status < 200 || response.status >= 400) {
      return {
        validationStatus: response.status >= 500 ? "unreachable" : "invalid",
        reason: "http_status_not_usable",
        errorCode: `http_${response.status}`,
        evidence: commonEvidence,
      };
    }
    if (channelType === "website" && !publisherDomainCompatible(finalUrl, publisher)) {
      response.abort?.();
      return {
        validationStatus: "invalid",
        reason: "domain_not_compatible_with_publisher",
        errorCode: "domain_mismatch",
        evidence: commonEvidence,
      };
    }
    if (channelType === "rss") {
      try {
        const body = await readResponseTextLimited(response, mergedDeps.maxBytes, deadline.signal);
        if (!/<(rss|feed|rdf:RDF)(\s|>)/i.test(body.text)) {
          return {
            validationStatus: "invalid",
            reason: "rss_atom_structure_not_found",
            errorCode: "invalid_feed_structure",
            evidence: commonEvidence,
          };
        }
      } catch (error) {
        return {
          ...errorResult(error, "unreachable"),
          evidence: { ...commonEvidence, errorCode: (error as any)?.code || "validation_error" },
        };
      }
    } else {
      response.abort?.();
    }
    return {
      validationStatus: "valid",
      reason: channelType === "rss" ? "feed_reachable_and_parseable" : "website_reachable",
      evidence: commonEvidence,
    };
  } catch (error) {
    return errorResult(error);
  } finally {
    deadline.clear();
  }
}
