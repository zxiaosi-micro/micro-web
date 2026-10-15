// Catalog.tsx · 商品目录（S9-04）：SKU 列表 + 经销商价（缺省回退零售价，FR-CTL-004）+ 可售库存跨仓聚合。
// 约定：ID string（E8）；列表走 ProTable request；价格/库存在 request 内并行补齐（一次请求一批，与 SKU 行同生命周期）。

import { useRef, useState } from "react";
import { Button, Input, Space, Tag, Typography } from "antd";
import { ShoppingCartOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { usePrefs } from "@micro/shared/prefs";
import type { SkuItem } from "@micro/shared/types";
import { listInventory, listPrices, listSkus } from "../api";

/** 目录行 = SKU + 价目（经销商价/零售价）+ 跨仓可售聚合 */
interface SkuRow extends SkuItem {
  dealerPrice: string | null; // 经销商价；null 表示缺失回退零售价
  retailPrice: string;
  available: number; // available 跨仓求和
}

/** 单 SKU 补齐：查 DEALER 价（缺省回退 RETAIL）+ /inventory 聚合 available */
async function enrichSku(s: SkuItem): Promise<SkuRow> {
  const [prices, inv] = await Promise.all([
    listPrices(s.sku_id).catch(() => null),
    listInventory(s.sku_id, "", { page: 1, size: 100 }).catch(() => null),
  ]);
  const latest = prices?.list ?? [];
  const retail = latest.find((x) => x.price_type === "RETAIL");
  const dealer = latest.find((x) => x.price_type === "DEALER");
  const available = (inv?.list ?? []).reduce((sum, it) => sum + it.available, 0);
  return {
    ...s,
    retailPrice: retail?.amount ?? "",
    dealerPrice: dealer?.amount ?? null,
    available,
  };
}

export default function CatalogPage() {
  const { t } = usePrefs();
  const [keyword, setKeyword] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<SkuRow>[] = [
    { title: t("cat.code"), dataIndex: "code", search: false },
    { title: t("cat.name"), dataIndex: "name", search: false },
    { title: t("cat.type"), dataIndex: "type", search: false, render: (_, r) => <Tag color={r.type === "EXT_WARRANTY" ? "purple" : "blue"}>{r.type}</Tag> },
    { title: t("cat.spec"), dataIndex: "spec", search: false, render: (_, r) => r.spec || "—" },
    {
      title: t("cat.dealerPrice"),
      dataIndex: "dealerPrice",
      search: false,
      render: (_, r) => {
        if (!r.retailPrice && !r.dealerPrice) {
          return <Typography.Text type="secondary">{t("cat.noPrice")}</Typography.Text>;
        }
        return (
          <Space size={4}>
            <Typography.Text strong>¥{r.dealerPrice ?? r.retailPrice}</Typography.Text>
            {r.dealerPrice ? <Tag color="green">{t("cat.dealerTag")}</Tag> : <Tag>{t("cat.retailTag")}</Tag>}
          </Space>
        );
      },
    },
    {
      title: t("cat.stock"),
      dataIndex: "available",
      search: false,
      render: (_, r) =>
        r.available > 0 ? <Typography.Text type="warning">{r.available}</Typography.Text> : <Typography.Text type="secondary">{t("cat.noStock")}</Typography.Text>,
    },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        {t("cat.hint")}
      </Typography.Text>
      <ProTable<SkuRow>
        headerTitle={t("cat.title")}
        rowKey="sku_id"
        actionRef={actionRef}
        columns={columns}
        params={{ keyword }}
        request={async (params) => {
          const resp = await listSkus(keyword, { page: params.current ?? 1, size: params.pageSize ?? 10 });
          const rows = await Promise.all(resp.list.map(enrichSku));
          return { data: rows, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Input.Search
            key="kw"
            onSearch={(v) => setKeyword(v)}
            style={{ width: 240 }}
            allowClear
            placeholder={t("cat.searchPlaceholder")}
          />,
          <Button key="go" type="primary" icon={<ShoppingCartOutlined />} onClick={() => (window.location.hash = "#/order-create")}>
            {t("cat.goOrder")}
          </Button>,
        ]}
      />
    </>
  );
}
