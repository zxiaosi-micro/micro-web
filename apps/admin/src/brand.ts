// brand.ts · admin 端品牌三元组（主色/渐变/光晕），theme.tsx 的 Brand 结构。
// 三端各自一个品牌色：admin=科技蓝 / dealer=翡翠青 / station=能量紫。

import type { Brand } from "@micro/shared/theme";

export const BRAND: Brand = {
  colorPrimary: "#2f6bff",
  gradient: "linear-gradient(165deg, #0a1c46 0%, #143a86 55%, #1d5fd6 100%)",
  glow: "rgba(47, 107, 255, 0.35)",
};
