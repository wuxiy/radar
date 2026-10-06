# Radar 双行业运行

## 本机

需要 Node.js 24.11+、两个不同的 PostgreSQL 数据库。`SITE_URL` 填公共根地址，不带 `/ai` 或 `/medical`。配置中只保存连接地址，行业由进程启动参数决定。

```bash
cp .env.radar.example .env
# 填写管理员密码、签名密钥及两个 DATABASE_URL；测试库必须以 _test 或 _ci 结尾。
npm ci
npm run radar:build
npm run radar:setup
# 以下三条在各自终端运行：
npm run radar:api
npm run radar:worker
npm run radar:web
```

访问 `/medical`、`/ai`，后台分别在 `/medical/admin`、`/ai/admin`。保留原 AI 数据时让 `RADAR_AI_DATABASE_URL` 指向原 AI 库；医疗从新空库开始。不要把现有通用 `postgres` 业务库作为医疗初始化目标。

`RADAR_AI_API_PORT`、`RADAR_MEDICAL_API_PORT` 默认 3001/3002；两个内部页面端口默认 3100/3101，公共页面端口默认 3000。多个本机项目同时运行时，在 `.env` 分别设置这五个端口。内部 API 和子页面只监听回环地址；Compose 仅开放公共 web。

## NAS / Docker

```bash
cp .env.radar.example .env
# 填写 SITE_URL、ADMIN_PASSWORD、SESSION_SECRET、IMG_PROXY_SIGN_SECRET、POSTGRES_PASSWORD。
# POSTGRES_PASSWORD 推荐随机十六进制，避免在连接 URL 中遗漏编码。
docker compose -f docker-compose.radar.yml config --quiet
docker compose -f docker-compose.radar.yml up -d --build
```

新部署默认使用 PostgreSQL 17，创建 `radar_ai` 和 `radar_medical`。一个数据卷保存两个行业的独立目录。修改行业配置后重新构建；更改密钥或运行开关后重建容器使环境生效。不要用 `down -v` 更新，它会删除数据库和持久化文件。

镜像默认 `node:24-trixie-slim`，可用 `--build-arg NODE_IMAGE=<可访问的同版 Debian 镜像>` 替换镜像入口；npm 源可用 `--build-arg NPM_REGISTRY=<镜像地址>` 设置。2026-10-03 本机镜像获取曾失败，随后目标 NAS 镜像构建与启动成功；使用者改为暂不采用 Docker，当前运行方式是 Node 24 源码构建与 systemd 常驻，见 [NAS 部署记录](nas-deployment.md)。

已有 NAS 反向代理时，把公共地址代理到 web，保留 `/ai`、`/medical` 路径，设置 `SITE_URL` 为实际根地址；仅在可信代理前设置 `TRUST_PROXY=true`。目标 NAS 为 x86_64，前端监听 13300；域名的外层端口映射尚未完成，当前通过 SSH 隧道访问。

## 开关与补充来源

新部署默认关闭采集、模型、飞书和 IndexNow，医疗示例来源也默认暂停。模型、采集服务、来源适配和预算确认后可按行业启用，例如 `RADAR_MEDICAL_COLLECT_ENABLED=true`；未授权全文继续关闭。当前 NAS 已按用户授权开启医疗采集和模型，AI 继续关闭。用户后续补充的微信公众号、播客和 X 账号在医疗后台独立登记。

医疗外部补录使用 `POST /medical/api/ingest/items`，需要独立 `RADAR_MEDICAL_INGEST_TOKEN`，请求格式见 [信源文档](../sources.md)。数据库中的预算、来源设置和运行记录仍按行业分别管理。

### 模型与请求预算

