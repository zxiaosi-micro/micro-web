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
import { enumLabel, getLocale, usePrefs } from "@micro/shared/prefs";
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
  const { t } = usePrefs();
  return (
    <Tabs
      items={[
        { key: "alerts", label: t("ops.tabAlerts"), children: <AlertsTab stationId={props.stationId} /> },
        { key: "tickets", label: t("ops.tabTickets"), children: <TicketsTab stationId={props.stationId} /> },
        { key: "inspection", label: t("ops.tabInspection"), children: <InspectionTab stationId={props.stationId} /> },
      ]}
    />
  );
}

// ---------- 告警 ----------

function AlertsTab(props: { stationId: string }) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<string>("OPEN");
  const alerts = usePolling(() => listAlerts(props.stationId, status || undefined));
  const [transferOpen, setTransferOpen] = useState<AlertView | null>(null);
  const [closeOpen, setCloseOpen] = useState<AlertView | null>(null);

  const columns = [
    { title: t("ops.level"), dataIndex: "level", render: (v: string) => <Tag color={v === "P1" ? "red" : v === "P2" ? "orange" : "blue"}>{v}</Tag> },
    { title: t("ops.titleCol"), dataIndex: "title" },
    { title: t("ops.source"), dataIndex: "source", width: 120 },
    { title: t("ops.aggregate"), dataIndex: "aggregate_count", width: 70 },
    { title: t("common.status"), dataIndex: "status", width: 90 },
    { title: t("ops.firstSeen"), dataIndex: "first_seen_at", render: (v: number) => (v ? new Date(v).toLocaleString(getLocale()) : "-") },
    {
      title: t("common.actions"),
      render: (_: unknown, a: AlertView) => (
        <>
          {a.status === "OPEN" && (
            <Button size="small" onClick={async () => { await ackAlert(a.alert_id); void alerts.refresh(); }}>
              {t("ops.ack")}
            </Button>
          )}{" "}
          {(a.status === "OPEN" || a.status === "ACKED") && (
            <>
              <Button size="small" type="primary" onClick={() => setTransferOpen(a)}>
                {t("ops.toTicket")}
              </Button>{" "}
              <Button size="small" onClick={() => setCloseOpen(a)}>
                {t("ops.close")}
              </Button>
            </>
          )}
          {a.status === "CLOSED" && (
            <Button size="small" onClick={async () => { await post(`/alerts/${a.alert_id}/archive`, {}); void alerts.refresh(); }}>
              {t("ops.archive")}
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <Select value={status} onChange={setStatus} style={{ width: 140, marginBottom: 12 }}>
        <Select.Option value="OPEN">{t("ops.stOpen")}</Select.Option>
        <Select.Option value="ACKED">{t("ops.stAcked")}</Select.Option>
        <Select.Option value="CLOSED">{t("ops.stClosed")}</Select.Option>
        <Select.Option value="">{t("common.all")}</Select.Option>
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
        title={t("ops.closeTitle")}
        open={!!closeOpen}
        okText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onCancel={() => setCloseOpen(null)}
        onOk={async () => {
          if (!closeOpen) return;
          await closeAlert(closeOpen.alert_id, t("ops.closeReason"));
          message.success(t("ops.closed"));
          setCloseOpen(null);
          void alerts.refresh();
        }}
      >
        {t("ops.closeHint")}
      </Modal>
    </>
  );
}

function TransferModal(props: { alert: AlertView | null; stationId: string; onClose: () => void; onDone: () => void }) {
  const { t } = usePrefs();
  const [auto, setAuto] = useState(true);
  return (
    <Modal
      title={t("ops.transferTitle")}
      open={!!props.alert}
      okText={t("common.confirm")}
      cancelText={t("common.cancel")}
      onCancel={props.onClose}
      footer={[
        <Button key="cancel" onClick={props.onClose}>{t("common.cancel")}</Button>,
        <Button
          key="ok"
          type="primary"
          onClick={async () => {
            if (!props.alert) return;
            const out = await transferAlert(props.alert.alert_id, auto);
            message.success(auto ? t("ops.generatedAuto", { no: out.ticket_no }) : t("ops.generated", { no: out.ticket_no }));
            props.onClose();
            props.onDone();
          }}
        >
          {auto ? t("ops.generateAuto") : t("ops.generate")}
        </Button>,
      ]}
    >
      <p>{props.alert?.title}</p>
      <label>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t("ops.autoDispatch")}
      </label>
    </Modal>
  );
}

// ---------- 工单 ----------

function TicketsTab(props: { stationId: string }) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<string>("DISPATCHED");
  const tickets = usePolling(() => listTickets(props.stationId, status || undefined));
  const [detail, setDetail] = useState<string | null>(null);

  const columns = [
    { title: t("ops.ticketNo"), dataIndex: "ticket_no", width: 150 },
    { title: t("ops.titleCol"), dataIndex: "title" },
    { title: t("ops.priority"), dataIndex: "priority", render: (v: string) => <Tag color={v === "P1" ? "red" : "blue"}>{v}</Tag> },
    { title: t("ops.assignee"), dataIndex: "assignee_name", width: 100 },
    { title: t("ops.escalate"), dataIndex: "escalate_level", width: 60 },
    { title: t("common.status"), dataIndex: "status", width: 140, render: (v: string) => enumLabel("enum.ticket", v) },
    {
      title: t("common.actions"),
      render: (_: unknown, tk: TicketView) => (
        <TicketActions
          stationId={props.stationId}
          ticket={tk}
          onDone={() => void tickets.refresh()}
          onDetail={(id) => setDetail(id)}
        />
      ),
    },
  ];

  return (
    <>
      <Select value={status} onChange={setStatus} style={{ width: 160, marginBottom: 12 }}>
        <Select.Option value="DISPATCHED">{t("ops.stDispatched")}</Select.Option>
        <Select.Option value="ACCEPTED">{t("ops.stAccepted")}</Select.Option>
        <Select.Option value="PROCESSING">{t("ops.stProcessing")}</Select.Option>
        <Select.Option value="SUBMITTED">{t("ops.stSubmitted")}</Select.Option>
        <Select.Option value="">{t("common.all")}</Select.Option>
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
  const { t } = usePrefs();
  const tk = props.ticket;
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const ok = (msg: string) => {
    message.success(msg);
    props.onDone();
  };
  return (
    <>
      {tk.status === "PENDING_DISPATCH" && (
        <Button size="small" type="primary" onClick={() => setDispatchOpen(true)}>{t("ops.dispatch")}</Button>
      )}
      {tk.status === "DISPATCHED" && (
        <Button size="small" type="primary" onClick={async () => { await acceptTicket(tk.ticket_id); ok(t("ops.accepted")); }}>{t("ops.accept")}</Button>
      )}
      {tk.status === "ACCEPTED" && (
        <Button size="small" type="primary" onClick={async () => { await startTicket(tk.ticket_id); ok(t("ops.started")); }}>{t("ops.start")}</Button>
      )}
      {tk.status === "PROCESSING" && (
        <Button size="small" type="primary" onClick={() => setSubmitOpen(true)}>{t("common.submit")}</Button>
      )}
      <Button size="small" onClick={() => props.onDetail(tk.ticket_id)}>{t("common.detail")}</Button>
      <DispatchModal open={dispatchOpen} stationId={props.stationId} ticket={tk} onClose={() => setDispatchOpen(false)} onDone={() => { setDispatchOpen(false); ok(t("ops.dispatched")); }} />
      <SubmitModal open={submitOpen} ticket={tk} onClose={() => setSubmitOpen(false)} onDone={() => { setSubmitOpen(false); ok(t("ops.submittedOk")); }} />
    </>
  );
}

function DispatchModal(props: { open: boolean; stationId: string; ticket: TicketView; onClose: () => void; onDone: () => void }) {
  const { t } = usePrefs();
  const [staff, setStaff] = useState<{ user_id: string; name: string }[]>([]);
  const [uid, setUid] = useState<string>("");
  useMemo(() => {
    if (props.open) {
      void matchStaff(props.stationId).then((out) => setStaff(out.list ?? []));
    }
  }, [props.open, props.stationId]);
  return (
    <Modal
      title={t("ops.dispatchTitle", { no: props.ticket.ticket_no })}
      open={props.open}
      okText={t("common.confirm")}
      cancelText={t("common.cancel")}
      onCancel={props.onClose}
      onOk={async () => {
        await dispatchTicket(props.ticket.ticket_id, uid);
        props.onDone();
      }}
    >
      <Form layout="vertical">
        <Form.Item label={t("ops.assigneeLabel")}>
          <Select value={uid} onChange={setUid} style={{ width: "100%" }} placeholder={t("ops.autoMatch")}>
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
  const { t } = usePrefs();
  const [result, setResult] = useState("");
  return (
    <Modal
      title={t("ops.submitTitle", { no: props.ticket.ticket_no })}
      open={props.open}
      okText={t("common.confirm")}
      cancelText={t("common.cancel")}
      onCancel={props.onClose}
      onOk={async () => {
        await submitTicket(props.ticket.ticket_id, result);
        props.onDone();
      }}
    >
      <Input.TextArea value={result} onChange={(e) => setResult(e.target.value)} placeholder={t("ops.resultPlaceholder")} rows={3} />
    </Modal>
  );
}

function DetailDrawer(props: { ticketId: string | null; onClose: () => void }) {
  const { t } = usePrefs();
  const [data, setData] = useState<import("@micro/shared/types").TicketGetResp | null>(null);
  useMemo(() => {
    if (props.ticketId) {
      void getTicket(props.ticketId).then(setData);
    } else {
      setData(null);
    }
  }, [props.ticketId]);
  return (
    <Drawer title={data?.ticket?.ticket_no ?? t("ops.detailTitle")} open={!!props.ticketId} onClose={props.onClose} width={520}>
      {data && (
        <>
          <p><b>{data.ticket.title}</b></p>
          <p>{data.ticket.content}</p>
          <p>{t("ops.statusLine", { status: enumLabel("enum.ticket", data.ticket.status), assignee: data.ticket.assignee_name || "-" })}</p>
          <h4>{t("ops.timeline")}</h4>
          {(data.logs ?? []).map((g) => (
            <p key={g.log_id} style={{ fontSize: 12, color: "var(--text-sub, #666)" }}>
              {new Date(g.created_at).toLocaleString(getLocale())} · {g.action} {g.from_status && `(${enumLabel("enum.ticket", g.from_status)}→${enumLabel("enum.ticket", g.to_status)})`} {g.note}
            </p>
          ))}
        </>
      )}
    </Drawer>
  );
}

// ---------- 巡检 ----------

function InspectionTab(props: { stationId: string }) {
  const { t } = usePrefs();
  const tasks = usePolling(() => listInspectionTasks(props.stationId, "PENDING"));
  const [submitTask, setSubmitTask] = useState<InspectionTaskView | null>(null);

  const columns = [
    { title: t("ops.titleCol"), dataIndex: "title" },
    { title: t("ops.planTime"), dataIndex: "scheduled_for", render: (v: number) => (v ? new Date(v).toLocaleString(getLocale()) : "-") },
    { title: t("common.status"), dataIndex: "status", width: 100 },
    {
      title: t("common.actions"),
      render: (_: unknown, tk: InspectionTaskView) =>
        tk.status === "PENDING" && (
          <Button size="small" type="primary" onClick={() => setSubmitTask(tk)}>
            {t("ops.batchSubmit")}
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
            message.success(t("ops.inspSubmitted"));
            void tasks.refresh();
          }}
        />
      )}
    </Row>
  );
}

function SubmitInspection(props: { taskId: string; onClose: () => void; onDone: () => void }) {
  const { t } = usePrefs();
  const [detail, setDetail] = useState<import("@micro/shared/types").InspectionTaskGetResp | null>(null);
  const [values, setValues] = useState<Record<string, { result: string; anomalous: boolean }>>({});
  useState(() => {
    void getInspectionTask(props.taskId).then((out) => {
      // 提交前明细为空：用默认日巡 schema 兜底（station_created 自动建计划的模板口径）
      if (!out.items || out.items.length === 0) {
        const names = [t("ops.inspItem1"), t("ops.inspItem2"), t("ops.inspItem3")];
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
      title={t("ops.inspTitle")}
      open
      okText={t("common.confirm")}
      cancelText={t("common.cancel")}
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
                placeholder={t("ops.result")}
              />
            </Col>
            <Col span={6}>
              <label>
                <input
                  type="checkbox"
                  checked={v.anomalous}
                  onChange={(e) => setValues({ ...values, [it.item_id]: { ...v, anomalous: e.target.checked } })}
                />{" "}
                {t("ops.anomalous")}
              </label>
            </Col>
          </Row>
        );
      })}
    </Modal>
  );
}
