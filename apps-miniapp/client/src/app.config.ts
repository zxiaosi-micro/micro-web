// app.config.ts · 应用配置：主包 4 页（首页/登录/设备列表/设备详情）+ 分包 3 个
// （station 场站 / service 售后 / profile 消息档案），主包保持最小（≤2M，8.5）。
export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/login/index",
    "pages/devices/index",
    "pages/device-detail/index",
  ],
  subPackages: [
    {
      root: "packages/station",
      pages: ["pages/list/index", "pages/detail/index"],
    },
    {
      root: "packages/service",
      pages: [
        "pages/warranty/index",
        "pages/extension/index",
        "pages/ticket-new/index",
        "pages/tickets/index",
      ],
    },
    {
      root: "packages/profile",
      pages: ["pages/messages/index", "pages/me/index"],
    },
  ],
  window: {
    navigationBarTitleText: "电池管家",
    navigationBarBackgroundColor: "#1f6feb",
    navigationBarTextStyle: "white",
    backgroundColor: "#f5f6f8",
    backgroundTextStyle: "light",
  },
});
