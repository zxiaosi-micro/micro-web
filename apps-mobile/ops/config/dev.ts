// config/dev.ts · 开发态增量配置（rn --watch / weapp --watch 共用）。
import type { UserConfigExport } from "@tarojs/cli";

export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
  rn: {},
} satisfies UserConfigExport;
