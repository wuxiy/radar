---
name: "Radar 信源管理"
description: "继承现有后台样式的统一信源管理扩展"
colors:
  accent: "#176b75"
  accent-soft: "rgba(23, 107, 117, 0.08)"
  bg: "#faf9f6"
  bg-sunk: "#f3f3ef"
  surface: "#ffffff"
  ink: "#202a30"
  ink-2: "#303c42"
  ink-3: "#59656b"
  ink-4: "#657176"
  line: "#dfe4e1"
  line-strong: "#d1d9d5"
  hot: "#b3402a"
  amber: "#b8873a"
  ok: "#2f7d5c"
typography:
  headline:
    fontSize: "24px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title:
    fontSize: "14px"
    fontWeight: 600
  body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontSize: "13.5px"
    fontWeight: 500
  label:
    fontSize: "12.5px"
    fontWeight: 500
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    fontSize: "12px"
    fontWeight: 400
rounded:
  control: "8px"
  card: "12px"
  panel: "14px"
  sheet: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.hot}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    textColor: "{colors.ink-2}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  industry-nav:
    backgroundColor: "{colors.bg-sunk}"
    rounded: "{rounded.control}"
    padding: "4px"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  badge:
    backgroundColor: "{colors.bg-sunk}"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: Radar 信源管理

## Overview

**Creative North Star: "现有后台的纸色工作台"**

本说明只约束 `apps/web/manage` 的管理扩展。页面继承现有后台的纸色、墨色、青色、表格与表单，优先支持扫描、编辑和确认操作；不建立新的品牌或替代整个站点的视觉规范。

样式真源是 `../app/app.css` 和 `../app/features/admin/ui.tsx`。`manage.css` 直接导入共享样式并声明共享后台组件的扫描路径，行业切换与离开确认复用这些语义 token。业务与权限边界见本目录 `PRODUCT.md`。

**Key Characteristics:**

- 纸色页面与白色细边框面板。
- 墨色主操作和选中态，青色链接与焦点。
- 系统字体、紧凑信息层级、等宽配置数据。
- 两行业共享组件与视觉语法，当前行业始终明确。

## Colors

单一青色交互强调搭配暖白与墨色；状态颜色只表达操作和健康状态。上方 token 为共享浅色主题的实际值，本扩展没有独立主题切换。

### Primary

- **青色强调（accent / accent-soft）**：链接、键盘焦点与精选徽章；浅色填充承载轻量状态。

### Neutral

- **纸色（bg / bg-sunk）**：页面底色与导航、弱化区域。
- **白色面板（surface）**：表格容器、编辑面板、输入框与弹窗。
- **墨色层级（ink / ink-2 / ink-3 / ink-4）**：依次承载标题、数据、说明与次要元数据。
- **细线（line / line-strong）**：面板和行分隔；输入与次级按钮使用较强的边界。

### Status

- **警示红（hot）**：删除、暂停、失败和配置错误。
- **提示琥珀（amber）**：不稳定与重复来源提醒。
- **健康绿（ok）**：成功、健康与一手来源状态。

**The Action Contrast Rule.** 主按钮、行业选中态和筛选选中态使用墨色底与纸色字；青色用于链接、焦点和轻量状态，不为两行业另配主题颜色。

## Typography

**Body Font:** 系统无衬线字体及中文系统回退。
**Mono Font:** 系统等宽字体及平台回退。

**Character:** 延续现有后台的操作型排版。标题用字重建立层级，正文和控件保持紧凑；没有独立的展示字体或营销标题角色。

### Hierarchy

- **Headline**：页面标题；手机使用较小字号（22px），从 `sm` 起使用 frontmatter 的标题规格。
- **Title**：面板标题；弹窗标题随既有组件使用（16–17px）。
- **Body**：基础正文；表格内容（13px）与说明文字（13.5px）延续共享组件。
- **Control / Label**：按钮、行业切换与字段标签，说明和时间使用较轻的次要字色。
- **Mono**：JSON 配置与来源 ID；表格 ID 采用紧凑字号（11.5px）。统计和时间使用等宽数字。

