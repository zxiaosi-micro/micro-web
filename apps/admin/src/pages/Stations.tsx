// Stations.tsx · 场站管理（S6-02）：列表/详情/绑定表格/拓扑（React Flow 形状预览）/监控聚合卡片/驻场人员。
// 主表走 ProTable request；详情抽屉子表（非分页轮询数据）保留 antd Table。

import { useEffect, useRef, useState } from "react";
import {
  App, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tag,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import type { StationView, StationDeviceView, StationMonitorResp, StationStaffView } from "@micro/shared/types";

const STATUS_TAG: Record<string, { text: string; color: string }> = {
  ACTIVE: { text: "运行中", color: "success" },
  SUSPENDED: { text: "停用", color: "orange" },
  RETIRED: { text: "退役", color: "red" },
};

export default function StationsPage() {
  const { message } = App.useApp();
  const [detail, setDetail] = useState<StationView | null>(null);
  const [devices, setDevices] = useState<StationDeviceView[]>([]);
  const [monitor, setMonitor] = useState<StationMonitorResp | null>(null);
  const [topology, setTopology] = useState<{ version: number; nodes_json: string; edges_json: string } | null>(null);
  const [staff, setStaff] = useState<StationStaffView[]>([]);
  const [bindOpen, setBindOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const actionRef = useRef<ActionType | undefined>(undefined);

  // 详情抽屉打开时 10s 轮询监控聚合（usePolling 语义：页面隐藏暂停由 shared 层承担）
  useEffect(() => {
    if (!detail) return;
    let alive = true;
    const load = async () => {
      const sid = detail.station_id;
      const [dev, mon, tp, st] = await Promise.all([
        get<{ list: StationDeviceView[] }>(`/stations/${sid}/devices`).catch(() => null),
        get<StationMonitorResp>(`/stations/${sid}/monitor`).catch(() => null),
        get<{ topology: { version: number; nodes_json: string; edges_json: string } }>(`/stations/${sid}/topology`).catch(() => null),
        get<{ list: StationStaffView[] }>(`/stations/${sid}/staff`).catch(() => null),
      ]);
      if (!alive) return;
      setDevices(dev?.list ?? []);
      setMonitor(mon);
      setTopology(tp?.topology ?? null);
      setStaff(st?.list ?? []);
    };
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [detail]);

  const columns: ProColumns<StationView>[] = [
    { title: "编号", dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: "场站编号/名称" } },
    { title: "编号", dataIndex: "station_no", search: false, render: (_, s) => <a onClick={() => setDetail(s)}>{s.station_no}</a> },
    { title: "名称", dataIndex: "name", search: false },
    { title: "类型", dataIndex: "type", search: false, render: (_, s) => <Tag>{s.type}</Tag> },
    { title: "状态", dataIndex: "status", search: false, render: (_, s) => <Tag color={STATUS_TAG[s.status]?.color}>{STATUS_TAG[s.status]?.text ?? s.status}</Tag> },
    { title: "地址", dataIndex: "address", search: false, ellipsis: true, render: (_, s) => s.address || "—" },
    { title: "容量 kWh", dataIndex: "capacity_kwh", search: false, render: (_, s) => (s.capacity_kwh ? s.capacity_kwh.toLocaleString() : "—") },
    { title: "来源订单", dataIndex: "order_no", search: false, render: (_, s) => s.order_no || "—" },
  ];

  return (<>
    <ProTable<StationView>
      headerTitle="场站管理"
      rowKey="station_id"
      size="small"
      actionRef={actionRef}
      columns={columns}
      request={async (params) => {
        const resp = await get<{ list: StationView[]; total: number }>(
          `/stations?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(String(params.keyword ?? ""))}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={{ defaultPageSize: 10, showSizeChanger: true }}
      toolBarRender={() => [
        <Perm key="create" code="asset:station:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>建站</Button>
        </Perm>,
      ]}
    />

    <Drawer title={`场站 ${detail?.station_no ?? ""}`} width={860} open={!!detail} onClose={() => setDetail(null)}>
      {detail && (<>
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}><Card size="small"><Statistic title="设备数" value={monitor?.device_count ?? 0} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title="在线" value={monitor?.online_count ?? 0} valueStyle={{ color: (monitor?.online_count ?? 0) > 0 ? "#3f8600" : "#cf1322" }} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title="平均 SOC %" value={monitor ? Number(monitor.avg_soc.toFixed(1)) : 0} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title="总功率 W" value={monitor ? Number(monitor.total_power.toFixed(0)) : 0} /></Card></Col>
        </Row>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
          <Descriptions.Item label="类型">{detail.type}</Descriptions.Item>
          <Descriptions.Item label="地址" span={2}>{detail.address || "—"}</Descriptions.Item>
          <Descriptions.Item label="经纬度">{detail.longitude}, {detail.latitude}</Descriptions.Item>
          <Descriptions.Item label="额定功率 kW">{detail.power_kw || "—"}</Descriptions.Item>
        </Descriptions>

        <Typography5 label="绑定设备" extra={<Perm code="asset:station:bind"><Button size="small" onClick={() => setBindOpen(true)}>绑定</Button></Perm>} />
        <Table rowKey="id" size="small" pagination={false} dataSource={devices}
          columns={[
            { title: "SN", dataIndex: "sn" },
            { title: "角色", dataIndex: "role", render: (v: string) => <Tag>{v}</Tag> },
            { title: "绑定时间", dataIndex: "bound_at", render: (v: number) => (v ? new Date(v).toLocaleString() : "—") },
          ]} />

        <Typography5 label="拓扑（React Flow 数据）" extra={topology ? <Tag>版本 v{topology.version}</Tag> : null} />
        <TopologyPreview topology={topology} />

        <Typography5 label="监控明细" />
        <Table rowKey="device_id" size="small" pagination={false} dataSource={monitor?.items ?? []}
          columns={[
            { title: "SN", dataIndex: "sn" },
            { title: "在线", dataIndex: "online", render: (v: boolean) => v ? <Tag color="green">在线</Tag> : <Tag>离线</Tag> },
            { title: "SOC %", dataIndex: "soc" },
            { title: "功率 W", dataIndex: "power" },
            { title: "电压 V", dataIndex: "voltage" },
            { title: "温度", dataIndex: "temperature" },
          ]} />

        <Typography5 label="驻场人员" extra={<Perm code="asset:station:staff"><StaffAddButton stationId={detail.station_id} onDone={() => { get<{ list: StationStaffView[] }>(`/stations/${detail.station_id}/staff`).then((s) => setStaff(s.list)); }} /></Perm>} />
        <Table rowKey="id" size="small" pagination={false} dataSource={staff}
          columns={[
            { title: "用户 ID", dataIndex: "user_id" },
            { title: "类型", dataIndex: "staff_type", render: (v: string) => <Tag>{v}</Tag> },
            { title: "排班", dataIndex: "shift", render: (v: string) => v || "—" },
            {
              title: "操作", render: (_: unknown, s) => (<Perm code="asset:station:staff">
                <Button size="small" danger onClick={async () => {
                  await fetchCfgDelete(`/stations/${detail.station_id}/staff`, s.user_id);
                  message.success("已移除");
                  setStaff(staff.filter((x) => x.id !== s.id));
                }}>移除</Button>
              </Perm>),
            },
          ]} />
      </>)}
    </Drawer>

    <BindModal stationId={detail?.station_id ?? ""} open={bindOpen} onClose={async () => { setBindOpen(false); if (detail) setDevices((await get<{ list: StationDeviceView[] }>(`/stations/${detail.station_id}/devices`)).list); }} />
    <CreateModal open={createOpen} onClose={() => { setCreateOpen(false); actionRef.current?.reload(); }} />
  </>);
}

// fetchCfgDelete DELETE 带 body（shared.del 无 body 形状；信封解包对齐 request.ts）。
async function fetchCfgDelete(path: string, userId: string) {
  const { getConfig } = await import("@micro/shared");
  const cfg = getConfig();
  const token = cfg.auth.getAccessToken();
  const resp = await fetch((cfg.baseURL ?? "") + path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

function Typography5({ label, extra }: { label: string; extra?: React.ReactNode }) {
  return (
    <div style={{ margin: "16px 0 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <b>{label}</b>
      {extra}
    </div>
  );
}

// TopologyPreview 拓扑预览（React Flow nodes/edges JSON 解析为只读列表——完整画布 S7 场站 Web 端落地）。
function TopologyPreview({ topology }: { topology: { version: number; nodes_json: string; edges_json: string } | null }) {
  if (!topology || topology.version === 0) {
    return <span style={{ color: "#999" }}>暂无拓扑</span>;
  }
  let nodes: { id?: string; data?: { label?: string } }[] = [];
  let edges: { source?: string; target?: string }[] = [];
  try {
    nodes = JSON.parse(topology.nodes_json);
    edges = JSON.parse(topology.edges_json);
  } catch {
    // 解析失败只显示版本号
  }
  return (
    <div style={{ border: "1px solid #eee", padding: 8, borderRadius: 4 }}>
      {nodes.length === 0 ? <span style={{ color: "#999" }}>空拓扑</span> : (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {nodes.map((n, i) => (
            <li key={i}>{n.data?.label ?? n.id ?? `节点${i + 1}`}
              {edges.filter((e) => e.target === n.id || e.source === n.id).length > 0 &&
                <span style={{ color: "#999" }}>（{edges.filter((e) => e.target === n.id || e.source === n.id).length} 条连接）</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StaffAddButton({ stationId, onDone }: { stationId: string; onDone: () => void }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  return (<>
    <Button size="small" onClick={() => setOpen(true)}>添加</Button>
    <Modal title="添加驻场人员" open={open} onCancel={() => setOpen(false)} onOk={async () => {
      const v = await form.validateFields();
      await post(`/stations/${stationId}/staff`, { user_id: v.user_id, staff_type: v.staff_type, shift: v.shift || "" });
      message.success("已添加");
      setOpen(false);
      onDone();
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="user_id" label="用户 ID" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="staff_type" label="类型" initialValue="RESIDENT">
          <Select options={[
            { value: "RESIDENT", label: "驻场" },
            { value: "INSPECTOR", label: "巡检" },
            { value: "MANAGER", label: "站长" },
          ]} />
        </Form.Item>
        <Form.Item name="shift" label="排班（可选）"><Input placeholder="day/night" /></Form.Item>
      </Form>
    </Modal>
  </>);
}

function BindModal({ stationId, open, onClose }: { stationId: string; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title="绑定设备（SN 清单，每行一个）" open={open} onCancel={onClose} onOk={async () => {
      const v = await form.validateFields();
      const sns = String(v.sns).split("\n").map((s: string) => s.trim()).filter(Boolean);
      await post(`/stations/${stationId}/devices`, { devices: sns.map((sn: string) => ({ sn, role: "PACK" })), bound_by: "manual" });
      message.success(`已绑定 ${sns.length} 台`);
      onClose();
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="sns" label="SN 清单" rules={[{ required: true }]}>
          <Input.TextArea rows={5} placeholder={"SN-0001\nSN-0002"} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title="创建场站（Saga 步骤6 手工兜底口径）" open={open} onCancel={onClose} width={640}
      onOk={async () => {
        const v = await form.validateFields();
        const sns = String(v.sns || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
        await post("/stations", {
          name: v.name, type: v.type, station_no: v.station_no || "",
          province: v.province || "", city: v.city || "", address: v.address || "",
          longitude: Number(v.longitude) || 0, latitude: Number(v.latitude) || 0,
          capacity_kwh: Number(v.capacity_kwh) || 0, power_kw: Number(v.power_kw) || 0,
          devices: sns.map((sn: string) => ({ sn, role: "PACK" })),
        });
        message.success("场站已创建（station_created 事件已发）");
        onClose();
      }}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="场站名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="type" label="类型" initialValue="ESS">
          <Select options={[
            { value: "ESS", label: "储能 ESS" },
            { value: "CHARGING", label: "充电 CHARGING" },
            { value: "HESS", label: "混合 HESS" },
          ]} />
        </Form.Item>
        <Form.Item name="station_no" label="场站编号（空自动生成）"><Input /></Form.Item>
        <Space>
          <Form.Item name="province" label="省"><Input /></Form.Item>
          <Form.Item name="city" label="市"><Input /></Form.Item>
        </Space>
        <Form.Item name="address" label="详细地址"><Input /></Form.Item>
        <Space>
          <Form.Item name="longitude" label="经度"><InputNumber /></Form.Item>
          <Form.Item name="latitude" label="纬度"><InputNumber /></Form.Item>
        </Space>
        <Space>
          <Form.Item name="capacity_kwh" label="容量 kWh"><InputNumber /></Form.Item>
          <Form.Item name="power_kw" label="额定功率 kW"><InputNumber /></Form.Item>
        </Space>
        <Form.Item name="sns" label="初始绑定 SN（每行一个，可空）">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
