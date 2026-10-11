export const SOURCE_INDUSTRIES = ["medical", "ai"] as const;
export type SourceIndustry = typeof SOURCE_INDUSTRIES[number];
export const SOURCE_INDUSTRY_LABEL: Record<SourceIndustry, string> = { medical: "医疗", ai: "AI" };

export function sourceIndustry(search: URLSearchParams): SourceIndustry | null {
  const values = search.getAll("industry");
  if (!values.length) return "medical";
  return values.length === 1 && SOURCE_INDUSTRIES.includes(values[0] as SourceIndustry) ? values[0] as SourceIndustry : null;
}

/** The only root-level destination allowed after an industry's admin sign-in. */
export function sourceManagementReturn(target: string, expectedIndustry?: string): string | null {
  if (!target.startsWith("/") || /[\\\u0000-\u0020\u007f]/.test(target)) return null;
  const url = new URL(target, "http://radar.local");
  if (url.origin !== "http://radar.local" || url.hash || !/^\/manage\/sources(?:\/(?:new|[a-z0-9][a-z0-9-]{2,79}))?$/.test(url.pathname)) return null;
  // Reject normalization, including dot segments, before approving a return destination.
  if (target.split("?")[0] !== url.pathname) return null;
  const industry = sourceIndustry(url.searchParams);
  if (!industry || (expectedIndustry && industry !== expectedIndustry)) return null;
  url.searchParams.set("industry", industry);
  return url.pathname + url.search;
}
