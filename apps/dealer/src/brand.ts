// brand.ts · dealer 端品牌三元组（主色/渐变/光晕），theme.tsx 的 Brand 结构。
// 三端各自一个品牌色：admin=科技蓝 / dealer=翡翠青 / station=能量紫。

import type { Brand } from "@micro/shared/theme";

export const BRAND: Brand = {
  colorPrimary: "#0f9f8a",
  gradient: "linear-gradient(165deg, #042e2a 0%, #0a5a4b 55%, #0fae8f 100%)",
  glow: "rgba(15, 159, 138, 0.35)",
};
