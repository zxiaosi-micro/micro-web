// config/dev.ts · 开发态增量配置（weapp --watch）。
import type { UserConfigExport } from "@tarojs/cli";

export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
} satisfies UserConfigExport;
