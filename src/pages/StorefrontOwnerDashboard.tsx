import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  App as AntdApp,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Tabs,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { LogoutOutlined, SaveOutlined, ShopOutlined } from "@ant-design/icons";
import {
  STOREFRONT_OWNER_STORAGE_KEY,
  isStorefrontOwnerLoggedIn,
  storefrontApiGet,
  storefrontApiPost,
  storefrontApiPut,
} from "@/lib/api";
import type {
  StorefrontDashboardActivityDto,
  StorefrontDashboardDto,
  StorefrontOwnerAuthResponse,
  StorefrontOwnerBrandDto,
  StorefrontPayoutDto,
  StorefrontThemeResponse,
  StorefrontWalletOrderDto,
  StorefrontWalletStatsDto,
  StorefrontWalletTransactionDto,
} from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

function ownerAuth(): StorefrontOwnerAuthResponse | null {
  try {
    const raw = localStorage.getItem(STOREFRONT_OWNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StorefrontOwnerAuthResponse : null;
  } catch {
    return null;
  }
}

interface KpiProps { title: string; value: string; }
function Kpi({ title, value }: KpiProps) {
  return <Card styles={{ body: { padding: 18 } }}><Statistic title={title} value={value} valueStyle={{ fontSize: 22 }} /></Card>;
}

export default function StorefrontOwnerDashboardPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [dashboard, setDashboard] = useState<StorefrontDashboardDto | null>(null);
  const [brands, setBrands] = useState<StorefrontOwnerBrandDto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [defaultMargin, setDefaultMargin] = useState<number | null>(null);
  const [walletStats, setWalletStats] = useState<StorefrontWalletStatsDto | null>(null);
  const [transactions, setTransactions] = useState<StorefrontWalletTransactionDto[]>([]);
  const [orders, setOrders] = useState<StorefrontWalletOrderDto[]>([]);
  const [payouts, setPayouts] = useState<StorefrontPayoutDto[]>([]);
  const [theme, setTheme] = useState<StorefrontThemeResponse | null>(null);
  const [themeJson, setThemeJson] = useState("{}");
  const [payoutDraft, setPayoutDraft] = useState({ amount: 0, bankCode: "", accountNumber: "", accountName: "", reason: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useMemo(() => ownerAuth(), []);

  useEffect(() => {
    if (!isStorefrontOwnerLoggedIn() || !auth) {
      navigate("/owner/login", { replace: true });
      return;
    }
    let cancelled = false;
    async function load() {
      const [dashboardResult, brandsResult, statsResult, transactionsResult, ordersResult, payoutsResult, themeResult] = await Promise.all([
        storefrontApiGet<StorefrontDashboardDto>("storefront/me/dashboard"),
        storefrontApiGet<StorefrontOwnerBrandDto[]>("storefront/me/brands"),
        storefrontApiGet<StorefrontWalletStatsDto>("storefront/me/wallet/stats"),
        storefrontApiGet<{ data: StorefrontWalletTransactionDto[] }>("storefront/me/wallet/transactions?PageNumber=1&PageSize=50"),
        storefrontApiGet<{ data: StorefrontWalletOrderDto[] }>("storefront/me/wallet/orders?PageNumber=1&PageSize=50"),
        storefrontApiGet<{ data: StorefrontPayoutDto[] }>("storefront/me/payouts?PageNumber=1&PageSize=50"),
        storefrontApiGet<StorefrontThemeResponse>("storefront/me/theme"),
      ]);
      if (cancelled) return;
      if (!dashboardResult.status || !brandsResult.status || !statsResult.status || !transactionsResult.status || !ordersResult.status || !payoutsResult.status || !themeResult.status) {
        setError(dashboardResult.message ?? brandsResult.message ?? statsResult.message ?? transactionsResult.message ?? ordersResult.message ?? payoutsResult.message ?? themeResult.message ?? "Storefront data could not be loaded");
      } else {
        setDashboard(dashboardResult.data);
        const rows = brandsResult.data ?? [];
        setBrands(rows);
        setSelectedIds(rows.filter((brand) => brand.isSelected).map((brand) => brand.storefrontBrandId));
        setPrimaryId(rows.find((brand) => brand.isPrimary)?.storefrontBrandId ?? null);
        setDefaultMargin(rows[0]?.ownerDefaultStorefrontPriceMargin ?? null);
        setWalletStats(statsResult.data);
        setTransactions(transactionsResult.data?.data ?? []);
        setOrders(ordersResult.data?.data ?? []);
        setPayouts(payoutsResult.data?.data ?? []);
        setTheme(themeResult.data);
        setThemeJson(themeResult.data ? JSON.stringify(themeResult.data.theme, null, 2) : "{}");
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [auth, navigate]);

  function logout() {
    localStorage.removeItem(STOREFRONT_OWNER_STORAGE_KEY);
    navigate("/owner/login", { replace: true });
  }

  async function saveBrands() {
    if (!primaryId || !selectedIds.includes(primaryId)) {
      message.error("Select a primary brand from the selected brands");
      return;
    }
    setSaving(true);
    const result = await storefrontApiPut<StorefrontOwnerBrandDto[]>("storefront/me/configuration", {
      storefrontBrandIds: selectedIds,
      primaryStorefrontBrandId: primaryId,
      defaultStorefrontPriceMargin: defaultMargin,
      brandMargins: brands.filter((brand) => selectedIds.includes(brand.storefrontBrandId)).map((brand) => ({ storefrontBrandId: brand.storefrontBrandId, storefrontPriceMargin: brand.storefrontPriceMargin })),
    });
    if (!result.status) {
      message.error(result.message ?? "Brand selection could not be saved");
    } else {
      setBrands(result.data ?? brands);
      message.success("Your storefront brands were updated");
    }
    setSaving(false);
  }

  async function requestPayout() {
    if (payoutDraft.amount <= 0 || !payoutDraft.bankCode || payoutDraft.accountNumber.length !== 10) {
      message.error("Enter amount, bank code, and a valid 10-digit account number");
      return;
    }
    const result = await storefrontApiPost<StorefrontPayoutDto>("storefront/me/payouts", { ...payoutDraft, currency: "NGN" });
    if (!result.status) message.error(result.message ?? "Payout request failed");
    else { message.success("Payout request submitted"); setPayouts((current) => result.data ? [result.data, ...current] : current); }
  }

  async function cancelPayout(payoutId: string) {
    const result = await storefrontApiPost<StorefrontPayoutDto>(`storefront/me/payouts/${payoutId}/cancel`, { reason: "Cancelled by storefront owner" });
    if (!result.status) message.error(result.message ?? "Payout could not be cancelled");
    else { message.success("Payout cancelled"); setPayouts((current) => current.map((payout) => payout.id === payoutId && result.data ? result.data : payout)); }
  }

  async function saveTheme() {
    let parsed: unknown;
    try { parsed = JSON.parse(themeJson); } catch { message.error("Theme JSON must be valid JSON"); return; }
    const result = await storefrontApiPut<StorefrontThemeResponse>("storefront/me/theme", { theme: parsed, themeName: theme?.themeName ?? "custom", isPublished: true, expectedRevision: theme?.revision ?? 0 });
    if (!result.status) message.error(result.message ?? "Theme could not be saved");
    else { setTheme(result.data); message.success("Storefront theme saved"); }
  }

  const activityColumns: TableColumnsType<StorefrontDashboardActivityDto> = [
    { title: "Date", dataIndex: "date", render: (value) => formatDate(value) },
    { title: "Activity", dataIndex: "description", render: (value, activity) => <div><div>{value}</div><div className="text-xs text-muted-foreground">{activity.reference}</div></div> },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Status", dataIndex: "status", render: (value) => <Tag>{value}</Tag> },
  ];

  const transactionColumns: TableColumnsType<StorefrontWalletTransactionDto> = [
    { title: "Date", dataIndex: "transactionDate", render: (value) => formatDate(value) },
    { title: "Type", dataIndex: "type", render: (value) => <Tag color={value === "credit" ? "success" : "error"}>{value}</Tag> },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Reference", dataIndex: "reference" },
    { title: "Balance", dataIndex: "balanceAfter", align: "right", render: (value) => formatCurrency(value, "NGN") },
  ];

  const orderColumns: TableColumnsType<StorefrontWalletOrderDto> = [
    { title: "Order", dataIndex: "orderReference", render: (value, row) => value ?? row.orderId },
    { title: "Customer", dataIndex: "customerName", render: (value) => value ?? "—" },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Commission", dataIndex: "commission", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Status", dataIndex: "commissionStatus", render: (value) => <Tag>{value ?? "—"}</Tag> },
  ];

  const payoutColumns: TableColumnsType<StorefrontPayoutDto> = [
    { title: "Date", dataIndex: "requestedAt", render: (value) => formatDate(value) },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Account", key: "account", render: (_, row) => `${row.accountName} ••••${row.accountNumberLast4}` },
    { title: "Status", dataIndex: "status", render: (value) => <Tag>{value}</Tag> },
    { title: "Action", key: "action", render: (_, row) => (row.status === "Requested" || row.status === "Approved") ? <Button size="small" danger onClick={() => cancelPayout(row.id)}>Cancel</Button> : null },
  ];

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spin size="large" /></div>;
  if (error) return <div className="mx-auto max-w-xl p-6"><Alert type="error" showIcon message={error} action={<Button onClick={logout}>Sign out</Button>} /></div>;

  const selected = new Set(selectedIds);
  const name = auth?.storeName || auth?.companyName || auth?.email || "Storefront";
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fbf0f2] via-white to-[#f7e8ec] p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Space>
            <Avatar size={44} className="bg-[#800020]" icon={<ShopOutlined />} />
            <div><Typography.Title level={3} className="!m-0">{name}</Typography.Title><Typography.Text type="secondary">Storefront owner console</Typography.Text></div>
          </Space>
          <Button icon={<LogoutOutlined />} onClick={logout}>Sign out</Button>
        </div>
        {dashboard && <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={6}><Kpi title="Gross sales" value={formatCurrency(dashboard.grossSales, "NGN")} /></Col>
          <Col xs={24} sm={12} lg={6}><Kpi title="Wallet balance" value={formatCurrency(dashboard.currentWalletBalance, "NGN")} /></Col>
          <Col xs={24} sm={12} lg={6}><Kpi title="Current commission" value={formatCurrency(dashboard.currentCommission, "NGN")} /></Col>
          <Col xs={24} sm={12} lg={6}><Kpi title="Orders" value={formatNumber(dashboard.totalOrders)} /></Col>
        </Row>}
        <Card title="Brands you sell" extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveBrands}>Save brands</Button>}>
          <Typography.Paragraph type="secondary">Select the brands you want to sell. Your primary brand controls the automatic storefront theme.</Typography.Paragraph>
          <Space className="mb-4" wrap><Typography.Text strong>Default margin</Typography.Text><InputNumber min={0} max={1000} precision={2} addonAfter="%" value={defaultMargin} onChange={setDefaultMargin} /><Typography.Text type="secondary">Applied when a brand has no specific margin.</Typography.Text></Space>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <Card key={brand.storefrontBrandId} size="small" className={selected.has(brand.storefrontBrandId) ? "border-[#800020]" : undefined}>
                <div className="flex items-center justify-between gap-3">
                  <Space><Avatar size="small" src={brand.brandImageUrl ?? undefined} icon={<ShopOutlined />} />{brand.name ?? "Unnamed brand"}</Space>
                  <Switch checked={selected.has(brand.storefrontBrandId)} onChange={(checked) => { setSelectedIds((current) => checked ? [...new Set([...current, brand.storefrontBrandId])] : current.filter((id) => id !== brand.storefrontBrandId)); if (checked && !primaryId) setPrimaryId(brand.storefrontBrandId); if (!checked && primaryId === brand.storefrontBrandId) setPrimaryId(null); }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{brand.themeName ?? "Brand default theme"}</span>
                  <Button type={primaryId === brand.storefrontBrandId ? "primary" : "link"} size="small" disabled={!selected.has(brand.storefrontBrandId)} onClick={() => setPrimaryId(brand.storefrontBrandId)}>{primaryId === brand.storefrontBrandId ? "Primary" : "Make primary"}</Button>
                </div>
              </Card>
            ))}
          </div>
          {brands.length === 0 && <Empty description="No brands are available yet" />}
        </Card>
        <Card title="Recent settlement activity">
          <Table<StorefrontDashboardActivityDto> rowKey={(activity) => `${activity.type}-${activity.reference}-${activity.date}`} size="small" dataSource={dashboard?.recentActivity ?? []} columns={activityColumns} pagination={false} locale={{ emptyText: <Empty description="No settlement activity" /> }} />
        </Card>
        <Card title="Wallet and earnings">
          {walletStats && <Row gutter={[12, 12]} className="mb-4"><Col xs={12} sm={6}><Kpi title="Revenue" value={formatCurrency(walletStats.revenue, "NGN")} /></Col><Col xs={12} sm={6}><Kpi title="Commission" value={formatCurrency(walletStats.currentCommission, "NGN")} /></Col><Col xs={12} sm={6}><Kpi title="Pending" value={formatCurrency(walletStats.pendingCommission, "NGN")} /></Col><Col xs={12} sm={6}><Kpi title="Reserved" value={formatCurrency(walletStats.reservedForPayout, "NGN")} /></Col></Row>}
          <Tabs items={[
            { key: "ledger", label: "Wallet ledger", children: <Table<StorefrontWalletTransactionDto> rowKey="id" size="small" dataSource={transactions} columns={transactionColumns} pagination={false} locale={{ emptyText: "No wallet transactions" }} /> },
            { key: "orders", label: "Orders", children: <Table<StorefrontWalletOrderDto> rowKey="orderId" size="small" dataSource={orders} columns={orderColumns} pagination={false} locale={{ emptyText: "No wallet orders" }} /> },
            { key: "payouts", label: "Payout history", children: <Table<StorefrontPayoutDto> rowKey="id" size="small" dataSource={payouts} columns={payoutColumns} pagination={false} locale={{ emptyText: "No payout requests" }} /> },
          ]} />
        </Card>
        <Card title="Request a payout">
          <Space wrap>
            <InputNumber min={0.01} precision={2} placeholder="Amount" value={payoutDraft.amount || null} onChange={(value) => setPayoutDraft((current) => ({ ...current, amount: value ?? 0 }))} />
            <Input placeholder="Bank code" value={payoutDraft.bankCode} onChange={(event) => setPayoutDraft((current) => ({ ...current, bankCode: event.target.value }))} />
            <Input placeholder="10-digit account number" value={payoutDraft.accountNumber} onChange={(event) => setPayoutDraft((current) => ({ ...current, accountNumber: event.target.value }))} />
            <Input placeholder="Account name (optional)" value={payoutDraft.accountName} onChange={(event) => setPayoutDraft((current) => ({ ...current, accountName: event.target.value }))} />
            <Button type="primary" onClick={requestPayout}>Submit request</Button>
          </Space>
        </Card>
        <Card title="Storefront theme" extra={<Button type="primary" onClick={saveTheme}>Save theme</Button>}>
          <Typography.Text type="secondary">Customize your presentation. If no custom theme is published, the primary brand theme is used automatically.</Typography.Text>
          <Input.TextArea className="mt-3" rows={10} value={themeJson} onChange={(event) => setThemeJson(event.target.value)} />
        </Card>
      </div>
    </div>
  );
}
