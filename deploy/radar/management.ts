import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sourceManagementReturn } from "@aihot/contracts/source-management";

/** Serve only the unified source UI and its build assets. All business requests use industry APIs. */
export async function serveManagement(req: IncomingMessage, res: ServerResponse, directory: string) {
  const raw = req.url || "/manage";
  const url = new URL(`http://radar.local${raw}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }); return res.end();
  }
  if (url.pathname === "/manage" || url.pathname === "/manage/") {
    const destination = sourceManagementReturn(`/manage/sources${url.search}`);
    res.writeHead(destination ? 308 : 400, destination ? { Location: destination } : {});
    return res.end();
  }
  const asset = /^\/manage\/assets\/([a-zA-Z0-9_-]+\.(?:js|css))$/.exec(url.pathname);
  if (!asset && !sourceManagementReturn(raw)) {
    res.writeHead(404); return res.end("Not found");
  }
  const file = path.join(directory, asset ? `assets/${asset[1]}` : "index.html");
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    res.writeHead(asset ? 404 : 503); return res.end(asset ? "Not found" : "Management build unavailable");
  }
  res.setHeader("Content-Type", asset ? file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8" : "text/html; charset=utf-8");
  res.setHeader("Content-Length", info.size);
  if (asset) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.writeHead(200);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
}
