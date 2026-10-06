import type { Config } from "@react-router/dev/config";

const industry = process.env.RADAR_INDUSTRY;
if (industry && industry !== "ai" && industry !== "medical") throw new Error("Unknown Radar industry");

export default {
  ssr: true,
  appDirectory: "app",
  buildDirectory: industry ? `build/${industry}` : "build",
  basename: industry ? `/${industry}` : "/",
  // The whole route manifest ships with the page: no /__manifest?paths=… requests, whose answers are
  // cacheable for a year while a CDN's page cache would not key them on paths or version.
  routeDiscovery: { mode: "initial" },
  // The page loader and component share tiny entry wrappers. Splitting their exports creates extra
  // serial requests before a cold navigation can read data; keep each route's exports together.
  splitRouteModules: false,
} satisfies Config;
