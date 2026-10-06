# Radar 单部署双行业

2026-10-06：单部署双行业已适配上游 4.0 并完成本机运行补验。保留 AI 行业配置与国内医疗配置，当前 NAS 仍运行先前源码版本，本次没有更新 NAS。部署历史见 [NAS 记录](nas-deployment.md)，验证范围见 [验收清单](acceptance.md)。

## 运行方式

现有词表、评分常量、提示词和缓存在模块加载时绑定行业。首版选择独立进程，避免在请求中修改全局配置，也避免给每条 SQL 补行业过滤条件。

```text
一个 Compose 项目 / 一个公共 web 端口
  web 监督进程 + 路由入口
    /ai      → AI SSR 进程 + AI 页面构建
    /medical → 医疗 SSR 进程 + 医疗页面构建
  API 监督进程 → AI API + 医疗 API
  worker 监督进程 → AI worker + 医疗 worker
  PostgreSQL 实例 → radar_ai / radar_medical
  数据卷 → /data/ai / /data/medical
```

一个角色容器包含两个行业子进程，并非一个进程动态切换行业。某个子进程退出时只重启该进程；访问不可用行业返回 503，未知行业返回 404。根 `/` 跳转医疗；原有已知无前缀页面/接口跳转 AI，查询参数保留。根 `robots.txt` 同时声明两个行业的规则。

`deploy/radar/config.ts` 要求两个不同的逻辑数据库，拒绝遗漏配置、共用数据库和内部端口冲突。`--conditions=radar-ai` / `--conditions=medical` 在启动时固定行业；Vite 与 React Router 分别生成 `/ai`、`/medical` 的构建。业务代码仍通过原来的公开读取层提供页面、RSS、API 和 MCP。

## 配置位置与隔离边界

| 内容 | AI | 医疗 |
| --- | --- | --- |
| 分类、主题、信源、评分门槛与提示词 | 保留 `industry/` 原文件 | `industry/profiles/medical/` |
| Radar 展示名、条款 | `site/profiles/ai/`（条款沿用 `site/pages/`） | `site/profiles/medical/` |
| 行业路径 | `industry/profiles/ai/profile.ts` | `industry/profiles/medical/profile.ts` |
| 品牌图标 | 共用 `site/profiles/brand/` 的 Radar 图标 | 同左 |
| 逻辑数据库 | `RADAR_AI_DATABASE_URL` | `RADAR_MEDICAL_DATABASE_URL` |
| 数据目录 | `<AIHOT_DATA_DIR>/ai` | `<AIHOT_DATA_DIR>/medical` |
| 后台 Cookie | `radar_ai_admin`，Path `/ai` | `radar_medical_admin`，Path `/medical` |
| 收藏、已读、草稿和列表缓存 | 保留 AI 收藏兼容键，缓存带 AI 标识 | 独立医疗键与缓存标识 |
| 可选模块 | 上游 4.0 已移除核心榜单/Codex；当前 `site/modules/` 为空 | 同左 |

每个进程有自己的连接池、pg-boss、提示词缓存、事件和回执。相同 URL、文章 ID、主题 slug 或日报日期可以在两库分别存在，读取和写入均只作用于当前库。浏览器主题偏好共用；收藏导出包含行业，医疗拒绝导入无行业标记的旧 AI 收藏。行业切换通过完整页面导航加载另一套构建，刷新和分享链接继续保留行业。

医疗采用已确认的六类与 12 个主题。保留原七种内容类型、五维权重和 T1/T1.5/T2 门槛 60/65/76；真实效果用人工标注样本校准。四个已确认来源均已登记、暂停且只允许摘要；CHIMA、健康界和动脉网先用外部补录入口，尚未交付自动列表适配。具体状态见 [来源说明](../../industry/profiles/medical/sources.md)。

公共出口：`/<行业>/feed.xml`、`/<行业>/api/v1/items`、`/<行业>/api/mcp`；后台：`/<行业>/admin/sources`。API 代理、原文链接、分享图、站点地图和跳转保持行业路径。React Router 自己给路由跳转加 basename，原生链接、表单和浏览器请求使用 `industryPath`，避免重复前缀。

## 部署与运营

双行业入口见 [运行说明](run.md)，原单行业入口保留以便跟踪上游。初始化逐库迁移和 seed，来源冲突不覆盖后台编辑；本次没有新增 Radar 专用数据库迁移，上游 4.0 新增 19 个迁移文件。医疗与 AI 数据仍分库；旧 topics、榜单和监控表会由上游迁移删除，正式升级前必须备份。已有 AI 数据可作为 AI 数据库；医疗使用新空库。

共用环境变量可用 `RADAR_AI_`、`RADAR_MEDICAL_` 覆盖。采集、模型、推送和 IndexNow 默认关闭；各行业的后台设置、预算与回执分别存储。每行业 SQL 连接池默认上限 5，任务并发仍沿用原 worker 配置。需要按 NAS 实际资源合计控制连接数、并发和两行业的服务额度；目前没有共用服务账户的全局费用熔断，不能把两套额度当作单一总额度。

备份目录按行业区分；4.0 的文件名按数据库名区分（下划线转换为连字符），共用对象存储时不会因同一分钟备份覆盖另一行业。两个数据库和对应文件目录应分别成对备份、恢复。本轮只验证本地备份，未启用对象存储或真实模型服务。条款与隐私说明仍为模板，公开发布前由使用者确认。
