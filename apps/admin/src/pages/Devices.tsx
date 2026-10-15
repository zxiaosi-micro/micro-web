// Devices.tsx · 设备中心（S6-01）：设备列表 / 详情（影子卡片+生命周期时间线+指令）/ OTA 任务（固件+灰度+回滚）。
// 约定：ID string（E8）；三个 Tab 分页表走 ProTable（筛选 params 联动）；指令下发 step-up（10406 → 全局提级弹窗）；
// 详情抽屉子表与导入/创建弹窗保留 antd；严禁并发冒烟（E1）。

import { useRef, useState } from "react";
import {
  App, Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Steps, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { CmdView, DeviceView, DeviceShadowResp, FirmwareView, OtaTaskView } from "@micro/shared/types";

const STATUS_TAG: Record<string, { key: string; color: string }> = {
  PRODUCED: { key: "dev.stProduced", color: "default" },
  IN_STOCK: { key: "dev.stInStock", color: "cyan" },
  OUT: { key: "dev.stOut", color: "geekblue" },
  ACTIVATED: { key: "dev.stActivated", color: "success" },
  RETIRED: { key: "dev.stRetired", color: "orange" },
  SCRAPPED: { key: "dev.stScrapped", color: "red" },
};

const CMD_STATUS_TAG: Record<string, { key: string; color: string }> = {
  PENDING: { key: "dev.stPending", color: "default" },
  SENT: { key: "dev.stSent", color: "blue" },
  ACKED: { key: "dev.stAcked", color: "success" },
  FAILED: { key: "dev.stFailed", color: "red" },
};

export default function DevicesPage(props: { defaultTab?: string }) {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "devices"} items={[
      { key: "devices", label: t("dev.tabDevices"), children: <DevicesTab /> },
      { key: "cmds", label: t("dev.tabCmds"), children: <CmdsTab /> },
      { key: "ota", label: t("dev.tabOta"), children: <OtaTab /> },
    ]} />
  );
}

// ---- 设备列表 ----

function DevicesTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<DeviceView | null>(null);
  const [shadow, setShadow] = useState<DeviceShadowResp | null>(null);
  const [topology, setTopology] = useState<{ nodes: { node_id: string; parent_id: string; node_type: string; node_name: string }[] } | null>(null);
  const [cmdTarget, setCmdTarget] = useState<DeviceView | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ sn: string; secret: string }[] | null>(null);
  const actionRef = useRef<ActionType | undefined>(undefined);

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

  const columns: ProColumns<DeviceView>[] = [
    { title: "SN", dataIndex: "sn", search: false, render: (_, d) => <a onClick={() => void openDetail(d)}>{d.sn}</a> },
    { title: t("dev.product"), dataIndex: "product_key", search: false },
    { title: t("dev.model"), dataIndex: "model", search: false },
    { title: t("common.status"), dataIndex: "status", search: false, render: (_, d) => <Tag color={STATUS_TAG[d.status]?.color}>{STATUS_TAG[d.status] ? t(STATUS_TAG[d.status].key) : d.status}</Tag> },
    { title: t("dev.sourceOrder"), dataIndex: "order_no", search: false, render: (_, d) => d.order_no || "—" },
    { title: t("dev.credential"), dataIndex: "has_secret", search: false, render: (_, d) => (d.has_secret ? <Tag color="green">{t("dev.credReady")}</Tag> : <Tag>{t("dev.credNone")}</Tag>) },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, d) => (<Space>
        <Perm code="asset:device:cmd"><Button size="small" onClick={() => setCmdTarget(d)}>{t("dev.cmd")}</Button></Perm>
        <Perm code="asset:device:activate">{d.status === "OUT" && <Button size="small" type="link" onClick={async () => {
          await post(`/devices/${d.device_id}/activate`, {});
          message.success(t("dev.activated"));
          actionRef.current?.reload();
        }}>{t("dev.activate")}</Button>}</Perm>
        <Perm code="asset:device:transition">{["ACTIVATED", "RETIRED", "IN_STOCK", "OUT"].includes(d.status) && <Button size="small" type="link" danger onClick={async () => {
          const to = d.status === "ACTIVATED" ? "RETIRED" : "SCRAPPED";
          await post(`/devices/${d.device_id}/transition`, { to_status: to, reason: t("dev.manualReason") });
          message.success(t("dev.migrated", { status: to }));
          actionRef.current?.reload();
        }}>{d.status === "ACTIVATED" ? t("dev.retire") : t("dev.scrap")}</Button>}</Perm>
      </Space>),
    },
  ];

  return (<>
    <ProTable<DeviceView>
      headerTitle={t("dev.tabDevices")}
      rowKey="device_id"
      size="small"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ keyword, status }}
      request={async (params) => {
        const resp = await get<{ list: DeviceView[]; total: number }>(
          `/devices?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(keyword)}&status=${status}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={{ defaultPageSize: 10, showSizeChanger: true }}
      toolBarRender={() => [
        <Input.Search key="kw" placeholder={t("dev.searchPlaceholder")} allowClear style={{ width: 220 }} onSearch={(v) => setKeyword(v)} />,
        <Select key="status" allowClear placeholder={t("common.status")} style={{ width: 130 }} value={status || undefined}
          onChange={(v) => setStatus(v ?? "")}
          options={Object.entries(STATUS_TAG).map(([v, m]) => ({ value: v, label: t(m.key) }))} />,
        <Perm key="import" code="asset:device:create"><Button type="primary" icon={<PlusOutlined />} onClick={() => setImportOpen(true)}>{t("dev.importSn")}</Button></Perm>,
      ]}
    />

    {/* 详情抽屉：影子卡片 + 拓扑 */}
    <Drawer title={t("dev.detailTitle", { sn: detail?.sn ?? "" })} width={620} open={!!detail} onClose={() => setDetail(null)}>
      {detail && (<>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="SN">{detail.sn}</Descriptions.Item>
          <Descriptions.Item label={t("common.status")}><Tag color={STATUS_TAG[detail.status]?.color}>{STATUS_TAG[detail.status] ? t(STATUS_TAG[detail.status].key) : detail.status}</Tag></Descriptions.Item>
          <Descriptions.Item label={t("dev.product")}>{detail.product_key}</Descriptions.Item>
          <Descriptions.Item label={t("dev.model")}>{detail.model || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("dev.batch")}>{detail.batch_no || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("dev.activatedAt")}>{detail.activated_at ? new Date(detail.activated_at).toLocaleString(getLocale()) : "—"}</Descriptions.Item>
        </Descriptions>
        <Typography.Title level={5} style={{ marginTop: 16 }}>{t("dev.shadow")}</Typography.Title>
        {shadow ? (<Descriptions column={2} size="small" bordered>
          {shadow.metrics.map((m) => (
            <Descriptions.Item key={m.key} label={m.key}>{m.value}</Descriptions.Item>
          ))}
          <Descriptions.Item label={t("dev.timestamp")} span={2}>{shadow.ts ? new Date(shadow.ts).toLocaleString(getLocale()) : "—"}</Descriptions.Item>
        </Descriptions>) : <Typography.Text type="secondary">{t("dev.noTelemetry")}</Typography.Text>}
        <Typography.Title level={5} style={{ marginTop: 16 }}>{t("dev.topology")}</Typography.Title>
        {topology && topology.nodes.length > 0 ? (
          <Steps direction="vertical" size="small" items={topology.nodes.map((n) => ({ title: n.node_type, description: n.node_name || undefined }))} />
        ) : <Typography.Text type="secondary">{t("dev.noTopology")}</Typography.Text>}
        <Perm code="asset:device:credential">
          <Button style={{ marginTop: 16 }} onClick={async () => {
            const out = await post<{ sn: string; secret: string }>(`/devices/${detail.device_id}/credential`, {});
            Modal.info({ title: t("dev.credRebuilt"), content: <Typography.Paragraph copyable>{out.secret}</Typography.Paragraph> });
          }}>{t("dev.reissueCred")}</Button>
        </Perm>
      </>)}
    </Drawer>

    {/* 指令下发弹窗（step-up 由后端 10406 触发全局提级弹窗） */}
    <CmdModal sn={cmdTarget?.sn ?? ""} onClose={() => { setCmdTarget(null); actionRef.current?.reload(); }} open={!!cmdTarget} />

    <ImportModal open={importOpen} onClose={() => { setImportOpen(false); actionRef.current?.reload(); }} onResult={setImportResult} result={importResult} />
  </>);
}

function CmdModal({ sn, open, onClose }: { sn: string; open: boolean; onClose: () => void }) {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title={t("dev.cmdTitle", { sn })} open={open} onCancel={onClose} okText={t("dev.send")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onOk={async () => {
      const v = await form.validateFields();
      await post("/devices/commands", { sn, cmd_type: v.cmd_type, params_json: v.params_json || "" });
      message.success(t("dev.cmdSent"));
      onClose();
    }}>
      <Form form={form} layout="vertical" initialValues={{ cmd_type: "QUERY" }}>
        <Form.Item name="cmd_type" label={t("dev.cmdType")} rules={[{ required: true, message: t("common.required") }]}>
          <Select options={[
            { value: "QUERY", label: t("dev.cmdQuery") },
            { value: "REBOOT", label: t("dev.cmdReboot") },
            { value: "RELAY_SET", label: t("dev.cmdRelay") },
            { value: "SET_PARAM", label: t("dev.cmdParam") },
            { value: "PING", label: t("dev.cmdPing") },
          ]} />
        </Form.Item>
        <Form.Item name="params_json" label={t("dev.cmdParams")}>
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
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  return (
    <Modal title={t("dev.importTitle")} open={open} onCancel={() => { onClose(); onResult(null); }}
      footer={null} width={640}>
      <Form form={form} layout="vertical" onFinish={async (v) => {
        const items = String(v.sns).split("\n").map((s: string) => s.trim()).filter(Boolean).map((sn: string) => ({ sn, product_key: v.product_key }));
        const out = await post<{ imported: number; secrets: { sn: string; secret: string }[]; provision_errors: string[] }>("/devices/import", { items, provision: true });
        message.success(t("dev.imported", { count: out.imported, warnings: out.provision_errors.length }));
        onResult(out.secrets);
      }}>
        <Form.Item name="product_key" label={t("dev.productKey")} rules={[{ required: true, message: t("common.required") }]} initialValue="ESS-DEMO">
          <Input />
        </Form.Item>
        <Form.Item name="sns" label={t("dev.snList")} rules={[{ required: true, message: t("common.required") }]}>
          <Input.TextArea rows={6} placeholder={"SN-0001\nSN-0002"} />
        </Form.Item>
        <Button type="primary" htmlType="submit">{t("dev.import")}</Button>
      </Form>
      {result && (<>
        <Typography.Title level={5} style={{ marginTop: 16 }}>{t("dev.secretCsv")}</Typography.Title>
        <Input.TextArea rows={6} readOnly value={result.map((r) => `${r.sn},${r.secret}`).join("\n")} />
      </>)}
    </Modal>
  );
}

// ---- 指令记录 ----

function CmdsTab() {
  const { t } = usePrefs();
  const [sn, setSn] = useState("");
  const [status, setStatus] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<CmdView>[] = [
    { title: t("dev.cmdId"), dataIndex: "cmd_id" },
    { title: "SN", dataIndex: "sn" },
    { title: t("audit.cmd"), dataIndex: "cmd_type" },
    { title: t("common.status"), dataIndex: "status", render: (_, r) => <Tag color={CMD_STATUS_TAG[r.status]?.color}>{CMD_STATUS_TAG[r.status] ? t(CMD_STATUS_TAG[r.status].key) : r.status}</Tag> },
    { title: t("dev.retry"), dataIndex: "retry_count" },
    { title: t("dev.failReason"), dataIndex: "fail_reason", ellipsis: true, render: (_, r) => r.fail_reason || "—" },
    { title: t("dev.sentAt"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
  ];

  return (
    <ProTable<CmdView>
      headerTitle={t("dev.tabCmds")}
      rowKey="cmd_id"
      size="small"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ sn, status }}
      request={async (params) => {
        const resp = await get<{ list: CmdView[]; total: number }>(
          `/device-cmds?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&sn=${encodeURIComponent(sn)}&status=${status}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={{ defaultPageSize: 10, showSizeChanger: true }}
      toolBarRender={() => [
        <Input.Search key="sn" placeholder="SN" allowClear style={{ width: 200 }} onSearch={(v) => setSn(v)} />,
        <Select key="status" allowClear placeholder={t("common.status")} style={{ width: 130 }} value={status || undefined} onChange={(v) => setStatus(v ?? "")}
          options={Object.entries(CMD_STATUS_TAG).map(([v, m]) => ({ value: v, label: t(m.key) }))} />,
      ]}
    />
  );
}

// ---- OTA 任务 ----

const OTA_STATUS: Record<string, { key: string; color: string }> = {
  CREATED: { key: "dev.otaStCreated", color: "default" },
  RUNNING: { key: "dev.otaStRunning", color: "blue" },
  PAUSED: { key: "dev.otaStPaused", color: "orange" },
  DONE: { key: "dev.otaStDone", color: "success" },
  CANCELLED: { key: "dev.otaStCancelled", color: "default" },
  ROLLED_BACK: { key: "dev.otaStRolledBack", color: "red" },
};

function OtaTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<OtaTaskView | null>(null);
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<OtaTaskView>[] = [
    {
      title: t("dev.otaTaskNo"),
      dataIndex: "task_no",
      render: (_, task) => <a onClick={async () => setDetail(await get<OtaTaskView>(`/ota-tasks/${task.task_id}`))}>{task.task_no}</a>,
    },
    { title: t("parties.name"), dataIndex: "name" },
    { title: t("dev.product"), dataIndex: "product_key" },
    { title: t("common.status"), dataIndex: "status", render: (_, task) => <Tag color={OTA_STATUS[task.status]?.color}>{OTA_STATUS[task.status] ? t(OTA_STATUS[task.status].key) : task.status}</Tag> },
    { title: t("dev.progress"), render: (_, task) => t("dev.progressDetail", { success: task.success_count, total: task.total, failed: task.fail_count }) },
    { title: t("dev.failThreshold"), dataIndex: "fail_threshold_pct", render: (_, task) => `${task.fail_threshold_pct}%` },
    { title: t("dev.pauseReason"), dataIndex: "fail_reason", ellipsis: true, render: (_, task) => task.fail_reason || "—" },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, task) => (
        <Perm code="asset:ota:rollback">
          {["RUNNING", "PAUSED", "DONE"].includes(task.status) && <Button size="small" danger onClick={async () => {
            await post(`/ota-tasks/${task.task_id}/rollback`, { reason: t("dev.manualReason") });
            message.success(t("dev.rolledBack"));
            actionRef.current?.reload();
          }}>{t("dev.rollback")}</Button>}
        </Perm>
      ),
    },
  ];

  return (<>
    <ProTable<OtaTaskView>
      headerTitle={t("dev.tabOta")}
      rowKey="task_id"
      size="small"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ status }}
      request={async (params) => {
        const resp = await get<{ list: OtaTaskView[]; total: number }>(
          `/ota-tasks?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&status=${status}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={{ defaultPageSize: 10, showSizeChanger: true }}
      toolBarRender={() => [
        <Select key="status" allowClear placeholder={t("common.status")} style={{ width: 130 }} value={status || undefined} onChange={(v) => setStatus(v ?? "")}
          options={Object.entries(OTA_STATUS).map(([v, m]) => ({ value: v, label: t(m.key) }))} />,
        <Perm key="create" code="asset:ota:task"><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t("dev.createOta")}</Button></Perm>,
      ]}
    />

    <OtaCreateModal open={createOpen} onClose={() => { setCreateOpen(false); actionRef.current?.reload(); }} />

    <Drawer title={t("dev.otaDetailTitle", { no: detail?.task_no ?? "" })} width={720} open={!!detail} onClose={() => setDetail(null)}>
      {detail && (<>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label={t("common.status")}><Tag color={OTA_STATUS[detail.status]?.color}>{OTA_STATUS[detail.status] ? t(OTA_STATUS[detail.status].key) : detail.status}</Tag></Descriptions.Item>
          <Descriptions.Item label={t("dev.targetFirmware")}>{detail.firmware_id}</Descriptions.Item>
          <Descriptions.Item label={t("dev.batchSize")}>{detail.batch_size}</Descriptions.Item>
          <Descriptions.Item label={t("dev.rollbackFirmware")}>{detail.rollback_firmware_id || "—"}</Descriptions.Item>
        </Descriptions>
        <Table style={{ marginTop: 12 }} rowKey="id" size="small" pagination={false} dataSource={detail.devices}
          columns={[
            { title: "SN", dataIndex: "sn" },
            { title: t("common.status"), dataIndex: "status", render: (v: string) => <Tag>{v}</Tag> },
            { title: t("dev.retry"), dataIndex: "retry_count" },
            { title: t("audit.error"), dataIndex: "error", ellipsis: true, render: (v: string) => v || "—" },
          ]} />
      </>)}
    </Drawer>
  </>);
}

function OtaCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [fws, setFws] = useState<FirmwareView[]>([]);
  const openFetch = async () => {
    const out = await get<{ list: FirmwareView[] }>("/firmwares?page=1&size=100");
    setFws(out.list);
  };
  return (
    <Modal title={t("dev.otaCreateTitle")} open={open} onCancel={onClose} afterOpenChange={(o) => o && openFetch()}
      okText={t("dev.create")} cancelText={t("common.cancel")}
      onOk={async () => {
        const v = await form.validateFields();
        await post("/ota-tasks", {
          name: v.name, product_key: v.product_key,
          firmware_id: v.firmware_id, rollback_firmware_id: v.rollback_firmware_id || "",
          batch_size: Number(v.batch_size) || 50,
          device_ids: String(v.device_ids || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        });
        message.success(t("dev.otaCreated"));
        onClose();
      }}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("dev.taskName")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
        <Form.Item name="product_key" label={t("dev.targetProduct")} rules={[{ required: true, message: t("common.required") }]} initialValue="ESS-DEMO"><Input /></Form.Item>
        <Form.Item name="firmware_id" label={t("dev.targetFirmware")} rules={[{ required: true, message: t("common.required") }]}>
          <Select options={fws.map((f) => ({ value: f.firmware_id, label: `${f.product_key} v${f.version} (${f.firmware_id})` }))} />
        </Form.Item>
        <Form.Item name="rollback_firmware_id" label={t("dev.rollbackFwOptional")}>
          <Select allowClear options={fws.map((f) => ({ value: f.firmware_id, label: `${f.product_key} v${f.version}` }))} />
        </Form.Item>
        <Form.Item name="batch_size" label={t("dev.batchSize")} initialValue={50}><Input /></Form.Item>
        <Form.Item name="device_ids" label={t("dev.grayDeviceIds")}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
