# NAS 源码部署记录

2026-10-03，按使用者要求直接从源码构建运行，当前没有运行 Radar Docker 容器。

2026-10-06 最新状态：NAS 已升级至同步上游 4.0 后的当前源码，双库各 57 个迁移，完成双行业构建并重启三个 systemd 服务；前端端口保持 13300。按使用者明确要求跳过本次升级备份。医疗采集和 DeepSeek Flash 已开启，新增后台模型配置入口。下方早期记录保留为当时快照；当前状态以本节和 [模型配置验收](model-configuration-acceptance.md) 为准。

## 2026-10-06 模型启用与后台配置

- 医疗模型：`deepseek/deepseek-flash`。请求限额 10/分钟、100/小时、100/滚动 24 小时；各 default 步骤共用 `llm`，失败与重试也计入。其他医疗付费服务保持零预算；AI 采集与模型关闭。
- 后台入口：行业后台 **模型与评测 → 配置模型**。可填写 API 地址、模型名称、密钥和限额；高级设置支持连接 IP、额外参数、JSON 模式及图片输入。密钥不回填，留空保留，响应和审计不返回密钥；保存后 API/worker 自动读取，无需重启。
- 当前医疗后台配置保存在 `.data/radar/medical/private/model.json`（目录 700、文件 600），优先于默认模型环境配置，包含私有密钥；原 `.data/credentials/medical/models.env` 保留为环境回退凭据。两行业的数据目录和配置隔离。
- 已实际执行 `npm ci`、双库 38→57 迁移、双行业源码构建、服务重启。源码基点 `478a3fc6df75bdd7234b33c129892a40ee3bdc31`；同步前 649 个文件中仅存在已知模型连接补丁差异，未发现额外改动。新清单位于 `.data/nas-deploy/source-manifest.json`。
- 本机后端 722/722、网页 48/48、定向 29/29，失败和跳过 0；NAS 两频道各 30 项 smoke 通过。桌面/手机配置保存、刷新、权限与行业隔离通过；修复真实调用记录出现后长提示版本号撑宽页面的问题。
- 最终快照：医疗 8/8 篇完成处理并发布摘要，等待/失败均为 0；40 次真实请求均收到有效回执，滚动 24 小时剩余 60 次。公开详情 200，阅读前后付费请求增量 0；AI 仍为 0 请求。历史导入保持原日期，今日精选不计入历史资料。
- 当前电脑的验收通道为 `http://127.0.0.1:14330/medical/admin/models`；NAS 的源服务仍监听 13300。外层 13300 映射尚未确认，不能据此声称公网可访问。

完整本轮标准和证据见 [模型配置验收](model-configuration-acceptance.md)。本轮未提交或推送 GitHub，个人改造仍保留在工作区。

## 2026-10-06 早期医疗采集与模型接入快照

按使用者要求，在现有 NAS 源码服务上启用医疗定时采集；AI 采集与模型仍关闭。没有执行上游 4.0 的全量升级或数据库迁移，仅将已验证的模型连接小补丁同步到当前运行版本。

- 四个医疗来源已通过正式信源管理函数恢复并记录审计。HIT RSS 预览为 10 条，首次采集按原配置入库 8 条，健康状态为 `ok`；抽查前三条已提取正文，长度分别为 1508、3936、2681 字符。CHIMA、健康界、动脉网启用的是外部补录接收，没有宣称自动采集完成。
- `RADAR_MEDICAL_COLLECT_ENABLED=true`，医疗库存在 `cron.sources.schedule`；外部补录密钥已生成，仅存 NAS 私有配置，接收限流为每分钟 10 次。来源全文展示和全文订阅继续关闭。
- 使用者提供的 Magpie 密钥已写入 `/home/dev/workspace/cywu/radar/.data/credentials/medical/models.env`，权限 600，父目录权限 700；`RADAR_MEDICAL_AIHOT_CREDENTIALS_DIR` 指向该目录，共享 `.env` 不保存模型密钥。
- 原 HTTPS 地址在 Debian 中只解析出不可达的内网 IPv6；经验证同一 Magpie 服务的 NAS 网关为 `100.64.0.1:80`。默认模型新增可选 `LLM_CONNECT_IP`，按原 URL 的 Host 访问该网关，仅作用于模型请求。NAS 的模型列表请求已返回 200；没有修改全局路由、DNS、其他应用或关闭 TLS 校验。
- **待确认**：实际模型名称和每日模型请求上限。当前 `RADAR_MEDICAL_MODEL_CALLS_ENABLED=false`，医疗付费服务的分钟/小时/滚动 24 小时预算均为 0；两行业付费请求回执均为 0。已入库原始资料正在等待模型处理，尚未生成真实摘要或精选。
- 运行验证：三个服务 `active`，AI/医疗健康接口均 200，医疗 30 项 smoke 通过。模型补丁的类型检查及构建通过，本机完整后端 717/717、网页 48/48、模型/预算/聚类定向 25/25，失败和跳过均为 0；测试模型只连接本机模拟服务。