医疗后端读取 `RADAR_MEDICAL_LLM_BASE_URL`、`RADAR_MEDICAL_LLM_API_KEY`、`RADAR_MEDICAL_LLM_MODEL`；启用时设置 `RADAR_MEDICAL_MODEL_CALLS_ENABLED=true` 并重启 API/worker。后台选用 `default` 时，各处理步骤共用医疗库的 `llm` 预算；预算是滚动一分钟、一小时、24 小时的请求次数，任一上限为 0 即停止发送，不能将它当作人民币费用上限。未启用的付费采集服务可将预算设为 0。

登录当前行业后台，进入 **模型与评测 → 配置模型**，可修改 OpenAI 兼容 API 地址、模型名称、API 密钥和分钟/小时/24 小时限额。高级设置包含连接 IP、额外 JSON 参数、JSON 模式及图片输入能力。密钥留空保留原值，接口、页面和审计仅返回是否已配置。使用真实支持的完整模型名；当前 Magpie 为 `deepseek/deepseek-flash`。

后台配置优先于该行业的默认模型环境配置；仅影响 `default`，单独选择的预设模型保留自身配置。配置保存在 `<行业数据目录>/private/model.json`（目录 700、文件 600，含密钥），API 与 worker 自动读取，下一个请求生效，无需重启；正在执行的请求沿用开始时的配置。此文件不应提交或公开。后台配置不会越过 `MODEL_CALLS_ENABLED=false` 的服务器阀门；临时暂停可将任一请求限额设为 0。

当前 NAS 医疗限额为 **10 次/分钟、100 次/小时、100 次/滚动 24 小时**。预筛、两次评分、摘要、结构化等都会分别消耗请求次数；失败和重试也计入，命中已完成回执的重用不会重复发送。AI 频道的配置、预算和数据独立。

2026-10-06 实测 NAS 的 Debian 运行环境无法路由到模型服务域名的内网 IPv6；现有 IPv4 网关按 Host 路由到同一 Magpie 服务。为此新增选填的 `RADAR_MEDICAL_LLM_CONNECT_IP`：仅改变默认模型请求的连接 IP，保留 `LLM_BASE_URL` 的 Host 和 HTTPS 证书校验；不修改系统 DNS、全局网络或普通信源请求。NAS 内网入口使用 `RADAR_MEDICAL_LLM_BASE_URL=http://magpie.cywu.heiyu.space/v1`、`RADAR_MEDICAL_LLM_CONNECT_IP=100.64.0.1`。从支持原 HTTPS 地址的环境访问时无需设置连接 IP。NAS 模型密钥位于 `.data/credentials/medical/models.env` 的 `LLM_API_KEY`，权限 600；通过 `RADAR_MEDICAL_AIHOT_CREDENTIALS_DIR` 指定医疗后端凭据目录，共享 `.env` 不保存模型密钥，示例配置与源码也不保存。

## 验收与备份

```bash
npm run typecheck
npm run radar:build
node --conditions=radar-ai scripts/smoke.ts --base http://localhost:3000/ai
node --conditions=medical scripts/smoke.ts --base http://localhost:3000/medical
# 两个运行库都必须是独立 *_test / *_ci 库；默认运行后清理验收样本。
node --env-file=<私有测试配置> scripts/verify-radar.ts
```

完整回归和精简标准见 [验收清单](acceptance.md)。`verify-radar.ts` 包括同编号内容、RSS/API/MCP/日报、后台会话与 CSRF、读者无付费回执、队列和预算隔离；不能在正式库运行。`--keep-fixtures` 仅供浏览器验收，样本明确标为验收数据。

数据库与文件备份按行业分别执行，保存 `<数据目录>/<行业>/backups/` 的 dump 和文件归档；恢复必须指向新空库和对应文件目录。`pg_dump` 客户端版本不能低于数据库主版本；当前 Compose 的 PostgreSQL 17 与镜像客户端匹配。外部 PostgreSQL 18 应配置匹配的客户端，不能直接沿用 17 的备份客户端。本轮两个行业已用 PostgreSQL 18 客户端实测恢复成功，未上传对象存储。
