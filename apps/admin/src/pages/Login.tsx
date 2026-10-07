// Login.tsx · 登录页（10400 凭证错误 / 10407 锁定倒计时分流，S3-04）。

import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { MobileOutlined } from "@ant-design/icons";
import { login } from "@micro/shared";

export default function LoginPage(props: { onLoggedIn: () => void }) {
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
      props.onLoggedIn();
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
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f0f2f5" }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={4} style={{ textAlign: "center" }}>
          管理后台登录
        </Typography.Title>
        {message && (
          <Alert type="error" showIcon message={message} style={{ marginBottom: 16 }} />
        )}
        <Form onFinish={onFinish} layout="vertical" disabled={lockedSeconds > 0}>
          <Form.Item name="mobile" rules={[{ required: true, message: "请输入手机号" }]}>
            <Input prefix={<MobileOutlined />} placeholder="手机号" maxLength={20} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting} disabled={lockedSeconds > 0}>
            {lockedSeconds > 0 ? `已锁定,${lockedSeconds}s 后重试` : "登录"}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
