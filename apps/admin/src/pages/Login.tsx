// Login.tsx · 登录页（10400 凭证错误 / 10407 锁定倒计时分流，S3-04）。
// 视觉：全屏渐变 + 光斑动画 + 玻璃拟态卡片（theme.css）；登录态回填走 zustand store。

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { MobileOutlined, SafetyOutlined } from "@ant-design/icons";
import { login } from "@micro/shared";
import { brandStyle, PrefSwitcher } from "@micro/shared/theme";
import { usePrefs } from "@micro/shared/prefs";
import { useAuthStore } from "../store/auth";
import { BRAND } from "../brand";

export default function LoginPage() {
  const { t } = usePrefs();
  const refresh = useAuthStore((s) => s.refresh);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 10407 锁定倒计时
  useEffect(() => {
    if (lockedSeconds <= 0) {
      return;
    }
    const timer = setInterval(() => setLockedSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [lockedSeconds]);

  const onFinish = async (values: { mobile: string; password: string }) => {
    setSubmitting(true);
    setMessage(null);
    const result = await login(values.mobile, values.password);
    setSubmitting(false);
    if (result.ok) {
      refresh();
      return;
    }
    if (result.lockedSeconds && result.lockedSeconds > 0) {
      setLockedSeconds(result.lockedSeconds);
      setMessage(result.message ?? t("login.accountLocked"));
    } else {
      setMessage(result.message ?? t("login.failed"));
    }
  };

  return (
    <div className="login-bg" style={brandStyle(BRAND)}>
      <div className="login-blob b1" />
      <div className="login-blob b2" />
      <div className="login-blob b3" />
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 2 }}>
        <PrefSwitcher />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">
            <SafetyOutlined />
          </span>
          <span className="login-brand-title">{t("app.title")}</span>
          <span className="login-brand-sub">{t("login.subtitle")}</span>
        </div>
        {message && (
          <Alert type="error" showIcon message={message} style={{ marginBottom: 16 }} />
        )}
        <Form onFinish={onFinish} layout="vertical" disabled={lockedSeconds > 0}>
          <Form.Item name="mobile" rules={[{ required: true, message: t("login.mobileRequired") }]}>
            <Input size="large" prefix={<MobileOutlined />} placeholder={t("login.mobile")} maxLength={20} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t("login.passwordRequired") }]}>
            <Input.Password size="large" placeholder={t("login.password")} autoComplete="current-password" />
          </Form.Item>
          <Button className="btn-brand-grad" type="primary" htmlType="submit" block size="large" loading={submitting} disabled={lockedSeconds > 0}>
            {lockedSeconds > 0 ? t("login.lockedRetry", { seconds: lockedSeconds }) : t("common.login")}
          </Button>
        </Form>
        <p className="login-footnote">{t("login.footnote")}</p>
      </div>
    </div>
  );
}
