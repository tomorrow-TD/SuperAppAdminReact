import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Input,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  getAdminStorefrontWallet,
  getAdminStorefrontWalletOrders,
  getAdminStorefrontWalletStats,
  getAdminStorefrontWalletTransactions,
  getStorefrontEarnings,
  getStorefrontEarningsSummary,
} from "@/lib/storefrontApi";
import type {
  StorefrontEarningDto,
  StorefrontWalletOrderDto,
  StorefrontWalletTransactionDto,
} from "@/lib/storefrontTypes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderDetailModal } from "@/components/orders/OrderDetailModal";

function money(amount: number, currency: string | null | undefined) {
  const code = currency === "USD" ? "USD" : "NGN";
  return formatCurrency(amount, code);
}

function statusTag(status: string | null | undefined) {
  if (!status) return <Tag>—</Tag>;
  const lower = status.toLowerCase();
  if (lower === "pending" || lower === "requested") return <Tag color="processing">{status}</Tag>;
  if (lower === "available" || lower === "completed" || lower === "success" || lower === "paid") {
    return <Tag color="success">{status}</Tag>;
  }
  if (lower === "reversed" || lower === "failed" || lower === "cancelled" || lower === "rejected") {
    return <Tag color="error">{status}</Tag>;
  }
  if (lower === "withdrawn" || lower === "approved") return <Tag color="default">{status}</Tag>;
  return <Tag>{status}</Tag>;
}

