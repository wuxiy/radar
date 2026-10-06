import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { INDUSTRY_IDS, type IndustryId } from "./config.ts";

const LEGACY = new Set(["all", "hot", "items", "story", "topics", "daily", "weekly", "monthly", "about", "terms", "privacy", "changelog", "feedback", "more", "starred", "agent", "admin", "api", "feed.xml", "feed", "llms.txt", "robots.txt", "sitemap.xml", "manifest.webmanifest", "openapi-v1.json", "og", "icon.png", "icon-192.png", "apple-icon.png", "favicon.ico", "logo.svg", "codex-reset", "leaderboard", "contact", "model-providers", "leaderboard-sources", ".well-known"]);

export function createGateway(targets: Record<IndustryId, number>, trustProxy = false, siteUrl = "http://localhost:3000") {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const raw = req.url || "/";
    const path = raw.split("?")[0];
    const segment = path.split("/")[1];
    if (path === "/robots.txt" && (req.method === "GET" || req.method === "HEAD")) {
      const lines = ["User-agent: *", ...INDUSTRY_IDS.flatMap(id => [
        `Allow: /${id}/api/v1/`, `Allow: /${id}/api/mcp`, `Disallow: /${id}/api/`,
        `Disallow: /${id}/admin`, `Disallow: /${id}/starred`, `Disallow: /${id}/feedback`,
        `Sitemap: ${siteUrl}/${id}/sitemap.xml`,
      ]), ""];
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      return res.end(req.method === "HEAD" ? undefined : lines.join("\n"));
    }
    const industry = INDUSTRY_IDS.find(id => segment === id);
    if (!industry) {
      const legacy = LEGACY.has(segment);
      if (path === "/" || legacy) {
        const location = path === "/" ? `/medical${raw.slice(1)}` : `/ai${raw}`;
        res.writeHead(308, { Location: location, "Cache-Control": "no-store" });
        return res.end();
      }
      res.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    // Only the address established by our trusted edge reaches an industry's own HTTP proxy.
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map(v => v.trim()).filter(Boolean);
    const client = trustProxy && forwarded.length ? forwarded.at(-1)! : req.socket.remoteAddress || "";
    const headers = { ...req.headers, "x-forwarded-for": client, "x-real-ip": client };
    const upstream = httpRequest({ hostname: "127.0.0.1", port: targets[industry], path: raw, method: req.method, headers }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(503, { "Cache-Control": "no-store", "Retry-After": "3" });
      res.end("Industry temporarily unavailable");
    });
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  });
}
