import { storage } from "./storage";
import type { Article, BriefingItem, EmailSubscription, SharedReport } from "@shared/schema";

type ScheduleConfig = {
  label?: string | null;
  recipients?: string[] | null;
  deliveryTime?: string;
  timezone?: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  reportId?: number | null;
  templateId?: number | null;
  notes?: string | null;
  lastDeliveryAttemptAt?: string | null;
  lastDeliveryStatus?: string | null;
  lastDeliveryError?: string | null;
  lastDeliveredAt?: string | null;
  lastDeliveryProviderId?: string | null;
  lastDeliveryItemCount?: number | null;
  lastDeliveryRecipientCount?: number | null;
};

type ArticleWithSource = Article & { source: { name?: string | null } | null };

export type BriefingDeliveryPreview = {
  subject: string;
  text: string;
  html: string;
  itemCount: number;
  articleCount: number;
  sourceType: "report" | "template" | "latest";
  reportTitle?: string | null;
};

export type BriefingDeliveryResult = {
  scheduleId: number;
  clientId: number;
  email: string;
  scheduleLabel?: string | null;
  recipients?: string[];
  recipientCount?: number;
  status: "sent" | "dry_run" | "provider_not_configured" | "failed" | "not_due";
  subject?: string;
  sourceType?: BriefingDeliveryPreview["sourceType"];
  itemCount?: number;
  articleCount?: number;
  providerMessageId?: string | null;
  error?: string;
};

const DEFAULT_TIMEZONE = "Asia/Baghdad";

export function getEmailProviderStatus() {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || process.env.NWS360_EMAIL_FROM || "";
  return {
    provider: "resend",
    configured: Boolean(apiKey && from),
    from: from || null,
    requiredEnv: ["RESEND_API_KEY", "EMAIL_FROM"],
  };
}

function getScheduleConfig(schedule: EmailSubscription): ScheduleConfig {
  return schedule.customSchedule && typeof schedule.customSchedule === "object"
    ? { ...(schedule.customSchedule as ScheduleConfig) }
    : {};
}