**The One UI Voice Rule.** 管理扩展沿用共享系统字体与字重层级；等宽字体只承载标识和结构化数据。

## Layout

页面居中，最大宽度沿用后台（1320px）；侧边留白从手机（16px）到 `sm`（24px）再到 `lg`（32px）。常用间距以 frontmatter 的小尺度组合，面板内留白为标准档，区块间距为较大档。

统计在手机排两列，从 `md` 排四列。字段默认单列，从 `sm` 排两列。新建和编辑的主表单与辅助面板从 `xl` 才并排，窄屏按阅读顺序堆叠；列表保留表格，在其自身容器中横向滚动（最小宽度 640px）。工具栏和页面操作允许换行。

本扩展实际使用的断点是 `sm`（641px）、`md`（768px）、`lg`（961px）、`xl`（1280px），继续从共享主题读取。

## Elevation & Depth

常规页面以纸色、白色和细线区分层级，面板静态时不靠浮起阴影。确认弹窗使用既有遮罩；原因弹窗沿用共享组件的遮罩模糊、入场动效和弹窗阴影。它们只表达模态状态，不扩展为列表面板的装饰。

**The Flat Workspace Rule.** 常规面板保持平面分区；遮罩和浮层深度只用于需要停下并确认的交互。

## Shapes

控件与行业切换采用柔和小圆角，提醒块、面板和弹窗依次采用已有的 `card`、`panel`、`sheet` 档位。徽章与筛选使用胶囊轮廓。边界均为轻量细线（1px），不新增任意圆角或独立卡片样式。

## Components

### Buttons

墨色主按钮、白色描边次级按钮、警示红危险按钮与无填充 ghost 按钮来自共享后台。常规按钮采用 frontmatter 尺寸，小号按钮用于分页（高 28px、横向 10px）。悬停反馈为轻量底色或透明度变化；按下轻缩放（0.98），忙碌和禁用态阻止重复操作。

### Inputs / Fields

白色输入框以较强细线界定，焦点换为青色环（2px）。标签置于上方，说明紧随字段下方；JSON 使用可纵向调整的等宽文本域。错误在字段附近以警示红文字呈现。

### Chips / Badges

筛选胶囊有可操作的墨色选中态，状态徽章使用淡背景与文字描述。类型、参与方式、等级与健康文字共同帮助判断，颜色不承担全部含义。

### Cards / Containers

白色面板保持细线边界，标题区与内容区以分隔线连接。统计块沿用同一面板圆角与留白；表格容器取消内容内边距，让行和表头直接对齐。

### Navigation

页头包含 Radar、行业切换与行业后台入口。行业选中态有墨色填充并设置 `aria-current`；当前行业文字在内容上方重复确认。窄屏允许页头换行，不引入另一个导航系统。

### Confirmations

离开确认明确继续编辑或放弃修改，操作进行中只提供留在页面。保存、暂停与删除复用原因弹窗；删除标题包含行业与来源名，危险按钮与影响说明相邻。原因弹窗在手机贴近底部，宽屏居中；沿用键盘焦点约束和焦点恢复。

## Do's and Don'ts

### Do:

- **Do** 从共享样式和后台组件继承 token 与状态，不在管理扩展复制主题。
- **Do** 保持墨色选中态、青色链接与焦点，以及文字表达的状态含义。
- **Do** 让窄屏字段堆叠、操作换行、表格在自身容器中滚动。

### Don't:

- **Don't** 为医疗和 AI 添加不同视觉世界或额外行业配色。
- **Don't** 把确认弹窗的遮罩、模糊或阴影推广到常规面板。
- **Don't** 把本目录的管理页面布局当作全站产品或视觉规范。
