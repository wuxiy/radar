# Radar 的仓库与上游维护

Radar 基于 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT) 开发，保留完整 Git 历史、[MIT 许可证](LICENSE) 和 [第三方声明](NOTICE)。产品使用自己的名称和品牌。

## 当前状态与目标

2026-10-02 已核实：

| 项目 | 当前状态 |
| --- | --- |
| 产品远程 | `git@github.com:wuxiy/radar.git` |
| GitHub 仓库关系 | `wuxiy/radar` 是独立仓库，GitHub API 已确认 `fork: false` |
| 贡献 Fork | `wuxiy/AIHOT`，保留原仓库身份和 `KKKKhazix/AIHOT` 的 Fork 关系 |
| 默认分支 | `main` |
| 初始上游基线 | `ddf1c19ef2302863748dce51e4fdcd60d4415fc0` |
| 最近纳入的上游提交 | `ddf1c19ef2302863748dce51e4fdcd60d4415fc0` |
| 产品代码改动 | 暂无；本次只调整 Git 配置并增加维护说明 |

两个仓库分别承担以下角色：

- `wuxiy/radar`：独立产品仓库，承载技术、医疗与交叉视图的后续开发。
- `wuxiy/AIHOT`：保留 Fork 关系的贡献仓库，向上游提交通用修复或能力。

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

产品开发从最新的 `origin/main` 创建 `codex/` 前缀分支，审核后合入 `main`。个人信源、分类、提示词和品牌优先放在 `industry/`；平台改动单独提交。`profiles/`、`extensions/` 等属于后续设计，本次尚未引入。

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

## 贡献记录与上游 PR

GitHub 的 commit contributions 要求仓库不是 Fork、提交进入默认分支或 `gh-pages`，且作者邮箱已关联 GitHub 账号；符合条件后可能需要等待最多 24 小时显示。见 [GitHub 贡献记录说明](https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/troubleshooting-missing-contributions)。

用 `git config user.email` 检查当前提交邮箱，在 [GitHub 邮箱设置](https://github.com/settings/emails) 核实绑定。不要为增加贡献数重写上游作者或历史。

个人行业配置留在 Radar。通用修复在贡献 Fork 中从最新上游 `main` 建分支，挑选独立的通用提交并验证后，再向 `KKKKhazix/AIHOT` 提 PR。
