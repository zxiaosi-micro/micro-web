// Screen.tsx · 大屏（S7-03）：4K 等比缩放（scale）+ 免登录设备账号 + 10s 轮询。
//
// 免登录口径（FR-STN-007）：VITE_SCREEN_MOBILE / VITE_SCREEN_PASSWORD 构建期注入
// 设备账号凭证，无 token 时自动登录（不占人工席位）；密码不入代码，走 env。

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Col, Progress, Row, Tag } from "antd";
import { login, tokenStore, usePolling } from "@micro/shared";
import { pendingAlerts, stationMonitor } from "../api";

export default function ScreenPage() {
  const [ready, setReady] = useState(!!tokenStore.getAccessToken());
  const scaleRef = useRef<HTMLDivElement>(null);

  // 免登录设备账号自动登录（大屏专用）
  useEffect(() => {
    if (ready) return;
    const mobile = import.meta.env.VITE_SCREEN_MOBILE as string | undefined;
    const password = import.meta.env.VITE_SCREEN_PASSWORD as string | undefined;
    if (mobile && password) {
      void login(mobile, password).then((r) => setReady(r.ok));
    } else {
      setReady(true); // 无凭证也渲染（接口 401 显示提示，不阻塞布局）
    }
  }, [ready]);

  // 4K 等比缩放：1920×1080 设计稿 → 实际窗口 scale
  useEffect(() => {
    const fit = () => {
      const el = scaleRef.current;
      if (!el) return;
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      el.style.transform = `scale(${scale})`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const stationId = useMemo(() => {
    return new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("station_id") ?? "";
  }, []);

  const monitor = usePolling(() => stationMonitor(stationId), { intervalMs: 10_000 });
  const alerts = usePolling(async () => {
    const out = await pendingAlerts(stationId, "0");
    return out.items ?? [];
  }, { intervalMs: 10_000 });

  const d = monitor.data;

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#0a1628" }}>
      <div ref={scaleRef} style={{ width: 1920, height: 1080, transformOrigin: "top left", padding: 24, color: "#cfe8ff" }}>
        <h1 style={{ color: "#fff", textAlign: "center", letterSpacing: 4 }}>
          {d ? "场站运行大屏" : "场站运行大屏（未配置 station_id）"}
        </h1>
        <Row gutter={24}>
          <Col span={6}>
            <ScreenCard title="设备总数" value={d?.device_count ?? "-"} />
          </Col>
          <Col span={6}>
            <ScreenCard title="在线设备" value={d?.online_count ?? "-"} />
          </Col>
          <Col span={6}>
            <ScreenCard title="平均 SOC">
              <Progress type="dashboard" percent={Math.round(d?.avg_soc ?? 0)} size={120} strokeColor="#36cfc9" />
            </ScreenCard>
          </Col>
          <Col span={6}>
            <ScreenCard title="总功率 kW" value={d?.total_power ?? "-"} />
          </Col>
        </Row>
        <Card
          title={<span style={{ color: "#cfe8ff" }}>最新告警（10s 轮询）</span>}
          style={{ marginTop: 24, background: "#112240", border: "1px solid #1e3a5f" }}
        >
          {(alerts.data ?? []).slice(0, 8).map((a) => (
            <p key={a.alert_id}>
              <Tag color={a.level === "P1" ? "red" : a.level === "P2" ? "orange" : "blue"}>{a.level}</Tag>
              <span>{a.title}</span>
              <span style={{ color: "#5b7ca3", marginLeft: 12 }}>
                {a.first_seen_at ? new Date(a.first_seen_at).toLocaleTimeString() : ""}
              </span>
            </p>
          ))}
          {(alerts.data ?? []).length === 0 && <p style={{ color: "#5b7ca3" }}>暂无告警</p>}
        </Card>
        {!ready && (
          <p style={{ color: "#5b7ca3", textAlign: "center", marginTop: 24 }}>
            大屏免登录账号未配置（VITE_SCREEN_MOBILE / VITE_SCREEN_PASSWORD）
          </p>
        )}
      </div>
    </div>
  );
}

function ScreenCard(props: { title: string; value?: string | number; children?: React.ReactNode }) {
  return (
    <Card title={<span style={{ color: "#cfe8ff" }}>{props.title}</span>} style={{ background: "#112240", border: "1px solid #1e3a5f", minHeight: 160 }}>
      {props.children ?? <span style={{ fontSize: 42, color: "#fff" }}>{props.value ?? "-"}</span>}
    </Card>
  );
}
