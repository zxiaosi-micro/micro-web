// Rebates.tsx · 经销商返利（S10-03）：月度结算（规则快照可追溯）+ 结算单列表（确认/打款）+ 月度对账。
// 规则源 party.dealer_ext.rebate_rule（{"rate":0.03,"settle":"MONTHLY"}）；结算快照可展开追溯；对账差异为 0 验收。

import { useState } from "react";
import {
  App, Button, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography,
} from "antd";
import { AuditOutlined, PayCircleOutlined, ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
import type { RebateDiffItem, RebateSettlementItem, RebateRunResp } from "@micro/shared/types";

const STATUS_META: Record<string, { text: string; color: string }> = {
  PENDING: { text: "待确认", color: "orange" },
  CONFIRMED: { text: "已确认", color: "blue" },
  PAID: { text: "已打款", color: "green" },
};

export default function RebatesPage() {
  return <RebatesTab />;
}

function RebatesTab() {
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

  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<RebateSettlementItem>(
    (p) => get<{ list: RebateSettlementItem[]; total: number }>(
      `/rebate-settlements?page=${p.page}&size=${p.size}&period=${period}&status=${status}&party_id=${partyId}`),
  );

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input style={{ width: 140 }} placeholder="周期 yyyy-MM" value={period}
          onChange={(e) => { setPeriod(e.target.value); setPage(1); }} allowClear />
        <Select style={{ width: 120 }} value={status || "all"} onChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}
          options={[{ value: "all", label: "全部状态" }, ...Object.entries(STATUS_META).map(([k, t]) => ({ value: k, label: t.text }))]} />
        <Input style={{ width: 160 }} placeholder="经销商 party ID" value={partyId}
          onChange={(e) => { setPartyId(e.target.value); setPage(1); }} allowClear />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Perm code="finance:rebate:settle">
          <Button type="primary" icon={<ThunderboltOutlined />}
            onClick={() => { setRunResult(null); setRunPeriod(period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`); setRunOpen(true); }}>
            月度结算
          </Button>
        </Perm>
        <Perm code="finance:rebate:list">
          <Button icon={<AuditOutlined />}
            onClick={() => { setReconPeriod(period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`); setReconDiffs([]); setReconCount(0); setReconOpen(true); }}>
            月度对账
          </Button>
        </Perm>
      </Space>
      <Table rowKey="settlement_id" columns={[
        { title: "结算周期", dataIndex: "period" },
        { title: "经销商", dataIndex: "party_id" },
        { title: "返利金额", dataIndex: "amount", render: (v: string) => `¥${v}` },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.text ?? v}</Tag> },
        {
          title: "规则快照", dataIndex: "rule_snapshot",
          render: (v: string) => (v
            ? <Typography.Paragraph style={{ maxWidth: 320, marginBottom: 0 }} ellipsis={{ tooltip: v }} code>{v}</Typography.Paragraph>
            : "—"),
        },
        { title: "创建时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString() },
        {
          title: "操作", render: (_: unknown, r: RebateSettlementItem) => (
            <Space>
              {r.status === "PENDING" && (
                <Perm code="finance:rebate:confirm">
                  <Popconfirm title="确认后金额锁定（规则快照不可再被结算覆盖），继续？" onConfirm={async () => {
                    await post(`/rebate-settlements/${r.settlement_id}/confirm`, { action: "CONFIRM" });
                    message.success("已确认（PENDING→CONFIRMED）"); refresh();
                  }}><Button size="small" type="primary">确认</Button></Popconfirm>
                </Perm>
              )}
              {r.status === "CONFIRMED" && (
                <Perm code="finance:rebate:confirm">
                  <Popconfirm title="标记已打款？" onConfirm={async () => {
                    await post(`/rebate-settlements/${r.settlement_id}/confirm`, { action: "PAID" });
                    message.success("已打款（CONFIRMED→PAID）"); refresh();
                  }}><Button size="small" icon={<PayCircleOutlined />}>打款</Button></Popconfirm>
                </Perm>
              )}
            </Space>
          ),
        },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />

      {/* 月度结算 */}
      <Modal title="经销商返利月度结算" open={runOpen} destroyOnClose onCancel={() => setRunOpen(false)}
        onOk={async () => {
          if (!/^\d{4}-\d{2}$/.test(runPeriod)) {
            message.warning("周期格式 yyyy-MM");
            return;
          }
          setRunning(true);
          try {
            const r = await post<RebateRunResp>("/rebate-settlements/run", { period: runPeriod });
            setRunResult(r);
            message.success(`结算完成：${r.results.length} 家经销商出单（PENDING 待确认）`);
            refresh();
          } finally {
            setRunning(false);
          }
        }} okText="执行结算" confirmLoading={running}>
        <Typography.Paragraph type="secondary">
          按经销商 dealer_ext.rebate_rule 规则快照计提（基数 = 周期内实付总额 × 费率，四舍五入到分）；
          QUARTER 规则仅季末月出单；已确认/已打款的结算单金额锁定不被覆盖。
        </Typography.Paragraph>
        <Input value={runPeriod} onChange={(e) => setRunPeriod(e.target.value)} placeholder="yyyy-MM" style={{ width: 160 }} />
        {runResult && (
          <Table style={{ marginTop: 16 }} size="small" rowKey="party_id" pagination={false}
            columns={[
              { title: "经销商", dataIndex: "party_id" },
              { title: "计提基数", dataIndex: "base_amount", render: (v: string) => `¥${v}` },
              { title: "费率", dataIndex: "rate" },
              { title: "返利金额", dataIndex: "amount", render: (v: string) => `¥${v}` },
              { title: "支付单数", dataIndex: "payment_count" },
            ]}
            dataSource={runResult.results} />
        )}
      </Modal>

      {/* 月度对账 */}
      <Modal title="返利月度对账" open={reconOpen} destroyOnClose onCancel={() => setReconOpen(false)} footer={null}>
        <Space style={{ marginBottom: 16 }}>
          <Input style={{ width: 140 }} value={reconPeriod} onChange={(e) => setReconPeriod(e.target.value)} placeholder="yyyy-MM" />
          <Button type="primary" loading={reconRunning} icon={<AuditOutlined />} onClick={async () => {
            if (!/^\d{4}-\d{2}$/.test(reconPeriod)) {
              message.warning("周期格式 yyyy-MM");
              return;
            }
            setReconRunning(true);
            try {
              const r = await post<{ diff_count: number; diffs: RebateDiffItem[] }>("/rebate-settlements/reconcile", { period: reconPeriod });
              setReconDiffs(r.diffs);
              setReconCount(r.diff_count);
              message.success(r.diff_count === 0 ? "对账差异为 0 ✓" : `发现 ${r.diff_count} 笔差异`);
            } finally {
              setReconRunning(false);
            }
          }}>执行对账</Button>
        </Space>
        {reconDiffs.length > 0 ? (
          <Table size="small" rowKey="settlement_id" pagination={false}
            columns={[
              { title: "结算单", dataIndex: "settlement_id" },
              { title: "经销商", dataIndex: "party_id" },
              { title: "存储金额", dataIndex: "stored_amount", render: (v: string) => `¥${v}` },
              { title: "重算金额", dataIndex: "recomputed_amount", render: (v: string) => (v ? `¥${v}` : "—") },
            ]}
            dataSource={reconDiffs} />
        ) : (
          reconCount === 0 && <Typography.Text type="secondary">执行后展示结果（差异为 0 即验收通过）。</Typography.Text>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          对账口径：存储金额 =（快照基数 × 快照费率）重算 且 当前基数 = 快照基数；不一致计入差异（如退款导致基数变化）。
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
