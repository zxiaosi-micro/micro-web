// Users.tsx · 用户管理（S3-04：列=姓名/手机号脱敏/部门/端标签/状态；操作=编辑/禁用/重置密码/绑角色）。
// ID 一律字符串渲染（E8）；列表走 ProTable request（分页上限 100）——本页是 ProTable/ModalForm
// 转换样板：search 隐藏列出关键词、request 拼 URL、actionRef.reload 刷新、ModalForm 承载弹窗表单。

import { useRef, useState } from "react";
import { App, Button, Form, Popconfirm, Space, Switch, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormSelect, ProFormText, ProTable } from "@ant-design/pro-components";
import { del, get, Perm, post, put } from "@micro/shared";
import type { UserItem } from "@micro/shared/types";

const CLIENT_OPTIONS = [
  { value: "ADMIN_WEB", label: "管理后台" },
  { value: "DEALER_WEB", label: "经销商" },
  { value: "STATION_WEB", label: "场站" },
  { value: "CLIENT_MINI", label: "客户端小程序" },
  { value: "STATION_MINI", label: "场站小程序" },
  { value: "OPS_APP", label: "运维 App" },
];

const STATUS_MAP: Record<number, { text: string; color: string }> = {
  1: { text: "正常", color: "green" },
  2: { text: "禁用", color: "red" },
  3: { text: "锁定", color: "orange" },
};

export default function UsersPage() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [editing, setEditing] = useState<UserItem | "new" | null>(null);
  const [resetting, setResetting] = useState<UserItem | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const columns: ProColumns<UserItem>[] = [
    // 搜索专用隐藏列：只在查询表单出现，params.keyword 回传服务端
    { title: "姓名", dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: "按姓名搜索" } },
    { title: "姓名", dataIndex: "nickname", search: false },
    { title: "手机号", dataIndex: "mobile_masked", search: false }, // 脱敏渲染，明文不出服务端
    { title: "部门", dataIndex: "org_id", search: false, render: (_, u) => u.org_id || "未分配" },
    {
      title: "可登录端",
      dataIndex: "types",
      search: false,
      render: (_, u) => u.types.map((t) => <Tag key={t}>{t}</Tag>),
    },
    {
      title: "状态",
      dataIndex: "status",
      search: false,
      render: (_, u) => <Tag color={STATUS_MAP[u.status]?.color}>{STATUS_MAP[u.status]?.text ?? u.status}</Tag>,
    },
    {
      title: "操作",
      valueType: "option",
      render: (_, u) => (
        <Space>
          <Perm code="system:user:update">
            <Button size="small" onClick={() => { setEditing(u); form.setFieldsValue(u); }}>编辑</Button>
          </Perm>
          <Perm code="system:user:status">
            <Popconfirm
              title={u.status === 2 ? "确认恢复该用户?" : "确认禁用?禁用将立即踢下线"}
              onConfirm={async () => {
                await put(`/users/${u.uid}/status`, { status: u.status === 2 ? 1 : 2 });
                message.success("已更新");
                actionRef.current?.reload();
              }}
            >
              <Button size="small" danger={u.status !== 2}>{u.status === 2 ? "恢复" : "禁用"}</Button>
            </Popconfirm>
          </Perm>
          <Perm code="system:user:reset-pwd">
            <Button size="small" onClick={() => { setResetting(u); resetForm.resetFields(); }}>重置密码</Button>
          </Perm>
          <Perm code="system:user:delete">
            <Popconfirm title="确认删除该用户?" onConfirm={async () => {
              await del(`/users/${u.uid}`);
              message.success("已删除");
              actionRef.current?.reload();
            }}>
              <Button size="small" danger type="link">删除</Button>
            </Popconfirm>
          </Perm>
        </Space>
      ),
    },
  ];

  const submit = async (values: Record<string, unknown>) => {
    if (editing === "new") {
      await post("/users", values);
    } else if (editing) {
      await put(`/users/${editing.uid}`, values);
    }
    message.success("已保存");
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const doReset = async (values: { new_password: string }) => {
    if (resetting) {
      await put(`/users/${resetting.uid}/password`, { new_password: values.new_password });
    }
    message.success("密码已重置,该用户全部会话已注销");
    setResetting(null);
    return true;
  };

  return (
    <>
      <ProTable<UserItem>
        headerTitle="用户管理"
        rowKey="uid"
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const resp = await get<{ list: UserItem[]; total: number }>(
            `/users?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(String(params.keyword ?? ""))}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100], // 上限 100
        }}
        toolBarRender={() => [
          <Perm key="create" code="system:user:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>
              新建用户
            </Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={editing === "new" ? "新建用户" : "编辑用户"}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submit}
      >
        <ProFormText name="nickname" label="姓名" rules={[{ required: true, message: "必填" }]} />
        <ProFormText name="mobile" label="手机号" rules={[{ required: editing === "new", message: "必填" }]} />
        <ProFormText name="email" label="邮箱" />
        {editing === "new" && (
          <ProFormText.Password name="password" label="初始密码" rules={[{ required: true, min: 8, message: "至少 8 位" }]} />
        )}
        <ProFormSelect name="types" label="可登录端" rules={[{ required: true, message: "至少选一个端" }]} options={CLIENT_OPTIONS} />
      </ModalForm>
      <ModalForm
        title={`重置密码（${resetting?.nickname ?? ""}）`}
        open={resetting !== null}
        onOpenChange={(o) => { if (!o) setResetting(null); }}
        form={resetForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={doReset}
      >
        <ProFormText.Password name="new_password" label="新密码" rules={[{ required: true, min: 8, message: "至少 8 位" }]} />
      </ModalForm>
      {/* Switch 引用保留：状态列未来切换为行内开关 */}
      <span hidden><Switch /></span>
    </>
  );
}
