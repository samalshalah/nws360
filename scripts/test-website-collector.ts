import assert from "node:assert/strict";
import { collectWebsite, collectWebsiteFromHtmlForTest } from "../server/website-collector";

const automaticHtml = `
  <html><body><main>
    <article>
      <a href="/news/story-one"><h2>First verified publisher story</h2></a>
      <p>A useful summary for the first story.</p>
      <img data-src="/images/story-one.jpg" />
      <time datetime="2026-07-19T14:00:00Z"></time>
    </article>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"NewsArticle","headline":"Structured publisher story","url":"https://publisher.example/news/story-two","description":"Structured summary","datePublished":"2026-07-19T13:00:00Z","image":{"url":"https://publisher.example/images/story-two.jpg"}}
    </script>
  </main></body></html>`;

const automatic = collectWebsiteFromHtmlForTest(automaticHtml, "https://publisher.example/");
assert.equal(automatic.length, 2);
assert.equal(automatic[0].title, "Structured publisher story");
assert.equal(automatic[0].image, "https://publisher.example/images/story-two.jpg");
assert.equal(automatic[1].image, "https://publisher.example/images/story-one.jpg");

const customHtml = `
  <div class="stream-row">
    <a class="story-link" href="/custom/story-three">
      <span class="story-title">Custom selector publisher story</span>
      <span class="story-summary">Custom selector summary</span>
      <img class="story-image" srcset="/images/small.jpg 320w, /images/large.jpg 1280w" />
      <span class="story-date" data-published="2026-07-19T12:00:00Z">July 19</span>
    </a>
  </div>`;

const custom = collectWebsiteFromHtmlForTest(customHtml, "https://publisher.example/", {
  strategy: "scrape",
  renderJavascript: false,
  selectors: {
    item: ".stream-row",
    link: ".story-link",
    title: ".story-title",
    summary: ".story-summary",
    image: ".story-image",
    date: ".story-date",
  },
});
assert.equal(custom.length, 1);
assert.equal(custom[0].url, "https://publisher.example/custom/story-three");
assert.equal(custom[0].image, "https://publisher.example/images/large.jpg");
assert.equal(custom[0].publishedAt.toISOString(), "2026-07-19T12:00:00.000Z");

await assert.rejects(
  () => collectWebsite("http://127.0.0.1/private", { strategy: "scrape", renderJavascript: false, selectors: {} }, 1),
  /Private network sources are not supported/,
);

console.log("Website collector tests passed");
