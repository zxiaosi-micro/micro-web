// Reconcile.tsx · 对账（S9-04）：本方档案（续签提醒占位）+ 发票列表 + 对账单/返利占位（L2/L3）。
// 发票走 ProTable request；顶部档案卡响应式栅格（手机单列）。

import { useRef } from "react";
import { Card, Col, Row, Tag, Typography } from "antd";
import { usePolling } from "@micro/shared";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { InvoiceView, PartyItem } from "@micro/shared/types";
import { fetchSelfDealer, listInvoices } from "../api";

const INVOICE_STATUS_COLOR: Record<string, string> = {
  ISSUED: "green",
  REVERSED: "red",
};

export default function ReconcilePage() {
  // 本方经销商档案（续签提醒=dealer_ext 展示；信用/授权区域到期后端未提供——占位）
  const self = usePolling(fetchSelfDealer, { intervalMs: 30_000 });
  const actionRef = useRef<ActionType | undefined>(undefined);

  const party: PartyItem | null = self.data?.party ?? null;
  const ext = self.data?.ext ?? null;

  const invoiceColumns: ProColumns<InvoiceView>[] = [
    { title: "发票号", dataIndex: "invoice_no" },
    { title: "关联订单", dataIndex: "order_no" },
    { title: "抬头", dataIndex: "title", ellipsis: true },
    { title: "金额", dataIndex: "amount", render: (_, r) => `¥${r.amount}` },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, r) => <Tag color={INVOICE_STATUS_COLOR[r.status] ?? "default"}>{r.status}</Tag>,
    },
    {
      title: "开票时间",
      dataIndex: "issued_at",
      render: (_, r) => (r.issued_at ? new Date(r.issued_at).toLocaleString() : "—"),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="本方档案（续签提醒）">
          {self.loading && !party && <Typography.Text type="secondary">加载中…</Typography.Text>}
          {party && (
            <>
              <Typography.Paragraph>
                {party.name}（{party.credit_code || "无统一信用代码"}）
              </Typography.Paragraph>
              {ext ? (
                <Typography.Paragraph>
                  经销商等级：{ext.dealer_level || "—"}｜授权区域：{ext.authorized_region || "—"}
                </Typography.Paragraph>
              ) : (
                <Typography.Text type="warning">未建立经销商扩展档案（请联系平台运营）</Typography.Text>
              )}
              <Typography.Paragraph type="secondary">
                续签提醒：授权协议到期字段后端未提供（占位：L2 FR-PTY-003 扩展），到期前 30 天此处展示提醒。
              </Typography.Paragraph>
            </>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title="返利（占位）">
          <Typography.Text type="secondary">
            经销商返利结算为 L3（FR-FIN-006）：规则快照/月度结算/对账按业务节奏启用（S10-03），
            启用前本页仅展示说明，不出账。
          </Typography.Text>
        </Card>
      </Col>

      <Col span={24}>
        <Card title="对账单（占位）">
          <Typography.Text type="secondary">
            周期对账单（FR-FIN-005，L2）后端未提供端点；财务域日结差异见管理后台「对账任务」页。
          </Typography.Text>
        </Card>
      </Col>

      <Col span={24}>
        <ProTable<InvoiceView>
          headerTitle="发票"
          rowKey="invoice_no"
          size="small"
          actionRef={actionRef}
          columns={invoiceColumns}
          search={false}
          request={async (params) => {
            const resp = await listInvoices("", { page: params.current ?? 1, size: params.pageSize ?? 20 });
            return { data: resp.list, total: resp.total, success: true };
          }}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        />
      </Col>
    </Row>
  );
}
