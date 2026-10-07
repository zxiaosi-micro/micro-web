// Orgs.tsx · 组织树（S3-04：树形展示 + 新建/编辑/删除）。

import { useCallback, useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Tree, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { del, get, Perm, post, put } from "@micro/shared";
import type { OrgItem } from "@micro/shared/types";
import type { DataNode } from "antd/es/tree";

interface OrgNode extends OrgItem {
  children?: OrgNode[];
}

interface OrgNode extends OrgItem {
  children?: OrgNode[];
}

function buildTree(items: OrgItem[]): OrgNode[] {
  const byId = new Map<string, OrgNode>();
  for (const o of items) {
    byId.set(o.org_id, { ...o });
  }
  const roots: OrgNode[] = [];
  for (const n of byId.values()) {
    const parent = byId.get(n.parent_id);
    if (parent) {
      (parent.children ??= []).push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

export default function OrgsPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<OrgItem[]>([]);
  const [editing, setEditing] = useState<OrgItem | "new" | null>(null);
  const [form] = Form.useForm();

  const reload = useCallback(() => {
    void get<{ list: OrgItem[] }>("/orgs").then((resp) => setItems(resp.list));
  }, []);

  useEffect(reload, [reload]);

  const submit = async () => {
    const values = await form.validateFields();
    if (editing === "new") {
      await post("/orgs", values);
    } else if (editing) {
      await put(`/orgs/${editing.org_id}`, values);
    }
    message.success("已保存");
    setEditing(null);
    reload();
  };

  const selected = editing && editing !== "new" ? editing : null;

  return (
    <>
      <Typography.Title level={4}>组织管理</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="system:org:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>
            新建组织
          </Button>
        </Perm>
      </Space>
      <Tree
        blockNode
        treeData={buildTree(items).map(function mapNode(n): DataNode {
          return {
            key: n.org_id,
            title: (
              <Space>
                <span>{n.name}</span>
                <Perm code="system:org:update">
                  <Button type="link" size="small" onClick={() => { setEditing(n); form.setFieldsValue(n); }}>编辑</Button>
                </Perm>
                <Perm code="system:org:create">
                  <Button type="link" size="small" onClick={() => { setEditing("new"); form.resetFields(); form.setFieldsValue({ parent_id: n.org_id }); }}>添加子组织</Button>
                </Perm>
                <Perm code="system:org:delete">
                  <Popconfirm title="确认删除?" onConfirm={async () => {
                    await del(`/orgs/${n.org_id}`);
                    message.success("已删除");
                    reload();
                  }}>
                    <Button type="link" size="small" danger>删除</Button>
                  </Popconfirm>
                </Perm>
              </Space>
            ),
            ...(n.children ? { children: n.children.map(mapNode) } : {}),
          } as DataNode;
        })}
      />
      <Modal
        title={editing === "new" ? "新建组织" : "编辑组织"}
        open={editing !== null}
        onOk={() => void submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parent_id" label="父组织 ID（空=根）">
            <Input placeholder="留空为根组织" disabled={!!selected} />
          </Form.Item>
          <Form.Item name="name" label="组织名称" rules={[{ required: true, message: "必填" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
