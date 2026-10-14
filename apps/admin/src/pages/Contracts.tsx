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
import type { ClaimView, ContractView, SlaStrategyView, WarrantyView } from "@micro/shared/types";

const CONTRACT_STATUS: Record<string, { text: string; color: string }> = {
  DRAFT: { text: "草稿", color: "default" },
  ACTIVE: { text: "生效中", color: "green" },
  ARCHIVED: { text: "已归档", color: "purple" },
};

const WARRANTY_STATUS: Record<string, { text: string; color: string }> = {
  PENDING: { text: "待起算", color: "default" },
  ACTIVE: { text: "质保中", color: "green" },
  EXPIRED: { text: "已到期", color: "default" },
  REFUNDED: { text: "已退款", color: "red" },
};

export default function ContractsPage(props: { defaultTab?: string }) {
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "contracts"} items={[
      { key: "contracts", label: "合同", children: <ContractsTab /> },
      { key: "warranties", label: "质保", children: <WarrantiesTab /> },
      { key: "sla", label: "SLA 策略", children: <SlaTab /> },
      { key: "claims", label: "索赔", children: <ClaimsTab /> },
      { key: "extensions", label: "延保", children: <ExtensionsTab /> },
    ]} />
  );
}

// ---- 合同 ----

function ContractsTab() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<ContractView | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<ContractView>[] = [
    { title: "合同号", dataIndex: "contract_no", search: false, render: (_, c) => <a onClick={() => setDetail(c)}>{c.contract_no}</a> },
    { title: "名称", dataIndex: "name", search: false },
    { title: "类型", dataIndex: "type", search: false },
    { title: "状态", dataIndex: "status", search: false, render: (_, c) => <Tag color={CONTRACT_STATUS[c.status]?.color}>{CONTRACT_STATUS[c.status]?.text ?? c.status}</Tag> },
    { title: "金额", dataIndex: "amount", search: false, render: (_, c) => `¥${c.amount}` },
    { title: "归档件", dataIndex: "files", search: false, render: (_, c) => (c.files?.length ? `v${Math.max(...c.files.map((x) => x.version))}` : "—") },
    { title: "生效时间", dataIndex: "effective_at", search: false, render: (_, c) => (c.effective_at ? new Date(c.effective_at).toLocaleString() : "—") },
  ];

  return (
    <>
      <ProTable<ContractView>
        headerTitle="合同"
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
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder="合同号/名称" />,
        ]}
      />

      <Drawer title={`合同 ${detail?.contract_no ?? ""}`} width={680} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="状态"><Tag color={CONTRACT_STATUS[detail.status]?.color}>{CONTRACT_STATUS[detail.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="金额">¥{detail.amount}</Descriptions.Item>
              <Descriptions.Item label="类型">{detail.type}</Descriptions.Item>
              <Descriptions.Item label="生效">{detail.effective_at ? new Date(detail.effective_at).toLocaleString() : "—"}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>归档件版本（受控下载）</Typography.Title>
            <Table rowKey="file_rec_id" size="small" pagination={false} columns={[
              { title: "版本", dataIndex: "version", render: (v: number) => <Tag>v{v}</Tag> },
              { title: "文件名", dataIndex: "file_name" },
              { title: "签署方", dataIndex: "sign_party_name", render: (v: string) => v || "—" },
              { title: "状态", dataIndex: "status", render: (v: string) => (
                <Tag color={v === "ACTIVE" ? "green" : "default"}>{v === "ACTIVE" ? "当前版" : "已替换"}</Tag>) },
              { title: "上传人", dataIndex: "uploader_name", render: (v: string) => v || "—" },
              { title: "上传时间", dataIndex: "uploaded_at", render: (v: number) => new Date(v).toLocaleString() },
            ]} dataSource={detail.files ?? []} />
            <Space style={{ marginTop: 16 }}>
              <Perm code="contract:contract:archive">
                <Button type="primary" icon={<UploadOutlined />} onClick={() => { form.resetFields(); setUploadOpen(true); }}>
                  上传归档件（step-up）
                </Button>
                {detail.status === "DRAFT" && (
                  <Button onClick={async () => {
                    await post(`/contracts/${detail.contract_no}/archive`, { action: "EFFECTIVE" });
                    message.success("合同已生效");
                    setDetail(null);
                    actionRef.current?.reload();
                  }}>生效</Button>
                )}
                {detail.status === "ACTIVE" && (
                  <Button onClick={async () => {
                    await post(`/contracts/${detail.contract_no}/archive`, { action: "ARCHIVE" });
                    message.success("合同已归档");
                    setDetail(null);
                    actionRef.current?.reload();
                  }}>归档</Button>
                )}
                <Button onClick={() => setBindOpen(true)}>绑定 SLA</Button>
              </Perm>
            </Space>
          </>
        )}
      </Drawer>

      <Modal title="上传归档件（线下签署后上传；平台不解析内容）" open={uploadOpen} destroyOnClose
        onCancel={() => setUploadOpen(false)} onOk={async () => {
          const v = await form.validateFields();
          const r = await post<{ version: number }>(`/contracts/${detail?.contract_no}/files`, v);
          message.success(`归档件 v${r.version} 已登记`);
          setUploadOpen(false);
          setDetail(null);
          actionRef.current?.reload();
        }}>
        <Form form={form} layout="vertical">
          <Form.Item name="file_id" label="file 服务对象 ID（已上传合同桶）" rules={[{ required: true }]}>
            <Input placeholder="先经文件服务上传，粘贴 file_id" />
          </Form.Item>
          <Form.Item name="file_name" label="文件名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sign_party_name" label="签署方名称"><Input /></Form.Item>
          <Form.Item name="sign_party_type" label="签署方类型" initialValue="BUYER">
            <Select options={["BUYER", "SELLER", "OTHER"].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`合同绑定 SLA（快照冻结）`} open={bindOpen} destroyOnClose onCancel={() => setBindOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        await post(`/contracts/${detail?.contract_no}/sla`, v);
        message.success("已绑定（ops 按快照计时）");
        setBindOpen(false);
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="strategy_id" label="策略 ID" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 质保 ----

function WarrantiesTab() {
  const [status, setStatus] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<WarrantyView>[] = [
    { title: "质保号", dataIndex: "warranty_no" },
    { title: "层级", dataIndex: "level", render: (_, r) => <Tag color={r.level === "STATION" ? "purple" : "cyan"}>{r.level}</Tag> },
    { title: "对象", dataIndex: "target_key" },
    { title: "状态", dataIndex: "status", render: (_, r) => <Tag color={WARRANTY_STATUS[r.status]?.color}>{WARRANTY_STATUS[r.status]?.text ?? r.status}</Tag> },
    { title: "起算", dataIndex: "start_at", render: (_, r) => (r.start_at ? new Date(r.start_at).toLocaleDateString() : "未起算") },
    { title: "到期", dataIndex: "end_at", render: (_, r) => (r.end_at ? new Date(r.end_at).toLocaleDateString() : "—") },
    { title: "月数", dataIndex: "months" },
    { title: "来源", dataIndex: "source_no", render: (_, r) => r.source_no || "—" },
  ];

  return (
    <ProTable<WarrantyView>
      headerTitle="质保"
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
          options={Object.entries(WARRANTY_STATUS).map(([k, t]) => ({ value: k, label: t.text }))} />,
      ]}
    />
  );
}

