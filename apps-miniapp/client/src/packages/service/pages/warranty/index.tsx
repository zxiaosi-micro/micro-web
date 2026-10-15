// service/warranty.tsx · 质保与合同（分包 service；两个 Tab 列表）。
import { useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import type { ContractListResp, ContractView, WarrantyListResp, WarrantyView } from "@micro/shared/types/mobile-bff";
import { listContracts, listWarranties } from "../../../../api";
import { fmtTime, statusTone, warrantyStatusLabel } from "../../../../ui";
import { useThemePage } from "../../../../i18n";
import "./index.scss";

type Tab = "warranty" | "contract";

export default function WarrantyPage() {
  const { t, rootClass } = useThemePage("page.warranty");
  const [tab, setTab] = useState<Tab>("warranty");
  const [warranties, setWarranties] = useState<WarrantyView[]>([]);
  const [contracts, setContracts] = useState<ContractView[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loads: Array<Promise<void>> = [
      listWarranties({ page: 1, size: 50 })
        .then((r: WarrantyListResp) => setWarranties(r.list ?? []))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : t("sv.loadFailed"))),
      listContracts({ page: 1, size: 50 })
        .then((r: ContractListResp) => setContracts(r.list ?? []))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : t("sv.contractFailed"))),
    ];
    void Promise.all(loads);
  }, []);

  return (
    <View className={`app-page ${rootClass}`}>
      <View className="sv-tabs">
        <View className={`sv-tab ${tab === "warranty" ? "sv-tab-active" : ""}`} onClick={() => setTab("warranty")}>
          <Text>{t("sv.tabWarranty")}</Text>
        </View>
        <View className={`sv-tab ${tab === "contract" ? "sv-tab-active" : ""}`} onClick={() => setTab("contract")}>
          <Text>{t("sv.tabContract")}</Text>
        </View>
      </View>

      {error !== "" && <Text className="app-error">{error}</Text>}

      {tab === "warranty" && (
        <>
          {warranties.length === 0 && <Text className="app-empty">{t("sv.noWarranty")}</Text>}
          {warranties.map((w) => (
            <View className="app-card" key={w.warranty_id}>
              <View className="sv-head">
                <Text className="sv-title">{w.warranty_no}</Text>
                <Text className={`app-tag ${statusTone(w.status)}`}>{warrantyStatusLabel(w.status)}</Text>
              </View>
              <Text className="sv-meta">
                {w.level === "STATION" ? t("sv.stationLevel") : t("sv.deviceLevel")} · {t("sv.target", { target: w.target_key || "—" })}
              </Text>
              <Text className="sv-meta">
                {t("dev.warrantyRange", { start: w.start_at ? fmtTime(w.start_at) : t("sv.notStarted"), end: w.end_at ? fmtTime(w.end_at) : "—", months: w.months })}
              </Text>
            </View>
          ))}
        </>
      )}

      {tab === "contract" && (
        <>
          {contracts.length === 0 && <Text className="app-empty">{t("sv.noContract")}</Text>}
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
                {t("sv.amount", { amount: c.amount || "0", time: fmtTime(c.created_at) })}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
