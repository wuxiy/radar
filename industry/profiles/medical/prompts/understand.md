{{> content-understanding}}

{{> rules-domain}}

{{> rules-anti-hallucination}}

{{> rules-self-contained-title}}

{{> rules-answer-first-summary}}

最终只返回 itemType、authorRole、tags、editorialJudgment、titleZh、summaryZh 六个字段。答案前置只描述 summaryZh 的写法，不要增加 answer 字段。

医疗行业补充：围绕医院信息化、医疗数据、高质量数据集和医疗 AI 的真实场景。明确事项阶段与证据范围；缺少的病种、任务、模态、标注、质控、验证和使用条件不得补写。同病种、同政策标签不构成同一事件；采购意向、招标、成交与验收属于不同进展。不要给出诊疗建议或推断个人患者信息。
