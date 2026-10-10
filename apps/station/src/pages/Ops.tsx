// Ops.tsx · 运维页（S7-03）：告警确认转工单 / 工单处理 / 巡检批量提交。
// 告警与工单列表 usePolling 10s 增量刷新（ADR-02）；写操作成功后手动 refresh。

import { useMemo, useState } from "react";
import {
  Button,
  Col,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Row,
  Select,
  Table,
  Tabs,
  Tag,
} from "antd";
import { post, usePolling } from "@micro/shared";
import type { AlertView, InspectionTaskView, TicketView } from "@micro/shared/types";
import {
  ackAlert,
  acceptTicket,
  closeAlert,
  dispatchTicket,
  getInspectionTask,
  getTicket,
  listAlerts,
  listInspectionTasks,
  listTickets,
  matchStaff,
  startTicket,
  submitInspection,
  submitTicket,
  transferAlert,
} from "../api";

export default function OpsPage(props: { stationId: string }) {
  return (
    <Tabs
      items={[
        { key: "alerts", label: "告警", children: <AlertsTab stationId={props.stationId} /> },
        { key: "tickets", label: "工单", children: <TicketsTab stationId={props.stationId} /> },
        { key: "inspection", label: "巡检", children: <InspectionTab stationId={props.stationId} /> },
      ]}
    />
  );
}

// ---------- 告警 ----------

