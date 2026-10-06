# Radar 的仓库与上游维护

Radar 基于 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT) 开发，保留完整 Git 历史、[MIT 许可证](LICENSE) 和 [第三方声明](NOTICE)。产品使用自己的名称和品牌。

## 当前状态与目标

仓库关系核实于 2026-10-02；本地同步状态更新于 2026-10-06：

| 项目 | 当前状态 |
| --- | --- |
| 产品远程 | `git@github.com:wuxiy/radar.git` |
| GitHub 仓库关系 | `wuxiy/radar` 是独立仓库，GitHub API 已确认 `fork: false` |
| 贡献 Fork | 迁移时保留了 `wuxiy/AIHOT` 的 Fork 关系；该仓库可选，不是产品同步的依赖 |
| 默认分支 | `main` |
| 初始上游基线 | `ddf1c19ef2302863748dce51e4fdcd60d4415fc0` |
| 最近纳入的上游提交 | `7d6ac837b364faf40bec30ab29be2a346f20262e` |
| 产品代码改动 | 已实现 AI／医疗双行业，并适配上游 4.0；见 [双行业设计](docs/radar/multi-industry-design.md) |

两个仓库分别承担以下角色：

- `wuxiy/radar`：独立产品仓库，当前定位为面向医疗行业工程师的行业热点站，重点覆盖医疗信息化、医疗数据与医疗 AI。
- `wuxiy/AIHOT`：可选的贡献 Fork，用于向上游提交通用修复或能力；删除它不影响 Radar 的历史及 `upstream` 同步。

重命名 Fork、修改本地 remote 都不会解除 GitHub 的 Fork 关系。独立仓库保留共同提交历史后，仍可通过普通 Git remote 合并上游。

## 本地远程配置

| Remote | 获取地址 | 推送方向 |
| --- | --- | --- |
| `origin` | `git@github.com:wuxiy/radar.git` | Radar 产品仓库 |
| `upstream` | `https://github.com/KKKKhazix/AIHOT.git` | 禁止从此工作区推送，push URL 为 `DISABLED` |

`main` 跟踪 `origin/main`；默认推送远程是 `origin`，推送模式是 `simple`。这些配置仅保存在本地 `.git/config`，新克隆需要重新设置：

```bash
git clone git@github.com:wuxiy/radar.git radar
cd radar
git remote add upstream https://github.com/KKKKhazix/AIHOT.git
git remote set-url --push upstream DISABLED
git config --local remote.pushDefault origin
git config --local push.default simple
git fetch upstream
git remote set-head upstream -a
```

## GitHub 两仓迁移记录

2026-10-02 保留现有 Fork，再创建独立产品仓库：

1. 将现有 `wuxiy/radar` Fork 改名为 `wuxiy/AIHOT`，原仓库身份及 Fork 关系保留。
2. 新建普通的空 `wuxiy/radar` 仓库，不使用 Fork 或模板生成，不初始化 README、许可证或 `.gitignore`。
3. 确认新仓库为空，将本地 `main` 和完整共同历史推入 `origin`。仅迁入已审核的提交，不使用强推或 `--mirror`。
4. 核实 GitHub API 的 `fork` 为 `false`、默认分支为 `main`，并比较本地与远程提交。

新建同名 `radar` 会让原 `radar` URL 指向产品仓库；贡献 Fork 使用它的新地址。贡献仓库单独克隆，避免在产品工作区把个人行业配置推给上游。

GitHub 也提供 Leave fork network，但脱离关系是永久的，并可能丢失 Issue、PR、星标等元数据；只有明确接受这些影响时才采用。见 [GitHub 的 Fork 脱离说明](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork)。

## 日常开发与同步

产品开发从最新的 `origin/main` 创建 `codex/` 前缀分支，审核后合入 `main`。信源、分类与提示词放在 `industry/`，站点身份、品牌与条款放在 `site/`；医疗覆盖分别位于 `industry/profiles/medical/` 和 `site/profiles/medical/`，共用 Radar 品牌位于 `site/profiles/brand/`。平台改动单独提交。

同步采用 merge，保留已发布的产品历史。在工作区干净时执行：

```bash
git fetch --prune origin
git fetch --prune upstream
git switch main
git merge --ff-only origin/main
git log --oneline main..upstream/main
git switch -c codex/sync-upstream-YYYY-MM-DD
git merge --no-ff upstream/main
```

分支名中的日期换成当日日期。有冲突时逐项核对行业配置、公开出口、付费回执和数据库迁移；需要撤销本次合并时使用 `git merge --abort`。验证后将同步分支合入 `main`，再推送 `origin main`。不要对已发布的 `main` 做 rebase、强推或直接重置为 `upstream/main`。

每次同步更新“最近纳入的上游提交”，记录重要冲突和验证结果。初始基线保持不变。按 [Agent 说明](AGENTS.md)、[贡献说明](CONTRIBUTING.md) 和 [部署文档](docs/deploy.md) 完成改动对应的验证。测试使用独立的 `_test` 或 `_ci` 空库；采集、模型调用、飞书推送和 IndexNow 提交保持关闭。纯 Git 配置或文档改动核对远程、提交关系及文档链接即可。

