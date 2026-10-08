// Contracts.tsx · 合同质保（S5-04）：合同列表/详情（归档件版本 + 上传弹窗 step-up）/ 质保 / SLA / 索赔 / 延保。
// 约定：归档五要素（上传人/版本/关联/状态/受控下载）；平台不解析文件内容；step-up 由 BFF SensitivePrefixes 强制。

import { useState } from "react";
import {
  App, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
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

  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<ContractView>(
    (p) => get<{ list: ContractView[]; total: number }>(`/contracts?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}`),
  );

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search onSearch={(v) => { setKeyword(v); setPage(1); }} style={{ width: 240 }} allowClear placeholder="合同号/名称" />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="contract_id" columns={[
        { title: "合同号", dataIndex: "contract_no", render: (v: string) => <a onClick={() => setDetail(list.find((c) => c.contract_no === v) ?? null)}>{v}</a> },
        { title: "名称", dataIndex: "name" },
        { title: "类型", dataIndex: "type" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={CONTRACT_STATUS[v]?.color}>{CONTRACT_STATUS[v]?.text ?? v}</Tag> },
        { title: "金额", dataIndex: "amount", render: (v: string) => `¥${v}` },
        { title: "归档件", dataIndex: "files", render: (f: ContractView["files"]) => (f?.length ? `v${Math.max(...f.map((x) => x.version))}` : "—") },
        { title: "生效时间", dataIndex: "effective_at", render: (v: number) => (v ? new Date(v).toLocaleString() : "—") },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />

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
                    message.success("合同已生效"); setDetail(null); refresh();
                  }}>生效</Button>
                )}
                {detail.status === "ACTIVE" && (
                  <Button onClick={async () => {
                    await post(`/contracts/${detail.contract_no}/archive`, { action: "ARCHIVE" });
                    message.success("合同已归档"); setDetail(null); refresh();
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
          message.success(`归档件 v${r.version} 已登记`); setUploadOpen(false); setDetail(null); refresh();
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
        message.success("已绑定（ops 按快照计时）"); setBindOpen(false);
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
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<WarrantyView>(
    (p) => get<{ list: WarrantyView[]; total: number }>(`/warranties?page=${p.page}&size=${p.size}&status=${status}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
          options={Object.entries(WARRANTY_STATUS).map(([k, t]) => ({ value: k, label: t.text }))} />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="warranty_no" columns={[
        { title: "质保号", dataIndex: "warranty_no" },
        { title: "层级", dataIndex: "level", render: (v: string) => <Tag color={v === "STATION" ? "purple" : "cyan"}>{v}</Tag> },
        { title: "对象", dataIndex: "target_key" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={WARRANTY_STATUS[v]?.color}>{WARRANTY_STATUS[v]?.text ?? v}</Tag> },
        { title: "起算", dataIndex: "start_at", render: (v: number) => (v ? new Date(v).toLocaleDateString() : "未起算") },
        { title: "到期", dataIndex: "end_at", render: (v: number) => (v ? new Date(v).toLocaleDateString() : "—") },
        { title: "月数", dataIndex: "months" },
        { title: "来源", dataIndex: "source_no", render: (v: string) => v || "—" },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />
    </>
  );
}

// ---- SLA ----

function SlaTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const { list, loading, refresh } = usePaged<SlaStrategyView>(() => get<{ list: SlaStrategyView[]; total: number }>("/sla-strategies").then((r) => ({ list: r.list, total: 1 })));
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Perm code="contract:sla:create">
          <Button type="primary" onClick={() => setCreateOpen(true)}>新建策略</Button>
        </Perm>
      </Space>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        策略在合同域定义，计时由 ops 执行（绑定即快照冻结，FR-CTR-007）。
      </Typography.Text>
      <Table rowKey="strategy_id" columns={[
        { title: "编码", dataIndex: "code" },
        { title: "名称", dataIndex: "name" },
        { title: "分级", dataIndex: "level", render: (v: string) => <Tag color={v === "P1" ? "red" : v === "P2" ? "orange" : "blue"}>{v}</Tag> },
        { title: "响应时限(分)", dataIndex: "response_minutes" },
        { title: "解决时限(分)", dataIndex: "resolve_minutes" },
      ]} dataSource={list ?? []} loading={loading} pagination={false} />
      <Modal title="新建 SLA 策略" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        await post("/sla-strategies", v);
        message.success("策略已建"); form.resetFields(); setCreateOpen(false); refresh();
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
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<ClaimView>(
    (p) => get<{ list: ClaimView[]; total: number }>(`/claims?page=${p.page}&size=${p.size}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Perm code="contract:claim:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>索赔申请</Button>
        </Perm>
      </Space>
      <Table rowKey="claim_no" columns={[
        { title: "索赔号", dataIndex: "claim_no" },
        { title: "质保号", dataIndex: "warranty_no" },
        { title: "类型", dataIndex: "type" },
        { title: "状态", dataIndex: "status", render: (v: string) => (
          <Tag color={v === "APPROVED" ? "green" : v === "REJECTED" ? "red" : v === "SETTLED" ? "purple" : "processing"}>{v}</Tag>) },
        { title: "结算方式", dataIndex: "settle_type", render: (v: string) => v || "—" },
        { title: "金额", dataIndex: "amount", render: (v: string) => (v ? `¥${v}` : "—") },
        {
          title: "操作", render: (_: unknown, r: ClaimView) => (
            <Space>
              {r.status === "APPLYING" && (
                <Perm code="contract:claim:approve">
                  <Button size="small" type="primary" onClick={async () => {
                    await post(`/claims/${r.claim_no}/approve`, { approve: true });
                    message.success("已批准"); refresh();
                  }}>批准</Button>
                </Perm>
              )}
              {r.status === "APPROVED" && (
                <Perm code="contract:claim:settle">
                  <Button size="small" onClick={async () => {
                    await post(`/claims/${r.claim_no}/settle`, { settle_type: "REPAIR" });
                    message.success("已结算"); refresh();
                  }}>结算（维修）</Button>
                </Perm>
              )}
            </Space>
          ),
        },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />
      <Modal title="索赔申请" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        await post("/claims", v);
        message.success("索赔已受理"); form.resetFields(); setCreateOpen(false); refresh();
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
      <Space style={{ marginBottom: 16 }}>
        <Perm code="contract:extension:sell">
          <Button type="primary" onClick={() => setSellOpen(true)}>延保销售</Button>
        </Perm>
      </Space>
      <Typography.Text type="secondary">
        延保衔接原质保（无缝衔接，FR-CTR-006）；支持转移（换设备/场站）与退款（联动 finance）。
        延保单经原质保 ID 关联展示于质保查询页。
      </Typography.Text>
      <Modal title="延保销售" open={sellOpen} destroyOnClose onCancel={() => setSellOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        const r = await post<{ extension_no: string }>("/warranty-extensions", v);
        message.success(`延保单 ${r.extension_no} 已建`); form.resetFields(); setSellOpen(false);
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
