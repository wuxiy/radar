export * from "../../site.ts";
import { SITE as originalSite, ABOUT as originalAbout } from "../../site.ts";

export const SITE = {
  ...originalSite,
  name: "Radar",
  homeTitle: "Radar — AI 行业动态 · 每日精选与日报",
  mcpPrefix: "radar_ai",
  footerNote: "行业热点与原文索引",
  organization: { ...originalSite.organization, name: "Radar" },
  crawlerName: "RadarBot",
} as const;
export const ABOUT = {
  ...originalAbout,
  kicker: "关于 Radar · AI",
  lead: "Radar 替你跟踪 {sources} 个 AI 信源，归并事件、筛选重要变化，每天生成日报。",
  copyright: "Radar 是聚合摘要和阅读索引，原文版权归各来源所有。如需更正、下架或调整展示方式，请通过",
} as const;
export function withSubject(noun: string): string { return `${SITE.subject} ${noun}`; }
export function subjectAfter(text: string, noun?: string): string { return `${text} ${noun ? withSubject(noun) : SITE.subject}`; }
