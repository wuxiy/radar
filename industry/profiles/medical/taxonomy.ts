// The six categories were confirmed by the owner on 2026-10-02.

export const RELEASE: { category: string; tag: string; unit: string } | null = null;
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "pacs", "ris", "dicom", "fhir", "hl7"];

export { ITEM_TYPES } from "../../taxonomy.ts";

export const CATEGORIES = [
  {
    "key": "medical-it",
    "label": "医疗信息化",
    "section": "医疗信息化",
    "guide": "PACS/RIS、影像云、电子处方、区域卫生系统、检查检验互认、医院业务协同"
  },
  {
    "key": "medical-data",
    "label": "医疗数据平台",
    "section": "医疗数据平台",
    "guide": "数据治理、互联互通、主数据、科研数据平台、可信数据空间"
  },
  {
    "key": "medical-datasets",
    "label": "高质量数据集",
    "section": "高质量数据集",
    "guide": "病种和任务场景、数据生产、标注、质控、验证、交付与版本更新"
  },
  {
    "key": "medical-ai",
    "label": "医疗 AI 应用",
    "section": "医疗 AI 应用",
    "guide": "有明确医疗场景的模型、产品、部署与评测；明确证据和适用边界"
  },
  {
    "key": "policy-standards",
    "label": "政策与标准",
    "section": "政策与标准",
    "guide": "与医疗信息化、医疗数据和医疗 AI 项目相关的政策、标准、指南与版本变化"
  },
  {
    "key": "industry",
    "label": "产业与产品",
    "section": "产业与产品",
    "guide": "有项目关联和实质信息的产品、合作、采购、交付和行业变化"
  }
] as const;

export const CATEGORY_TAGS = ["医疗信息化", "医疗数据平台", "高质量数据集", "医疗AI应用", "政策/标准", "产业/产品", "研究/评价", "医院实践", "采购信息", "行业解读", "其他"] as const;

export const TOPIC_TAGS = ["影像系统", "影像云", "电子处方", "区域卫生", "检查检验互认", "数据治理", "互联互通", "专病数据库", "数据标注", "数据质控", "数据验证", "数据产品", "可信数据空间", "医疗AI", "隐私保护"] as const;

export const ENTITY_TAGS = ["CHIMA", "国家卫生健康委", "国家医保局", "国家数据局"] as const;

export const TAG_SYNONYMS: Readonly<Record<string,string>> = {
  "PACS": "影像系统",
  "RIS": "影像系统",
  "医学影像": "影像系统",
  "电子处方流转": "电子处方",
  "专病库": "专病数据库",
  "医疗 AI": "医疗AI",
  "医疗AI应用": "医疗AI应用",
  "政策": "政策/标准",
  "标准": "政策/标准",
  "采购": "采购信息",
  "研究": "研究/评价",
  "医院案例": "医院实践"
};

export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string,string>> = {
  "model_release": "医疗AI应用",
  "product_launch": "产业/产品",
  "tool_or_prompt": "医院实践",
  "research_paper": "研究/评价",
  "industry_event": "产业/产品",
  "opinion_analysis": "行业解读",
  "tutorial_explainer": "行业解读"
};

export const ENTITIES: Record<string,{name:string;displayTag:string|null;aliases:string[];otherNames?:string[]}> = {
  "chima": {
    "name": "CHIMA",
    "displayTag": "CHIMA",
    "aliases": [
      "CHIMA",
      "中国医院协会信息专业委员会"
    ]
  },
  "nhc": {
    "name": "国家卫生健康委",
    "displayTag": "国家卫生健康委",
    "aliases": [
      "国家卫生健康委",
      "国家卫生健康委员会"
    ]
  },
  "nhsa": {
    "name": "国家医保局",
    "displayTag": "国家医保局",
    "aliases": [
      "国家医保局",
      "国家医疗保障局"
    ]
  },
  "nda": {
    "name": "国家数据局",
    "displayTag": "国家数据局",
    "aliases": [
      "国家数据局"
    ]
  }
};

export const IDENTITY_LEXICON: ReadonlyArray<{id:string;name:string;patterns:RegExp[]}> = [
  {id:"chima",name:"CHIMA",patterns:[/CHIMA/i,/中国医院协会信息专业委员会/i]},
  {id:"nhc",name:"国家卫生健康委",patterns:[/国家卫生健康委/i,/国家卫生健康委员会/i]},
  {id:"nhsa",name:"国家医保局",patterns:[/国家医保局/i,/国家医疗保障局/i]},
  {id:"nda",name:"国家数据局",patterns:[/国家数据局/i]}
];

export const PUBLISHER_DOMAINS: ReadonlyArray<{entityId:string;domains:readonly string[]}> = [{entityId:"chima",domains:["chima.org.cn"]},{entityId:"nhc",domains:["nhc.gov.cn"]},{entityId:"nhsa",domains:["nhsa.gov.cn"]},{entityId:"nda",domains:["nda.gov.cn"]}];

export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{entityId:string;pattern:RegExp}> = [];