function AlertsTab(props: { stationId: string }) {
  const [status, setStatus] = useState<string>("OPEN");
  const alerts = usePolling(() => listAlerts(props.stationId, status || undefined));
  const [transferOpen, setTransferOpen] = useState<AlertView | null>(null);
  const [closeOpen, setCloseOpen] = useState<AlertView | null>(null);

  const columns = [
    { title: "级别", dataIndex: "level", render: (v: string) => <Tag color={v === "P1" ? "red" : v === "P2" ? "orange" : "blue"}>{v}</Tag> },
    { title: "标题", dataIndex: "title" },
    { title: "来源", dataIndex: "source", width: 120 },
    { title: "聚合", dataIndex: "aggregate_count", width: 70 },
    { title: "状态", dataIndex: "status", width: 90 },
    { title: "首次", dataIndex: "first_seen_at", render: (v: number) => (v ? new Date(v).toLocaleString() : "-") },
    {
      title: "操作",
      render: (_: unknown, a: AlertView) => (
        <>
          {a.status === "OPEN" && (
            <Button size="small" onClick={async () => { await ackAlert(a.alert_id); void alerts.refresh(); }}>
              确认
            </Button>
          )}{" "}
          {(a.status === "OPEN" || a.status === "ACKED") && (
            <>
              <Button size="small" type="primary" onClick={() => setTransferOpen(a)}>
                转工单
              </Button>{" "}
              <Button size="small" onClick={() => setCloseOpen(a)}>
                关闭
              </Button>
            </>
          )}
          {a.status === "CLOSED" && (
            <Button size="small" onClick={async () => { await post(`/alerts/${a.alert_id}/archive`, {}); void alerts.refresh(); }}>
              归档
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <Select value={status} onChange={setStatus} style={{ width: 140, marginBottom: 12 }}>
        <Select.Option value="OPEN">未确认</Select.Option>
        <Select.Option value="ACKED">已确认</Select.Option>
        <Select.Option value="CLOSED">已关闭</Select.Option>
        <Select.Option value="">全部</Select.Option>
      </Select>
      <Table<AlertView>
        rowKey="alert_id"
        size="small"
        loading={alerts.loading}
        dataSource={alerts.data?.list ?? []}
        columns={columns as never}
        pagination={false}
      />
      <TransferModal alert={transferOpen} stationId={props.stationId} onClose={() => setTransferOpen(null)} onDone={() => void alerts.refresh()} />
      <Modal
        title="人工关闭告警"
        open={!!closeOpen}
        onCancel={() => setCloseOpen(null)}
        onOk={async () => {
          if (!closeOpen) return;
          await closeAlert(closeOpen.alert_id, "人工确认无需处理");
          message.success("已关闭");
          setCloseOpen(null);
          void alerts.refresh();
        }}
      >
        关闭前须填写人工原因（无关联工单时）。
      </Modal>
    </>
  );
}

function TransferModal(props: { alert: AlertView | null; stationId: string; onClose: () => void; onDone: () => void }) {
  const [auto, setAuto] = useState(true);
  return (
    <Modal
      title="告警转工单"
      open={!!props.alert}
      onCancel={props.onClose}
      footer={[
        <Button key="cancel" onClick={props.onClose}>取消</Button>,
        <Button
          key="ok"
          type="primary"
          onClick={async () => {
            if (!props.alert) return;
            const out = await transferAlert(props.alert.alert_id, auto);
            message.success(`已生成工单 ${out.ticket_no}${auto ? "并自动派单" : ""}`);
            props.onClose();
            props.onDone();
          }}
        >
          生成{auto ? "（自动派单）" : ""}
        </Button>,
      ]}
    >
      <p>{props.alert?.title}</p>
      <label>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 建单后自动派单（区域+技能匹配）
      </label>
    </Modal>
  );
}

// ---------- 工单 ----------

function TicketsTab(props: { stationId: string }) {
  const [status, setStatus] = useState<string>("DISPATCHED");
  const tickets = usePolling(() => listTickets(props.stationId, status || undefined));
  const [detail, setDetail] = useState<string | null>(null);

  const columns = [
    { title: "工单号", dataIndex: "ticket_no", width: 150 },
    { title: "标题", dataIndex: "title" },
    { title: "优先级", dataIndex: "priority", render: (v: string) => <Tag color={v === "P1" ? "red" : "blue"}>{v}</Tag> },
    { title: "受理人", dataIndex: "assignee_name", width: 100 },
    { title: "升级", dataIndex: "escalate_level", width: 60 },
    { title: "状态", dataIndex: "status", width: 140 },
    {
      title: "操作",
      render: (_: unknown, t: TicketView) => (
        <TicketActions
          stationId={props.stationId}
          ticket={t}
          onDone={() => void tickets.refresh()}
          onDetail={(id) => setDetail(id)}
        />
      ),
    },
  ];

  return (
    <>
      <Select value={status} onChange={setStatus} style={{ width: 160, marginBottom: 12 }}>
        <Select.Option value="DISPATCHED">待接单</Select.Option>
        <Select.Option value="ACCEPTED">已接单</Select.Option>
        <Select.Option value="PROCESSING">处理中</Select.Option>
        <Select.Option value="SUBMITTED">待验收</Select.Option>
        <Select.Option value="">全部</Select.Option>
      </Select>
      <Table<TicketView>
        rowKey="ticket_id"
        size="small"
        loading={tickets.loading}
        dataSource={tickets.data?.list ?? []}
        columns={columns as never}
        pagination={false}
      />
      <DetailDrawer ticketId={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function TicketActions(props: { stationId: string; ticket: TicketView; onDone: () => void; onDetail: (id: string) => void }) {
  const t = props.ticket;
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const ok = (msg: string) => {
    message.success(msg);
    props.onDone();
  };
  return (
    <>
      {t.status === "PENDING_DISPATCH" && (
        <Button size="small" type="primary" onClick={() => setDispatchOpen(true)}>派单</Button>
      )}
      {t.status === "DISPATCHED" && (
        <Button size="small" type="primary" onClick={async () => { await acceptTicket(t.ticket_id); ok("已接单"); }}>接单</Button>
      )}
      {t.status === "ACCEPTED" && (
        <Button size="small" type="primary" onClick={async () => { await startTicket(t.ticket_id); ok("已开工"); }}>开工</Button>
      )}
      {t.status === "PROCESSING" && (
        <Button size="small" type="primary" onClick={() => setSubmitOpen(true)}>提交</Button>
      )}
      <Button size="small" onClick={() => props.onDetail(t.ticket_id)}>详情</Button>
      <DispatchModal open={dispatchOpen} stationId={props.stationId} ticket={t} onClose={() => setDispatchOpen(false)} onDone={() => { setDispatchOpen(false); ok("已派单"); }} />
      <SubmitModal open={submitOpen} ticket={t} onClose={() => setSubmitOpen(false)} onDone={() => { setSubmitOpen(false); ok("已提交"); }} />
    </>
  );
}

function DispatchModal(props: { open: boolean; stationId: string; ticket: TicketView; onClose: () => void; onDone: () => void }) {
  const [staff, setStaff] = useState<{ user_id: string; name: string }[]>([]);
  const [uid, setUid] = useState<string>("");
  useMemo(() => {
    if (props.open) {
      void matchStaff(props.stationId).then((out) => setStaff(out.list ?? []));
    }
  }, [props.open, props.stationId]);
  return (
    <Modal
      title={`派单：${props.ticket.ticket_no}`}
      open={props.open}
      onCancel={props.onClose}
      onOk={async () => {
        await dispatchTicket(props.ticket.ticket_id, uid);
        props.onDone();
      }}
    >
      <Form layout="vertical">
        <Form.Item label="受理人（区域+技能候选）">
          <Select value={uid} onChange={setUid} style={{ width: "100%" }} placeholder="自动匹配">
            {staff.map((s) => (
              <Select.Option key={s.user_id} value={s.user_id}>
                {s.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function SubmitModal(props: { open: boolean; ticket: TicketView; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState("");
  return (
    <Modal
      title={`提交处理结果：${props.ticket.ticket_no}`}
      open={props.open}
      onCancel={props.onClose}
      onOk={async () => {
        await submitTicket(props.ticket.ticket_id, result);
        props.onDone();
      }}
    >
      <Input.TextArea value={result} onChange={(e) => setResult(e.target.value)} placeholder="处理结果说明" rows={3} />
    </Modal>
  );
}

function DetailDrawer(props: { ticketId: string | null; onClose: () => void }) {
  const [data, setData] = useState<import("@micro/shared/types").TicketGetResp | null>(null);
  useMemo(() => {
    if (props.ticketId) {
      void getTicket(props.ticketId).then(setData);
    } else {
      setData(null);
    }
  }, [props.ticketId]);
  return (
    <Drawer title={data?.ticket?.ticket_no ?? "工单详情"} open={!!props.ticketId} onClose={props.onClose} width={520}>
      {data && (
        <>
          <p><b>{data.ticket.title}</b></p>
          <p>{data.ticket.content}</p>
          <p>状态：{data.ticket.status} ｜ 受理人：{data.ticket.assignee_name || "-"}</p>
          <h4>时间线</h4>
          {(data.logs ?? []).map((g) => (
            <p key={g.log_id} style={{ fontSize: 12, color: "#666" }}>
              {new Date(g.created_at).toLocaleString()} · {g.action} {g.from_status && `(${g.from_status}→${g.to_status})`} {g.note}
            </p>
          ))}
        </>
      )}
    </Drawer>
  );
}

// ---------- 巡检 ----------

function InspectionTab(props: { stationId: string }) {
  const tasks = usePolling(() => listInspectionTasks(props.stationId, "PENDING"));
  const [submitTask, setSubmitTask] = useState<InspectionTaskView | null>(null);

  const columns = [
    { title: "任务", dataIndex: "title" },
    { title: "计划时刻", dataIndex: "scheduled_for", render: (v: number) => (v ? new Date(v).toLocaleString() : "-") },
    { title: "状态", dataIndex: "status", width: 100 },
    {
      title: "操作",
      render: (_: unknown, t: InspectionTaskView) =>
        t.status === "PENDING" && (
          <Button size="small" type="primary" onClick={() => setSubmitTask(t)}>
            批量提交
          </Button>
        ),
    },
  ];

  return (
    <Row>
      <Col span={16}>
        <Table<InspectionTaskView>
          rowKey="task_id"
          size="small"
          loading={tasks.loading}
          dataSource={tasks.data?.list ?? []}
          columns={columns as never}
          pagination={false}
        />
      </Col>
      {submitTask && (
        <SubmitInspection
          taskId={submitTask.task_id}
          onClose={() => setSubmitTask(null)}
          onDone={() => {
            setSubmitTask(null);
            message.success("巡检已提交（异常项已生成工单）");
            void tasks.refresh();
          }}
        />
      )}
    </Row>
  );
}

function SubmitInspection(props: { taskId: string; onClose: () => void; onDone: () => void }) {
  const [detail, setDetail] = useState<import("@micro/shared/types").InspectionTaskGetResp | null>(null);
  const [values, setValues] = useState<Record<string, { result: string; anomalous: boolean }>>({});
  useState(() => {
    void getInspectionTask(props.taskId).then((out) => {
      // 提交前明细为空：用默认日巡 schema 兜底（station_created 自动建计划的模板口径）
      if (!out.items || out.items.length === 0) {
        const names = ["外观检查", "连接紧固", "异味异响"];
        const items = names.map((name, i) => ({
          item_id: String(i),
          task_id: out.task?.task_id ?? props.taskId,
          name,
          result: "",
          anomalous: false,
          ticket_id: "0",
        }));
        setDetail({ ...out, items });
        setValues(Object.fromEntries(items.map((it) => [it.item_id, { result: "", anomalous: false }])));
        return;
      }
      setDetail(out);
      const init: Record<string, { result: string; anomalous: boolean }> = {};
      for (const it of out.items ?? []) {
        init[it.item_id] = { result: it.result ?? "", anomalous: it.anomalous };
      }
      setValues(init);
    });
  });

  return (
    <Modal
      title="巡检批量提交"
      open
      onCancel={props.onClose}
      width={640}
      onOk={async () => {
        const items = Object.entries(values).map(([itemId, v]) => ({
          name: detail?.items?.find((x) => x.item_id === itemId)?.name ?? itemId,
          result: v.result,
          anomalous: v.anomalous,
        }));
        await submitInspection(props.taskId, items, "116.397,39.908");
        props.onDone();
      }}
    >
      {(detail?.items ?? []).map((it) => {
        const v = values[it.item_id] ?? { result: "", anomalous: false };
        return (
          <Row key={it.item_id} gutter={8} style={{ marginBottom: 8 }}>
            <Col span={8}>{it.name}</Col>
            <Col span={10}>
              <Input
                size="small"
                value={v.result}
                onChange={(e) => setValues({ ...values, [it.item_id]: { ...v, result: e.target.value } })}
                placeholder="结果"
              />
            </Col>
            <Col span={6}>
              <label>
                <input
                  type="checkbox"
                  checked={v.anomalous}
                  onChange={(e) => setValues({ ...values, [it.item_id]: { ...v, anomalous: e.target.checked } })}
                />{" "}
                异常（生成工单）
              </label>
            </Col>
          </Row>
        );
      })}
    </Modal>
  );
}