### 2026-10-02 同步记录

通过 `upstream` 获取并合并 3 个提交，无冲突：

- `b5e2a09`：X 搜索回执随采集覆盖范围事务完成，数据库失败时可重放。
- `39281f6`：启动前设置公开 `SITE_URL` 的部署说明。
- `3343fe2`：读者可按时间顺序查看事件进展。

合并提交为 `dad2f362418c40ca6827c02376a8fe98a4717a27`，已快进纳入本地 `main`。本轮未推送 `origin`。

验证通过：`npm run typecheck`、网页生产构建、31 项网页测试、6 项 X 采集与分片测试，以及页面/RSS/API/MCP smoke。测试使用 PostgreSQL 17 的独立临时空库，采集和外部推送保持关闭；空库未生成模型榜单，smoke 按现有脚本跳过 3 个榜单页面。

完整后端测试在 `MODEL_CALLS_ENABLED=false` 下尝试后中止：部分模型测试需要调用本地模拟服务，关闭开关时不能验证这些路径。该次同步尚未获得本机模型模拟例外，不宣称当次完整后端测试通过。使用者随后已授权仅限本机模拟，后续结果按日期另记。

### 2026-10-06 同步记录

获取并合并上游 32 个提交，纳入本地 `main` 的合并提交为 `478a3fc`，同步分支为 `codex/sync-upstream-2026-10-06`。同步前完整备份未提交改动，并保留 `Radar pre-upstream sync 2026-10-06` stash；备份与测试配置位于被忽略的 `.data/upstream-sync-20261006/`。本轮未推送 `origin`，没有更新 NAS 服务或正式数据库。原有个人改造与本轮兼容修改继续保留在工作区。

上游 4.0 将站点身份、模型配置、品牌、条款与公共静态文件移到 `site/`，行业词表、信源和提示词仍在 `industry/`；主题改为直接读取配置文件。榜单与 Codex 监控已从核心移除，`site/modules/` 当前没有注册模块。恢复个人改动时出现 50 处冲突，按新结构适配了双行业构建、服务代理、原生链接、PWA、后台会话、阅读状态及医疗提示词契约，没有恢复上游移除的核心模块。原生成 Logo 和提示词记录已迁到 `site/profiles/brand/designs/`。

运行验收发现精选快照从历史回执读取条目时遗漏实际发布条件，补充了统一 `seatedCondition` 过滤，并增加未来发布时间的回归用例；撤回验收使用正式管理操作同步更新投影与回执状态。

验证结果：

- 默认类型检查及医疗条件的 contracts/backend/API/web 类型检查通过；默认与 AI／医疗生产构建通过。
- 完整后端 **716/716**，网页 Chromium／WebKit 回归 **48/48**，最终定向回归 **28/28**；失败与跳过均为 0。
- 实际运行两个 API、两个 worker、两个 SSR 和统一入口；两个频道 smoke、API/RSS/日报/MCP、隐藏内容、全文权限、Cookie/CSRF、跨库撤回、预算/队列/回执隔离通过。
- Chromium 桌面 1440×1000、手机 390×844：切换、主题、详情、收藏与刷新、医疗登录及 AI 登录隔离通过，无脚本错误、框架错误页或意外失败请求。
- 本机临时库实测 **38 → 57** 迁移，新增 19 个迁移文件，来源、材料、分析与自定义设置保留，重放新增 0；两行业 seed 重放保留手工修改，AI 18 源、医疗 4 源。

测试数据库全部为本机独立 `_test` 库；模型调用仅本机模拟并由网络守卫限制，正常运行采集、模型和外部推送仍关闭。运行样本已清理，本轮后台测试进程已停止。日志、恢复备份与未提交源码均保留；未用这些离线样本重新测量医疗精选质量。

**NAS 升级边界与后续结果：** 上游 4.0 的迁移删除旧 `topics`、榜单与监控相关表，并改变报告/公开接口形态（接口版本 4.0）。使用者于 2026-10-06 确认 NAS 尚未开始使用，明确要求本次升级跳过数据库与文件备份。随后模型配置实施已完成 NAS 38→57 迁移、双行业源码构建及运行验收；三服务 active，两频道 smoke 通过。医疗模型为 `deepseek/deepseek-flash`，100 次/滚动 24 小时，AI 保持关闭；后台新增模型配置。详见 [最新验收](docs/radar/model-configuration-acceptance.md)。备份功能文件名沿用上游新规则，按数据库名区分；两行业仍分别保存数据目录。

## 贡献记录与上游 PR

GitHub 的 commit contributions 要求仓库不是 Fork、提交进入默认分支或 `gh-pages`，且作者邮箱已关联 GitHub 账号；符合条件后可能需要等待最多 24 小时显示。见 [GitHub 贡献记录说明](https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/troubleshooting-missing-contributions)。

用 `git config user.email` 检查当前提交邮箱，在 [GitHub 邮箱设置](https://github.com/settings/emails) 核实绑定。不要为增加贡献数重写上游作者或历史。

个人行业配置留在 Radar。通用修复在贡献 Fork 中从最新上游 `main` 建分支，挑选独立的通用提交并验证后，再向 `KKKKhazix/AIHOT` 提 PR。
