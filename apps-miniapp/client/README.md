# apps-miniapp/client · 客户端小程序（Taro 4 + React，weapp）

S9-02。客户端 C 端主入口：微信静默登录 → 手机号绑定 → 设备激活/监控/质保/延保/报修/消息。

## 页面结构（主包 ≤2M）

- **主包 4 页**：`pages/index`（首页：设备摘要+扫码激活+消息角标）、`pages/login`（wxLogin 静默+手机号绑定）、`pages/devices`（影子卡片列表）、`pages/device-detail`（影子+质保+遥测趋势+场站归属）
- **分包 3 个**：`packages/station`（我的场站）、`packages/service`（质保/延保购买/报修拍照/售后进度）、`packages/profile`（消息/我的）

## 启动

```bash
pnpm dev:weapp     # 产出 dist/weapp → 微信开发者工具导入（project.config.json）
pnpm build:weapp
pnpm typecheck
```

## dev 联调（MOCKWX）

后端 `MOCKWX=1`（`source tools/devenv.sh`）时微信登录走模拟：`Taro.login` 产出的 code 由
identity 派生确定性 openid（同 code 同账号），无需正式 appid 即可跑通登录/绑定/会话链路。

## 用户侧动作（04 §3 F1/F2）

- **正式 appid**：`project.config.json` 的 `touristappid` 占位替换
- **订阅消息模板**：`src/subscribe.ts` 的 `TPL_ID_ALERT` 占位（告警提醒场景，报修提交后请求授权）
- JSAPI 支付需商户号绑定（延保购买当前展示 mock 支付链接）

## 请求层

`src/request.ts`：Taro.request 版统一请求层（{code,msg,data} 信封 / Bearer 注入 / 401 单飞刷新 /
10402 互斥 / 10403 重登兜底 wxLogin）——与 Web 版 shared/request 同款设计（ADR-05：fetch 与
Taro.request 各自实现，类型共享 `@micro/shared/types/mobile-bff`）。
