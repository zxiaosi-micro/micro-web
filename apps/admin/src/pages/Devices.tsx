// Devices.tsx · 设备中心（S6-01）：设备列表 / 详情（影子卡片+生命周期时间线+指令）/ OTA 任务（固件+灰度+回滚）。
// 约定：ID string（E8）；usePaged 分页；指令下发 step-up（10406 → 全局提级弹窗）；严禁并发冒烟（E1）。

import { useState } from "react";
import {
  App, Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Steps, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
import type { CmdView, DeviceView, DeviceShadowResp, FirmwareView, OtaTaskView } from "@micro/shared/types";

const STATUS_TAG: Record<string, { text: string; color: string }> = {
  PRODUCED: { text: "已产出", color: "default" },
  IN_STOCK: { text: "在库", color: "cyan" },
  OUT: { text: "已出库", color: "geekblue" },
  ACTIVATED: { text: "已激活", color: "success" },
  RETIRED: { text: "已退役", color: "orange" },
  SCRAPPED: { text: "已报废", color: "red" },
};

const CMD_STATUS_TAG: Record<string, { text: string; color: string }> = {
  PENDING: { text: "待下发", color: "default" },
  SENT: { text: "已下发", color: "blue" },
  ACKED: { text: "已回执", color: "success" },
  FAILED: { text: "失败", color: "red" },
};

export default function DevicesPage(props: { defaultTab?: string }) {
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "devices"} items={[
      { key: "devices", label: "设备", children: <DevicesTab /> },
      { key: "cmds", label: "指令记录", children: <CmdsTab /> },
      { key: "ota", label: "OTA 任务", children: <OtaTab /> },
    ]} />
  );
}

// ---- 设备列表 ----

