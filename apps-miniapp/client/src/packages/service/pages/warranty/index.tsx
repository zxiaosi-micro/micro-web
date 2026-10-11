// service/warranty.tsx · 质保与合同（分包 service；两个 Tab 列表）。
import { useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import type { ContractListResp, ContractView, WarrantyListResp, WarrantyView } from "@micro/shared/types/mobile-bff";
import { listContracts, listWarranties } from "../../../../api";
import { WARRANTY_STATUS_LABEL, fmtTime, statusLabel, statusTone } from "../../../../ui";
import "./index.scss";

type Tab = "warranty" | "contract";

export default function WarrantyPage() {
  const [tab, setTab] = useState<Tab>("warranty");
  const [warranties, setWarranties] = useState<WarrantyView[]>([]);
  const [contracts, setContracts] = useState<ContractView[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loads: Array<Promise<void>> = [
      listWarranties({ page: 1, size: 50 })
        .then((r: WarrantyListResp) => setWarranties(r.list ?? []))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "质保加载失败")),
      listContracts({ page: 1, size: 50 })
        .then((r: ContractListResp) => setContracts(r.list ?? []))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "合同加载失败")),
    ];
    void Promise.all(loads);
  }, []);

  return (
    <View className="app-page">
      <View className="sv-tabs">
        <View className={`sv-tab ${tab === "warranty" ? "sv-tab-active" : ""}`} onClick={() => setTab("warranty")}>
          <Text>质保</Text>
        </View>
        <View className={`sv-tab ${tab === "contract" ? "sv-tab-active" : ""}`} onClick={() => setTab("contract")}>
          <Text>合同</Text>
        </View>
      </View>

      {error !== "" && <Text className="app-error">{error}</Text>}

      {tab === "warranty" && (
        <>
          {warranties.length === 0 && <Text className="app-empty">暂无质保记录</Text>}
          {warranties.map((w) => (
            <View className="app-card" key={w.warranty_id}>
              <View className="sv-head">
                <Text className="sv-title">{w.warranty_no}</Text>
                <Text className={`app-tag ${statusTone(w.status)}`}>{statusLabel(WARRANTY_STATUS_LABEL, w.status)}</Text>
              </View>
              <Text className="sv-meta">
                {w.level === "STATION" ? "场站级" : "设备级"} · 对象 {w.target_key || "—"}
              </Text>
              <Text className="sv-meta">
                {w.start_at ? fmtTime(w.start_at) : "未起算"} ~ {w.end_at ? fmtTime(w.end_at) : "—"} · {w.months} 个月
              </Text>
            </View>
          ))}
        </>
      )}

      {tab === "contract" && (
        <>
          {contracts.length === 0 && <Text className="app-empty">暂无合同</Text>}
          {contracts.map((c) => (
            <View className="app-card" key={c.contract_id}>
              <View className="sv-head">
                <Text className="sv-title">{c.name || c.contract_no}</Text>
                <Text className="app-tag">{c.status}</Text>
              </View>
              <Text className="sv-meta">
                {c.contract_no} · {c.type}
              </Text>
              <Text className="sv-meta">
                金额 ¥{c.amount || "0"} · {fmtTime(c.created_at)}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
