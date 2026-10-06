# Radar 统一认证验收

目标：接入 Work-OS 的 authentik；工作站账号 `cywu` 映射到两个频道各自现有的管理员。公共阅读保持匿名，管理员操作仍通过原有会话和 CSRF 校验。

## 验收清单

| 项目 | 可独立核对的结果 | 当前结果 |
| --- | --- | --- |
| 身份与回调 | 独立 confidential client `workos-radar`；仅 `cywu` 一条访问绑定；两条严格 HTTPS 回调 | 通过 |
| 原生登录 | Work-OS 登录一次后，医疗和 AI 后台免重复密码登录，回到请求的后台页面 | 通过 |
| 原管理员 | OIDC 会话关联既有 `admin_users.id`，不根据邮箱、名称或请求头创建管理员 | 通过 |
| 双频道隔离 | Cookie 名称及 Path 分别限定 `/medical`、`/ai`；退出医疗后 AI 与 Work-OS 仍可用 | 通过 |
| 认证边界 | 无会话返回 401；写入缺 CSRF 返回 403；错误签名、issuer、audience、subject、nonce、状态和重放无管理员会话 | 通过 |
| 故障与恢复 | IdP 故障拒绝新 OIDC 登录；原密码可用；配置不完整或 HTTP 回调启动失败 | 通过 |
| 密钥与日志 | 只在 NAS 私有文件保存客户端密钥；回调 code/state 不进入错误日志或响应正文；正常验证 TLS | 通过 |
| 保留原功能 | 类型检查、后端全部测试、默认及双频道构建、前端全部测试、运行后两频道 smoke 全通过 | 通过 |
| 阅读与模型 | 匿名阅读正常；读取页面及登录不触发模型调用；医疗模型和 100 次/24 小时预算保持 | 通过 |
| 页面可用 | 桌面与 390px 手机登录、切换、退出正常，无横向溢出或运行异常 | 通过 |

## 配置与维护

