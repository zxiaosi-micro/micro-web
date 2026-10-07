// Users.tsx · 用户管理（S3-04：列=姓名/手机号脱敏/部门/端标签/状态；操作=编辑/禁用/重置密码/绑角色）。
// ID 一律字符串渲染（E8）；列表统一 usePaged（上限 100）。

import { useMemo, useState } from "react";
import {
  App, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { del, get, Perm, post, put, usePaged } from "@micro/shared";
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
  const [keyword, setKeyword] = useState("");
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<UserItem>(
    (p) => get<{ list: UserItem[]; total: number }>(`/users?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}`),
  );
  const [editing, setEditing] = useState<UserItem | "new" | null>(null);
  const [resetting, setResetting] = useState<UserItem | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const columns = useMemo(
    () => [
      { title: "姓名", dataIndex: "nickname", key: "nickname" },
      { title: "手机号", dataIndex: "mobile_masked", key: "mobile_masked" }, // 脱敏渲染，明文不出服务端
      { title: "部门", dataIndex: "org_id", key: "org_id", render: (v: string) => v || "未分配" },
      {
        title: "可登录端",
        dataIndex: "types",
        key: "types",
        render: (types: string[]) => types.map((t) => <Tag key={t}>{t}</Tag>),
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        render: (s: number) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.text ?? s}</Tag>,
      },
      {
        title: "操作",
        key: "actions",
        render: (_: unknown, u: UserItem) => (
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
                  refresh();
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
                refresh();
              }}>
                <Button size="small" danger type="link">删除</Button>
              </Popconfirm>
            </Perm>
          </Space>
        ),
      },
    ],
    [form, resetForm, refresh, message],
  );

  const submit = async () => {
    const values = await form.validateFields();
    if (editing === "new") {
      await post("/users", values);
    } else if (editing) {
      await put(`/users/${editing.uid}`, values);
    }
    message.success("已保存");
    setEditing(null);
    refresh();
  };

  const doReset = async () => {
    const { new_password } = await resetForm.validateFields();
    if (resetting) {
      await put(`/users/${resetting.uid}/password`, { new_password });
    }
    message.success("密码已重置,该用户全部会话已注销");
    setResetting(null);
  };

  return (
    <>
      <Typography.Title level={4}>用户管理</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="按姓名搜索"
          allowClear
          onSearch={(v) => { setKeyword(v); setPage(1); }}
          style={{ width: 240 }}
        />
        <Perm code="system:user:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>
            新建用户
          </Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table
        rowKey="uid"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100], // 上限 100
          onChange: (p, s) => { setPage(p); setSize(s); },
        }}
      />
      <Modal
        title={editing === "new" ? "新建用户" : "编辑用户"}
        open={editing !== null}
        onOk={() => void submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nickname" label="姓名" rules={[{ required: true, message: "必填" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="mobile" label="手机号" rules={[{ required: editing === "new", message: "必填" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input />
          </Form.Item>
          {editing === "new" && (
            <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 8, message: "至少 8 位" }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="types" label="可登录端" rules={[{ required: true, message: "至少选一个端" }]}>
            <Select mode="multiple" options={CLIENT_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title={`重置密码（${resetting?.nickname ?? ""}）`} open={resetting !== null} onOk={() => void doReset()} onCancel={() => setResetting(null)} destroyOnHidden>
        <Form form={resetForm} layout="vertical">
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 8, message: "至少 8 位" }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
      {/* Switch 引用保留：状态列未来切换为行内开关 */}
      <span hidden><Switch /></span>
    </>
  );
}