function DevicesTab() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<DeviceView | null>(null);
  const [shadow, setShadow] = useState<DeviceShadowResp | null>(null);
  const [topology, setTopology] = useState<{ nodes: { node_id: string; parent_id: string; node_type: string; node_name: string }[] } | null>(null);
  const [cmdTarget, setCmdTarget] = useState<DeviceView | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ sn: string; secret: string }[] | null>(null);

  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<DeviceView>(
    (p) => get<{ list: DeviceView[]; total: number }>(`/devices?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}&status=${status}`),
  );

  const openDetail = async (d: DeviceView) => {
    setDetail(d);
    setShadow(null);
    setTopology(null);
    const [sh, tp] = await Promise.all([
      get<DeviceShadowResp>(`/devices/${d.device_id}/shadow`).catch(() => null),
      get<{ nodes: { node_id: string; parent_id: string; node_type: string; node_name: string }[] }>(`/devices/${d.device_id}/topology`).catch(() => null),
    ]);
    setShadow(sh);
    setTopology(tp);
  };

  return (<>
    <Space style={{ marginBottom: 12 }}>
      <Input.Search placeholder="SN/型号" allowClear style={{ width: 220 }} onSearch={(v) => { setKeyword(v); setPage(1); }} />
      <Select allowClear placeholder="状态" style={{ width: 130 }} value={status || undefined}
        onChange={(v) => { setStatus(v ?? ""); setPage(1); }}
        options={Object.entries(STATUS_TAG).map(([v, t]) => ({ value: v, label: t.text }))} />
      <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      <Perm code="asset:device:create"><Button type="primary" icon={<PlusOutlined />} onClick={() => setImportOpen(true)}>导入 SN</Button></Perm>
    </Space>
    <Table rowKey="device_id" loading={loading} size="small"
      columns={[
        { title: "SN", dataIndex: "sn", render: (v: string, d) => <a onClick={() => openDetail(d)}>{v}</a> },
        { title: "产品", dataIndex: "product_key" },
        { title: "型号", dataIndex: "model" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={STATUS_TAG[v]?.color}>{STATUS_TAG[v]?.text ?? v}</Tag> },
        { title: "来源订单", dataIndex: "order_no", render: (v: string) => v || "—" },
        { title: "凭证", dataIndex: "has_secret", render: (v: boolean) => v ? <Tag color="green">就绪</Tag> : <Tag>无</Tag> },
        {
          title: "操作", render: (_: unknown, d) => (<Space>
            <Perm code="asset:device:cmd"><Button size="small" onClick={() => setCmdTarget(d)}>指令</Button></Perm>
            <Perm code="asset:device:activate">{d.status === "OUT" && <Button size="small" type="link" onClick={async () => {
              await post(`/devices/${d.device_id}/activate`, {});
              message.success("已激活（质保起算事件已发）");
              refresh();
            }}>激活</Button>}</Perm>
            <Perm code="asset:device:transition">{["ACTIVATED", "RETIRED", "IN_STOCK", "OUT"].includes(d.status) && <Button size="small" type="link" danger onClick={async () => {
              const to = d.status === "ACTIVATED" ? "RETIRED" : "SCRAPPED";
              await post(`/devices/${d.device_id}/transition`, { to_status: to, reason: "后台人工操作" });
              message.success(`已迁移至 ${to}`);
              refresh();
            }}>{d.status === "ACTIVATED" ? "退役" : "报废"}</Button>}</Perm>
          </Space>),
        },
      ]}
      dataSource={list}
      pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />

    {/* 详情抽屉：影子卡片 + 拓扑 */}
    <Drawer title={`设备 ${detail?.sn ?? ""}`} width={620} open={!!detail} onClose={() => setDetail(null)}>
      {detail && (<>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="SN">{detail.sn}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={STATUS_TAG[detail.status]?.color}>{STATUS_TAG[detail.status]?.text}</Tag></Descriptions.Item>
          <Descriptions.Item label="产品">{detail.product_key}</Descriptions.Item>
          <Descriptions.Item label="型号">{detail.model || "—"}</Descriptions.Item>
          <Descriptions.Item label="批次">{detail.batch_no || "—"}</Descriptions.Item>
          <Descriptions.Item label="激活时间">{detail.activated_at ? new Date(detail.activated_at).toLocaleString() : "—"}</Descriptions.Item>
        </Descriptions>
        <Typography.Title level={5} style={{ marginTop: 16 }}>设备影子</Typography.Title>
        {shadow ? (<Descriptions column={2} size="small" bordered>
          {shadow.metrics.map((m) => (
            <Descriptions.Item key={m.key} label={m.key}>{m.value}</Descriptions.Item>
          ))}
          <Descriptions.Item label="时间戳" span={2}>{shadow.ts ? new Date(shadow.ts).toLocaleString() : "—"}</Descriptions.Item>
        </Descriptions>) : <Typography.Text type="secondary">暂无遥测上报</Typography.Text>}
        <Typography.Title level={5} style={{ marginTop: 16 }}>拓扑（电芯→模组→包→桩）</Typography.Title>
        {topology && topology.nodes.length > 0 ? (
          <Steps direction="vertical" size="small" items={topology.nodes.map((n) => ({ title: n.node_type, description: n.node_name || undefined }))} />
        ) : <Typography.Text type="secondary">未配置拓扑</Typography.Text>}
        <Perm code="asset:device:credential">
          <Button style={{ marginTop: 16 }} onClick={async () => {
            const out = await post<{ sn: string; secret: string }>(`/devices/${detail.device_id}/credential`, {});
            Modal.info({ title: `凭证已重建（明文仅此一次）`, content: <Typography.Paragraph copyable>{out.secret}</Typography.Paragraph> });
          }}>补发凭证</Button>
        </Perm>
      </>)}
    </Drawer>

    {/* 指令下发弹窗（step-up 由后端 10406 触发全局提级弹窗） */}
    <CmdModal sn={cmdTarget?.sn ?? ""} onClose={() => { setCmdTarget(null); refresh(); }} open={!!cmdTarget} />

    <ImportModal open={importOpen} onClose={() => { setImportOpen(false); refresh(); }} onResult={setImportResult} result={importResult} />
  </>);
}

