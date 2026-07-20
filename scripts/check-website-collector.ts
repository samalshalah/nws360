import { collectWebsite } from "../server/website-collector";

const url = process.argv[2];
const strategy = (process.argv[3] || "auto") as "auto" | "rss" | "scrape";
if (!url) throw new Error("Usage: tsx scripts/check-website-collector.ts <url> [auto|rss|scrape]");

const result = await collectWebsite(url, { strategy, renderJavascript: false, selectors: {} }, 5);
console.log(JSON.stringify({
  method: result.method,
  feedUrl: result.feedUrl || null,
  rendered: result.rendered,
  warnings: result.warnings,
  articles: result.articles.map((article) => ({
    title: article.title,
    url: article.url,
    image: article.image || null,
    publishedAt: article.publishedAt.toISOString(),
  })),
}, null, 2));
