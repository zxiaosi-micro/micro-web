// config/index.ts · Taro 4 构建配置：RN 为主目标（S9-05），weapp 为兼容占位。
// RN 产物走 metro（@tarojs/plugin-platform-rn），weapp 产物走 webpack5；
// dist 输出目录按 TARO_ENV 分桶（dist/rn、dist/weapp），project.config.json 的 miniprogramRoot 指向后者。
import { defineConfig, type UserConfigExport } from "@tarojs/cli";

import devConfig from "./dev";
import prodConfig from "./prod";

export default defineConfig(async (merge) => {
  const baseConfig: UserConfigExport = {
    projectName: "ops-mobile",
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
    outputRoot: `dist/${process.env.TARO_ENV ?? "rn"}`,
    plugins: [],
    defineConstants: {},
    copy: { patterns: [], options: {} },
    framework: "react",
    compiler: "webpack5",
    mini: {
      // weapp 兼容占位：仅保底能编过，运营 App 正式交付目标为 RN（02 §12.3）
      optimizeMainPackage: { enable: false },
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: { enable: false },
      },
    },
    rn: {
      appName: "ops-mobile",
      postcss: {
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