- 公共入口：`https://radar.cywu.heiyu.space`，登录入口为 `/medical/admin/login`、`/ai/admin/login`。
- issuer：`https://auth.cywu.heiyu.space/application/o/radar/`。
- 登录按钮始终使用后端公布的正式 HTTPS 入口；从本地隧道或 NAS 内网打开登录页，也会先在正式域名创建登录状态，再前往身份中心。
- 严格回调：`https://radar.cywu.heiyu.space/medical/api/auth/oidc/callback`、`https://radar.cywu.heiyu.space/ai/api/auth/oidc/callback`。
- NAS 两个独立凭据目录的 `auth.env` 保存 `OIDC_ISSUER`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_ADMIN_SUBJECT`、`OIDC_ADMIN_USER_ID`。文件权限 600；具体目录沿用各自 `RADAR_*_AIHOT_CREDENTIALS_DIR`，不保存到 Git。
- NAS 回连身份中心只对 issuer 的 HTTPS origin 使用环回地址及已有 Work-OS CA：`OIDC_LOOPBACK=true`、`OIDC_CA_FILE=/home/dev/work-os/deploy/runtime/tls/ca.crt`。保留 Host/SNI，拒绝跨 origin 的元数据端点和 HTTP，未关闭证书验证。
- `deploy/radar/authentik-client.mjs` 仅为 Radar 创建独立客户端及已有 Owner 的授权，保留其他客户端。需要已有 Work-OS 私有管理配置及每个 Radar 数据库的原 `admin@local` 用户。
- OIDC 使用 code flow、S256 PKCE、state、nonce、RS256 签名检查；浏览器绑定的状态 10 分钟内有效且只消费一次，最多保留 128 条。
- OIDC 登录和审计在同一数据库事务中。Cookie 保存随机会话 token，数据库只保存其摘要；会话沿用 30 天有效期。每次后台请求重验固定身份和本地用户映射；更改映射或客户端密钥并重启后，旧 OIDC 会话失效。
- 退出是当前频道的本地退出。Authentik 或其他应用的退出不会立即撤销 Radar 既有会话；需要全局退出或中央实时撤销时另做明确的会话协议。
- 完全移除某频道的 `OIDC_*` 配置并重启 `radar-api` 可停用统一登录；原管理员密码保留。只填写部分 OIDC 配置会阻止启动。
- 0058–0060 分步扩展会话 CHECK，保留历史迁移、数据和密码/飞书会话。三步迁移完成后才启用 OIDC；旧应用代码会拒绝 OIDC 会话。

## 重跑验证

使用空的本机隔离 `*_test` 数据库，账号应能建库。PostgreSQL 客户端版本需匹配服务端。

```sh
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/radar_test npm test
node scripts/check-migrations.ts --base HEAD
npm run build -w @aihot/web
npm run radar:build
node --test apps/web/tests/*.test.ts
node --conditions=medical scripts/smoke.ts --base http://127.0.0.1:13300/medical
node --conditions=radar-ai scripts/smoke.ts --base http://127.0.0.1:13300/ai
```

`tests/oidc.test.ts` 使用本机 HTTPS 身份服务和临时签名密钥，包含真实签名验证、数据库会话、审计回滚、权限与故障测试，不访问外部身份服务。其他采集和模型测试也只使用本机模拟服务。

## 本轮实际结果

2026-10-06 完成，最终代码已在 NAS 原生服务运行：

- 类型检查、迁移历史和在线安全检查通过；默认前端及两个频道构建成功。
- 后端 **735/735**、前端 **49/49**，失败及跳过均为 0。OIDC 的 13 项协议、会话与故障测试包含在后端总数内。
- NAS 两频道 smoke 各 **30/30**，包含公开 API、页面、RSS 和 MCP。
- NAS Chromium 通过真实外部 HTTPS 和正常 DNS 验证，证书检查保持开启。Work-OS 首页 Radar 入口可见；输入一次 `cywu` 密码后，两个后台分别登录成功并回到模型页。
- 实际从 `http://127.0.0.1:13300/medical/admin/login` 点击统一登录，会进入正式 HTTPS 地址并完成认证；不会把本地登录状态错误带到另一个域名。
- Cookie 分别为 `radar_medical_admin`（Path `/medical`）及 `radar_ai_admin`（Path `/ai`），均 Secure、HttpOnly、SameSite=Lax。将医疗 Cookie 发给 AI 返回 401；退出医疗后 AI 和 Work-OS 会话保持，医疗可复用 IdP 会话再次登录。
- 真实 NAS 匿名后台和伪造 authentik 身份头均返回 401；无效回调、无 CSRF 的写入均返回 403；原密码在两个频道实际登录并退出成功。
- 桌面 1440×960、手机 390×844 登录与后台操作通过；页面无横向溢出，运行异常为 0。
- 两个数据库仍各有一个原管理员（本地 id=1），迁移数各 60。AI 文章/付费尝试为 0/0；医疗为 8/40。浏览器登录与阅读前后这些计数完全一致；医疗模型 `deepseek/deepseek-flash`、100 次/24 小时限额保持，AI 模型调用仍关闭。
- 两个 `auth.env` 权限 600、目录 700。原 AI 凭据目录遗留的 775 权限已修复。服务日志未出现回调测试的 code/state 标记；隔离前端代理故障测试也确认日志不含回调参数。
- 三服务 active/enabled；原生端口 13300 保留。Radar 测试会话已退出或定向清理，其他 Authentik 客户端配置及 Work-OS 原有首页入口保留。

证据保存在 NAS `/home/dev/workspace/cywu/radar/.data/oidc-deploy/`（目录 700），包含 `browser-result.json`、`final-result.json`、两频道 smoke 日志、构建日志和桌面/手机截图；本机镜像保存在项目 `.data/oidc-deploy/`。后端、前端和类型检查日志为本机 `.data/oidc-*-final.log`、`.data/oidc-typecheck.log`，均未进入 Git。

边界：错误签名/其他 subject、身份中心故障和审计失败在本机隔离服务中验证；没有在共享身份中心创建其他用户、停止身份中心或撤销其他应用会话。
