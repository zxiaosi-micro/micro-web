// Parties.tsx · 参与方管理（S4-05）：列表 + 详情（联系人/跟进/员工/经销商扩展）+ 新建/编辑。
// 约定：ID 一律 string（E8）；主表走 ProTable request；按钮级权限 <Perm>。
// 抽屉内子表为非分页小表，保留 antd Table。

import { useRef, useState } from "react";
import {
  App, Button, Descriptions, Drawer, Form, Input, Space, Table,
  Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormSelect, ProFormText, ProTable } from "@ant-design/pro-components";
import { get, Perm, post, put } from "@micro/shared";
import type { ContactItem, CrmRecordItem, DealerExtItem, PartyItem, StaffItem } from "@micro/shared/types";

const PARTY_TYPES = ["CUSTOMER", "DEALER", "SUPPLIER", "ENTERPRISE", "RECYCLER"] as const;
const STATUS_MAP: Record<number, { text: string; color: string }> = {
  1: { text: "正常", color: "green" },
  2: { text: "停用", color: "red" },
};

export default function PartiesPage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const [editing, setEditing] = useState<PartyItem | "new" | null>(null);
  const [form] = Form.useForm();

  // 详情抽屉与子表单
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PartyItem | null>(null);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [crm, setCrm] = useState<CrmRecordItem[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [dealerExt, setDealerExt] = useState<DealerExtItem | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);
  const [contactForm] = Form.useForm();
  const [crmForm] = Form.useForm();

  const reloadDetail = async (id: string) => {
    const [d, c, cr, s, de] = await Promise.all([
      get<{ party: PartyItem }>(`/parties/${id}`),
      get<{ list: ContactItem[] }>(`/parties/${id}/contacts`),
      get<{ list: CrmRecordItem[] }>(`/parties/${id}/crm`),
      get<{ list: StaffItem[] }>(`/parties/${id}/staff`),
      get<{ dealer_ext: DealerExtItem }>(`/parties/${id}/dealer-ext`),
    ]);
    setDetail(d.party);
    setContacts(c.list ?? []);
    setCrm(cr.list ?? []);
    setStaff(s.list ?? []);
    setDealerExt(de.dealer_ext);
  };

  const openDetail = (id: string) => {
    setDetailId(id);
    void reloadDetail(id);
  };

  const submit = async (values: Record<string, unknown>) => {
    const payload = { ...values, type: (values.type as string[] | undefined) ?? [] };
    if (editing === "new") await post("/parties", payload);
    else if (editing) await put(`/parties/${editing.party_id}`, payload);
    message.success("已保存");
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const submitContact = async (values: Record<string, unknown>) => {
    if (!detailId) return false;
    await post(`/parties/${detailId}/contacts`, values);
    message.success("已保存");
    setContactOpen(false);
    void reloadDetail(detailId);
    return true;
  };

  const submitCrm = async (values: Record<string, unknown>) => {
    if (!detailId) return false;
    await post(`/parties/${detailId}/crm`, values);
    message.success("已保存");
    setCrmOpen(false);
    void reloadDetail(detailId);
    return true;
  };

  const columns: ProColumns<PartyItem>[] = [
    { title: "名称", dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: "名称/信用代码" } },
    { title: "名称", dataIndex: "name", search: false },
    {
      title: "类型",
      dataIndex: "type",
      search: false,
      render: (_, r) => (r.type ?? []).map((t) => <Tag key={t}>{t}</Tag>),
    },
    { title: "信用代码", dataIndex: "credit_code", search: false, render: (_, r) => r.credit_code || "-" },
    { title: "区域", dataIndex: "region", search: false, render: (_, r) => r.region || "-" },
    {
      title: "状态",
      dataIndex: "status",
      search: false,
      render: (_, r) => <Tag color={STATUS_MAP[r.status]?.color}>{STATUS_MAP[r.status]?.text ?? r.status}</Tag>,
    },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" onClick={() => openDetail(r.party_id)}>详情</Button>
          <Perm code="party:party:update">
            <Button size="small" type="link" onClick={() => { setEditing(r); form.setFieldsValue({ ...r }); }}>编辑</Button>
          </Perm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<PartyItem>
        headerTitle="参与方管理"
        rowKey="party_id"
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const resp = await get<{ list: PartyItem[]; total: number }>(
            `/parties?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(String(params.keyword ?? ""))}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Perm key="create" code="party:party:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>新建参与方</Button>
          </Perm>,
        ]}
      />

      <ModalForm
        title={editing === "new" ? "新建参与方" : "编辑参与方"}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submit}
      >
        <ProFormText name="name" label="名称" rules={[{ required: true }]} />
        <ProFormSelect
          name="type"
          label="类型(可多选)"
          mode="multiple"
          options={PARTY_TYPES.map((t) => ({ value: t, label: t }))}
          rules={[{ required: true }]}
        />
        <ProFormText name="credit_code" label="统一社会信用代码" />
        <ProFormText name="region" label="区域" />
        <ProFormText name="address" label="地址" />
        <ProFormText name="remark" label="备注" />
      </ModalForm>

      <Drawer title={detail?.name ?? "参与方详情"} width={720} open={detailId !== null} onClose={() => setDetailId(null)}>
        {detail && (
          <Tabs items={[
            {
              key: "contacts", label: "联系人", children: (
                <>
                  <Perm code="party:contact:create">
                    <Button size="small" icon={<PlusOutlined />} style={{ marginBottom: 8 }} onClick={() => setContactOpen(true)}>新增联系人</Button>
                  </Perm>
                  <Table rowKey="contact_id" size="small" pagination={false} dataSource={contacts}
                    columns={[
                      { title: "姓名", dataIndex: "name" },
                      { title: "手机号", dataIndex: "mobile" },
                      { title: "职务", dataIndex: "position", render: (v: string) => v || "-" },
                      { title: "默认", dataIndex: "is_default", render: (v: boolean) => (v ? <Tag color="blue">默认</Tag> : "-") },
                    ]} />
                </>
              ),
            },
            {
              key: "crm", label: "跟进记录", children: (
                <>
                  <Perm code="party:crm:create">
                    <Button size="small" icon={<PlusOutlined />} style={{ marginBottom: 8 }} onClick={() => setCrmOpen(true)}>追加跟进</Button>
                  </Perm>
                  <Table rowKey="record_id" size="small" pagination={false} dataSource={crm}
                    columns={[
                      { title: "内容", dataIndex: "content" },
                      { title: "时间", dataIndex: "created_at", render: (v: number) => (v ? new Date(v).toLocaleString("zh-CN") : "-") },
                    ]} />
                </>
              ),
            },
            {
              key: "staff", label: "员工", children: (
                <Table rowKey="staff_id" size="small" pagination={false} dataSource={staff}
                  columns={[
                    { title: "姓名", dataIndex: "name" },
                    { title: "类型", dataIndex: "staff_type" },
                    { title: "技能", dataIndex: "skill_tags", render: (v: string[]) => (v ?? []).map((t) => <Tag key={t}>{t}</Tag>) },
                    { title: "工作区域", dataIndex: "work_region", render: (v: string) => v || "-" },
                  ]} />
              ),
            },
            {
              key: "dealer", label: "经销商扩展", children: dealerExt && dealerExt.party_id ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="等级">{dealerExt.dealer_level}</Descriptions.Item>
                  <Descriptions.Item label="授权区域">{dealerExt.authorized_region || "-"}</Descriptions.Item>
                  <Descriptions.Item label="返利规则">{dealerExt.rebate_rule || "-"}</Descriptions.Item>
                </Descriptions>
              ) : <Typography.Text type="secondary">未建档</Typography.Text>,
            },
          ]} />
        )}
      </Drawer>

      <ModalForm
        title="新增联系人"
        open={contactOpen}
        onOpenChange={(o) => setContactOpen(o)}
        form={contactForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submitContact}
      >
        <ProFormText name="name" label="姓名" rules={[{ required: true }]} />
        <ProFormText name="mobile" label="手机号" rules={[{ required: true }]} />
        <ProFormText name="position" label="职务" />
      </ModalForm>

      <ModalForm
        title="追加跟进"
        open={crmOpen}
        onOpenChange={(o) => setCrmOpen(o)}
        form={crmForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submitCrm}
      >
        <Form.Item name="content" label="跟进内容" rules={[{ required: true }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </ModalForm>
    </>
  );
}
