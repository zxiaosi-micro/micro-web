// babel.config.js · Taro 4 统一 babel 配置（weapp 单目标）。
// weapp 侧由 webpack5-runner 在此基础上叠加平台专用 preset；此处只声明框架与 TS。
module.exports = {
  presets: [["babel-preset-taro", { framework: "react", ts: true }]],
};
