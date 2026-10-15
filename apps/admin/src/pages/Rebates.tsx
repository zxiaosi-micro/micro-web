// Rebates.tsx · 经销商返利（S10-03）：月度结算（规则快照可追溯）+ 结算单列表（确认/打款）+ 月度对账。
// 规则源 party.dealer_ext.rebate_rule（{"rate":0.03,"settle":"MONTHLY"}）；结算快照可展开追溯；对账差异为 0 验收。
// 列表走 ProTable（筛选参数 params 联动）；月度结算/对账为交互结果 Modal，保留 antd Modal。

import { useRef, useState } from "react";
import {
  App, Button, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography,
} from "antd";
import { AuditOutlined, PayCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { RebateDiffItem, RebateSettlementItem, RebateRunResp } from "@micro/shared/types";

const STATUS_META: Record<string, { key: string; color: string }> = {
  PENDING: { key: "reb.stPending", color: "orange" },
  CONFIRMED: { key: "reb.stConfirmed", color: "blue" },
  PAID: { key: "reb.stPaid", color: "green" },
};

export default function RebatesPage() {
  return <RebatesTab />;
}

function RebatesTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [partyId, setPartyId] = useState("");
  const [runOpen, setRunOpen] = useState(false);
  const [runPeriod, setRunPeriod] = useState("");
  const [runResult, setRunResult] = useState<RebateRunResp | null>(null);
  const [running, setRunning] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);
  const [reconPeriod, setReconPeriod] = useState("");
  const [reconDiffs, setReconDiffs] = useState<RebateDiffItem[]>([]);
  const [reconCount, setReconCount] = useState(0);
  const [reconRunning, setReconRunning] = useState(false);
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<RebateSettlementItem>[] = [
    { title: t("reb.period"), dataIndex: "period" },
    { title: t("reb.dealer"), dataIndex: "party_id" },
    { title: t("reb.amount"), dataIndex: "amount", render: (_, r) => `¥${r.amount}` },
    { title: t("common.status"), dataIndex: "status", render: (_, r) => <Tag color={STATUS_META[r.status]?.color}>{STATUS_META[r.status] ? t(STATUS_META[r.status].key) : r.status}</Tag> },
    {
      title: t("reb.ruleSnapshot"),
      dataIndex: "rule_snapshot",
      render: (_, r) => (r.rule_snapshot
        ? <Typography.Paragraph style={{ maxWidth: 320, marginBottom: 0 }} ellipsis={{ tooltip: r.rule_snapshot }} code>{r.rule_snapshot}</Typography.Paragraph>
        : "—"),
    },
    { title: t("inv.createdAt"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (
        <Space>
          {r.status === "PENDING" && (
            <Perm code="finance:rebate:confirm">
              <Popconfirm title={t("reb.confirmLockHint")} okText={t("common.confirm")} cancelText={t("common.cancel")} onConfirm={async () => {
                await post(`/rebate-settlements/${r.settlement_id}/confirm`, { action: "CONFIRM" });
                message.success(t("reb.confirmed"));
                actionRef.current?.reload();
              }}><Button size="small" type="primary">{t("reb.confirm")}</Button></Popconfirm>
            </Perm>
          )}
          {r.status === "CONFIRMED" && (
            <Perm code="finance:rebate:confirm">
              <Popconfirm title={t("reb.paidHint")} okText={t("common.confirm")} cancelText={t("common.cancel")} onConfirm={async () => {
                await post(`/rebate-settlements/${r.settlement_id}/confirm`, { action: "PAID" });
                message.success(t("reb.paid"));
                actionRef.current?.reload();
              }}><Button size="small" icon={<PayCircleOutlined />}>{t("reb.pay")}</Button></Popconfirm>
            </Perm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<RebateSettlementItem>
        headerTitle={t("reb.title")}
        rowKey="settlement_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        params={{ period, status, partyId }}
        request={async (params) => {
          const resp = await get<{ list: RebateSettlementItem[]; total: number }>(
            `/rebate-settlements?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&period=${period}&status=${status}&party_id=${partyId}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Input key="period" style={{ width: 140 }} placeholder={t("reb.periodPlaceholder")} value={period}
            onChange={(e) => setPeriod(e.target.value)} allowClear />,
          <Select key="status" style={{ width: 120 }} value={status || "all"} onChange={(v) => setStatus(v === "all" ? "" : v)}
            options={[{ value: "all", label: t("ret.allStatus") }, ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: t(m.key) }))]} />,
          <Input key="party" style={{ width: 160 }} placeholder={t("reb.partyPlaceholder")} value={partyId}
            onChange={(e) => setPartyId(e.target.value)} allowClear />,
          <Perm key="run" code="finance:rebate:settle">
            <Button type="primary" icon={<ThunderboltOutlined />}
              onClick={() => { setRunResult(null); setRunPeriod(period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`); setRunOpen(true); }}>
              {t("reb.monthlySettle")}
            </Button>
          </Perm>,
          <Perm key="recon" code="finance:rebate:list">
            <Button icon={<AuditOutlined />}
              onClick={() => { setReconPeriod(period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`); setReconDiffs([]); setReconCount(0); setReconOpen(true); }}>
              {t("reb.monthlyRecon")}
            </Button>
          </Perm>,
        ]}
      />

      {/* 月度结算 */}
      <Modal title={t("reb.settleTitle")} open={runOpen} destroyOnClose okText={t("reb.executeSettle")} cancelText={t("common.cancel")} confirmLoading={running} onCancel={() => setRunOpen(false)}
        onOk={async () => {
          if (!/^\d{4}-\d{2}$/.test(runPeriod)) {
            message.warning(t("reb.periodInvalid"));
            return;
          }
          setRunning(true);
          try {
            const r = await post<RebateRunResp>("/rebate-settlements/run", { period: runPeriod });
            setRunResult(r);
            message.success(t("reb.settleDone", { count: r.results.length }));
            actionRef.current?.reload();
          } finally {
            setRunning(false);
          }
        }}>
        <Typography.Paragraph type="secondary">
          {t("reb.settleHint")}
        </Typography.Paragraph>
        <Input value={runPeriod} onChange={(e) => setRunPeriod(e.target.value)} placeholder={t("reb.periodPlaceholder")} style={{ width: 160 }} />
        {runResult && (
          <Table style={{ marginTop: 16 }} size="small" rowKey="party_id" pagination={false}
            columns={[
              { title: t("reb.dealer"), dataIndex: "party_id" },
              { title: t("reb.baseAmount"), dataIndex: "base_amount", render: (v: string) => `¥${v}` },
              { title: t("reb.rate"), dataIndex: "rate" },
              { title: t("reb.amount"), dataIndex: "amount", render: (v: string) => `¥${v}` },
              { title: t("reb.paymentCount"), dataIndex: "payment_count" },
            ]}
            dataSource={runResult.results} />
        )}
      </Modal>

      {/* 月度对账 */}
      <Modal title={t("reb.reconTitle")} open={reconOpen} destroyOnClose onCancel={() => setReconOpen(false)} footer={null}>
        <Space style={{ marginBottom: 16 }}>
          <Input style={{ width: 140 }} value={reconPeriod} onChange={(e) => setReconPeriod(e.target.value)} placeholder={t("reb.periodPlaceholder")} />
          <Button type="primary" loading={reconRunning} icon={<AuditOutlined />} onClick={async () => {
            if (!/^\d{4}-\d{2}$/.test(reconPeriod)) {
              message.warning(t("reb.periodInvalid"));
              return;
            }
            setReconRunning(true);
            try {
              const r = await post<{ diff_count: number; diffs: RebateDiffItem[] }>("/rebate-settlements/reconcile", { period: reconPeriod });
              setReconDiffs(r.diffs);
              setReconCount(r.diff_count);
              message.success(r.diff_count === 0 ? t("reb.reconClean") : t("reb.reconDiff", { count: r.diff_count }));
            } finally {
              setReconRunning(false);
            }
          }}>{t("reb.executeRecon")}</Button>
        </Space>
        {reconDiffs.length > 0 ? (
          <Table size="small" rowKey="settlement_id" pagination={false}
            columns={[
              { title: t("reb.settlementCol"), dataIndex: "settlement_id" },
              { title: t("reb.dealer"), dataIndex: "party_id" },
              { title: t("reb.storedAmount"), dataIndex: "stored_amount", render: (v: string) => `¥${v}` },
              { title: t("reb.recomputed"), dataIndex: "recomputed_amount", render: (v: string) => (v ? `¥${v}` : "—") },
            ]}
            dataSource={reconDiffs} />
        ) : (
          reconCount === 0 && <Typography.Text type="secondary">{t("reb.reconEmpty")}</Typography.Text>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {t("reb.reconHint")}
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