// ---- SLA ----

function SlaTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<SlaStrategyView>[] = [
    { title: "编码", dataIndex: "code" },
    { title: "名称", dataIndex: "name" },
    { title: "分级", dataIndex: "level", render: (_, r) => <Tag color={r.level === "P1" ? "red" : r.level === "P2" ? "orange" : "blue"}>{r.level}</Tag> },
    { title: "响应时限(分)", dataIndex: "response_minutes" },
    { title: "解决时限(分)", dataIndex: "resolve_minutes" },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        策略在合同域定义，计时由 ops 执行（绑定即快照冻结，FR-CTR-007）。
      </Typography.Text>
      <ProTable<SlaStrategyView>
        headerTitle="SLA 策略"
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
            <Button type="primary" onClick={() => setCreateOpen(true)}>新建策略</Button>
          </Perm>,
        ]}
      />
      <Modal title="新建 SLA 策略" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        await post("/sla-strategies", v);
        message.success("策略已建");
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="level" label="分级" rules={[{ required: true }]}>
            <Select options={["P1", "P2", "P3"].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="response_minutes" label="响应时限(分钟)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="resolve_minutes" label="解决时限(分钟)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 索赔 ----

function ClaimsTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<ClaimView>[] = [
    { title: "索赔号", dataIndex: "claim_no" },
    { title: "质保号", dataIndex: "warranty_no" },
    { title: "类型", dataIndex: "type" },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : r.status === "SETTLED" ? "purple" : "processing"}>{r.status}</Tag>
      ),
    },
    { title: "结算方式", dataIndex: "settle_type", render: (_, r) => r.settle_type || "—" },
    { title: "金额", dataIndex: "amount", render: (_, r) => (r.amount ? `¥${r.amount}` : "—") },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => (
        <Space>
          {r.status === "APPLYING" && (
            <Perm code="contract:claim:approve">
              <Button size="small" type="primary" onClick={async () => {
                await post(`/claims/${r.claim_no}/approve`, { approve: true });
                message.success("已批准");
                actionRef.current?.reload();
              }}>批准</Button>
            </Perm>
          )}
          {r.status === "APPROVED" && (
            <Perm code="contract:claim:settle">
              <Button size="small" onClick={async () => {
                await post(`/claims/${r.claim_no}/settle`, { settle_type: "REPAIR" });
                message.success("已结算");
                actionRef.current?.reload();
              }}>结算（维修）</Button>
            </Perm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<ClaimView>
        headerTitle="索赔"
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>索赔申请</Button>
          </Perm>,
        ]}
      />
      <Modal title="索赔申请" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        await post("/claims", v);
        message.success("索赔已受理");
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="warranty_id" label="质保 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={["QUALITY", "TRANSPORT", "INSTALL"].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 延保 ----

function ExtensionsTab() {
  const { message } = App.useApp();
  const [sellOpen, setSellOpen] = useState(false);
  const [form] = Form.useForm();
  return (
    <>
      <Typography.Paragraph type="secondary">
        延保衔接原质保（无缝衔接，FR-CTR-006）；支持转移（换设备/场站）与退款（联动 finance）。
        延保单经原质保 ID 关联展示于质保查询页。
      </Typography.Paragraph>
      <Perm code="contract:extension:sell">
        <Button type="primary" onClick={() => setSellOpen(true)}>延保销售</Button>
      </Perm>
      <Modal title="延保销售" open={sellOpen} destroyOnClose onCancel={() => setSellOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        const r = await post<{ extension_no: string }>("/warranty-extensions", v);
        message.success(`延保单 ${r.extension_no} 已建`);
        form.resetFields();
        setSellOpen(false);
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="base_warranty_id" label="原质保 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="months" label="延长月数" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="amount" label="销售金额"><Input placeholder="199.00" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
