// theme.tsx · 三端 Web 共用设计系统：品牌主题工厂 + 路由过渡 + 数字滚动 + 指标卡。
//
// 仅 Web 端经子路径 `@micro/shared/theme` 引用（不进 index.ts）——小程序端
// （Taro/React 18.3）不拖 antd 依赖。动画本体在 theme.css，此处只提供
// token 工厂与少量组件；零第三方依赖（动画全 CSS 实现）。

import { Card, Statistic } from "antd";
import type { ThemeConfig } from "antd";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/** 品牌三元组：主色（antd token）/ 渐变（侧栏·大标题·按钮）/ 光晕（阴影用） */
export interface Brand {
  colorPrimary: string;
  gradient: string;
  glow: string;
}

/** 把品牌变量挂到容器根；Drawer 是 portal 不在容器内，背景/变量需单独再传 */
export function brandStyle(b: Brand): CSSProperties {
  return {
    "--brand": b.colorPrimary,
    "--brand-grad": b.gradient,
    "--brand-glow": b.glow,
  } as CSSProperties;
}

/** antd 主题工厂：圆角/布局/表格/菜单全局调性（深色菜单选中态的品牌光晕在 theme.css 覆盖） */
export function brandTheme(b: Brand): ThemeConfig {
  return {
    token: {
      colorPrimary: b.colorPrimary,
      colorLink: b.colorPrimary,
      borderRadius: 10,
      colorBgLayout: "#f4f6fa",
      fontFamily:
        "-apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    },
    components: {
      Layout: { headerBg: "transparent", siderBg: "transparent", bodyBg: "#f4f6fa" },
      Menu: {
        itemHeight: 42,
        itemBorderRadius: 10,
        itemMarginInline: 10,
        darkItemBg: "transparent",
        darkItemColor: "rgba(255,255,255,0.78)",
        darkItemHoverBg: "rgba(255,255,255,0.10)",
        darkItemHoverColor: "#ffffff",
        darkItemSelectedBg: "rgba(255,255,255,0.16)",
        darkItemSelectedColor: "#ffffff",
        horizontalItemSelectedColor: b.colorPrimary,
      },
      Table: {
        headerBg: "#f7f9fd",
        headerColor: "#475569",
        headerSplitColor: "transparent",
        rowHoverBg: "#f5f8ff",
      },
      Card: { borderRadiusLG: 14 },
    },
  };
}

/** 路由切换过渡：key=route，每次挂载播放进场动画（theme.css .page-enter） */
export function PageTransition(props: { routeKey: string; children: ReactNode }) {
  return (
    <div key={props.routeKey} className="page-enter">
      {props.children}
    </div>
  );
}

/**
 * 数字滚动：target 变化时从当前值缓动滚到新值（rAF + easeOutCubic）。
 * 轮询数据每 15s 刷新一次，从旧值滚到新值比清零重滚自然。
 */
export function useCountUp(target: number, opts?: { durationMs?: number; enabled?: boolean }): number {
  const enabled = opts?.enabled !== false;
  const [val, setVal] = useState(() => (enabled ? 0 : target));
  const curRef = useRef(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      curRef.current = target;
      setVal(target);
      return;
    }
    const from = curRef.current;
    const to = target;
    if (Math.abs(to - from) < 1e-9) {
      curRef.current = to;
      setVal(to);
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      curRef.current = to;
      setVal(to);
      return;
    }
    const dur = opts?.durationMs ?? 800;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      curRef.current = from + (to - from) * eased;
      setVal(curRef.current);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, opts?.durationMs]);

  return val;
}

/**
 * 指标卡：图标气泡 + 数字滚动 + 进场交错（animationDelay）+ hover 浮起。
 * tone 传 6 位 hex（图标气泡底色按 `${tone}1a` 附加透明度）。
 */
export function StatCard(props: {
  title: string;
  value: number | string;
  precision?: number;
  prefix?: string;
  suffix?: string;
  icon: ReactNode;
  tone?: string;
  loading?: boolean;
  delayMs?: number;
}) {
  const numeric =
    typeof props.value === "number"
      ? props.value
      : props.value !== "" && Number.isFinite(Number(props.value))
        ? Number(props.value)
        : null;
  const rolled = useCountUp(numeric ?? 0, { enabled: numeric !== null && !props.loading });
  return (
    <Card
      className="stat-card"
      loading={props.loading}
      style={{ animationDelay: props.delayMs ? `${props.delayMs}ms` : undefined }}
    >
      <div className="stat-card-row">
        <span
          className="stat-icon"
          style={{ color: props.tone, background: props.tone ? `${props.tone}1a` : undefined }}
        >
          {props.icon}
        </span>
        <Statistic
          title={props.title}
          value={numeric === null ? props.value : rolled}
          precision={numeric === null ? undefined : props.precision}
          prefix={props.prefix}
          suffix={props.suffix}
        />
      </div>
    </Card>
  );
}
