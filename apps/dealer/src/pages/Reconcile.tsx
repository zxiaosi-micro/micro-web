// Reconcile.tsx · 对账（S9-04）：本方档案（续签提醒占位）+ 发票列表 + 对账单/返利占位（L2/L3）。
// 发票走 ProTable request；顶部档案卡响应式栅格（手机单列）。

import { useRef } from "react";
import { Card, Col, Row, Tag, Typography } from "antd";
import { usePolling } from "@micro/shared";
import { usePrefs } from "@micro/shared/prefs";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { InvoiceView, PartyItem } from "@micro/shared/types";
import { fetchSelfDealer, listInvoices } from "../api";

const INVOICE_STATUS_COLOR: Record<string, string> = {
  ISSUED: "green",
  REVERSED: "red",
};

export default function ReconcilePage() {
  const { t } = usePrefs();
  // 本方经销商档案（续签提醒=dealer_ext 展示；信用/授权区域到期后端未提供——占位）
  const self = usePolling(fetchSelfDealer, { intervalMs: 30_000 });
  const actionRef = useRef<ActionType | undefined>(undefined);

  const party: PartyItem | null = self.data?.party ?? null;
  const ext = self.data?.ext ?? null;

  const invoiceColumns: ProColumns<InvoiceView>[] = [
    { title: t("rc.invoiceNo"), dataIndex: "invoice_no" },
    { title: t("rc.relOrder"), dataIndex: "order_no" },
    { title: t("rc.title"), dataIndex: "title", ellipsis: true },
    { title: t("rc.amount"), dataIndex: "amount", render: (_, r) => `¥${r.amount}` },
    {
      title: t("common.status"),
      dataIndex: "status",
      render: (_, r) => <Tag color={INVOICE_STATUS_COLOR[r.status] ?? "default"}>{r.status}</Tag>,
    },
    {
      title: t("rc.issuedAt"),
      dataIndex: "issued_at",
      render: (_, r) => (r.issued_at ? new Date(r.issued_at).toLocaleString() : "—"),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title={t("rc.selfTitle")}>
          {self.loading && !party && <Typography.Text type="secondary">{t("rc.loading")}</Typography.Text>}
          {party && (
            <>
              <Typography.Paragraph>
                {party.name}（{party.credit_code || t("rc.noCreditCode")}）
              </Typography.Paragraph>
              {ext ? (
                <Typography.Paragraph>
                  {t("rc.levelLine", { level: ext.dealer_level || "—", region: ext.authorized_region || "—" })}
                </Typography.Paragraph>
              ) : (
                <Typography.Text type="warning">{t("rc.noExt")}</Typography.Text>
              )}
              <Typography.Paragraph type="secondary">
                {t("rc.renewHint")}
              </Typography.Paragraph>
            </>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title={t("rc.rebateTitle")}>
          <Typography.Text type="secondary">
            {t("rc.rebateHint")}
          </Typography.Text>
        </Card>
      </Col>

      <Col span={24}>
        <Card title={t("rc.reconTitle")}>
          <Typography.Text type="secondary">
            {t("rc.reconHint")}
          </Typography.Text>
        </Card>
      </Col>

      <Col span={24}>
        <ProTable<InvoiceView>
          headerTitle={t("rc.invoice")}
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
