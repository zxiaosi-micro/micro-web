// brand.ts · station 端品牌三元组（主色/渐变/光晕），theme.tsx 的 Brand 结构。
// 三端各自一个品牌色：admin=科技蓝 / dealer=翡翠青 / station=能量紫。

import type { Brand } from "@micro/shared/theme";

export const BRAND: Brand = {
  colorPrimary: "#6d4df6",
  gradient: "linear-gradient(165deg, #180f3d 0%, #33207c 55%, #6d4df6 100%)",
  glow: "rgba(109, 77, 246, 0.38)",
};
