// Orgs.tsx · 组织树（S3-04：树形展示 + 新建/编辑/删除）。

import { useCallback, useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Tree, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { del, get, Perm, post, put } from "@micro/shared";
import { usePrefs } from "@micro/shared/prefs";
import type { OrgItem } from "@micro/shared/types";
import type { DataNode } from "antd/es/tree";

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
  const { t } = usePrefs();
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
    message.success(t("common.saved"));
    setEditing(null);
    reload();
  };

  const selected = editing && editing !== "new" ? editing : null;

  return (
    <>
      <Typography.Title level={4}>{t("orgs.title")}</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="system:org:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>
            {t("orgs.create")}
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
                  <Button type="link" size="small" onClick={() => { setEditing(n); form.setFieldsValue(n); }}>{t("common.edit")}</Button>
                </Perm>
                <Perm code="system:org:create">
                  <Button type="link" size="small" onClick={() => { setEditing("new"); form.resetFields(); form.setFieldsValue({ parent_id: n.org_id }); }}>{t("orgs.addChild")}</Button>
                </Perm>
                <Perm code="system:org:delete">
                  <Popconfirm title={t("orgs.deleteConfirm")} onConfirm={async () => {
                    await del(`/orgs/${n.org_id}`);
                    message.success(t("common.deleted"));
                    reload();
                  }}>
                    <Button type="link" size="small" danger>{t("common.delete")}</Button>
                  </Popconfirm>
                </Perm>
              </Space>
            ),
            ...(n.children ? { children: n.children.map(mapNode) } : {}),
          } as DataNode;
        })}
      />
      <Modal
        title={editing === "new" ? t("orgs.create") : t("orgs.editTitle")}
        open={editing !== null}
        onOk={() => void submit()}
        onCancel={() => setEditing(null)}
        okText={t("common.confirm")}
        cancelText={t("common.cancel")}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parent_id" label={t("orgs.parentId")}>
            <Input placeholder={t("orgs.parentPlaceholder")} disabled={!!selected} />
          </Form.Item>
          <Form.Item name="name" label={t("orgs.name")} rules={[{ required: true, message: t("common.required") }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sort" label={t("orgs.sort")}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
