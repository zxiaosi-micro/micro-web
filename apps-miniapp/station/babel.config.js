// babel.config.js · Taro 4 统一 babel 配置（weapp 目标，由 webpack5-runner 叠加平台 preset）。
module.exports = {
  presets: [["babel-preset-taro", { framework: "react", ts: true }]],
};