function normalizeEmailList(values: unknown[]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of values) {
    const email = String(value || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

function getScheduleRecipients(schedule: EmailSubscription): string[] {
  const config = getScheduleConfig(schedule);
  const configuredRecipients = Array.isArray(config.recipients) ? config.recipients : [];
  const recipients = normalizeEmailList([schedule.email, ...configuredRecipients]);
  return recipients.length > 0 ? recipients : [schedule.email];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sourceName(article: ArticleWithSource) {
  return article.subSource || article.source?.name || "Unknown source";
}

function articleDate(article: ArticleWithSource) {
  const value = article.publishedAt || article.ingestedAt || article.createdAt;
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function articleSnippet(article: ArticleWithSource) {
  return String(article.summary || article.contentClean || article.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}

function getPeriodStart(frequency: string) {
  const now = Date.now();
  const hours =
    frequency === "monthly" ? 24 * 30 :
    frequency === "weekly" ? 24 * 7 :
    frequency === "realtime" ? 1 :
    24;
  return new Date(now - hours * 60 * 60 * 1000).toISOString();
}

async function getLatestArticles(schedule: EmailSubscription, limit = 12): Promise<ArticleWithSource[]> {
  const topics = (schedule.topics || []).map(topic => topic.trim()).filter(Boolean);
  const startDate = getPeriodStart(schedule.frequency);
  const seen = new Set<number>();
  const articles: ArticleWithSource[] = [];

  if (topics.length === 0) {
    const result = await storage.getArticles({ clientId: schedule.clientId, sort: "newest", startDate, limit });
    return result.items as ArticleWithSource[];
  }

  for (const topic of topics) {
    const result = await storage.getArticles({
      clientId: schedule.clientId,
      search: topic,
      sort: "newest",
      startDate,
      limit,
    });
    for (const article of result.items as ArticleWithSource[]) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      articles.push(article);
      if (articles.length >= limit) break;
    }
    if (articles.length >= limit) break;
  }

  return articles;
}

async function buildReportLines(report: SharedReport, items: BriefingItem[], clientId: number) {
  const articleIds = items
    .filter(item => item.itemType === "article" && item.itemRefId)
    .map(item => item.itemRefId as number);
  const articleRows = await storage.getArticlesByIds(articleIds, clientId);
  const articleMap = new Map(articleRows.map(article => [article.id, article as ArticleWithSource]));
  const textLines: string[] = [];
  const htmlLines: string[] = [];
  let articleCount = 0;

  if (report.summary) {
    textLines.push(report.summary, "");
    htmlLines.push(`<p>${escapeHtml(report.summary)}</p>`);
  }

  for (const item of items) {
    if (item.itemType === "heading" && item.content) {
      textLines.push(item.content, "");
      htmlLines.push(`<h2>${escapeHtml(item.content)}</h2>`);
    } else if (item.itemType === "note" && item.content) {
      textLines.push(item.content, "");
      htmlLines.push(`<p>${escapeHtml(item.content)}</p>`);
    } else if (item.itemType === "link" && item.content) {
      textLines.push(item.content, "");
      htmlLines.push(`<p><a href="${escapeHtml(item.content)}">${escapeHtml(item.content)}</a></p>`);
    } else if (item.itemType === "article" && item.itemRefId) {
      const article = articleMap.get(item.itemRefId);
      articleCount += 1;
      if (article) {
        const articleUrl = article.url || "";
        textLines.push(`- ${article.title}`);
        textLines.push(`  ${sourceName(article)}${articleDate(article) ? ` | ${articleDate(article)}` : ""}`);
        if (item.content) textLines.push(`  ${item.content}`);
        if (articleUrl) textLines.push(`  ${articleUrl}`);
        textLines.push("");
        htmlLines.push(`
          <article>
            <h3>${escapeHtml(article.title)}</h3>
            <p><strong>${escapeHtml(sourceName(article))}</strong>${articleDate(article) ? ` | ${escapeHtml(articleDate(article))}` : ""}</p>
            ${item.content ? `<p>${escapeHtml(item.content)}</p>` : ""}
            ${articleUrl ? `<p><a href="${escapeHtml(articleUrl)}">Open source article</a></p>` : ""}
          </article>
        `);
      } else {
        textLines.push(`- Article #${item.itemRefId}`, "");
        htmlLines.push(`<p>Article #${item.itemRefId}</p>`);
      }
    }
  }

  return { textLines, htmlLines, articleCount };
}

function buildLatestLines(articles: ArticleWithSource[]) {
  const textLines: string[] = [];
  const htmlLines: string[] = [];

  for (const article of articles) {
    const snippet = articleSnippet(article);
    const articleUrl = article.url || "";
    textLines.push(`- ${article.title}`);
    textLines.push(`  ${sourceName(article)}${articleDate(article) ? ` | ${articleDate(article)}` : ""}`);
    if (snippet) textLines.push(`  ${snippet}`);
    if (articleUrl) textLines.push(`  ${articleUrl}`);
    textLines.push("");
    htmlLines.push(`
      <article>
        <h3>${escapeHtml(article.title)}</h3>
        <p><strong>${escapeHtml(sourceName(article))}</strong>${articleDate(article) ? ` | ${escapeHtml(articleDate(article))}` : ""}</p>
        ${snippet ? `<p>${escapeHtml(snippet)}</p>` : ""}
        ${articleUrl ? `<p><a href="${escapeHtml(articleUrl)}">Open source article</a></p>` : ""}
      </article>
    `);
  }

  if (articles.length === 0) {
    textLines.push("No matching articles were found for this delivery window.");
    htmlLines.push("<p>No matching articles were found for this delivery window.</p>");
  }

  return { textLines, htmlLines };
}

export async function buildBriefingDeliveryPreview(schedule: EmailSubscription): Promise<BriefingDeliveryPreview> {
  const config = getScheduleConfig(schedule);
  const title = config.label || "NWS360 briefing";
  const subject = `${title} - ${new Date().toISOString().slice(0, 10)}`;
  let sourceType: BriefingDeliveryPreview["sourceType"] = "latest";
  let reportTitle: string | null | undefined;
  let textLines: string[] = [];
  let htmlLines: string[] = [];
  let itemCount = 0;
  let articleCount = 0;

  if (config.reportId) {
    const report = await storage.getSharedReport(config.reportId);
    if (!report || report.clientId !== schedule.clientId || report.status === "template") {
      throw new Error("Briefing not found for this schedule");
    }
    sourceType = "report";
    reportTitle = report.title;
    const items = await storage.getBriefingItems(report.id);
    const reportLines = await buildReportLines(report, items, schedule.clientId);
    textLines = reportLines.textLines;
    htmlLines = reportLines.htmlLines;
    itemCount = items.length;
    articleCount = reportLines.articleCount;
  } else {
    if (config.templateId) {
      const template = await storage.getSharedReport(config.templateId);
      if (!template || template.clientId !== schedule.clientId || template.status !== "template") {
        throw new Error("Template not found for this schedule");
      }
      sourceType = "template";
      reportTitle = template.title;
      const sections = await storage.getBriefingItems(template.id);
      textLines = sections.filter(item => item.content).map(item => item.content as string);
      htmlLines = sections.filter(item => item.content).map(item =>
        item.itemType === "heading"
          ? `<h2>${escapeHtml(item.content as string)}</h2>`
          : `<p>${escapeHtml(item.content as string)}</p>`,
      );
      itemCount += sections.length;
    }
    const latestArticles = await getLatestArticles(schedule);
    const latestLines = buildLatestLines(latestArticles);
    textLines = [...textLines, "", "Latest matching articles", "", ...latestLines.textLines];
    htmlLines = [...htmlLines, "<h2>Latest matching articles</h2>", ...latestLines.htmlLines];
    articleCount = latestArticles.length;
    itemCount += latestArticles.length;
  }

  const topics = schedule.topics?.length ? `Topics: ${schedule.topics.join(", ")}` : "Topics: all monitored coverage";
  const text = [`${title}`, topics, "", ...textLines].join("\n").trim();
  const html = `
    <main style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(topics)}</p>
      ${htmlLines.join("\n")}
      <hr />
      <p style="color: #6b7280; font-size: 12px;">Generated by NWS360.</p>
    </main>
  `;

  return { subject, text, html, itemCount, articleCount, sourceType, reportTitle };
}

function getDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    day: Number(value("day")),
    weekday: weekdayIndex < 0 ? 0 : weekdayIndex,
  };
}

function weekKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
  return `${date.getUTCFullYear()}-${Math.ceil((day + firstDay.getUTCDay() + 1) / 7)}`;
}

export function isScheduleDue(schedule: EmailSubscription, now = new Date()) {
  const config = getScheduleConfig(schedule);
  const timeZone = config.timezone || DEFAULT_TIMEZONE;
  const current = getDateParts(now, timeZone);
  const lastAttempt = config.lastDeliveryAttemptAt ? getDateParts(new Date(config.lastDeliveryAttemptAt), timeZone) : null;

  if (schedule.frequency === "realtime") {
    if (!lastAttempt) return true;
    return now.getTime() - new Date(config.lastDeliveryAttemptAt as string).getTime() >= 15 * 60 * 1000;
  }

  const [targetHour, targetMinute] = String(config.deliveryTime || "08:00").split(":").map(Number);
  const afterDeliveryTime = current.hour > targetHour || (current.hour === targetHour && current.minute >= targetMinute);
  if (!afterDeliveryTime) return false;

  if (schedule.frequency === "weekly") {
    const targetWeekday = config.dayOfWeek ?? 1;
    return current.weekday === targetWeekday && (!lastAttempt || weekKey(lastAttempt.dateKey) !== weekKey(current.dateKey));
  }

  if (schedule.frequency === "monthly") {
    const targetDay = config.dayOfMonth ?? 1;
    return current.day === targetDay && (!lastAttempt || lastAttempt.dateKey.slice(0, 7) !== current.dateKey.slice(0, 7));
  }

  return !lastAttempt || lastAttempt.dateKey !== current.dateKey;
}

async function sendViaResend(input: { to: string[]; subject: string; text: string; html: string }) {
  const status = getEmailProviderStatus();
  if (!status.configured) return { status: "provider_not_configured" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: status.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Resend returned ${response.status}`);
  }
  return { status: "sent" as const, providerMessageId: body?.id || null };
}

export async function deliverBriefingSchedule(schedule: EmailSubscription, options: { force?: boolean; dryRun?: boolean } = {}): Promise<BriefingDeliveryResult> {
  const recipients = getScheduleRecipients(schedule);
  const config = getScheduleConfig(schedule);
  const baseResult = {
    scheduleId: schedule.id,
    clientId: schedule.clientId,
    email: schedule.email,
    scheduleLabel: config.label || schedule.email,
    recipients,
    recipientCount: recipients.length,
  };
  if (!schedule.active || schedule.sendBriefing === false) {
    return { ...baseResult, status: "not_due" };
  }
  if (!options.force && !isScheduleDue(schedule)) {
    return { ...baseResult, status: "not_due" };
  }

  try {
    const provider = getEmailProviderStatus();
    if (!options.dryRun && !provider.configured) {
      return {
        ...baseResult,
        status: "provider_not_configured",
      };
    }

    const preview = await buildBriefingDeliveryPreview(schedule);
    const now = new Date().toISOString();

    if (options.dryRun) {
      return {
        ...baseResult,
        status: "dry_run",
        subject: preview.subject,
        sourceType: preview.sourceType,
        itemCount: preview.itemCount,
        articleCount: preview.articleCount,
      };
    }

    const sendResult = await sendViaResend({
      to: recipients,
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
    });

    await storage.updateEmailSubscription(schedule.id, {
      customSchedule: {
        ...config,
        lastDeliveryAttemptAt: now,
        lastDeliveryStatus: sendResult.status,
        lastDeliveryError: null,
        lastDeliveredAt: now,
        lastDeliveryProviderId: sendResult.providerMessageId,
        lastDeliveryItemCount: preview.itemCount,
        lastDeliveryRecipientCount: recipients.length,
      },
    } as any, { clientId: schedule.clientId });

    return {
      ...baseResult,
      status: sendResult.status,
      subject: preview.subject,
      sourceType: preview.sourceType,
      itemCount: preview.itemCount,
      articleCount: preview.articleCount,
      providerMessageId: sendResult.providerMessageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await storage.updateEmailSubscription(schedule.id, {
      customSchedule: {
        ...config,
        lastDeliveryAttemptAt: new Date().toISOString(),
        lastDeliveryStatus: "failed",
        lastDeliveryError: message.slice(0, 500),
      },
    } as any, { clientId: schedule.clientId });
    return { ...baseResult, status: "failed", error: message };
  }
}

export async function deliverDueBriefings(options: { clientId?: number; scheduleId?: number; dryRun?: boolean; force?: boolean } = {}) {
  const schedules = await storage.getEmailSubscriptions(
    options.clientId ? { clientId: options.clientId } : undefined,
  );
  const targetSchedules = schedules.filter(schedule =>
    schedule.sendBriefing !== false &&
    schedule.active !== false &&
    (!options.scheduleId || schedule.id === options.scheduleId),
  );

  if (targetSchedules.length === 0) {
    return {
      status: "skipped",
      reason: "no_due_briefings",
      processed: 0,
      provider: getEmailProviderStatus(),
      checked: 0,
      sent: 0,
      dryRun: 0,
      skipped: 0,
      providerMissing: 0,
      failed: 0,
      results: [],
    };
  }

  const results: BriefingDeliveryResult[] = [];
  for (const schedule of targetSchedules) {
    results.push(await deliverBriefingSchedule(schedule, {
      dryRun: options.dryRun,
      force: options.force,
    }));
  }

  const sent = results.filter(result => result.status === "sent").length;
  const dryRun = results.filter(result => result.status === "dry_run").length;
  const skipped = results.filter(result => result.status === "not_due").length;
  const providerMissing = results.filter(result => result.status === "provider_not_configured").length;
  const failed = results.filter(result => result.status === "failed").length;
  const noDueWork = sent === 0 && dryRun === 0 && providerMissing === 0 && failed === 0 && skipped === targetSchedules.length;

  return {
    ...(noDueWork ? { status: "skipped", reason: "no_due_briefings", processed: 0 } : {}),
    provider: getEmailProviderStatus(),
    checked: targetSchedules.length,
    sent,
    dryRun,
    skipped,
    providerMissing,
    failed,
    results,
  };
}
