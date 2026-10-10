// Login.tsx · 场站 Web 登录（STATION_WEB 语义：登录后 /station-web/me 锁定本场站）。

import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { MobileOutlined } from "@ant-design/icons";
import { login } from "@micro/shared";

export default function LoginPage(props: { onLoggedIn: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMessage(null);
  }, []);

  const onFinish = async (values: { mobile: string; password: string }) => {
    setSubmitting(true);
    setMessage(null);
    const result = await login(values.mobile, values.password);
    setSubmitting(false);
    if (result.ok) {
      props.onLoggedIn();
      return;
    }
    setMessage(result.message ?? "登录失败");
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#e6f4ff" }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={4} style={{ textAlign: "center" }}>
          场站 Web 登录
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: "center", fontSize: 12 }}>
          场站人员专用（data_scope 锁定本场站）
        </Typography.Paragraph>
        {message && <Alert type="error" showIcon message={message} style={{ marginBottom: 16 }} />}
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="mobile" rules={[{ required: true, message: "请输入手机号" }]}>
            <Input prefix={<MobileOutlined />} placeholder="手机号" maxLength={20} autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
