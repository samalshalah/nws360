import { lookup } from "node:dns/promises";
import net from "node:net";
import type { PublisherChannel, PublisherProfile } from "@shared/schema";
import { normalizeDomain, parseUrl, type PublisherChannelType } from "@shared/publisher-catalog";

export type ChannelValidationStatus = "valid" | "invalid" | "unreachable" | "needs_review";

export type ChannelValidationResult = {
  validationStatus: ChannelValidationStatus;
  reason: string;
  errorCode?: string;
  evidence: Record<string, unknown>;
};

export type ValidatorHttpResponse = {
  status: number;
  url?: string;
  headers: {
    get(name: string): string | null;
  };
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

export type ChannelValidatorDeps = {
  resolveHost?: (hostname: string) => Promise<string[]>;
  fetchUrl?: (url: string, init: { signal: AbortSignal; redirect: "manual" }) => Promise<ValidatorHttpResponse>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
};

const NETWORK_CHANNEL_TYPES = new Set<PublisherChannelType>(["website", "rss"]);
const SOCIAL_CHANNEL_TYPES = new Set<PublisherChannelType>(["telegram", "facebook", "x", "youtube", "instagram", "tiktok", "linkedin"]);
const MANUAL_CHANNEL_TYPES = new Set<PublisherChannelType>(["television", "radio", "other"]);
const METADATA_HOSTS = new Set(["metadata", "metadata.google.internal", "169.254.169.254", "169.254.170.2"]);

function sanitizeUrlForEvidence(value: string): string {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.toString().slice(0, 700);
}

function firstIpv6Hextet(address: string): number | null {
  const first = address.toLowerCase().split(":")[0];
  if (!first) return null;
  const value = Number.parseInt(first, 16);
  return Number.isFinite(value) ? value : null;
}

export function isBlockedNetworkAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "localhost" || value.endsWith(".localhost")) return true;
  if (METADATA_HOSTS.has(value)) return true;

  const ipVersion = net.isIP(value);
  if (ipVersion === 4) {
    const [a, b] = value.split(".").map((part) => Number.parseInt(part, 10));
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  if (ipVersion === 6) {
    if (value === "::1" || value === "::" || value.endsWith(":1")) return true;
    if (value.startsWith("fe80:")) return true;
    const hextet = firstIpv6Hextet(value);
    return hextet !== null && hextet >= 0xfc00 && hextet <= 0xfdff;
  }
  return false;
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const rows = await lookup(hostname, { all: true, verbatim: false });
  return rows.map((row) => row.address);
}

async function defaultFetchUrl(url: string, init: { signal: AbortSignal; redirect: "manual" }): Promise<ValidatorHttpResponse> {
  return fetch(url, init) as Promise<ValidatorHttpResponse>;
}

async function assertSafeNetworkTarget(url: URL, deps: Required<Pick<ChannelValidatorDeps, "resolveHost">>) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw Object.assign(new Error("Only HTTP and HTTPS URLs can be validated."), { code: "unsupported_protocol" });
  }
  if (isBlockedNetworkAddress(url.hostname)) {
    throw Object.assign(new Error("Unsafe validation target."), { code: "blocked_network_target" });
  }
  const addresses = await deps.resolveHost(url.hostname);
  if (!addresses.length) {
    throw Object.assign(new Error("Validation target did not resolve."), { code: "dns_no_records" });
  }
  const blocked = addresses.find(isBlockedNetworkAddress);
  if (blocked) {
    throw Object.assign(new Error("Validation target resolved to a blocked network address."), { code: "blocked_resolved_address" });
  }
}

async function readResponseText(response: ValidatorHttpResponse, maxBytes: number): Promise<string> {
  if (typeof response.arrayBuffer === "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.subarray(0, maxBytes).toString("utf8");
  }
  if (typeof response.text === "function") {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }
  return "";
}

async function fetchWithSafeRedirects(initialUrl: URL, deps: Required<ChannelValidatorDeps>) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= deps.maxRedirects; redirectCount += 1) {
    await assertSafeNetworkTarget(currentUrl, deps);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), deps.timeoutMs);
    try {
      const response = await deps.fetchUrl(currentUrl.toString(), { signal: controller.signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { response, finalUrl: currentUrl, redirectCount };
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }
      return { response, finalUrl: currentUrl, redirectCount };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw Object.assign(new Error("Validation redirect limit exceeded."), { code: "redirect_limit_exceeded" });
}

function errorResult(error: unknown, fallbackStatus: ChannelValidationStatus = "unreachable"): ChannelValidationResult {
  const anyError = error as any;
  const code = typeof anyError?.code === "string" ? anyError.code : anyError?.name === "AbortError" ? "timeout" : "validation_error";
  const blocked = code.startsWith("blocked") || code === "unsupported_protocol";
  return {
    validationStatus: blocked ? "invalid" : fallbackStatus,
    reason: blocked ? "unsafe_validation_target" : "validation_failed",
    errorCode: code,
    evidence: { networkTested: false, errorCode: code },
  };
}

function publisherDomainCompatible(finalUrl: URL, publisher: PublisherProfile): boolean {
  const publisherDomain = publisher.normalizedPrimaryDomain || normalizeDomain(publisher.primaryDomain || publisher.websiteUrl || "");
  if (!publisherDomain) return true;
  const finalDomain = normalizeDomain(finalUrl.toString());
  return Boolean(finalDomain && (finalDomain === publisherDomain || finalDomain.endsWith(`.${publisherDomain}`)));
}

export async function validatePublisherChannel(
  publisher: PublisherProfile,
  channel: PublisherChannel,
  deps: ChannelValidatorDeps = {},
): Promise<ChannelValidationResult> {
  const channelType = channel.channelType as PublisherChannelType;
  const mergedDeps: Required<ChannelValidatorDeps> = {
    resolveHost: deps.resolveHost || defaultResolveHost,
    fetchUrl: deps.fetchUrl || defaultFetchUrl,
    timeoutMs: deps.timeoutMs ?? 5000,
    maxRedirects: deps.maxRedirects ?? 3,
    maxBytes: deps.maxBytes ?? 64 * 1024,
  };

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
      await assertSafeNetworkTarget(parsed, mergedDeps);
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

  try {
    const { response, finalUrl, redirectCount } = await fetchWithSafeRedirects(parsed, mergedDeps);
    const commonEvidence = {
      networkTested: true,
      channelType,
      statusCode: response.status,
      finalUrl: sanitizeUrlForEvidence(finalUrl.toString()),
      redirectCount,
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
      return {
        validationStatus: "invalid",
        reason: "domain_not_compatible_with_publisher",
        errorCode: "domain_mismatch",
        evidence: commonEvidence,
      };
    }
    if (channelType === "rss") {
      const text = await readResponseText(response, mergedDeps.maxBytes);
      if (!/<(rss|feed|rdf:RDF)(\s|>)/i.test(text)) {
        return {
          validationStatus: "invalid",
          reason: "rss_atom_structure_not_found",
          errorCode: "invalid_feed_structure",
          evidence: commonEvidence,
        };
      }
    }
    return {
      validationStatus: "valid",
      reason: channelType === "rss" ? "feed_reachable_and_parseable" : "website_reachable",
      evidence: commonEvidence,
    };
  } catch (error) {
    return errorResult(error);
  }
}
