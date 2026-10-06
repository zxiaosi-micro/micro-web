# micro-web · 前端全端合仓

前端全部端（pnpm workspace 单仓，ADR-17：前端团队小，合仓共享请求层/权限/类型最省事）：

```
micro-web/
├── pnpm-workspace.yaml
├── apps/              # Web 三端：admin（管理后台 30 页）/ dealer（经销商）/ station（场站+大屏）
│                      # React 19 + TS + Vite 8 + antd 6
├── apps-miniapp/      # 客户端 / 场站小程序（Taro 4 + React，weapp）
├── apps-mobile/       # 运维 App（Taro + React Native；RN 先 spike，失败回退 uni-app，ADR-05）
└── packages/shared/   # 请求层（信封/Bearer/401 单飞刷新/10402/10406 分流）、permission、
                       # usePolling（10s/隐藏暂停/回前台即拉）、apitypes 生成类型
```

## CI（S0-04）

`pnpm install → oxlint → tsc --noEmit → build`（首个 package.json 入库后自动生效）。

## apitypes 与契约先行（S0-05）

- 接口类型**不从手写**：apitypes 生成器从 micro-server 各服务 `.api` 契约生成 TS 类型到 `packages/shared/types`（CI diff 阻断漂移）
- **改任何接口，先改契约文件（`.api`/`.proto`），评审合并后再写实现**——前端以生成的类型为准开发，不在代码里手改接口形状

## 常用命令

```bash
make install    # pnpm install
make lint       # oxlint
make typecheck  # tsc --noEmit
make build      # pnpm -r build
```

## 提交与评审约定（S0-03）

- 中文 conventional commits + 任务号：`feat(admin): S3-01 登录页`；trunk-based（main + 短命分支）
- PR 走 DoD 自查模板；跨仓库改动（契约 + 类型）当天提交并推送
