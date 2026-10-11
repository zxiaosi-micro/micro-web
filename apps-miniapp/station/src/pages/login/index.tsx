// pages/login/index.tsx · 登录页（S9-03）：admin-bff 密码登录 {mobile,password}；
// 10407 锁定倒计时 / 10400 凭证错误；登录成功拉 /station-web/me 锁定本场站后进工作台。

import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { cachedStationMe, isLoggedIn, login } from "../../auth";
import "./index.scss";

const WORKBENCH_PAGE = "/pages/workbench/index";

export default function LoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(0);

  // 10407 锁定倒计时（本地每秒递减；到 0 自动恢复可登录）
  useEffect(() => {
    if (lockedSeconds <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setLockedSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedSeconds > 0]);

  // 已登录且有驻站上下文 → 直接进工作台（token 失效由请求层 401 分流兜底弹回）
  useEffect(() => {
    if (isLoggedIn() && cachedStationMe()?.station_id) {
      Taro.reLaunch({ url: WORKBENCH_PAGE });
    }
  }, []);

  // 10402 同端互斥/会话注销被弹回：展示原因
  useEffect(() => {
    if (router.params.kicked === "1") {
      setMessage(router.params.reason ? decodeURIComponent(router.params.reason) : "登录状态已失效，请重新登录");
    }
  }, [router.params.kicked, router.params.reason]);

  const onSubmit = async () => {
    if (!mobile.trim() || !password) {
      setMessage("请输入手机号与密码");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const result = await login(mobile.trim(), password);
    setSubmitting(false);
    if (result.ok) {
      Taro.reLaunch({ url: WORKBENCH_PAGE });
      return;
    }
    if (result.lockedSeconds && result.lockedSeconds > 0) {
      setLockedSeconds(result.lockedSeconds);
    }
    setMessage(result.message ?? "登录失败");
  };

  const disabled = submitting || lockedSeconds > 0;

  return (
    <View className="app-page">
      <View className="login-brand">
        <Text className="login-brand-title">场站小程序</Text>
        <View className="login-brand-sub">场站人员专用（data_scope 锁定本场站）</View>
      </View>

      <View className="login-card">
        <View className="login-label">手机号</View>
        <Input
          className="app-input"
          value={mobile}
          onInput={(e) => setMobile(e.detail.value)}
          placeholder="请输入手机号"
          type="text"
          maxlength={20}
        />
        <View className="login-label">密码</View>
        <Input
          className="app-input"
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
          placeholder="请输入密码"
          password
        />
        {message !== null && <Text className="login-error">{message}</Text>}
        {lockedSeconds > 0 && <Text className="login-locked">账号已锁定，剩余 {lockedSeconds} 秒后可重试</Text>}
        <Button
          className={`app-btn ${disabled ? "login-btn-disabled" : ""}`}
          disabled={disabled}
          loading={submitting}
          onClick={() => void onSubmit()}
        >
          <Text className="app-btn-text">{lockedSeconds > 0 ? `已锁定（${lockedSeconds}s）` : "登录"}</Text>
        </Button>
      </View>
    </View>
  );
}
