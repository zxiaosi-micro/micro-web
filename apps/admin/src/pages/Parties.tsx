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
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { ContactItem, CrmRecordItem, DealerExtItem, PartyItem, StaffItem } from "@micro/shared/types";

const PARTY_TYPES = ["CUSTOMER", "DEALER", "SUPPLIER", "ENTERPRISE", "RECYCLER"] as const;

export default function PartiesPage() {
  const { t } = usePrefs();
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
    message.success(t("common.saved"));
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const submitContact = async (values: Record<string, unknown>) => {
    if (!detailId) return false;
    await post(`/parties/${detailId}/contacts`, values);
    message.success(t("common.saved"));
    setContactOpen(false);
    void reloadDetail(detailId);
    return true;
  };

  const submitCrm = async (values: Record<string, unknown>) => {
    if (!detailId) return false;
    await post(`/parties/${detailId}/crm`, values);
    message.success(t("common.saved"));
    setCrmOpen(false);
    void reloadDetail(detailId);
    return true;
  };

  const columns: ProColumns<PartyItem>[] = [
    { title: t("parties.name"), dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: t("parties.searchPlaceholder") } },
    { title: t("parties.name"), dataIndex: "name", search: false },
    {
      title: t("parties.type"),
      dataIndex: "type",
      search: false,
      render: (_, r) => (r.type ?? []).map((tp) => <Tag key={tp}>{tp}</Tag>),
    },
    { title: t("parties.creditCode"), dataIndex: "credit_code", search: false, render: (_, r) => r.credit_code || "-" },
    { title: t("parties.region"), dataIndex: "region", search: false, render: (_, r) => r.region || "-" },
    {
      title: t("common.status"),
      dataIndex: "status",
      search: false,
      render: (_, r) => <Tag color={r.status === 1 ? "green" : "red"}>{r.status === 1 ? t("tenants.active") : t("tenants.disabled")}</Tag>,
    },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" onClick={() => openDetail(r.party_id)}>{t("parties.detail")}</Button>
          <Perm code="party:party:update">
            <Button size="small" type="link" onClick={() => { setEditing(r); form.setFieldsValue({ ...r }); }}>{t("common.edit")}</Button>
          </Perm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<PartyItem>
        headerTitle={t("parties.title")}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>{t("parties.create")}</Button>
          </Perm>,
        ]}
      />

      <ModalForm
        title={editing === "new" ? t("parties.create") : t("parties.editTitle")}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submit}
      >
        <ProFormText name="name" label={t("parties.name")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormSelect
          name="type"
          label={t("parties.typeMulti")}
          mode="multiple"
          options={PARTY_TYPES.map((tp) => ({ value: tp, label: tp }))}
          rules={[{ required: true, message: t("common.required") }]}
        />
        <ProFormText name="credit_code" label={t("parties.creditCode")} />
        <ProFormText name="region" label={t("parties.region")} />
        <ProFormText name="address" label={t("parties.address")} />
        <ProFormText name="remark" label={t("parties.remark")} />
      </ModalForm>

      <Drawer title={detail?.name ?? t("parties.detailTitle")} width={720} open={detailId !== null} onClose={() => setDetailId(null)}>
        {detail && (
          <Tabs items={[
            {
              key: "contacts", label: t("parties.tabContacts"), children: (
                <>
                  <Perm code="party:contact:create">
                    <Button size="small" icon={<PlusOutlined />} style={{ marginBottom: 8 }} onClick={() => setContactOpen(true)}>{t("parties.addContact")}</Button>
                  </Perm>
                  <Table rowKey="contact_id" size="small" pagination={false} dataSource={contacts}
                    columns={[
                      { title: t("users.nickname"), dataIndex: "name" },
                      { title: t("users.mobile"), dataIndex: "mobile" },
                      { title: t("parties.position"), dataIndex: "position", render: (v: string) => v || "-" },
                      { title: t("parties.isDefault"), dataIndex: "is_default", render: (v: boolean) => (v ? <Tag color="blue">{t("parties.isDefault")}</Tag> : "-") },
                    ]} />
                </>
              ),
            },
            {
              key: "crm", label: t("parties.tabCrm"), children: (
                <>
                  <Perm code="party:crm:create">
                    <Button size="small" icon={<PlusOutlined />} style={{ marginBottom: 8 }} onClick={() => setCrmOpen(true)}>{t("parties.addCrm")}</Button>
                  </Perm>
                  <Table rowKey="record_id" size="small" pagination={false} dataSource={crm}
                    columns={[
                      { title: t("parties.content"), dataIndex: "content" },
                      { title: t("parties.time"), dataIndex: "created_at", render: (v: number) => (v ? new Date(v).toLocaleString(getLocale()) : "-") },
                    ]} />
                </>
              ),
            },
            {
              key: "staff", label: t("parties.tabStaff"), children: (
                <Table rowKey="staff_id" size="small" pagination={false} dataSource={staff}
                  columns={[
                    { title: t("users.nickname"), dataIndex: "name" },
                    { title: t("parties.staffType"), dataIndex: "staff_type" },
                    { title: t("parties.skillTags"), dataIndex: "skill_tags", render: (v: string[]) => (v ?? []).map((tp) => <Tag key={tp}>{tp}</Tag>) },
                    { title: t("parties.workRegion"), dataIndex: "work_region", render: (v: string) => v || "-" },
                  ]} />
              ),
            },
            {
              key: "dealer", label: t("parties.tabDealer"), children: dealerExt && dealerExt.party_id ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t("parties.dealerLevel")}>{dealerExt.dealer_level}</Descriptions.Item>
                  <Descriptions.Item label={t("parties.authRegion")}>{dealerExt.authorized_region || "-"}</Descriptions.Item>
                  <Descriptions.Item label={t("parties.rebateRule")}>{dealerExt.rebate_rule || "-"}</Descriptions.Item>
                </Descriptions>
              ) : <Typography.Text type="secondary">{t("parties.noRecord")}</Typography.Text>,
            },
          ]} />
        )}
      </Drawer>

      <ModalForm
        title={t("parties.addContact")}
        open={contactOpen}
        onOpenChange={(o) => setContactOpen(o)}
        form={contactForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submitContact}
      >
        <ProFormText name="name" label={t("users.nickname")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="mobile" label={t("users.mobile")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="position" label={t("parties.position")} />
      </ModalForm>

      <ModalForm
        title={t("parties.addCrm")}
        open={crmOpen}
        onOpenChange={(o) => setCrmOpen(o)}
        form={crmForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submitCrm}
      >
        <Form.Item name="content" label={t("parties.crmContent")} rules={[{ required: true, message: t("common.required") }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </ModalForm>
    </>
  );
}