NAS 操作证据位于 `.data/medical-activation-20261006/`，包括采集结果、模型连接补丁哈希及最终状态；本机同名目录保存本轮回归日志。凭据不写入日志。模型选择与预算确认后，启用医疗 `llm` 预算与模型阀门，再验收真实采集→处理→发布链路。

## 当前服务

- SSH：`dev@cywu.heiyu.space:1822`。
- 目录：`/home/dev/workspace/cywu/radar`。
- Node：已有的 `v24.12.0`，路径 `/home/dev/.local/share/node-v24.12.0-linux-x64/bin/node`。
- 常驻服务：`radar-api.service`、`radar-worker.service`、`radar-web.service`，均已启动并设置开机运行。
- 前端：`0.0.0.0:13300`；两个 API 为回环端口 13301/13302，两个页面进程为回环端口 13303/13304。
- PostgreSQL：已迁移至 NAS 的 `127.0.0.1:5432`，实例为 `/home/dev/svc/postgres` 部署的 PostgreSQL 18.6；AI 使用 `radar_nas_ai` / `radar_ai_app`，医疗使用 `radar_nas_medical` / `radar_medical_app`。两账号不是超级用户，没有创建数据库或角色的权限，分别只能连接自己的行业库，连接数上限各 25。
- 持久化目录：`/home/dev/workspace/cywu/radar/.data/radar/ai`、`medical`。
- 管理员密码及连接配置：项目 `.env`，权限 600；密码未写入本文档。

GitHub 直连超时后，使用本地 Git bundle 同步仓库历史，`origin` 仍指向 `https://github.com/wuxiy/radar.git`。版本基点为 `dad2f362418c40ca6827c02376a8fe98a4717a27`，叠加当前尚未提交的双行业改造；649 个源码文件逐项校验一致。校验清单位于 NAS `.data/nas-deploy/source-manifest.json`。本轮没有提交或推送 GitHub，后续更新应先将当前改造纳入版本管理，再拉取更新。

## 访问与人工验证

NAS 外层 13300 的映射目前不可达；已在当前电脑建立 SSH 隧道，可直接访问：

