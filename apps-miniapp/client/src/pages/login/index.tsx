// login.tsx · 登录页：微信静默授权（wxLogin）+ 手机号绑定表单（need_bind_phone 流程收尾）。
// 进入即静默登录；被踢（10402）/失效（10403/10405 兜底失败）由请求层 reLaunch 到本页并带提示。
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Input, Text, View } from "@tarojs/components";
import { bindPhone, wxLogin } from "../../auth";
import { useThemePage } from "../../i18n";
import PrefsRow from "../../prefs-row";
import "./index.scss";

type Phase = "loading" | "bind" | "error";

export default function Login() {
  const { t, rootClass } = useThemePage("page.home");
  // 跳转原因（kicked=互斥踢下线 / reason=失效文案），只在首帧读一次
  const [notice] = useState(() => {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.kicked === "1") {
      return params.reason ?? t("login.kicked");
    }
    return params?.reason ?? "";
  });

  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void runLogin();
  }, []);

  /** 静默登录：成功回首页；首登未绑手机切绑定表单；其余展示错误可重试 */
  async function runLogin(): Promise<void> {
    setPhase("loading");
    setMessage("");
    const r = await wxLogin();
    if (r.ok) {
      void Taro.reLaunch({ url: "/pages/index/index" });
      return;
    }
    if (r.needBindPhone) {
      setPhase("bind");
      return;
    }
    setPhase("error");
    setMessage(r.message ?? t("login.failed"));
  }

  /** 绑定手机号：Taro.login 取新 code → /auth/wx-bind-phone → 签发 tokens */
  async function onSubmitPhone(): Promise<void> {
    const trimmed = phone.trim();
    if (!/^1\d{10}$/.test(trimmed)) {
      Taro.showToast({ title: t("login.phoneInvalid"), icon: "none" });
      return;
    }
    setSubmitting(true);
    const r = await bindPhone(trimmed);
    setSubmitting(false);
    if (r.ok) {
      void Taro.reLaunch({ url: "/pages/index/index" });
      return;
    }
    setMessage(r.message ?? t("login.bindFailed"));
  }

  return (
    <View className={`app-page ${rootClass}`}>
      <View className="app-card login-hero">
        <Text className="app-title">{t("app.brand")}</Text>
        <Text className="app-sub">{t("login.heroSub")}</Text>
      </View>

      {notice !== "" && (
        <View className="login-notice">
          <Text className="login-notice-text">{notice}</Text>
        </View>
      )}

      {phase === "loading" && <Text className="app-loading">{t("login.wxLoading")}</Text>}

      {phase === "bind" && (
        <View className="app-card">
          <Text className="app-title">{t("login.bindTitle")}</Text>
          <Text className="app-sub">{t("login.bindSub")}</Text>
          <Input
            className="app-input"
            type="number"
            maxlength={11}
            placeholder={t("login.phonePlaceholder")}
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
          {message !== "" && <Text className="app-error">{message}</Text>}
          <Button className="login-submit" disabled={submitting} onClick={() => void onSubmitPhone()}>
            {submitting ? t("login.binding") : t("login.bindSubmit")}
          </Button>
        </View>
      )}

      {phase === "error" && (
        <View className="app-card">
          <Text className="app-title">{t("login.failedTitle")}</Text>
          {message !== "" && <Text className="app-error">{message}</Text>}
          <Button className="login-submit" onClick={() => void runLogin()}>
            {t("login.retry")}
          </Button>
        </View>
      )}

      <PrefsRow />
    </View>
  );
}
