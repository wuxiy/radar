// The article renderer preserves native video controls, deferred loading and all candidate sources.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit, expect, type Browser } from "@playwright/test";
import { fakeApi, itemDetail, startWebServer, visit, type WebServer } from "./web-server.ts";

const api = fakeApi(url => url.pathname === "/api/site/items/video-fixture" ? itemDetail({
  id: "video-fixture", title: "原生视频检查",
  body: { zh: '<p>使用浏览器原生按钮播放。</p><video controls playsinline preload="none"><source src="/unsupported" type="video/not-supported"><source src="/clip.webm" type="video/webm"></video>', original: null, zhKind: "translation", complete: true },
}) : undefined);
let web: WebServer;
let chrome: Browser;
let safari: Browser;
before(async () => {
  const results = await Promise.allSettled([
    startWebServer(api).then(value => { web = value; }),
    chromium.launch({ channel: "chromium" }).then(value => { chrome = value; }),
    webkit.launch().then(value => { safari = value; }),
  ]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
});
after(async () => { await chrome?.close(); await safari?.close(); await web?.stop(); });
for (const engine of ["Chromium", "WebKit"] as const) {
  test(`${engine}: article rendering preserves native video and its source alternatives`, async () => {
    const context = await (engine === "Chromium" ? chrome : safari).newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await visit(page, web.origin + "/items/video-fixture");
      const video = page.locator(".prose video");
      await expect(video).toBeVisible();
      await expect(video).toHaveAttribute("controls", "");
      await expect(video).toHaveAttribute("playsinline", "");
      await expect(video).toHaveAttribute("preload", "none");
      assert.deepEqual(await video.locator("source").evaluateAll(nodes => nodes.map(node => [node.getAttribute("src"), node.getAttribute("type")])), [["/unsupported", "video/not-supported"], ["/clip.webm", "video/webm"]]);
      assert.equal(await video.getAttribute("autoplay"), null);
      assert.equal(await video.getAttribute("loop"), null);
    } finally { await context.close(); }
  });
}