- 医疗：[http://127.0.0.1:13300/medical](http://127.0.0.1:13300/medical)。
- AI：[http://127.0.0.1:13300/ai](http://127.0.0.1:13300/ai)。
- 后台：上述行业路径后加 `/admin`；密码为 NAS 项目 `.env` 的 `ADMIN_PASSWORD`。

隧道断开后，在自己的终端重新连接：

```bash
ssh -p 1822 -N -L 13300:127.0.0.1:13300 dev@cywu.heiyu.space
```

直接通过 `http://cywu.heiyu.space:13300` 访问，需要在 NAS 外层映射到 Debian 环境的 13300；当前未完成这一层映射，不能视为外网可用。

## 已检查的结果

- `npm ci`、`npm run radar:build`、两个新库的迁移与初始化成功。
- AI 31 项、医疗 30 项页面/API/RSS/MCP 检查通过。AI 的三个榜单页面因没有发布轮次返回 503，仍待数据。
- 两个后台密码登录、会话和行业 Cookie 路径有效，验证会话已退出。
- 三个源码服务实际重启成功，重启前后：AI 18 信源/38 主题，医疗 4 信源/12 主题；各 38 条迁移，文章和付费回执均为 0。
- 当前电脑通过隧道访问两个频道均返回 200。
- 采集、模型、飞书和 IndexNow 均关闭；医疗四来源暂停。因此资讯列表为空，真实资讯质量与人工界面验收仍待后续完成。
- 未重启整台 NAS，未在正式运行库写入验收新闻；两个数据库已在 NAS 实际恢复并核对，文件归档的恢复演练仍未完成。

日志保存在 NAS `.data/nas-deploy/`。后台服务日志和重启命令：

```bash
journalctl -u radar-api -u radar-worker -u radar-web -n 100 --no-pager
sudo systemctl restart radar-api radar-worker radar-web
systemctl is-active radar-api radar-worker radar-web
```

修改 `.env` 后重启服务使配置生效。更新源码后，用上述 Node 24 的路径运行 `npm ci`、`npm run radar:build`、`npm run radar:setup`，成功后再重启服务。数据库为 PostgreSQL 18；本次迁移使用现有数据库容器内的 18.6 导出/恢复客户端。NAS 主机客户端仍为 17，将来启用应用自动备份时应配置匹配的 PostgreSQL 18 客户端。

## 2026-10-03 本机数据库迁移

运行连接保存在 NAS 项目 `.env`（权限 600），实际密码由迁移时生成的随机值替代下面的掩码：

```text
RADAR_AI_DATABASE_URL=postgres://radar_ai_app:***@127.0.0.1:5432/radar_nas_ai
RADAR_MEDICAL_DATABASE_URL=postgres://radar_medical_app:***@127.0.0.1:5432/radar_nas_medical
```

迁移时仅停止 Radar 三个服务。两个旧库各 73 张表和 16 个序列的记录数、全部行指纹与序列状态，在新库恢复后逐项一致；4 个持久化文件的哈希没有变化。旧库保留，未将 `postgres` 通用库作为恢复目标。

本机 PostgreSQL 的连接规则增加了两条 `scram-sha-256` 规则，分别限定对应库、账号和 Docker 主机网关 `172.22.0.1/32`。配置持久化在 `/home/dev/svc/postgres/data/18/docker/pg_hba.conf`，原文件保存为同目录 `pg_hba.conf.before-radar-20261003`。两个账号跨行业连接均被拒绝。

迁移证据及备份保存在 NAS `/home/dev/workspace/cywu/radar/.data/db-migration-20261003043714/`（目录权限 700）：

- `ai.dump`、`medical.dump`：两个独立数据库的自定义格式备份。
- `files.tar.gz`、`files-state.json`：两个行业文件目录的归档与哈希清单。
- `source-state.json`、`migration-result.json`：恢复前后核对结果。
- `.env.before`、`.env.next`：旧连接回退配置和新配置，均为私有文件。

切换后两个行业的 smoke、后台密码登录与会话检查通过；运行连接已在 NAS PostgreSQL 的活动会话中确认。三服务 active，13300 及现有 SSH 隧道访问不变，采集、模型、飞书和 IndexNow 仍关闭。AI 三个榜单页面仍因缺少发布轮次返回 503。

需要回退时，先保留切换后新库的写入，再停止 Radar，将 `.env.before` 恢复到项目 `.env` 并重新启动三个服务；回退配置指向迁移前保留的旧库。

## 2026-10-06：接入 Work-OS authentik

正式入口为 `https://radar.cywu.heiyu.space`，已通过真实外部 HTTPS 浏览器验证，13300 原生监听保留。Work-OS 首页新增 Radar 入口。两个频道使用独立路径 Cookie，将 `cywu` 的固定 issuer/subject 映射到各自原管理员，保留密码登录。客户端 `workos-radar` 仅允许两条严格回调，私有 `auth.env` 位于各频道原凭据目录中，文件 600、目录 700。

本轮源码原生构建、三条向后兼容迁移、735 项后端和 49 项前端测试，以及两个频道各 30 项 smoke 均通过。医疗模型、100 次/24 小时预算与已有数据保持。详细配置、退出语义和逐项实际验收见 [统一认证验收](sso-acceptance.md)。
