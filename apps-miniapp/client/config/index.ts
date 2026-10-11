// config/index.ts · Taro 4 构建配置（weapp 单目标，S9-02）。
// 产物输出 dist/（project.config.json 的 miniprogramRoot 指向它）；
// designWidth 750（设计稿 rpx 基准）；optimizeMainPackage 开启——主包公共模块下沉分包，主包 ≤2M。
import { defineConfig, type UserConfigExport } from "@tarojs/cli";

import devConfig from "./dev";
import prodConfig from "./prod";

export default defineConfig(async (merge) => {
  const baseConfig: UserConfigExport = {
    projectName: "client-miniapp",
    date: "2026-10-11",
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
      375: 2,
      390: 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    plugins: [],
    defineConstants: {},
    copy: { patterns: [], options: {} },
    framework: "react",
    compiler: "webpack5",
    mini: {
      // 主包瘦身：主包与分包公共模块收敛进分包（8.5 主包 4 页保持最小）
      optimizeMainPackage: { enable: true },
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: { enable: false },
      },
    },
    h5: {},
  };

  if (process.env.NODE_ENV === "development") {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
