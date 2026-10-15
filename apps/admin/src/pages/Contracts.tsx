// Contracts.tsx · 合同质保（S5-04）：合同列表/详情（归档件版本 + 上传弹窗 step-up）/ 质保 / SLA / 索赔 / 延保。
// 约定：归档五要素（上传人/版本/关联/状态/受控下载）；平台不解析文件内容；step-up 由 BFF SensitivePrefixes 强制。
// 分页表走 ProTable（筛选 params 联动）；详情抽屉子表与业务弹窗保留 antd。

import { useRef, useState } from "react";
import {
  App, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { ClaimView, ContractView, SlaStrategyView, WarrantyView } from "@micro/shared/types";

const CONTRACT_STATUS: Record<string, { key: string; color: string }> = {
  DRAFT: { key: "ctr.stDraft", color: "default" },
  ACTIVE: { key: "ctr.stActive", color: "green" },
  ARCHIVED: { key: "ctr.stArchived", color: "purple" },
};

const WARRANTY_STATUS: Record<string, { key: string; color: string }> = {
  PENDING: { key: "ctr.stPending", color: "default" },
  ACTIVE: { key: "ctr.stWarranty", color: "green" },
  EXPIRED: { key: "ctr.stExpired", color: "default" },
  REFUNDED: { key: "ctr.stRefunded", color: "red" },
};

export default function ContractsPage(props: { defaultTab?: string }) {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "contracts"} items={[
      { key: "contracts", label: t("ctr.tabContracts"), children: <ContractsTab /> },
      { key: "warranties", label: t("ctr.tabWarranties"), children: <WarrantiesTab /> },
      { key: "sla", label: t("ctr.tabSla"), children: <SlaTab /> },
      { key: "claims", label: t("ctr.tabClaims"), children: <ClaimsTab /> },
      { key: "extensions", label: t("ctr.tabExtensions"), children: <ExtensionsTab /> },
    ]} />
  );
}

// ---- 合同 ----

function ContractsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<ContractView | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<ContractView>[] = [
    { title: t("ctr.contractNo"), dataIndex: "contract_no", search: false, render: (_, c) => <a onClick={() => setDetail(c)}>{c.contract_no}</a> },
    { title: t("parties.name"), dataIndex: "name", search: false },
    { title: t("order.type"), dataIndex: "type", search: false },
    { title: t("common.status"), dataIndex: "status", search: false, render: (_, c) => <Tag color={CONTRACT_STATUS[c.status]?.color}>{CONTRACT_STATUS[c.status] ? t(CONTRACT_STATUS[c.status].key) : c.status}</Tag> },
    { title: t("pay.amount"), dataIndex: "amount", search: false, render: (_, c) => `¥${c.amount}` },
    { title: t("ctr.archiveVer"), dataIndex: "files", search: false, render: (_, c) => (c.files?.length ? `v${Math.max(...c.files.map((x) => x.version))}` : "—") },
    { title: t("ctr.effectiveAt"), dataIndex: "effective_at", search: false, render: (_, c) => (c.effective_at ? new Date(c.effective_at).toLocaleString(getLocale()) : "—") },
  ];

  return (
    <>
      <ProTable<ContractView>
        headerTitle={t("ctr.tabContracts")}
        rowKey="contract_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        params={{ keyword }}
        request={async (params) => {
          const resp = await get<{ list: ContractView[]; total: number }>(
            `/contracts?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(keyword)}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder={t("ctr.searchPlaceholder")} />,
        ]}
      />

      <Drawer title={t("ctr.detailTitle", { no: detail?.contract_no ?? "" })} width={680} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t("common.status")}><Tag color={CONTRACT_STATUS[detail.status]?.color}>{CONTRACT_STATUS[detail.status] ? t(CONTRACT_STATUS[detail.status].key) : detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t("pay.amount")}>¥{detail.amount}</Descriptions.Item>
              <Descriptions.Item label={t("order.type")}>{detail.type}</Descriptions.Item>
              <Descriptions.Item label={t("ctr.effective")}>{detail.effective_at ? new Date(detail.effective_at).toLocaleString(getLocale()) : "—"}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>{t("ctr.filesTitle")}</Typography.Title>
            <Table rowKey="file_rec_id" size="small" pagination={false} columns={[
              { title: t("ctr.version"), dataIndex: "version", render: (v: number) => <Tag>v{v}</Tag> },
              { title: t("ctr.fileName"), dataIndex: "file_name" },
              { title: t("ctr.signParty"), dataIndex: "sign_party_name", render: (v: string) => v || "—" },
              { title: t("common.status"), dataIndex: "status", render: (v: string) => (
                <Tag color={v === "ACTIVE" ? "green" : "default"}>{v === "ACTIVE" ? t("ctr.currentVer") : t("ctr.replaced")}</Tag>) },
              { title: t("ctr.uploader"), dataIndex: "uploader_name", render: (v: string) => v || "—" },
              { title: t("ctr.uploadedAt"), dataIndex: "uploaded_at", render: (v: number) => new Date(v).toLocaleString(getLocale()) },
            ]} dataSource={detail.files ?? []} />
            <Space style={{ marginTop: 16 }}>
              <Perm code="contract:contract:archive">
                <Button type="primary" icon={<UploadOutlined />} onClick={() => { form.resetFields(); setUploadOpen(true); }}>
                  {t("ctr.upload")}
                </Button>
                {detail.status === "DRAFT" && (
                  <Button onClick={async () => {
                    await post(`/contracts/${detail.contract_no}/archive`, { action: "EFFECTIVE" });
                    message.success(t("ctr.effectiveDone"));
                    setDetail(null);
                    actionRef.current?.reload();
                  }}>{t("ctr.makeEffective")}</Button>
                )}
                {detail.status === "ACTIVE" && (
                  <Button onClick={async () => {
                    await post(`/contracts/${detail.contract_no}/archive`, { action: "ARCHIVE" });
                    message.success(t("ctr.archived"));
                    setDetail(null);
                    actionRef.current?.reload();
                  }}>{t("ctr.archive")}</Button>
                )}
                <Button onClick={() => setBindOpen(true)}>{t("ctr.bindSla")}</Button>
              </Perm>
            </Space>
          </>
        )}
      </Drawer>

      <Modal title={t("ctr.uploadTitle")} open={uploadOpen} destroyOnClose okText={t("common.confirm")} cancelText={t("common.cancel")}
        onCancel={() => setUploadOpen(false)} onOk={async () => {
          const v = await form.validateFields();
          const r = await post<{ version: number }>(`/contracts/${detail?.contract_no}/files`, v);
          message.success(t("ctr.uploaded", { version: r.version }));
          setUploadOpen(false);
          setDetail(null);
          actionRef.current?.reload();
        }}>
        <Form form={form} layout="vertical">
          <Form.Item name="file_id" label={t("ctr.fileId")} rules={[{ required: true, message: t("common.required") }]}>
            <Input placeholder={t("ctr.fileIdPlaceholder")} />
          </Form.Item>
          <Form.Item name="file_name" label={t("ctr.fileName")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="sign_party_name" label={t("ctr.signPartyName")}><Input /></Form.Item>
          <Form.Item name="sign_party_type" label={t("ctr.signPartyType")} initialValue="BUYER">
            <Select options={["BUYER", "SELLER", "OTHER"].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t("ctr.bindTitle")} open={bindOpen} destroyOnClose onCancel={() => setBindOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        const v = await form.validateFields();
        await post(`/contracts/${detail?.contract_no}/sla`, v);
        message.success(t("ctr.bound"));
        setBindOpen(false);
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="strategy_id" label={t("ctr.strategyId")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 质保 ----

function WarrantiesTab() {
  const { t } = usePrefs();
  const [status, setStatus] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<WarrantyView>[] = [
    { title: t("ctr.warrantyNo"), dataIndex: "warranty_no" },
    { title: t("ctr.level"), dataIndex: "level", render: (_, r) => <Tag color={r.level === "STATION" ? "purple" : "cyan"}>{r.level}</Tag> },
    { title: t("ctr.target"), dataIndex: "target_key" },
    { title: t("common.status"), dataIndex: "status", render: (_, r) => <Tag color={WARRANTY_STATUS[r.status]?.color}>{WARRANTY_STATUS[r.status] ? t(WARRANTY_STATUS[r.status].key) : r.status}</Tag> },
    { title: t("ctr.startAt"), dataIndex: "start_at", render: (_, r) => (r.start_at ? new Date(r.start_at).toLocaleDateString(getLocale()) : t("ctr.notStarted")) },
    { title: t("ctr.endAt"), dataIndex: "end_at", render: (_, r) => (r.end_at ? new Date(r.end_at).toLocaleDateString(getLocale()) : "—") },
    { title: t("ctr.months"), dataIndex: "months" },
    { title: t("ctr.sourceNo"), dataIndex: "source_no", render: (_, r) => r.source_no || "—" },
  ];

  return (
    <ProTable<WarrantyView>
      headerTitle={t("ctr.tabWarranties")}
      rowKey="warranty_no"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ status }}
      request={async (params) => {
        const resp = await get<{ list: WarrantyView[]; total: number }>(
          `/warranties?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&status=${status}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={{ defaultPageSize: 10, showSizeChanger: true }}
      toolBarRender={() => [
        <Select key="status" value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
          options={Object.entries(WARRANTY_STATUS).map(([k, m]) => ({ value: k, label: t(m.key) }))} />,
      ]}
    />
  );
}

// ---- SLA ----

function SlaTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<SlaStrategyView>[] = [
    { title: t("ctr.code"), dataIndex: "code" },
    { title: t("parties.name"), dataIndex: "name" },
    { title: t("ctr.grade"), dataIndex: "level", render: (_, r) => <Tag color={r.level === "P1" ? "red" : r.level === "P2" ? "orange" : "blue"}>{r.level}</Tag> },
    { title: t("ctr.responseMinutes"), dataIndex: "response_minutes" },
    { title: t("ctr.resolveMinutes"), dataIndex: "resolve_minutes" },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("ctr.slaHint")}
      </Typography.Text>
      <ProTable<SlaStrategyView>
        headerTitle={t("ctr.tabSla")}
        rowKey="strategy_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        options={false}
        request={async () => {
          const r = await get<{ list: SlaStrategyView[]; total: number }>("/sla-strategies");
          return { data: r.list, total: r.total, success: true };
        }}
        pagination={false}
        toolBarRender={() => [
          <Perm key="create" code="contract:sla:create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>{t("ctr.createSla")}</Button>
          </Perm>,
        ]}
      />
      <Modal title={t("ctr.slaTitle")} open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        const v = await form.validateFields();
        await post("/sla-strategies", v);
        message.success(t("ctr.slaCreated"));
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label={t("ctr.code")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="name" label={t("parties.name")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="level" label={t("ctr.grade")} rules={[{ required: true, message: t("common.required") }]}>
            <Select options={["P1", "P2", "P3"].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="response_minutes" label={t("ctr.responseMinutesInput")} rules={[{ required: true, message: t("common.required") }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="resolve_minutes" label={t("ctr.resolveMinutesInput")} rules={[{ required: true, message: t("common.required") }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 索赔 ----

function ClaimsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<ClaimView>[] = [
    { title: t("ctr.claimNo"), dataIndex: "claim_no" },
    { title: t("ctr.warrantyNo"), dataIndex: "warranty_no" },
    { title: t("order.type"), dataIndex: "type" },
    {
      title: t("common.status"),
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : r.status === "SETTLED" ? "purple" : "processing"}>{r.status}</Tag>
      ),
    },
    { title: t("ctr.settleType"), dataIndex: "settle_type", render: (_, r) => r.settle_type || "—" },
    { title: t("pay.amount"), dataIndex: "amount", render: (_, r) => (r.amount ? `¥${r.amount}` : "—") },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (
        <Space>
          {r.status === "APPLYING" && (
            <Perm code="contract:claim:approve">
              <Button size="small" type="primary" onClick={async () => {
                await post(`/claims/${r.claim_no}/approve`, { approve: true });
                message.success(t("ctr.approved"));
                actionRef.current?.reload();
              }}>{t("ctr.approve")}</Button>
            </Perm>
          )}
          {r.status === "APPROVED" && (
            <Perm code="contract:claim:settle">
              <Button size="small" onClick={async () => {
                await post(`/claims/${r.claim_no}/settle`, { settle_type: "REPAIR" });
                message.success(t("ctr.settled"));
                actionRef.current?.reload();
              }}>{t("ctr.settleRepair")}</Button>
            </Perm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<ClaimView>
        headerTitle={t("ctr.tabClaims")}
        rowKey="claim_no"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: ClaimView[]; total: number }>(
            `/claims?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        toolBarRender={() => [
          <Perm key="create" code="contract:claim:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t("ctr.claimApply")}</Button>
          </Perm>,
        ]}
      />
      <Modal title={t("ctr.claimApply")} open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        const v = await form.validateFields();
        await post("/claims", v);
        message.success(t("ctr.claimAccepted"));
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="warranty_id" label={t("ctr.warrantyId")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="type" label={t("order.type")} rules={[{ required: true, message: t("common.required") }]}>
            <Select options={["QUALITY", "TRANSPORT", "INSTALL"].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="description" label={t("ctr.description")}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 延保 ----

function ExtensionsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [sellOpen, setSellOpen] = useState(false);
  const [form] = Form.useForm();
  return (
    <>
      <Typography.Paragraph type="secondary">
        {t("ctr.extHint")}
      </Typography.Paragraph>
      <Perm code="contract:extension:sell">
        <Button type="primary" onClick={() => setSellOpen(true)}>{t("ctr.sellExt")}</Button>
      </Perm>
      <Modal title={t("ctr.sellExt")} open={sellOpen} destroyOnClose onCancel={() => setSellOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        const v = await form.validateFields();
        const r = await post<{ extension_no: string }>("/warranty-extensions", v);
        message.success(t("ctr.extCreated", { no: r.extension_no }));
        form.resetFields();
        setSellOpen(false);
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="base_warranty_id" label={t("ctr.baseWarrantyId")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="months" label={t("ctr.extMonths")} rules={[{ required: true, message: t("common.required") }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="amount" label={t("ctr.saleAmount")}><Input placeholder="199.00" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