function CmdModal({ sn, open, onClose }: { sn: string; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title={`下发指令 → ${sn}`} open={open} onCancel={onClose} onOk={async () => {
      const v = await form.validateFields();
      await post("/devices/commands", { sn, cmd_type: v.cmd_type, params_json: v.params_json || "" });
      message.success("指令已入队（QoS1 下发，ACK 3s 超时自动重试）");
      onClose();
    }} okText="下发" okButtonProps={{ danger: true }}>
      <Form form={form} layout="vertical" initialValues={{ cmd_type: "QUERY" }}>
        <Form.Item name="cmd_type" label="指令类型" rules={[{ required: true }]}>
          <Select options={[
            { value: "QUERY", label: "QUERY 查询" },
            { value: "REBOOT", label: "REBOOT 重启（控制类）" },
            { value: "RELAY_SET", label: "RELAY_SET 继电器（控制类）" },
            { value: "SET_PARAM", label: "SET_PARAM 参数设置" },
            { value: "PING", label: "PING 探活" },
          ]} />
        </Form.Item>
        <Form.Item name="params_json" label="参数 JSON（可选）">
          <Input.TextArea rows={3} placeholder='{"key": "value"}' />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ImportModal({ open, onClose, onResult, result }: {
  open: boolean; onClose: () => void;
  onResult: (r: { sn: string; secret: string }[] | null) => void;
  result: { sn: string; secret: string }[] | null;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title="批量导入 SN（自动开通 EMQX 凭证）" open={open} onCancel={() => { onClose(); onResult(null); }}
      footer={null} width={640}>
      <Form form={form} layout="vertical" onFinish={async (v) => {
        const items = String(v.sns).split("\n").map((s: string) => s.trim()).filter(Boolean).map((sn: string) => ({ sn, product_key: v.product_key }));
        const out = await post<{ imported: number; secrets: { sn: string; secret: string }[]; provision_errors: string[] }>("/devices/import", { items, provision: true });
        message.success(`导入 ${out.imported} 台${out.provision_errors.length ? `（${out.provision_errors.length} 条告警）` : ""}`);
        onResult(out.secrets);
      }}>
        <Form.Item name="product_key" label="产品标识" rules={[{ required: true }]} initialValue="ESS-DEMO">
          <Input />
        </Form.Item>
        <Form.Item name="sns" label="SN 清单（每行一个）" rules={[{ required: true }]}>
          <Input.TextArea rows={6} placeholder={"SN-0001\nSN-0002"} />
        </Form.Item>
        <Button type="primary" htmlType="submit">导入</Button>
      </Form>
      {result && (<>
        <Typography.Title level={5} style={{ marginTop: 16 }}>密钥 CSV（产线明文仅此一次）</Typography.Title>
        <Input.TextArea rows={6} readOnly value={result.map((r) => `${r.sn},${r.secret}`).join("\n")} />
      </>)}
    </Modal>
  );
}

// ---- 指令记录 ----

function CmdsTab() {
  const [sn, setSn] = useState("");
  const [status, setStatus] = useState("");
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<CmdView>(
    (p) => get<{ list: CmdView[]; total: number }>(`/device-cmds?page=${p.page}&size=${p.size}&sn=${encodeURIComponent(sn)}&status=${status}`),
  );
  return (<>
    <Space style={{ marginBottom: 12 }}>
      <Input.Search placeholder="SN" allowClear style={{ width: 200 }} onSearch={(v) => { setSn(v); setPage(1); }} />
      <Select allowClear placeholder="状态" style={{ width: 130 }} value={status || undefined} onChange={(v) => { setStatus(v ?? ""); setPage(1); }}
        options={Object.entries(CMD_STATUS_TAG).map(([v, t]) => ({ value: v, label: t.text }))} />
      <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
    </Space>
    <Table rowKey="cmd_id" loading={loading} size="small"
      columns={[
        { title: "指令 ID", dataIndex: "cmd_id" },
        { title: "SN", dataIndex: "sn" },
        { title: "类型", dataIndex: "cmd_type" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={CMD_STATUS_TAG[v]?.color}>{CMD_STATUS_TAG[v]?.text ?? v}</Tag> },
        { title: "重试", dataIndex: "retry_count" },
        { title: "失败原因", dataIndex: "fail_reason", ellipsis: true, render: (v: string) => v || "—" },
        { title: "下发时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString() },
      ]}
      dataSource={list}
      pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />
  </>);
}

// ---- OTA 任务 ----

const OTA_STATUS: Record<string, { text: string; color: string }> = {
  CREATED: { text: "已创建", color: "default" },
  RUNNING: { text: "进行中", color: "blue" },
  PAUSED: { text: "已暂停", color: "orange" },
  DONE: { text: "完成", color: "success" },
  CANCELLED: { text: "已取消", color: "default" },
  ROLLED_BACK: { text: "已回滚", color: "red" },
};

function OtaTab() {
  const { message } = App.useApp();
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<OtaTaskView | null>(null);

  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<OtaTaskView>(
    (p) => get<{ list: OtaTaskView[]; total: number }>(`/ota-tasks?page=${p.page}&size=${p.size}&status=${status}`),
  );

  return (<>
    <Space style={{ marginBottom: 12 }}>
      <Select allowClear placeholder="状态" style={{ width: 130 }} value={status || undefined} onChange={(v) => { setStatus(v ?? ""); setPage(1); }}
        options={Object.entries(OTA_STATUS).map(([v, t]) => ({ value: v, label: t.text }))} />
      <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      <Perm code="asset:ota:task"><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建 OTA 任务</Button></Perm>
    </Space>
    <Table rowKey="task_id" loading={loading} size="small"
      columns={[
        { title: "任务号", dataIndex: "task_no", render: (v: string, t) => <a onClick={async () => setDetail(await get<OtaTaskView>(`/ota-tasks/${t.task_id}`))}>{v}</a> },
        { title: "名称", dataIndex: "name" },
        { title: "产品", dataIndex: "product_key" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={OTA_STATUS[v]?.color}>{OTA_STATUS[v]?.text ?? v}</Tag> },
        { title: "进度", render: (_: unknown, t) => `${t.success_count}/${t.total}（失败 ${t.fail_count}）` },
        { title: "失败率阈值", dataIndex: "fail_threshold_pct", render: (v: number) => `${v}%` },
        { title: "暂停原因", dataIndex: "fail_reason", ellipsis: true, render: (v: string) => v || "—" },
        {
          title: "操作", render: (_: unknown, t) => (<Perm code="asset:ota:rollback">
            {["RUNNING", "PAUSED", "DONE"].includes(t.status) && <Button size="small" danger onClick={async () => {
              await post(`/ota-tasks/${t.task_id}/rollback`, { reason: "后台人工回滚" });
              message.success("已回滚（明细复位，旧固件重推）");
              refresh();
            }}>回滚</Button>}
          </Perm>),
        },
      ]}
      dataSource={list}
      pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />

    <OtaCreateModal open={createOpen} onClose={() => { setCreateOpen(false); refresh(); }} />

    <Drawer title={`OTA 任务 ${detail?.task_no ?? ""}`} width={720} open={!!detail} onClose={() => setDetail(null)}>
      {detail && (<>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="状态"><Tag color={OTA_STATUS[detail.status]?.color}>{OTA_STATUS[detail.status]?.text}</Tag></Descriptions.Item>
          <Descriptions.Item label="目标固件">{detail.firmware_id}</Descriptions.Item>
          <Descriptions.Item label="批次大小">{detail.batch_size}</Descriptions.Item>
          <Descriptions.Item label="回滚固件">{detail.rollback_firmware_id || "—"}</Descriptions.Item>
        </Descriptions>
        <Table style={{ marginTop: 12 }} rowKey="id" size="small" pagination={false} dataSource={detail.devices}
          columns={[
            { title: "SN", dataIndex: "sn" },
            { title: "状态", dataIndex: "status", render: (v: string) => <Tag>{v}</Tag> },
            { title: "重试", dataIndex: "retry_count" },
            { title: "错误", dataIndex: "error", ellipsis: true, render: (v: string) => v || "—" },
          ]} />
      </>)}
    </Drawer>
  </>);
}

function OtaCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [fws, setFws] = useState<FirmwareView[]>([]);
  const openFetch = async () => {
    const out = await get<{ list: FirmwareView[] }>("/firmwares?page=1&size=100");
    setFws(out.list);
  };
  return (
    <Modal title="创建 OTA 任务（灰度分批）" open={open} onCancel={onClose} afterOpenChange={(o) => o && openFetch()}
      onOk={async () => {
        const v = await form.validateFields();
        await post("/ota-tasks", {
          name: v.name, product_key: v.product_key,
          firmware_id: v.firmware_id, rollback_firmware_id: v.rollback_firmware_id || "",
          batch_size: Number(v.batch_size) || 50,
          device_ids: String(v.device_ids || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        });
        message.success("任务已创建（扫描器将按批次下发）");
        onClose();
      }} okText="创建">
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="任务名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="product_key" label="目标产品" rules={[{ required: true }]} initialValue="ESS-DEMO"><Input /></Form.Item>
        <Form.Item name="firmware_id" label="目标固件" rules={[{ required: true }]}>
          <Select options={fws.map((f) => ({ value: f.firmware_id, label: `${f.product_key} v${f.version} (${f.firmware_id})` }))} />
        </Form.Item>
        <Form.Item name="rollback_firmware_id" label="回滚固件（可选）">
          <Select allowClear options={fws.map((f) => ({ value: f.firmware_id, label: `${f.product_key} v${f.version}` }))} />
        </Form.Item>
        <Form.Item name="batch_size" label="批次大小" initialValue={50}><Input /></Form.Item>
        <Form.Item name="device_ids" label="灰度设备 ID（逗号分隔；空=全量 ACTIVATED）">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
