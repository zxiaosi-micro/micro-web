// babel.config.js · Taro 4 统一 babel 配置（rn / weapp 双目标共用）。
// RN 侧由 @tarojs/plugin-platform-rn 的 metro 流水线在此基础上叠加 RN 专用 preset；
// weapp 侧由 webpack5-runner 叠加。此处只声明框架与 TS。
module.exports = {
  presets: [["babel-preset-taro", { framework: "react", ts: true }]],
};
