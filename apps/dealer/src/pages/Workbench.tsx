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
import { usePrefs } from "@micro/shared/prefs";
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
  const { t } = usePrefs();
  if (props.loading && !props.self) {
    return (
      <Card title={t("work.creditTitle")}>
        <Spin />
      </Card>
    );
  }
  if (!props.self) {
    return (
      <Card title={t("work.creditTitle")}>
        <Typography.Text type="secondary">{t("work.noProfile")}</Typography.Text>
      </Card>
    );
  }
  const { party, ext } = props.self;
  return (
    <Card
      title={t("work.creditTitle")}
      extra={<Tag color="blue">{ext?.dealer_level || "—"}</Tag>}
    >
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
        <Descriptions.Item label={t("work.dealer")}>{party.name}</Descriptions.Item>
        <Descriptions.Item label={t("work.dealerLevel")}>{ext?.dealer_level || "—"}</Descriptions.Item>
        <Descriptions.Item label={t("work.authRegion")}>{ext?.authorized_region || "—"}</Descriptions.Item>
        {/* 占位：L2 待后端端点/字段（FR-PTY-003 信用额度与账期） */}
        <Descriptions.Item label={t("work.creditLimit")}>—</Descriptions.Item>
        <Descriptions.Item label={t("work.termsDays")}>—</Descriptions.Item>
        <Descriptions.Item label={t("work.rebateRule")}>{ext?.rebate_rule || "—"}</Descriptions.Item>
      </Descriptions>
      <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
        {t("work.creditHint")}
      </Typography.Text>
    </Card>
  );
}

export default function WorkbenchPage() {
  const { t } = usePrefs();
  const stats = usePolling<OrderStats>(fetchOrderStats, { intervalMs: 15_000 });
  const self = usePolling<{ party: PartyItem; ext: DealerExtItem | null } | null>(fetchSelfDealer, { intervalMs: 30_000 });

  const go = (r: string) => (window.location.hash = `#/${r}`);

  const quickLinks = [
    { icon: <ShoppingCartOutlined />, label: t("work.qlOrder"), route: "order-create" },
    { icon: <AppstoreOutlined />, label: t("work.qlCatalog"), route: "catalog" },
    { icon: <ToolOutlined />, label: t("work.qlService"), route: "service" },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={8}>
        <StatCard
          title={t("work.statTotal")}
          value={stats.data?.total ?? 0}
          icon={<UnorderedListOutlined />}
          tone="#2f6bff"
          loading={stats.loading && !stats.data}
          delayMs={0}
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <StatCard
          title={t("work.statPaying")}
          value={stats.data?.paying ?? 0}
          icon={<PayCircleOutlined />}
          tone="#fa8c16"
          loading={stats.loading && !stats.data}
          delayMs={80}
        />
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <StatCard
          title={t("work.statPaid")}
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
        <Card title={t("work.quickTitle")}>
          {quickLinks.map((l) => (
            <div key={l.route} className="quick-link" onClick={() => go(l.route)}>
              {l.icon}
              <span>{l.label}</span>
            </div>
          ))}
          <Typography.Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
            {t("work.hint")}
          </Typography.Text>
        </Card>
      </Col>
    </Row>
  );
}
