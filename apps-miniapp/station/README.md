# apps-miniapp/station · 场站小程序（Taro 4 + React，weapp）

S9-03。场站人员移动端：**走 admin-bff（:8889）与场站 Web 同源同鉴权**（登录端 ADMIN_WEB，
data_scope 锁定本场站），5 页全主包。

## 页面（01 §8.4 小程序 5 页）

1. `pages/login`：账号密码登录（10407 锁定倒计时 / 10400 凭证错误分流）
2. `pages/workbench`：工作台（stationWebMe 取 station_id 锁定 + pendingAlerts/pendingTickets 增量轮询折叠 + 未读角标）
3. `pages/alerts`：告警（确认 ack / 转工单 transfer，usePolling 增量 + 操作后手动刷新）
4. `pages/tickets`：工单（自领 accept / 处理 start / 提交 submit）
5. `pages/inspections`：巡检（任务表单 + Taro.getLocation gcj02 + 拍照占位 + 批量提交，异常项自动转工单）

## 启动

```bash
pnpm dev:weapp
pnpm build:weapp
pnpm typecheck
```

## data_scope 口径

与 apps/station（场站 Web）一致：前端所有列表/动作强制携带 station_id（来自 /station-web/me），
服务端按 token 的 data_scope 二次过滤——前端拿不到全站数据入口（FR-STN-006）。

## 定位与拍照

- 定位：Taro.getLocation type:'gcj02'（app.config.ts 已声明 permission + requiredPrivateInfos）
- 拍照：Taro.chooseImage 临时路径并入提交内容（正式图片上传走 file 服务，为后扩展位）
