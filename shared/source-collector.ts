import { z } from "zod";

export const WEBSITE_COLLECTION_STRATEGIES = ["auto", "rss", "scrape"] as const;

const optionalSelector = z.string().trim().max(240).optional();

export const websiteCollectorConfigSchema = z.object({
  strategy: z.enum(WEBSITE_COLLECTION_STRATEGIES).default("auto"),
  feedUrl: z.string().trim().url().max(2000).optional(),
  renderJavascript: z.boolean().default(false),
  selectors: z.object({
    item: optionalSelector,
    link: optionalSelector,
    title: optionalSelector,
    summary: optionalSelector,
    image: optionalSelector,
    date: optionalSelector,
  }).strict().optional(),
}).strict();

export type WebsiteCollectorConfig = z.infer<typeof websiteCollectorConfigSchema>;

export function normalizeWebsiteCollectorConfig(value: unknown): WebsiteCollectorConfig {
  return websiteCollectorConfigSchema.parse(value || {});
}
