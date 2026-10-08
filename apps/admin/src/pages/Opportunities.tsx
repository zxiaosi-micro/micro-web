// Opportunities.tsx · 商机看板（S4-05）：阶段列看板（NEW→…→WON/LOST）+ 新建 + 阶段推进。
// 约定：ID string（E8）；列表数据按 stage 分列渲染；拖列简化为下拉选择推进。

import { useEffect, useState } from "react";
import { App, Button, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, put } from "@micro/shared";
import type { OpportunityItem } from "@micro/shared/types";

const STAGES = ["NEW", "CONTACTING", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
const STAGE_COLOR: Record<string, string> = {
  NEW: "default", CONTACTING: "blue", PROPOSAL: "gold", NEGOTIATION: "orange", WON: "green", LOST: "red",
};

export default function OpportunitiesPage() {
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
    message.success("已创建");
    setCreateOpen(false);
    void load();
  };

  const changeStage = async (id: string, stage: string) => {
    await put(`/opportunities/${id}/stage`, { stage });
    message.success("阶段已推进");
    void load();
  };

  return (
    <>
      <Typography.Title level={4}>商机看板</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="party:opportunity:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>新建商机</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
      </Space>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto" }}>
        {STAGES.map((stage) => {
          const items = list.filter((o) => o.stage === stage);
          return (
            <div key={stage} style={{ flex: "1 1 0", minWidth: 220, background: "#fafafa", borderRadius: 8, padding: 8 }}>
              <Space style={{ marginBottom: 8 }}>
                <Tag color={STAGE_COLOR[stage]}>{stage}</Tag>
                <Typography.Text type="secondary">{items.length}</Typography.Text>
              </Space>
              {items.map((o) => (
                <div key={o.opportunity_id} style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                  <Typography.Text strong>{o.title}</Typography.Text>
                  <div>
                    <Typography.Text type="secondary">客户 {o.party_id}</Typography.Text>
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

      <Modal title="新建商机" open={createOpen} onOk={() => void create()} onCancel={() => setCreateOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="party_id" label="客户参与方 ID" rules={[{ required: true }]}>
            <Input placeholder="参与方 party_id" />
          </Form.Item>
          <Form.Item name="title" label="商机标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label="预估金额(元)">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
