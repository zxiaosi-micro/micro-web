// Login.tsx · 经销商端登录（S9-04：10400 凭证错误 / 10407 锁定倒计时分流）。
// 视觉：全屏渐变 + 光斑动画 + 玻璃拟态卡片（theme.css）；登录态回填走 zustand store。

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { MobileOutlined, ShopOutlined } from "@ant-design/icons";
import { login } from "@micro/shared";
import { brandStyle } from "@micro/shared/theme";
import { useAuthStore } from "../store/auth";
import { BRAND } from "../brand";

export default function LoginPage() {
  const refresh = useAuthStore((s) => s.refresh);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 10407 锁定倒计时
  useEffect(() => {
    if (lockedSeconds <= 0) {
      return;
    }
    const t = setInterval(() => setLockedSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
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
      setMessage(result.message ?? "账号已锁定");
    } else {
      setMessage(result.message ?? "登录失败");
    }
  };

  return (
    <div className="login-bg" style={brandStyle(BRAND)}>
      <div className="login-blob b1" />
      <div className="login-blob b2" />
      <div className="login-blob b3" />
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">
            <ShopOutlined />
          </span>
          <span className="login-brand-title">电池全生命周期平台</span>
          <span className="login-brand-sub">经销商端 · data_scope 锁定本方档案与订单</span>
        </div>
        {message && (
          <Alert type="error" showIcon message={message} style={{ marginBottom: 16 }} />
        )}
        <Form onFinish={onFinish} layout="vertical" disabled={lockedSeconds > 0}>
          <Form.Item name="mobile" rules={[{ required: true, message: "请输入手机号" }]}>
            <Input size="large" prefix={<MobileOutlined />} placeholder="手机号" maxLength={20} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password size="large" placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Button className="btn-brand-grad" type="primary" htmlType="submit" block size="large" loading={submitting} disabled={lockedSeconds > 0}>
            {lockedSeconds > 0 ? `已锁定,${lockedSeconds}s 后重试` : "登录"}
          </Button>
        </Form>
        <p className="login-footnote">连续失败将触发账号锁定保护</p>
      </div>
    </div>
  );
}
