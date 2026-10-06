export * from "../../site.ts";
import { SITE as originalSite, ABOUT as originalAbout } from "../../site.ts";

export const SITE = {
  ...originalSite,
  name: "Radar",
  subject: "医疗",
  topicsTitle: "医疗主题：信息化、数据平台、数据集与医疗 AI",
  keywords: ["医疗信息化", "医疗数据平台", "高质量数据集", "医疗 AI", "医疗行业热点"],
  homeTitle: "Radar — 医疗信息化与医疗数据行业热点",
  description: "持续跟踪国内医疗信息化、医疗数据平台、高质量数据集与医疗 AI 的行业变化，提供摘要、证据出处和原文索引。",
  tagline: "医疗信息化与医疗数据行业热点",
  mcpPrefix: "radar_medical",
  footerNote: "聚合摘要与原文索引 · 关注医疗行业变化",
  organization: { ...originalSite.organization, name: "Radar" },
  crawlerName: "RadarBot",
} as const;
export const ABOUT = {
  ...originalAbout,
  kicker: "关于 Radar · 医疗",
  headline: ["跟踪医疗行业变化，", "理解项目背后的需求。"] as [string, string],
  lead: "Radar 面向国内医疗行业工程师，关注医院和区域医疗信息化、医疗数据平台、高质量数据集与医疗 AI。当前登记 {sources} 个信源，正文版权归原发布者所有。",
  steps: {
    collect: "跟踪 HIT 专家网、CHIMA、健康界、动脉网。医院、采购入口和个人账号由使用者补充。",
    store: "保留原始出处和日期，归并同一事件；政策、采购、试点、部署与验收分别说明。",
    select: "关注具体场景、建设过程、证据与边界，降低营销、重复转载和无关科普的优先级。",
    publish: "按医疗主题阅读精选、热点和日报；摘要只写原文支持的事实，缺少的信息明确列为未披露。",
  },
  copyright: "Radar 提供行业资讯索引，不能代替原文核验或临床判断。原文版权归各来源所有，如需更正、下架或调整展示方式，请通过",
} as const;
export function withSubject(noun: string): string { return `${SITE.subject}${noun}`; }
export function subjectAfter(text: string, noun?: string): string { return `${text}${noun ? withSubject(noun) : SITE.subject}`; }
