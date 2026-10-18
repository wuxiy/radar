# AIHOT 上游功能对齐评估（2026-10-18）

## 范围与证据

- Radar 当前 `main`／GitHub `origin/main`：`cd887ac9ed8eeb181709ad1827c00fcf30d0532d`。
- 最近已纳入上游：`e36480d548aaa1c8461dc93b7b940559b6dd7099`。
- 本次 `git fetch --prune upstream` 后：`4947ad03309c64a4002bd073d690aee50c548063`。
- 新增 26 个提交，290 个文件变化，新增 9047 行、删除 3458 行。[上游比较](https://github.com/KKKKhazix/AIHOT/compare/e36480d...4947ad0)。
- 使用 `git merge-tree --write-tree HEAD upstream/main` 在 Git 对象中预演：9 个文件冲突；未执行工作区合并，未切换分支。
- 本次完成获取与静态评估。没有安装新依赖、运行新版功能／迁移、部署或修改采集、模型、认证和预算。
- NAS SSH `1822` 连接超时，当前线上版本与 systemd 停机参数尚未现场确认；不能用 10 月 12 日的运行记录充当本次验收。
- 原始结果位于本机 `.data/upstream-review-20261018/merge-tree.txt`、`snapshot.json`。

## 值得纳入的功能

| 优先级 | 上游变化 | Radar 的实际收益与边界 |
| --- | --- | --- |
| P0 | 采集正文版本、发布时间精度、展示变更分离与发布可靠性 | 防止正文、图片链接变化被混为内容变化；保存“仅有日期”和“精确时刻”的区别；修复事件恢复与公开投影。不能直接用上游覆盖 Radar 的采集删除和时间窗口逻辑。 |
| P0 | 付费回执、翻译恢复、归组预算等待与重排队 | 减少可复用回执被重复调用，额度耗尽时保留可恢复状态。保持两行业独立、100 次／滚动 24 小时预算以及未知结果核对规则。 |
| P0 | 备份排空与迁移等待 | 新 worker 排空上限 470 秒；Radar 父进程当前 210 秒强杀，必须适配，否则上游修复无法完整生效。 |
| P1 | 精选“只看未读” | 按浏览器已读状态过滤；事件组仍有未读成员时继续展示；全已读页会在上限内续翻。必须沿用 AI／医疗已读键、列表缓存与路径隔离。 |
| P1 | 中英文搜索和相关度排序 | 连写的中英文拆词，英文短词按词首匹配；同等相关度时依次优先精选、质量分、时间。适合混合中文与英文产品名的行业检索。 |
| P1 | 正文插图说明、组件保留、展示刷新 | 保留原站 SVG 的可读文字替代说明；按信源配置保留特定内容组件。后台新增先预览再“仅刷新正文展示”，不调用模型；翻译结构无法对应时明确阻止，不能把它当作任意内容更新的免费重翻。旧资料不会自动批量重抽取。 |
| P1 | X 分片水位与账号改名跟踪 | 分片中每个账号只推进自己的水位，直接关联 `yetone`、`mattpocockuk` 的漏采风险。新改名检查对静默账号做付费查询，需验证计入原 SocialData 100 次／滚动 24 小时预算，不增加额度。 |
| P1 | 信源健康、报告恢复、反馈安全 | 静默判据按来源历史节奏判断；日报齐全且全部为空的周／月报自动跳过，缺日报或撤回导致无内容仍报错；反馈限流、临时封禁持久化，URL／图片／输入安全边界加强。 |
| P2 | 内网订阅、备用模型、运维 Agent、公安备案展示 | 按需使用：内网订阅用 `PRIVATE_FEED_HOSTS` 完整主机白名单，正文／图片／元数据地址仍受限制；备用模型需评估映射和凭据；Agent Webhook 由内部推送阀门与凭据控制。保留现有单模型和通知设置，未提供的配置不自动补全。 |

专业内容深度仍取决于新信源。引擎升级不能替代使用者重新规划医疗来源；本次不能恢复已撤除的站点或重新创建被取消的 100 条样本。

## 必须人工对齐的 Radar 改造

### 1. 模型调用与后台配置

`packages/backend/src/providers/llm.ts` 有实质冲突。Radar 现有逻辑包含后台私有配置热读取、单次请求配置快照与 `connectIp` 定向连接；上游加入 `ModelPreset` 共享类型、`requestFor`、熔断与备用路由、回执失败分类。应合并两套能力，不能整段选上游而丢失 NAS 的连接方式及密钥处理。

上游只为配置过映射的模型选择不同服务的备用模型。当前单模型配置保持；后续启用备用时需核对跨服务预算总量与原有每行业额度的关系，不能把每服务限额当成行业总限额。

### 2. 医疗词表与提示词（自动合并也会漏）

- 上游 `editorial/vocabulary.ts` 的 `entityNames` 直接读 `orgNames`；医疗 `ENTITIES` 类型当前只有 `otherNames`，需补兼容字段。
- 上游 `notify/selected-content.ts` 直接读分类的 `tagColor`；医疗六类当前未定义该字段，需补齐。保持已确认的六类，不改变分类范围或评分门槛。
- 上游只更新根 `industry/prompts/`，医疗副本不会自动更新。需同步摘要／翻译的 `{{> safety}}`、旧发布与新动作的区别、发布时间原始精度规则，并保留医疗采购的调研／采购／中标／验收边界。
- `site/profiles/medical/site.ts` 的 `ABOUT.steps.collect` 仍列 CHIMA、健康界、动脉网，与已撤除状态不一致；`industry/profiles/medical/sources.md` 也保留早期四来源说明，应在对齐时清理现行表述。

### 3. 统一来源管理与删除语义

保留 `apps/web/app/features/admin/source-detail.tsx` 作为行业后台与 `/manage/sources` 的共享视图；行业路由只保留 loader／参数传递壳，防止再次出现 `loaderData` 丢失。

上游新增采集记录 `presentationFailures` 与“正文展示待处理”提示，需迁入共享视图。预览使用当前草稿、RSS／网页／JSON 方式切换、删除保留历史、`deleted_at` 过滤、固定发布日期边界及冲突版本检查均须保留。

### 4. 双行业阅读与构建

`Timeline.tsx` 的未读逻辑与 Radar 已有日期分组／链接定制冲突；`local-state.ts` 虽可自动合并，也必须检查行业命名空间、事件成员已读判断、返回后状态与分页上限。

保留两套构建与 basename、统一管理构建、行业切换和 Authentik Cookie／CSRF 边界。先默认网页构建，再 `npm run radar:build`，再执行网页回归，避免默认构建清理 `build/ai`、`build/medical`。

### 5. 原生 NAS 停机链路

`deploy/radar/run.ts` 当前父进程在 210000ms 后对未退出的行业子进程发送 SIGKILL。新 worker 的 `STOP_TIMEOUT_MS` 为 470000ms。需同时调整父进程强杀时限以及 systemd `TimeoutStopSec`，给数据库清理留余量；上游部署说明要求外层 515 秒与 `KillMode=mixed`。

本次无法连接 NAS，所以 systemd 实际值待部署前核验；不能只更新 worker 就宣称优雅停机通过。

## 合并预演的 9 个冲突

| 文件 | 处理原则 |
| --- | --- |
| `apps/web/app/features/admin/ui.tsx` | 合并上游布局调整，保留统一管理共享组件的接口。 |
| `apps/web/app/features/feed/Timeline.tsx` | 接入未读筛选，保留行业路径、阅读状态与分组定制。 |
| `apps/web/app/routes/admin/source.tsx` | 保留共享视图与 loaderData；把新增展示失败提示迁入共享视图。 |
| `packages/backend/src/admin/sources.ts` | 接入新版预览／抽取规则，保留软删除、身份边界、版本校验和固定时间窗口。 |
| `packages/backend/src/providers/llm.ts` | 保留后台私有配置与定向连接，结合新回执、熔断和备用机制。 |
| `packages/backend/src/sources/collect.ts` | 结合正文版本／发布时间精度／X 修复，保留删除过滤和原有业务边界。 |
| `apps/web/tests/native-video.test.ts` | 上游删除而 Radar 修改，先确认有效覆盖迁移，不能只为消除冲突删掉验收。 |
| `apps/web/tests/navigation-performance.test.ts` | 对齐新测试服务启动方式，保留双行业与实际导航行为覆盖。 |
| `tests/source-publication-window.test.ts` | 合并新版采集／预览语义，保留 Radar 草稿完整标题与时间窗口回归。 |

## 数据库与依赖

新增五个迁移文件，按完整文件名执行，两个 `0086` 都要记账：

| 迁移 | 含义 |
| --- | --- |
| `0086_feedback_ban_expiry.sql` | 反馈封禁增加过期时间。 |
| `0086_translation_attempt_request_tag.sql` | 为翻译尝试增加临时请求标记。 |
| `0087_feedback_submission_state.sql` | 增加跨进程反馈限流／重试状态表。 |
| `0088_drop_translation_attempts_request_tag.sql` | 删除已停用的临时请求标记列；保留翻译内容、尝试记录与回执。 |
| `0089_publication_time.sql` | 保存来源原始发布时间精度；旧资料保持未知，不把零点推断为仅日期。 |

其中包含 `DROP COLUMN`，不能称作“只有新增索引”或“全是增量字段”。应在隔离库应用全部迁移并核对旧内容／回执；两行业分别迁移，不改已发布历史 SQL。

新增 `entities@8.1.0`，用于 HTML 实体解码；共享 `ModelPreset`／`Founder` 类型迁入 `@aihot/contracts/site-config`。需通过正常依赖安装和双行业类型检查核验，不跳过锁文件差异。

## 建议实施顺序与验收

1. 从 `cd887ac` 建 `codex/sync-upstream-2026-10-18`，合并 `4947ad0`，处理上述冲突与医疗静态接口缺口。
2. 验证采集、回执、翻译、事件恢复、发布一致性和迁移；同步适配监督进程停机链路。
3. 接入未读、搜索、展示刷新和共享来源详情提示；核对双行业导航、模型配置及 Authentik 回归。
4. 配置类能力维持现有选择；按后续医疗信源规划再决定内网订阅等使用方式。
5. 隔离运行与逐项验收完成后，再执行 NAS 原生升级、线上验证和 Git 交付。

- [x] 上游 refs 获取成功，确认本地与 GitHub 基线。
- [x] 合并预演完成，记录九个文件冲突；当前无 MERGE_HEAD。
- [x] 医疗来源包仍仅 `rss-hit180`，未恢复被拒绝来源或样本。
- [ ] 新依赖安装，默认及医疗条件类型检查，默认与双行业构建。
- [ ] 完整后端／网页回归与迁移历史检查；不沿用 10 月 12 日的测试数量作为本次结果。
- [ ] 本机模拟模型：配置热更新、定向连接、回执复用／失败、预算等待与备用路由不突破既定额度。
- [ ] 双行业实际运行：相同 ID 的已读／未读隔离、组内未读、筛选后分页、返回恢复；统一管理 CRUD／预览与软删除不复活。
- [ ] 源数据日期精度、正文展示预览／应用、翻译失配拒绝、X 独立水位与静默查名、空报告边界。
- [ ] 本机长任务停机：worker 排空、父进程与外层超时一致，不因停止服务截断备份。
- [ ] NAS 可达后，核对实际 systemd 配置，再做原生构建／双库迁移／公网页面及 API／RSS／MCP 验证。
