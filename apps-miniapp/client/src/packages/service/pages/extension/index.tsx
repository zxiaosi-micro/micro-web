// service/extension.tsx · 延保购买（分包 service）：EXT_WARRANTY SKU 列表 + 数量选择 + 下单微信支付（dev mock URL）。
// base_warranty_id 从路由参数带入（设备详情"购买延保"入口）。
import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ExtensionSkuView } from "@micro/shared/types/mobile-bff";
import { createExtensionOrder, listExtensionSkus } from "../../../../api";
import "./../warranty/index.scss";

export default function ExtensionPage() {
  const [skus, setSkus] = useState<ExtensionSkuView[]>([]);
  const [baseWarranty, setBaseWarranty] = useState("");
  const [selected, setSelected] = useState<ExtensionSkuView | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = (Taro.getCurrentInstance().router?.params ?? {}) as Record<string, string | undefined>;
    setBaseWarranty(params.warranty ?? "");
    listExtensionSkus()
      .then((r) => setSkus(r.list ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const submit = async (): Promise<void> => {
    if (!selected) {
      setError("请先选择延保商品");
      return;
    }
    setSubmitting(true);
    try {
      const r = await createExtensionOrder({
        base_warranty_id: baseWarranty,
        sku_id: selected.sku_id,
        qty,
      });
      setError("");
      Taro.showModal({
        title: "下单成功",
        content: `订单 ${r.order_no}\n金额 ¥${r.total_amount}\n支付链接（dev 模拟）：${r.pay_params}\n支付单号 ${r.payment_no}`,
        showCancel: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "下单失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="app-page">
      {baseWarranty === "" && (
        <Text className="app-empty">未指定衔接质保——请从设备详情进入以无缝衔接原质保</Text>
      )}
      {error !== "" && <Text className="app-error">{error}</Text>}
      {skus.length === 0 && error === "" && <Text className="app-empty">暂无可售延保商品</Text>}
      {skus.map((s) => (
        <View
          className="app-card"
          key={s.sku_id}
          onClick={() => setSelected(s)}
          style={selected?.sku_id === s.sku_id ? { border: "2px solid #1f6feb" } : {}}
        >
          <View className="sv-head">
            <Text className="sv-title">{s.name}</Text>
            <Text className="sv-price">¥{s.price || "—"}</Text>
          </View>
          <Text className="sv-meta">
            {s.code} · {s.spec || "—"}
          </Text>
        </View>
      ))}

      {selected && (
        <View className="app-card">
          <Text className="sv-title">购买数量</Text>
          <View className="sv-qty">
            <View className="sv-qty-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Text>-</Text>
            </View>
            <Input
              className="sv-qty-val"
              type="number"
              value={String(qty)}
              onInput={(e) => setQty(Math.max(1, Math.min(10, Number(e.detail.value) || 1)))}
            />
            <View className="sv-qty-btn" onClick={() => setQty((q) => Math.min(10, q + 1))}>
              <Text>+</Text>
            </View>
          </View>
          <Button className="sv-btn" loading={submitting} disabled={submitting} onClick={() => void submit()}>
            提交订单并支付
          </Button>
        </View>
      )}
    </View>
  );
}
