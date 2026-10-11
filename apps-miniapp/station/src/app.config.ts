// app.config.ts · Taro 应用配置：5 页全主包（S9-03 不做分包；login 为启动页）。
// requiredPrivateInfos/permission：巡检提交 Taro.getLocation（gcj02）所需的小程序隐私声明。
export default defineAppConfig({
  pages: [
    "pages/login/index",
    "pages/workbench/index",
    "pages/alerts/index",
    "pages/tickets/index",
    "pages/inspections/index",
  ],
  window: {
    navigationBarTitleText: "场站小程序",
    navigationBarBackgroundColor: "#1f6feb",
    navigationBarTextStyle: "white",
    backgroundColor: "#f5f6f8",
    backgroundTextStyle: "light",
  },
  permission: {
    "scope.userLocation": {
      desc: "巡检提交需要获取当前位置（gcj02 坐标）",
    },
  },
  requiredPrivateInfos: ["getLocation"],
});
