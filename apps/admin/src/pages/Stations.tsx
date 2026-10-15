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
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { StationView, StationDeviceView, StationMonitorResp, StationStaffView } from "@micro/shared/types";

const STATUS_KEY: Record<string, { key: string; color: string }> = {
  ACTIVE: { key: "stn.stActive", color: "success" },
  SUSPENDED: { key: "stn.stSuspended", color: "orange" },
  RETIRED: { key: "stn.stRetired", color: "red" },
};

export default function StationsPage() {
  const { t } = usePrefs();
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
    const timer = setInterval(load, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [detail]);

  const columns: ProColumns<StationView>[] = [
    { title: t("stn.no"), dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: t("stn.searchPlaceholder") } },
    { title: t("stn.no"), dataIndex: "station_no", search: false, render: (_, s) => <a onClick={() => setDetail(s)}>{s.station_no}</a> },
    { title: t("parties.name"), dataIndex: "name", search: false },
    { title: t("order.type"), dataIndex: "type", search: false, render: (_, s) => <Tag>{s.type}</Tag> },
    { title: t("common.status"), dataIndex: "status", search: false, render: (_, s) => <Tag color={STATUS_KEY[s.status]?.color}>{STATUS_KEY[s.status] ? t(STATUS_KEY[s.status].key) : s.status}</Tag> },
    { title: t("parties.address"), dataIndex: "address", search: false, ellipsis: true, render: (_, s) => s.address || "—" },
    { title: t("stn.capacity"), dataIndex: "capacity_kwh", search: false, render: (_, s) => (s.capacity_kwh ? s.capacity_kwh.toLocaleString() : "—") },
    { title: t("dev.sourceOrder"), dataIndex: "order_no", search: false, render: (_, s) => s.order_no || "—" },
  ];

  return (<>
    <ProTable<StationView>
      headerTitle={t("stn.title")}
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t("stn.create")}</Button>
        </Perm>,
      ]}
    />

    <Drawer title={t("stn.detailTitle", { no: detail?.station_no ?? "" })} width={860} open={!!detail} onClose={() => setDetail(null)}>
      {detail && (<>
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}><Card size="small"><Statistic title={t("stn.deviceCount")} value={monitor?.device_count ?? 0} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title={t("stn.online")} value={monitor?.online_count ?? 0} valueStyle={{ color: (monitor?.online_count ?? 0) > 0 ? "#3f8600" : "#cf1322" }} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title={t("stn.avgSoc")} value={monitor ? Number(monitor.avg_soc.toFixed(1)) : 0} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title={t("stn.totalPower")} value={monitor ? Number(monitor.total_power.toFixed(0)) : 0} /></Card></Col>
        </Row>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label={t("parties.name")}>{detail.name}</Descriptions.Item>
          <Descriptions.Item label={t("order.type")}>{detail.type}</Descriptions.Item>
          <Descriptions.Item label={t("parties.address")} span={2}>{detail.address || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("stn.longitude")}>{detail.longitude}, {detail.latitude}</Descriptions.Item>
          <Descriptions.Item label={t("stn.powerKw")}>{detail.power_kw || "—"}</Descriptions.Item>
        </Descriptions>

        <Typography5 label={t("stn.boundDevices")} extra={<Perm code="asset:station:bind"><Button size="small" onClick={() => setBindOpen(true)}>{t("stn.bind")}</Button></Perm>} />
        <Table rowKey="id" size="small" pagination={false} dataSource={devices}
          columns={[
            { title: "SN", dataIndex: "sn" },
            { title: t("stn.role"), dataIndex: "role", render: (v: string) => <Tag>{v}</Tag> },
            { title: t("stn.boundAt"), dataIndex: "bound_at", render: (v: number) => (v ? new Date(v).toLocaleString(getLocale()) : "—") },
          ]} />

        <Typography5 label={t("stn.topologyData")} extra={topology ? <Tag>{t("stn.versionTag", { version: topology.version })}</Tag> : null} />
        <TopologyPreview topology={topology} />

        <Typography5 label={t("stn.monitorDetail")} />
        <Table rowKey="device_id" size="small" pagination={false} dataSource={monitor?.items ?? []}
          columns={[
            { title: "SN", dataIndex: "sn" },
            { title: t("stn.online"), dataIndex: "online", render: (v: boolean) => v ? <Tag color="green">{t("stn.online")}</Tag> : <Tag>{t("stn.offline")}</Tag> },
            { title: t("stn.soc"), dataIndex: "soc" },
            { title: t("stn.powerW"), dataIndex: "power" },
            { title: t("stn.voltage"), dataIndex: "voltage" },
            { title: t("stn.temperature"), dataIndex: "temperature" },
          ]} />

        <Typography5 label={t("stn.staff")} extra={<Perm code="asset:station:staff"><StaffAddButton stationId={detail.station_id} onDone={() => { get<{ list: StationStaffView[] }>(`/stations/${detail.station_id}/staff`).then((s) => setStaff(s.list)); }} /></Perm>} />
        <Table rowKey="id" size="small" pagination={false} dataSource={staff}
          columns={[
            { title: t("stn.userId"), dataIndex: "user_id" },
            { title: t("parties.staffType"), dataIndex: "staff_type", render: (v: string) => <Tag>{v}</Tag> },
            { title: t("stn.shift"), dataIndex: "shift", render: (v: string) => v || "—" },
            {
              title: t("common.actions"), render: (_: unknown, s) => (<Perm code="asset:station:staff">
                <Button size="small" danger onClick={async () => {
                  await fetchCfgDelete(`/stations/${detail.station_id}/staff`, s.user_id);
                  message.success(t("stn.removed"));
                  setStaff(staff.filter((x) => x.id !== s.id));
                }}>{t("stn.remove")}</Button>
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
  const { t } = usePrefs();
  if (!topology || topology.version === 0) {
    return <span style={{ color: "var(--text-sub, #999)" }}>{t("stn.noTopology")}</span>;
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
    <div style={{ border: "1px solid var(--pref-border, #eee)", padding: 8, borderRadius: 4 }}>
      {nodes.length === 0 ? <span style={{ color: "var(--text-sub, #999)" }}>{t("stn.emptyTopology")}</span> : (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {nodes.map((n, i) => (
            <li key={i}>{n.data?.label ?? n.id ?? `#${i + 1}`}
              {edges.filter((e) => e.target === n.id || e.source === n.id).length > 0 &&
                <span style={{ color: "var(--text-sub, #999)" }}>（{edges.filter((e) => e.target === n.id || e.source === n.id).length}）</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StaffAddButton({ stationId, onDone }: { stationId: string; onDone: () => void }) {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  return (<>
    <Button size="small" onClick={() => setOpen(true)}>{t("stn.add")}</Button>
    <Modal title={t("stn.staffTitle")} open={open} onCancel={() => setOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
      const v = await form.validateFields();
      await post(`/stations/${stationId}/staff`, { user_id: v.user_id, staff_type: v.staff_type, shift: v.shift || "" });
      message.success(t("stn.added"));
      setOpen(false);
      onDone();
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="user_id" label={t("stn.userId")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
        <Form.Item name="staff_type" label={t("parties.staffType")} initialValue="RESIDENT">
          <Select options={[
            { value: "RESIDENT", label: t("stn.staffResident") },
            { value: "INSPECTOR", label: t("stn.staffInspector") },
            { value: "MANAGER", label: t("stn.staffManager") },
          ]} />
        </Form.Item>
        <Form.Item name="shift" label={t("stn.shiftOptional")}><Input placeholder="day/night" /></Form.Item>
      </Form>
    </Modal>
  </>);
}

function BindModal({ stationId, open, onClose }: { stationId: string; open: boolean; onClose: () => void }) {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title={t("stn.bindTitle")} open={open} onCancel={onClose} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
      const v = await form.validateFields();
      const sns = String(v.sns).split("\n").map((s: string) => s.trim()).filter(Boolean);
      await post(`/stations/${stationId}/devices`, { devices: sns.map((sn: string) => ({ sn, role: "PACK" })), bound_by: "manual" });
      message.success(t("stn.bound", { count: sns.length }));
      onClose();
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="sns" label={t("stn.snList")} rules={[{ required: true, message: t("common.required") }]}>
          <Input.TextArea rows={5} placeholder={"SN-0001\nSN-0002"} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title={t("stn.createTitle")} open={open} onCancel={onClose} width={640} okText={t("common.confirm")} cancelText={t("common.cancel")}
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
        message.success(t("stn.created"));
        onClose();
      }}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("stn.stationName")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
        <Form.Item name="type" label={t("order.type")} initialValue="ESS">
          <Select options={[
            { value: "ESS", label: t("stn.typeEss") },
            { value: "CHARGING", label: t("stn.typeCharging") },
            { value: "HESS", label: t("stn.typeHess") },
          ]} />
        </Form.Item>
        <Form.Item name="station_no" label={t("stn.stationNo")}><Input /></Form.Item>
        <Space>
          <Form.Item name="province" label={t("stn.province")}><Input /></Form.Item>
          <Form.Item name="city" label={t("stn.city")}><Input /></Form.Item>
        </Space>
        <Form.Item name="address" label={t("stn.detailAddress")}><Input /></Form.Item>
        <Space>
          <Form.Item name="longitude" label={t("stn.longitudeInput")}><InputNumber /></Form.Item>
          <Form.Item name="latitude" label={t("stn.latitudeInput")}><InputNumber /></Form.Item>
        </Space>
        <Space>
          <Form.Item name="capacity_kwh" label={t("stn.capacityInput")}><InputNumber /></Form.Item>
          <Form.Item name="power_kw" label={t("stn.powerInput")}><InputNumber /></Form.Item>
        </Space>
        <Form.Item name="sns" label={t("stn.initialSns")}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