export default function FranchiseStoreOwnerDetailPage() {
  const { storeOwnerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();

  const companyName = searchParams.get("company") ?? "";
  const ownerName = searchParams.get("owner") ?? "";
  const userName = searchParams.get("user") ?? "";

  const [earningsSearch, setEarningsSearch] = useState("");
  const debouncedEarningsSearch = useDebouncedValue(earningsSearch, 350);
  const [earningsPage, setEarningsPage] = useState(1);
  const [earningsPageSize, setEarningsPageSize] = useState(20);

  const [txSearch, setTxSearch] = useState("");
  const debouncedTxSearch = useDebouncedValue(txSearch, 350);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(20);

  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(20);
  const [ordersSearch, setOrdersSearch] = useState("");
  const debouncedOrdersSearch = useDebouncedValue(ordersSearch, 350);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);

  const ownerScope = useMemo(
    () => (storeOwnerId ? { ownerId: storeOwnerId } : {}),
    [storeOwnerId],
  );

  const walletQuery = useQuery({
    queryKey: ["admin-storefront-wallet", storeOwnerId],
    queryFn: async () => {
      const res = await getAdminStorefrontWallet(storeOwnerId!);
      if (!res.status) throw new Error(res.message ?? "Failed to load wallet");
      return res.data;
    },
    enabled: !!storeOwnerId,
  });

  const statsQuery = useQuery({
    queryKey: ["admin-storefront-wallet-stats", storeOwnerId],
    queryFn: async () => {
      const res = await getAdminStorefrontWalletStats(storeOwnerId!);
      if (!res.status) throw new Error(res.message ?? "Failed to load wallet stats");
      return res.data;
    },
    enabled: !!storeOwnerId,
  });

  const summaryQuery = useQuery({
    queryKey: ["storefront", "earnings-summary", ownerScope],
    queryFn: async () => {
      const res = await getStorefrontEarningsSummary(ownerScope);
      if (!res.status) throw new Error(res.message ?? "Failed to load earnings summary");
      return res.data;
    },
    enabled: !!storeOwnerId,
  });

  const earningsParams = useMemo(
    () => ({
      ...ownerScope,
      PageSize: earningsPageSize,
      PageNumber: earningsPage,
      SearchString: debouncedEarningsSearch.trim() || undefined,
    }),
    [ownerScope, earningsPageSize, earningsPage, debouncedEarningsSearch],
  );

  const earningsQuery = useQuery({
    queryKey: ["storefront", "earnings", earningsParams],
    queryFn: async () => {
      const res = await getStorefrontEarnings(earningsParams);
      if (!res.status) throw new Error(res.message ?? "Failed to load earnings");
      return res.data;
    },
    enabled: !!storeOwnerId,
  });

  const txParams = useMemo(
    () => ({
      PageSize: txPageSize,
      PageNumber: txPage,
      SearchString: debouncedTxSearch.trim() || undefined,
    }),
    [txPageSize, txPage, debouncedTxSearch],
  );

  const txQuery = useQuery({
    queryKey: ["admin-storefront-wallet-tx", storeOwnerId, txParams],
    queryFn: async () => {
      const res = await getAdminStorefrontWalletTransactions(storeOwnerId!, txParams);
      if (!res.status) throw new Error(res.message ?? "Failed to load transactions");
      return res.data;
    },
    enabled: !!storeOwnerId,
  });

  const ordersParams = useMemo(
    () => ({
      PageSize: ordersPageSize,
      PageNumber: ordersPage,
      SearchString: debouncedOrdersSearch.trim() || undefined,
    }),
    [ordersPageSize, ordersPage, debouncedOrdersSearch],
  );

  const ordersQuery = useQuery({
    queryKey: ["admin-storefront-wallet-orders", storeOwnerId, ordersParams],
    queryFn: async () => {
      const res = await getAdminStorefrontWalletOrders(storeOwnerId!, ordersParams);
      if (!res.status) throw new Error(res.message ?? "Failed to load orders");
      return res.data;
    },
    enabled: !!storeOwnerId,
  });

  useEffect(() => {
    const err =
      walletQuery.error ??
      statsQuery.error ??
      summaryQuery.error ??
      earningsQuery.error ??
      txQuery.error ??
      ordersQuery.error;
    if (err) {
      message.error(err instanceof Error ? err.message : "Unable to load store owner.");
    }
  }, [
    walletQuery.error,
    statsQuery.error,
    summaryQuery.error,
    earningsQuery.error,
    txQuery.error,
    ordersQuery.error,
    message,
  ]);

  const title =
    companyName.trim() ||
    ownerName.trim() ||
    userName.trim() ||
    "Store owner";

  const currency =
    walletQuery.data?.currency ??
    statsQuery.data?.currency ??
    summaryQuery.data?.currency ??
    "NGN";

  const earningsColumns: TableColumnsType<StorefrontEarningDto> = [
    {
      title: "Date",
      dataIndex: "dateCreated",
      width: 140,
      render: (v: string) => (
        <span className="text-xs text-muted-foreground">{formatDate(v)}</span>
      ),
    },
    {
      title: "External order",
      dataIndex: "externalOrderId",
      render: (v: string | null, row) => (
        <Button
          type="link"
          className="!px-0"
          onClick={() => {
            setSelectedOrderId(row.orderId);
            setOrderOpen(true);
          }}
        >
          {v?.trim() || row.orderId.slice(0, 8)}
        </Button>
      ),
    },
    {
      title: "Earned",
      dataIndex: "earnedAmount",
      align: "right",
      render: (v: number, row) => (
        <span className="font-semibold text-[#800020]">{money(v, row.currency)}</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (v: string) => statusTag(v),
    },
  ];

  const txColumns: TableColumnsType<StorefrontWalletTransactionDto> = [
    {
      title: "Date",
      dataIndex: "transactionDate",
      width: 140,
      render: (v: string) => (
        <span className="text-xs text-muted-foreground">{formatDate(v)}</span>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      width: 110,
      render: (v: string | null) => {
        if (!v) return <Tag>—</Tag>;
        const lower = v.toLowerCase();
        if (lower === "debit") return <Tag color="error">Debit</Tag>;
        if (lower === "credit") return <Tag color="success">Credit</Tag>;
        return <Tag>{v}</Tag>;
      },
    },
    {
      title: "Amount",
      dataIndex: "amount",
      align: "right",
      render: (v: number) => (
        <span className={v < 0 ? "text-red-600" : "font-medium"}>{money(v, currency)}</span>
      ),
    },
    {
      title: "After",
      dataIndex: "balanceAfter",
      align: "right",
      render: (v: number) => money(v, currency),
    },
    {
      title: "Reference",
      key: "ref",
      render: (_, row) => row.paymentReference ?? row.reference ?? "—",
    },
    { title: "Status", dataIndex: "status", width: 100, render: (v) => statusTag(v) },
  ];

  const ordersColumns: TableColumnsType<StorefrontWalletOrderDto> = [
    {
      title: "Date",
      dataIndex: "dateCreated",
      width: 140,
      render: (v) => <span className="text-xs">{formatDate(v)}</span>,
    },
    {
      title: "Order",
      dataIndex: "orderReference",
      render: (v, row) => (
        <Button
          type="link"
          className="!px-0"
          onClick={() => {
            setSelectedOrderId(row.orderId);
            setOrderOpen(true);
          }}
        >
          {v ?? row.externalOrderId ?? row.orderId.slice(0, 8)}
        </Button>
      ),
    },
    {
      title: "Customer",
      dataIndex: "customerName",
      render: (v) => v ?? "—",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      align: "right",
      render: (v) => money(v, currency),
    },
    {
      title: "Commission",
      dataIndex: "commission",
      align: "right",
      render: (v) => money(v, currency),
    },
    {
      title: "Commission status",
      dataIndex: "commissionStatus",
      render: (v) => statusTag(v),
    },
    {
      title: "Paid",
      dataIndex: "isPaid",
      width: 80,
      render: (v: boolean) => <Tag color={v ? "success" : "default"}>{v ? "Yes" : "No"}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "orderStatus",
      render: (v) => statusTag(v),
    },
  ];

  if (!storeOwnerId) {
    return (
      <Empty description="Store owner not found">
        <Button onClick={() => navigate("/franchise-store-owners")}>Back to store owners</Button>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          className="!px-0"
          onClick={() => navigate("/franchise-store-owners")}
        >
          Store owners
        </Button>
        <Typography.Title level={3} className="!m-0">
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">
          {[ownerName, userName].filter(Boolean).join(" · ") ||
            "Read-only storefront activity for this owner"}
        </Typography.Text>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card loading={walletQuery.isLoading || statsQuery.isLoading}>
          <Statistic
            title="Wallet balance"
            value={walletQuery.data?.balance ?? statsQuery.data?.walletBalance ?? 0}
            formatter={() =>
              money(
                walletQuery.data?.balance ?? statsQuery.data?.walletBalance ?? 0,
                currency,
              )
            }
            valueStyle={{ color: "#800020", fontWeight: 600 }}
          />
        </Card>
        <Card loading={statsQuery.isLoading}>
          <Statistic
            title="Revenue"
            value={statsQuery.data?.revenue ?? 0}
            formatter={() => money(statsQuery.data?.revenue ?? 0, currency)}
          />
        </Card>
        <Card loading={statsQuery.isLoading}>
          <Statistic title="Paid orders" value={statsQuery.data?.paidOrders ?? 0} />
        </Card>
        <Card loading={statsQuery.isLoading || summaryQuery.isLoading}>
          <Statistic
            title="Pending commission"
            value={statsQuery.data?.pendingCommission ?? summaryQuery.data?.pending ?? 0}
            formatter={() =>
              money(
                statsQuery.data?.pendingCommission ?? summaryQuery.data?.pending ?? 0,
                currency,
              )
            }
          />
        </Card>
      </div>

      <Card styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          defaultActiveKey="orders"
          items={[
            {
              key: "orders",
              label: "Orders",
              children: (
                <div className="space-y-3">
                  <Input
                    allowClear
                    placeholder="Search orders…"
                    value={ordersSearch}
                    onChange={(e) => {
                      setOrdersPage(1);
                      setOrdersSearch(e.target.value);
                    }}
                  />
                  <Table<StorefrontWalletOrderDto>
                    rowKey="orderId"
                    columns={ordersColumns}
                    dataSource={ordersQuery.data?.data ?? []}
                    loading={ordersQuery.isLoading || ordersQuery.isFetching}
                    locale={{ emptyText: <Empty description="No orders" /> }}
                    pagination={{
                      current: ordersPage,
                      pageSize: ordersPageSize,
                      total: Number(ordersQuery.data?.count ?? 0),
                      showSizeChanger: true,
                      onChange: (p, ps) => {
                        setOrdersPage(p);
                        setOrdersPageSize(ps);
                      },
                    }}
                    scroll={{ x: 900 }}
                  />
                </div>
              ),
            },
            {
              key: "earnings",
              label: "Earnings",
              children: (
                <div className="space-y-3">
                  <Input
                    allowClear
                    placeholder="Search earnings…"
                    value={earningsSearch}
                    onChange={(e) => {
                      setEarningsPage(1);
                      setEarningsSearch(e.target.value);
                    }}
                  />
                  <Table<StorefrontEarningDto>
                    rowKey="id"
                    columns={earningsColumns}
                    dataSource={earningsQuery.data?.data ?? []}
                    loading={earningsQuery.isLoading || earningsQuery.isFetching}
                    locale={{ emptyText: <Empty description="No earnings" /> }}
                    pagination={{
                      current: earningsPage,
                      pageSize: earningsPageSize,
                      total: Number(earningsQuery.data?.count ?? 0),
                      showSizeChanger: true,
                      onChange: (p, ps) => {
                        setEarningsPage(p);
                        setEarningsPageSize(ps);
                      },
                    }}
                    scroll={{ x: 700 }}
                  />
                </div>
              ),
            },
            {
              key: "transactions",
              label: "Transactions",
              children: (
                <div className="space-y-3">
                  <Input
                    allowClear
                    placeholder="Search transactions…"
                    value={txSearch}
                    onChange={(e) => {
                      setTxPage(1);
                      setTxSearch(e.target.value);
                    }}
                  />
                  <Table<StorefrontWalletTransactionDto>
                    rowKey="id"
                    columns={txColumns}
                    dataSource={txQuery.data?.data ?? []}
                    loading={txQuery.isLoading || txQuery.isFetching}
                    locale={{ emptyText: <Empty description="No transactions" /> }}
                    pagination={{
                      current: txPage,
                      pageSize: txPageSize,
                      total: Number(txQuery.data?.count ?? 0),
                      showSizeChanger: true,
                      onChange: (p, ps) => {
                        setTxPage(p);
                        setTxPageSize(ps);
                      },
                    }}
                    scroll={{ x: 800 }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <OrderDetailModal
        orderId={selectedOrderId}
        open={orderOpen}
        onOpenChange={(v) => {
          setOrderOpen(v);
          if (!v) setSelectedOrderId(null);
        }}
        onUpdated={() => ordersQuery.refetch()}
      />
    </div>
  );
}
