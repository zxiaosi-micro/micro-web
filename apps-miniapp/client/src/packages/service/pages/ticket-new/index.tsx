// service/ticket-new.tsx · 报修（分包 service）：选设备/填单/拍照占位 + 提交后订阅消息授权（告警提醒场景，04 §3 F2）。
import { useEffect, useState } from "react";
import { Button, Input, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { CustomerDeviceItem } from "@micro/shared/types/mobile-bff";
import { createTicket, listDevices } from "../../../../api";
import { requestAlertSubscribe } from "../../../../subscribe";
import "./../warranty/index.scss";
import { useThemePage } from "../../../../i18n";

export default function TicketNewPage() {
  const { t, rootClass } = useThemePage("page.ticketNew");
  const [devices, setDevices] = useState<CustomerDeviceItem[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [sn, setSn] = useState("");
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = (Taro.getCurrentInstance().router?.params ?? {}) as Record<string, string | undefined>;
    if (params.deviceId) {
      setDeviceId(params.deviceId);
      setSn(params.sn ?? "");
    } else {
      listDevices({ page: 1, size: 50 })
        .then((r) => setDevices(r.list ?? []))
        .catch((e) => setError(e instanceof Error ? e.message : t("tk.deviceListFailed")));
    }
  }, []);

  // 拍照/选图：chooseImage 得本机临时路径；正式上传走 file 服务（biz_type 后扩展位），
  // 当前把路径并入 content 留痕（p5smoke 同口径）。
  const pickPhoto = (): void => {
    Taro.chooseImage({
      count: 3 - photos.length,
      success: (r) => setPhotos((p) => [...p, ...r.tempFilePaths].slice(0, 3)),
    }).catch(() => undefined);
  };

  const submit = async (): Promise<void> => {
    if (title.trim() === "" || (deviceId === "" && sn.trim() === "")) {
      setError(t("tk.needTitle"));
      return;
    }
    setSubmitting(true);
    try {
      const r = await createTicket({
        device_id: deviceId || undefined,
        sn: deviceId === "" ? sn.trim() : undefined,
        title: title.trim(),
        content: content.trim(),
        photos: photos.length > 0 ? photos : undefined,
      });
      // 报修提交成功 → 订阅消息授权（告警/工单提醒模板，04 §3 F2 用户侧申请后生效）
      void requestAlertSubscribe();
      Taro.showModal({
        title: t("tk.acceptedTitle"),
        content: t("tk.acceptedContent", { no: r.ticket_no }),
        showCancel: false,
        success: () => Taro.redirectTo({ url: "/packages/service/pages/tickets/index" }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tk.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className={`app-page ${rootClass}`}>
      {error !== "" && <Text className="app-error">{error}</Text>}

      {deviceId === "" && (
        <View className="app-card">
          <Text className="sv-title">{t("tk.pickDevice")}</Text>
          {deviceOpen ? (
            devices.map((d) => (
              <View
                className="sv-pick"
                key={d.device_id}
                onClick={() => {
                  setDeviceId(d.device_id);
                  setSn(d.sn);
                  setDeviceOpen(false);
                }}
              >
                {d.sn}（{d.model || "—"}）
              </View>
            ))
          ) : (
            <View className="sv-pick" onClick={() => setDeviceOpen(true)}>
              {sn || t("tk.pickHint")}
            </View>
          )}
        </View>
      )}

      <View className="app-card">
        <Text className="sv-title">{t("tk.faultSection")}</Text>
        <Input
          className="sv-input"
          placeholder={t("tk.titlePlaceholder")}
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
          style={{ marginTop: "16px" }}
        />
        <Textarea
          className="sv-textarea"
          placeholder={t("tk.contentPlaceholder")}
          value={content}
          onInput={(e) => setContent(e.detail.value)}
          style={{ marginTop: "16px" }}
        />
        <View style={{ marginTop: "16px" }}>
          <View className="sv-photo" onClick={pickPhoto}>
            {t("tk.photo", { count: photos.length })}
          </View>
          {photos.map((p) => (
            <Text className="sv-meta" key={p}>
              {t("tk.photoPicked")}
            </Text>
          ))}
        </View>
        <Button className="sv-btn" loading={submitting} disabled={submitting} onClick={() => void submit()}>
          {t("tk.submit")}
        </Button>
      </View>
    </View>
  );
}
