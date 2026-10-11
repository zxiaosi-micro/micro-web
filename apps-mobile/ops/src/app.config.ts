// app.config.ts · Taro 应用配置：6 页全主包（S9-05 骨架不做分包；login 为启动页）。
export default defineAppConfig({
  pages: [
    "pages/login/index",
    "pages/workbench/index",
    "pages/alerts/index",
    "pages/tickets/index",
    "pages/inspections/index",
    "pages/settings/index",
  ],
  window: {
    navigationBarTitleText: "运维 App",
    navigationBarBackgroundColor: "#1f6feb",
    navigationBarTextStyle: "white",
    backgroundColor: "#f5f6f8",
    backgroundTextStyle: "light",
  },
});
