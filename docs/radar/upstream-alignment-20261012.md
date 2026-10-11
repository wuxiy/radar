# 上游对齐与医疗信源验收（2026-10-12）

目标：保留已部署的双行业改造，同步 AIHOT `931a4eb`，并按四川省／成都市优先接入可核验的医疗公开信源。

| 验收项 | 操作与独立证据 | 结果 |
| --- | --- | --- |
| 可复现基线 | 718 个受控文件与 NAS manifest 一致；个人改造保存为 `7c08bd5` | 通过 |
| 上游历史与迁移 | 合并 32 个提交；`node scripts/check-migrations.ts --base 7c08bd5` | 通过；只新增 2 个索引 |
| 构建 | `npm run typecheck`、医疗条件 tsc、默认网页构建、`npm run radar:build` | 通过 |
| 后端 | 临时 PostgreSQL 17，完整套件，外网连接守卫 | 779/779，通过；跳过 0 |
| 网页 | `node --test apps/web/tests/*.test.ts`，项目自带 Playwright | 57/57，通过；跳过 0 |
| 实际运行 | 双 API／worker／SSR／gateway；`scripts/verify-radar.ts` | 通过：公开出口、权限、Cookie、预算和队列隔离 |
| 页面可用性 | 两频道 smoke；Chromium 桌面及手机交互与截图 | 各 30/30；脚本错误 0，无框架错误页；表格内部横向滚动，页面无横向溢出 |
| 医疗信源 | 每个启用来源至少 3 条真实标题、日期和正文核验 | 21/21 通过；见 [逐源核验](medical-sources-20261012.md) |
| NAS 升级 | 原生源码构建、迁移、重启、HTTPS smoke | 待部署 |
| 医疗精选质量 | 使用者标注的真实样本，记录覆盖率、失败、Precision／Recall／Accuracy | 待标注；未修改评分门槛，不将功能测试通过当成质量达标 |

模型测试仅访问本机模拟服务；实际本机服务的采集、模型和外推开关关闭。日志、截图和临时配置位于 `/tmp/radar-validation-20261012/`，无凭据进入 Git。Browser 插件未提供，使用仓库已有 Playwright。独立检查 181/181 已包含在后端统计中。
