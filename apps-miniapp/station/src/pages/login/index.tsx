// pages/login/index.tsx · 登录页（S9-03）：admin-bff 密码登录 {mobile,password}；
// 10407 锁定倒计时 / 10400 凭证错误；登录成功拉 /station-web/me 锁定本场站后进工作台。

import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { cachedStationMe, isLoggedIn, login } from "../../auth";
import { useThemePage } from "../../i18n";
import PrefsRow from "../../prefs-row";
import "./index.scss";

const WORKBENCH_PAGE = "/pages/workbench/index";

export default function LoginPage() {
  const { t, rootClass } = useThemePage("page.login");
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
      setMessage(router.params.reason ? decodeURIComponent(router.params.reason) : t("login.expired"));
    }
  }, [router.params.kicked, router.params.reason]);

  const onSubmit = async () => {
    if (!mobile.trim() || !password) {
      setMessage(t("login.needBoth"));
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
    setMessage(result.message ?? t("login.failed"));
  };

  const disabled = submitting || lockedSeconds > 0;

  return (
    <View className={`app-page ${rootClass}`}>
      <View className="login-brand">
        <Text className="login-brand-title">{t("app.brand")}</Text>
        <View className="login-brand-sub">{t("login.subtitle")}</View>
      </View>

      <View className="login-card">
        <View className="login-label">{t("login.mobile")}</View>
        <Input
          className="app-input"
          value={mobile}
          onInput={(e) => setMobile(e.detail.value)}
          placeholder={t("login.mobilePlaceholder")}
          type="text"
          maxlength={20}
        />
        <View className="login-label">{t("login.password")}</View>
        <Input
          className="app-input"
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
          placeholder={t("login.passwordPlaceholder")}
          password
        />
        {message !== null && <Text className="login-error">{message}</Text>}
        {lockedSeconds > 0 && <Text className="login-locked">{t("login.lockedRetry", { seconds: lockedSeconds })}</Text>}
        <Button
          className={`app-btn ${disabled ? "login-btn-disabled" : ""}`}
          disabled={disabled}
          loading={submitting}
          onClick={() => void onSubmit()}
        >
          <Text className="app-btn-text">{lockedSeconds > 0 ? t("login.locked", { seconds: lockedSeconds }) : t("common.login")}</Text>
        </Button>
      </View>

      <PrefsRow />
    </View>
  );
}
