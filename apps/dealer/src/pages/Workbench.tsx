// Workbench.tsx · 工作台（S9-04）：订单指标卡（/orders 分页拉取统计）+ 信用额度卡（本方 dealer-ext）。
// 约定：ID string（E8）；统计走轮询（usePolling）；本方隔离靠服务端 data_scope。
// 视觉：StatCard 数字滚动 + 响应式栅格（手机单列）。

import { Card, Col, Descriptions, Row, Spin, Tag, Typography } from "antd";
import {
  AccountBookOutlined,
  AppstoreOutlined,
  PayCircleOutlined,
  ShoppingCartOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { usePolling } from "@micro/shared";
import { StatCard } from "@micro/shared/theme";
import type { DealerExtItem, PartyItem } from "@micro/shared/types";
import { fetchSelfDealer, listOrders } from "../api";

/** 待支付口径：未到终态且未支付（与 admin Orders 倒计时口径一致） */
const PAYING_STATUSES = ["CREATED", "LOCKED", "PAYING"];

interface OrderStats {
  total: number;
  paying: number;
  paidAmount: string;
}

/** /orders 分页拉取统计（上限 5 页 × 100，够 dev 量级；buyer 过滤由服务端 data_scope 承担） */
async function fetchOrderStats(): Promise<OrderStats> {
  const first = await listOrders("", "", { page: 1, size: 100 });
  const rows = [...first.list];
  const pages = Math.min(Math.ceil(first.total / 100), 5);
  for (let pg = 2; pg <= pages; pg++) {
    const r = await listOrders("", "", { page: pg, size: 100 });
    rows.push(...r.list);
  }
  const paidAmount = rows
    .filter((o) => o.paid_at > 0)
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  return {
    total: first.total,
    paying: rows.filter((o) => PAYING_STATUSES.includes(o.status)).length,
    paidAmount: paidAmount.toFixed(2),
  };
}

/** 信用额度卡：本方 dealer-ext（等级/授权区域/返利规则）；额度/账期字段后端未提供——"—"占位（L2 FR-PTY-003） */
function CreditCard(props: {
  self: { party: PartyItem; ext: DealerExtItem | null } | null;
  loading: boolean;
}) {
  if (props.loading && !props.self) {
    return (
      <Card title="信用额度 / 档案">
        <Spin />
      </Card>
    );
  }
  if (!props.self) {
    return (
      <Card title="信用额度 / 档案">
        <Typography.Text type="secondary">无档案（当前账号未关联经销商参与方）</Typography.Text>
      </Card>
    );
  }
  const { party, ext } = props.self;
  return (
    <Card
      title="信用额度 / 档案"
      extra={<Tag color="blue">{ext?.dealer_level || "—"}</Tag>}
    >
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
        <Descriptions.Item label="经销商">{party.name}</Descriptions.Item>
        <Descriptions.Item label="经销商等级">{ext?.dealer_level || "—"}</Descriptions.Item>
        <Descriptions.Item label="授权区域">{ext?.authorized_region || "—"}</Descriptions.Item>
        {/* 占位：L2 待后端端点/字段（FR-PTY-003 信用额度与账期） */}
        <Descriptions.Item label="信用额度">—</Descriptions.Item>
        <Descriptions.Item label="账期天数">—</Descriptions.Item>
        <Descriptions.Item label="返利规则">{ext?.rebate_rule || "—"}</Descriptions.Item>
      </Descriptions>
      <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
        信用额度/账期为 L2 待后端字段（FR-PTY-003），当前以"—"占位；超额下单拦截在服务端生效。
      </Typography.Text>
    </Card>
  );
}

const QUICK_LINKS = [
  { icon: <ShoppingCartOutlined />, label: "去下单（购物车批量）", route: "order-create" },
  { icon: <AppstoreOutlined />, label: "商品目录（经销商价 + 可售库存）", route: "catalog" },
  { icon: <ToolOutlined />, label: "代客服务（SN 质保查询 / 代报修）", route: "service" },
];

export default function WorkbenchPage() {
  const stats = usePolling<OrderStats>(fetchOrderStats, { intervalMs: 15_000 });
  const self = usePolling<{ party: PartyItem; ext: DealerExtItem | null } | null>(fetchSelfDealer, { intervalMs: 30_000 });

  const go = (r: string) => (window.location.hash = `#/${r}`);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={8}>
        <StatCard
          title="我的订单总数"
          value={stats.data?.total ?? 0}
          icon={<UnorderedListOutlined />}
          tone="#2f6bff"
          loading={stats.loading && !stats.data}
          delayMs={0}
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <StatCard
          title="待支付订单"
          value={stats.data?.paying ?? 0}
          icon={<PayCircleOutlined />}
          tone="#fa8c16"
          loading={stats.loading && !stats.data}
          delayMs={80}
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <StatCard
          title="已成交额（元）"
          value={stats.data?.paidAmount ?? "0.00"}
          precision={2}
          prefix="¥"
          icon={<AccountBookOutlined />}
          tone="#0f9f8a"
          loading={stats.loading && !stats.data}
          delayMs={160}
        />
      </Col>

      <Col xs={24} xl={16}>
        <CreditCard self={self.data} loading={self.loading} />
      </Col>
      <Col xs={24} xl={8}>
        <Card title="快捷入口">
          {QUICK_LINKS.map((l) => (
            <div key={l.route} className="quick-link" onClick={() => go(l.route)}>
              {l.icon}
              <span>{l.label}</span>
            </div>
          ))}
          <Typography.Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
            指标 15s 轮询、档案 30s 轮询（页面隐藏自动暂停）；订单过滤由服务端 data_scope 承担。
          </Typography.Text>
        </Card>
      </Col>
    </Row>
  );
}
