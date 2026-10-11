// config/index.ts · Taro 4 构建配置：weapp 单目标（S9-03 场站小程序，5 页全主包）。
import { defineConfig, type UserConfigExport } from "@tarojs/cli";

import devConfig from "./dev";
import prodConfig from "./prod";

export default defineConfig(async (merge) => {
  const baseConfig: UserConfigExport = {
    projectName: "station-miniapp",
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
    outputRoot: `dist/${process.env.TARO_ENV ?? "weapp"}`,
    plugins: [],
    defineConstants: {},
    copy: { patterns: [], options: {} },
    framework: "react",
    compiler: "webpack5",
    mini: {
      optimizeMainPackage: { enable: false },
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
