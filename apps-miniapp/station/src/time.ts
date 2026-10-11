// time.ts · 时间戳渲染助手（UnixMilli → "MM-DD HH:mm:ss"；weapp 下 toLocaleString 输出不稳定，手动拼装）。

/** UnixMilli 时间戳 → "MM-DD HH:mm:ss"（0/undefined 渲染 "-"，E8：时间字段可能为 0 值） */
export function formatTs(ms: number | undefined): string {
  if (!ms) {
    return "-";
  }
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
