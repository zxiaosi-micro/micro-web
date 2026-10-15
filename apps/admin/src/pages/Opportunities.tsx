// Opportunities.tsx · 商机看板（S4-05）：阶段列看板（NEW→…→WON/LOST）+ 新建 + 阶段推进。
// 约定：ID string（E8）；列表数据按 stage 分列渲染；拖列简化为下拉选择推进。

import { useEffect, useState } from "react";
import { App, Button, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, put } from "@micro/shared";
import { usePrefs } from "@micro/shared/prefs";
import type { OpportunityItem } from "@micro/shared/types";

const STAGES = ["NEW", "CONTACTING", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
const STAGE_COLOR: Record<string, string> = {
  NEW: "default", CONTACTING: "blue", PROPOSAL: "gold", NEGOTIATION: "orange", WON: "green", LOST: "red",
};

export default function OpportunitiesPage() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [list, setList] = useState<OpportunityItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const r = await get<{ list: OpportunityItem[]; total: number }>("/opportunities?page=1&size=100");
    setList(r.list ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    const values = await form.validateFields();
    await post("/opportunities", values);
    message.success(t("common.saved"));
    setCreateOpen(false);
    void load();
  };

  const changeStage = async (id: string, stage: string) => {
    await put(`/opportunities/${id}/stage`, { stage });
    message.success(t("opps.stageAdvanced"));
    void load();
  };

  return (
    <>
      <Typography.Title level={4}>{t("opps.title")}</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="party:opportunity:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>{t("opps.create")}</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t("common.refresh")}</Button>
      </Space>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto" }}>
        {STAGES.map((stage) => {
          const items = list.filter((o) => o.stage === stage);
          return (
            <div key={stage} style={{ flex: "1 1 0", minWidth: 220, background: "var(--hover-bg, #fafafa)", borderRadius: 8, padding: 8 }}>
              <Space style={{ marginBottom: 8 }}>
                <Tag color={STAGE_COLOR[stage]}>{stage}</Tag>
                <Typography.Text type="secondary">{items.length}</Typography.Text>
              </Space>
              {items.map((o) => (
                <div key={o.opportunity_id} style={{ background: "var(--card-bg, #fff)", border: "1px solid var(--pref-border, #f0f0f0)", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                  <Typography.Text strong>{o.title}</Typography.Text>
                  <div>
                    <Typography.Text type="secondary">{t("opps.customer", { id: o.party_id })}</Typography.Text>
                  </div>
                  {o.amount && (
                    <div>
                      <Typography.Text>¥{o.amount}</Typography.Text>
                    </div>
                  )}
                  <Perm code="party:opportunity:update">
                    <Select size="small" style={{ marginTop: 4, width: "100%" }} value={o.stage}
                      onChange={(v) => void changeStage(o.opportunity_id, v)}
                      options={STAGES.map((s) => ({ value: s, label: s }))} />
                  </Perm>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <Modal title={t("opps.create")} open={createOpen} onOk={() => void create()} onCancel={() => setCreateOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="party_id" label={t("opps.partyId")} rules={[{ required: true, message: t("common.required") }]}>
            <Input placeholder={t("opps.partyIdPlaceholder")} />
          </Form.Item>
          <Form.Item name="title" label={t("opps.oppTitle")} rules={[{ required: true, message: t("common.required") }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label={t("opps.amount")}>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label={t("parties.remark")}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
