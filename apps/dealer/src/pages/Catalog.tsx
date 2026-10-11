// Catalog.tsx · 商品目录（S9-04）：SKU 列表 + 经销商价（缺省回退零售价，FR-CTL-004）+ 可售库存跨仓聚合。
// 约定：ID string（E8）；列表 usePaged；价格/ 库存在 fetcher 内并行补齐（一次轮询一批，与 SKU 行同生命周期）。

import { useState } from "react";
import { Button, Input, Space, Table, Tag, Typography } from "antd";
import { ShoppingCartOutlined, ReloadOutlined } from "@ant-design/icons";
import { usePaged } from "@micro/shared";
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
  const [keyword, setKeyword] = useState("");

  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<SkuRow>(
    async (p) => {
      const resp = await listSkus(keyword, p);
      const rows = await Promise.all(resp.list.map(enrichSku));
      return { list: rows, total: resp.total };
    },
  );

  const columns = [
    { title: "编码", dataIndex: "code" },
    { title: "名称", dataIndex: "name" },
    { title: "类型", dataIndex: "type", render: (v: string) => <Tag color={v === "EXT_WARRANTY" ? "purple" : "blue"}>{v}</Tag> },
    { title: "规格", dataIndex: "spec", render: (v: string) => v || "—" },
    {
      title: "经销商价（元）",
      dataIndex: "dealerPrice",
      render: (v: string | null, r: SkuRow) => {
        if (!r.retailPrice && !v) {
          return <Typography.Text type="secondary">未设价</Typography.Text>;
        }
        return (
          <Space size={4}>
            <Typography.Text strong>¥{v ?? r.retailPrice}</Typography.Text>
            {v ? <Tag color="green">经销商价</Tag> : <Tag>零售价回退</Tag>}
          </Space>
        );
      },
    },
    {
      title: "可售库存",
      dataIndex: "available",
      render: (v: number) =>
        v > 0 ? <Typography.Text type="warning">{v}</Typography.Text> : <Typography.Text type="secondary">无货</Typography.Text>,
    },
  ];

  return (
    <>
      <Typography.Title level={4}>商品目录</Typography.Title>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        经销商价缺省回退零售价（FR-CTL-004）；可售库存为 available 跨仓聚合，仅作参考——下单以服务端预扣为准。
      </Typography.Text>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          style={{ width: 240 }}
          allowClear
          placeholder="SKU 编码/名称"
        />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Button type="primary" icon={<ShoppingCartOutlined />} onClick={() => (window.location.hash = "#/order-create")}>
          去下单
        </Button>
      </Space>
      <Table
        rowKey="sku_id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          onChange: (p, s) => {
            setPage(p);
            setSize(s);
          },
        }}
      />
    </>
  );
}
