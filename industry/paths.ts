import { PROFILE } from "@aihot/industry/profile";

/** Root-relative browser URLs stay in the current industry; external URLs and anchors stay intact. */
export function industryPath(value: string): string {
  if (!PROFILE.basePath || !value.startsWith("/") || value.startsWith("//")) return value;
  if (value === PROFILE.basePath || value.startsWith(`${PROFILE.basePath}/`) || value.startsWith(`${PROFILE.basePath}?`)) return value;
  return `${PROFILE.basePath}${value}`;
}

/** Internal API routes and router-relative paths never contain the public industry prefix. */
export function localPath(value: string): string {
  if (!PROFILE.basePath) return value;
  if (value === PROFILE.basePath) return "/";
  return value.startsWith(`${PROFILE.basePath}/`) ? value.slice(PROFILE.basePath.length) : value;
}
