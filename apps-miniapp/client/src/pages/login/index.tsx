// login.tsx · 登录页：微信静默授权（wxLogin）+ 手机号绑定表单（need_bind_phone 流程收尾）。
// 进入即静默登录；被踢（10402）/失效（10403/10405 兜底失败）由请求层 reLaunch 到本页并带提示。
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { Button, Input, Text, View } from "@tarojs/components";
import { bindPhone, wxLogin } from "../../auth";
import "./index.scss";

type Phase = "loading" | "bind" | "error";

export default function Login() {
  // 跳转原因（kicked=互斥踢下线 / reason=失效文案），只在首帧读一次
  const [notice] = useState(() => {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.kicked === "1") {
      return params.reason ?? "账号已在其他小程序端登录，请重新登录";
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
    setMessage(r.message ?? "登录失败，请重试");
  }

  /** 绑定手机号：Taro.login 取新 code → /auth/wx-bind-phone → 签发 tokens */
  async function onSubmitPhone(): Promise<void> {
    const trimmed = phone.trim();
    if (!/^1\d{10}$/.test(trimmed)) {
      Taro.showToast({ title: "请输入 11 位手机号", icon: "none" });
      return;
    }
    setSubmitting(true);
    const r = await bindPhone(trimmed);
    setSubmitting(false);
    if (r.ok) {
      void Taro.reLaunch({ url: "/pages/index/index" });
      return;
    }
    setMessage(r.message ?? "绑定失败，请重试");
  }

  return (
    <View className="app-page">
      <View className="app-card login-hero">
        <Text className="app-title">电池管家</Text>
        <Text className="app-sub">设备激活 · 影子监控 · 质保延保 · 售后报修</Text>
      </View>

      {notice !== "" && (
        <View className="login-notice">
          <Text className="login-notice-text">{notice}</Text>
        </View>
      )}

      {phase === "loading" && <Text className="app-loading">正在微信登录…</Text>}

      {phase === "bind" && (
        <View className="app-card">
          <Text className="app-title">绑定手机号</Text>
          <Text className="app-sub">首次微信登录需绑定手机号完成注册（dev MOCKWX 任意 11 位号码）</Text>
          <Input
            className="app-input"
            type="number"
            maxlength={11}
            placeholder="请输入手机号"
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
          {message !== "" && <Text className="app-error">{message}</Text>}
          <Button className="login-submit" disabled={submitting} onClick={() => void onSubmitPhone()}>
            {submitting ? "绑定中…" : "绑定并登录"}
          </Button>
        </View>
      )}

      {phase === "error" && (
        <View className="app-card">
          <Text className="app-title">登录失败</Text>
          {message !== "" && <Text className="app-error">{message}</Text>}
          <Button className="login-submit" onClick={() => void runLogin()}>
            重试
          </Button>
        </View>
      )}
    </View>
  );
}
