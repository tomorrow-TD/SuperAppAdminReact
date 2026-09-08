import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntdApp,
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tabs,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  DashboardOutlined,
  MailOutlined,
  ReloadOutlined,
  SaveOutlined,
  ShopOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  ensureStorefrontAdminSession,
  storefrontAdminApiPost,
} from "@/lib/api";
import type {
  PaginationResponse,
  StorefrontDashboardActivityDto,
  StorefrontDashboardDto,
  StorefrontBrandReturnDto,
  StorefrontOwnerBrandDto,
  StorefrontOwnerCandidateDto,
  StorefrontOwnerDetailDto,
  StorefrontInvitationSendResponse,
  StorefrontCategoryDto,
  StorefrontPayoutDto,
  StorefrontWalletOrderDto,
  StorefrontWalletStatsDto,
  StorefrontWalletTransactionDto,
  SuperAdminWalletDto,
  SuperAdminWalletTransactionDto,
} from "@/lib/types";
import { Permission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const { RangePicker } = DatePicker;

function ownerName(owner: Pick<StorefrontOwnerDetailDto, "id" | "firstName" | "lastName" | "companyName" | "email">) {
  return [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.companyName || owner.email || owner.id;
}

function candidateName(candidate: StorefrontOwnerCandidateDto) {
  return [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") || candidate.companyName || candidate.email || candidate.id;
}

function dashboardUrl(ownerId: string, range: [Dayjs | null, Dayjs | null] | null) {
  const params = new URLSearchParams({ recentActivitySize: "20" });
  if (range?.[0]) params.set("startDate", range[0].toISOString());
  if (range?.[1]) params.set("endDate", range[1].toISOString());
  return `admin/storefront/dashboard/${ownerId}?${params.toString()}`;
}

function statusTag(owner: StorefrontOwnerDetailDto) {
  if (owner.isInvitationAccepted) return <Tag color="success">Accepted</Tag>;
  if (owner.isInvited) return <Tag color="processing">Invited</Tag>;
  return <Tag>Not invited</Tag>;
}

interface KpiProps {
  title: string;
  value: string;
}

function Kpi({ title, value }: KpiProps) {
  return (
    <Card styles={{ body: { padding: 18 } }}>
      <Statistic title={title} value={value} valueStyle={{ fontSize: 22 }} />
    </Card>
  );
}

export default function StorefrontPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const canEditOwners = useAuthStore((s) => s.hasPermission(Permission.CanEditUser));
  const canEditBrands = useAuthStore((s) => s.hasPermission(Permission.CanEditBrands));
  const canEditProducts = useAuthStore((s) => s.hasPermission(Permission.CanEditProducts));

  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const debouncedCandidateSearch = useDebouncedValue(candidateSearch, 350);
  const [dashboardRange, setDashboardRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [primaryBrandId, setPrimaryBrandId] = useState<string | null>(null);
  const [marginDraft, setMarginDraft] = useState<Record<string, number | null>>({});
  const [savingBrands, setSavingBrands] = useState(false);
  const [workingOwnerId, setWorkingOwnerId] = useState<string | null>(null);
  const [globalMarginDraft, setGlobalMarginDraft] = useState<Record<string, number>>({});
  const [ownerDefaultMargin, setOwnerDefaultMargin] = useState<number | null>(null);
  const [ownerAdjustment, setOwnerAdjustment] = useState({ amount: 0, reference: "", description: "" });
  const [superAdjustment, setSuperAdjustment] = useState({ amount: 0, reference: "", description: "" });
  const [categoryDraft, setCategoryDraft] = useState({ name: "", imageUrl: "" });
  const [assignmentDraft, setAssignmentDraft] = useState({ categoryId: "", productIds: "" });
  const [themeBrandId, setThemeBrandId] = useState("");
  const [themeName, setThemeName] = useState("brand-default");
  const [themeJson, setThemeJson] = useState("{}");
  const [themeActive, setThemeActive] = useState(true);

  const ownersQuery = useQuery({
    queryKey: ["storefront-owners"],
    queryFn: async () => {
      const result = await apiGet<PaginationResponse<StorefrontOwnerDetailDto>>(
        "Storefront/GetStorefrontOwners?PageNumber=1&PageSize=100",
      );
      if (!result.status) throw new Error(result.message ?? "Failed to load storefront owners");
      return result.data;
    },
  });

  const candidatesQuery = useQuery({
    queryKey: ["storefront-owner-candidates", debouncedCandidateSearch],
    enabled: debouncedCandidateSearch.trim().length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({ PageNumber: "1", PageSize: "25", SearchString: debouncedCandidateSearch.trim() });
      const result = await apiGet<PaginationResponse<StorefrontOwnerCandidateDto>>(
        `Storefront/GetOwnerCandidates?${params.toString()}`,
      );
      if (!result.status) throw new Error(result.message ?? "Failed to search customers");
      return result.data;
    },
  });

  const globalBrandsQuery = useQuery({
    queryKey: ["storefront-brands-global"],
    queryFn: async () => {
      const result = await apiGet<PaginationResponse<StorefrontBrandReturnDto>>(
        "Storefront/GetStorefrontBrands?PageNumber=1&PageSize=100&isActive=true",
      );
      if (!result.status) throw new Error(result.message ?? "Failed to load storefront brands");
      return result.data;
    },
  });

  const brandsQuery = useQuery({
    queryKey: ["storefront-owner-brands", selectedOwnerId],
    enabled: !!selectedOwnerId,
    queryFn: async () => {
      const result = await apiGet<StorefrontOwnerBrandDto[]>(
        `Storefront/GetStorefrontOwnerBrands/${selectedOwnerId}`,
      );
      if (!result.status) throw new Error(result.message ?? "Failed to load owner brands");
      return result.data ?? [];
    },
  });

  const dashboardQuery = useQuery({
    queryKey: ["storefront-dashboard", selectedOwnerId, dashboardRange?.[0]?.valueOf(), dashboardRange?.[1]?.valueOf()],
    enabled: !!selectedOwnerId,
    queryFn: async () => {
      const result = await apiGet<StorefrontDashboardDto>(dashboardUrl(selectedOwnerId!, dashboardRange));
      if (!result.status) throw new Error(result.message ?? "Failed to load storefront dashboard");
      return result.data;
    },
  });

  const walletStatsQuery = useQuery({
    queryKey: ["storefront-wallet-stats", selectedOwnerId],
    enabled: !!selectedOwnerId,
    queryFn: async () => {
      const result = await apiGet<StorefrontWalletStatsDto>(`admin/storefront/wallets/${selectedOwnerId}/stats`);
      if (!result.status) throw new Error(result.message ?? "Failed to load owner wallet stats");
      return result.data;
    },
  });

  const walletTransactionsQuery = useQuery({
    queryKey: ["storefront-wallet-transactions", selectedOwnerId],
    enabled: !!selectedOwnerId,
    queryFn: async () => {
      const result = await apiGet<PaginationResponse<StorefrontWalletTransactionDto>>(`admin/storefront/wallets/${selectedOwnerId}/transactions?PageNumber=1&PageSize=50`);
      if (!result.status) throw new Error(result.message ?? "Failed to load owner wallet transactions");
      return result.data;
    },
  });

  const walletOrdersQuery = useQuery({
    queryKey: ["storefront-wallet-orders", selectedOwnerId],
    enabled: !!selectedOwnerId,
    queryFn: async () => {
      const result = await apiGet<PaginationResponse<StorefrontWalletOrderDto>>(`admin/storefront/wallets/${selectedOwnerId}/orders?PageNumber=1&PageSize=50`);
      if (!result.status) throw new Error(result.message ?? "Failed to load owner wallet orders");
      return result.data;
    },
  });

  const payoutsQuery = useQuery({
    queryKey: ["storefront-payouts", selectedOwnerId],
    enabled: !!selectedOwnerId,
    queryFn: async () => {
      const result = await apiGet<PaginationResponse<StorefrontPayoutDto>>(`admin/storefront/payouts?ownerId=${selectedOwnerId}&PageNumber=1&PageSize=50`);
      if (!result.status) throw new Error(result.message ?? "Failed to load owner payouts");
      return result.data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["storefront-categories"],
    queryFn: async () => {
      const result = await apiGet<PaginationResponse<StorefrontCategoryDto>>("Storefront/GetStorefrontCategories?PageNumber=1&PageSize=100&isActive=true");
      if (!result.status) throw new Error(result.message ?? "Failed to load storefront categories");
      return result.data;
    },
  });

  const superAdminWalletQuery = useQuery({
    queryKey: ["storefront-superadmin-wallet"],
    queryFn: async () => {
      const result = await apiGet<SuperAdminWalletDto>("admin/storefront/superadmin-wallet");
      if (!result.status) throw new Error(result.message ?? "Failed to load SuperApp settlement wallet");
      return result.data;
    },
  });

  const superAdminTransactionsQuery = useQuery({
    queryKey: ["storefront-superadmin-wallet-transactions"],
    queryFn: async () => {
      const result = await apiGet<PaginationResponse<SuperAdminWalletTransactionDto>>("admin/storefront/superadmin-wallet/transactions?PageNumber=1&PageSize=50");
      if (!result.status) throw new Error(result.message ?? "Failed to load settlement wallet transactions");
      return result.data;
    },
  });

  const themeQuery = useQuery({
    queryKey: ["storefront-brand-theme", themeBrandId],
    enabled: !!themeBrandId,
    queryFn: async () => {
      const result = await apiGet<import("@/lib/types").StorefrontBrandThemeDto>(`Storefront/GetStorefrontBrandTheme/${themeBrandId}`);
      if (!result.status) throw new Error(result.message ?? "Failed to load brand theme");
      return result.data;
    },
  });

  const owners = ownersQuery.data?.data ?? [];
  const candidates = candidatesQuery.data?.data ?? [];
  const selectedOwner = owners.find((owner) => owner.id === selectedOwnerId) ?? null;
  const brandRows = brandsQuery.data ?? [];
  const globalBrandRows = globalBrandsQuery.data?.data ?? [];
  const selectedBrandSet = useMemo(() => new Set(selectedBrandIds), [selectedBrandIds]);

  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) setSelectedOwnerId(owners[0].id);
  }, [owners, selectedOwnerId]);

  useEffect(() => {
    setSelectedBrandIds(brandRows.filter((brand) => brand.isSelected).map((brand) => brand.storefrontBrandId));
    setPrimaryBrandId(brandRows.find((brand) => brand.isPrimary)?.storefrontBrandId ?? null);
    setMarginDraft(Object.fromEntries(brandRows.map((brand) => [brand.storefrontBrandId, brand.storefrontPriceMargin])));
    setOwnerDefaultMargin(brandRows[0]?.ownerDefaultStorefrontPriceMargin ?? selectedOwner?.defaultStorefrontPriceMargin ?? null);
  }, [brandRows, selectedOwner]);

  useEffect(() => {
    setGlobalMarginDraft(Object.fromEntries(globalBrandRows.map((brand) => [brand.id, brand.storefrontPriceMargin])));
  }, [globalBrandRows]);

  useEffect(() => {
    if (!themeQuery.data) return;
    setThemeName(themeQuery.data.themeName);
    setThemeJson(themeQuery.data.themeJson);
    setThemeActive(themeQuery.data.isActive);
  }, [themeQuery.data]);

  async function invite(ownerId: string, resend = false) {
    setWorkingOwnerId(ownerId);
    try {
      const session = await ensureStorefrontAdminSession();
      if (!session.status) {
        message.error(session.message ?? "Storefront administrator authorization failed");
        return;
      }
      const result = await storefrontAdminApiPost<StorefrontInvitationSendResponse>(
        `admin/storefront/owners/${ownerId}/invitation`,
        { resend },
      );
      if (!result.status) {
        message.error(result.message ?? "Invitation could not be sent");
        return;
      }
      message.success(resend ? "Invitation resent" : "Invitation sent");
      await queryClient.invalidateQueries({ queryKey: ["storefront-owners"] });
      await queryClient.invalidateQueries({ queryKey: ["storefront-owner-candidates"] });
    } finally {
      setWorkingOwnerId(null);
    }
  }

  async function revoke(ownerId: string) {
    setWorkingOwnerId(ownerId);
    try {
      const session = await ensureStorefrontAdminSession();
      if (!session.status) {
        message.error(session.message ?? "Storefront administrator authorization failed");
        return;
      }
      const result = await storefrontAdminApiPost<null>(
        `admin/storefront/owners/${ownerId}/invitation/revoke`,
      );
      if (!result.status) message.error(result.message ?? "Invitation could not be revoked");
      else {
        message.success("Invitation revoked");
        await queryClient.invalidateQueries({ queryKey: ["storefront-owners"] });
      }
    } finally {
      setWorkingOwnerId(null);
    }
  }

  async function saveOwnerBrands() {
    if (!selectedOwnerId) return;
    if (primaryBrandId && !selectedBrandSet.has(primaryBrandId)) {
      message.error("The primary brand must be selected");
      return;
    }
    setSavingBrands(true);
    try {
      const result = await apiPut<StorefrontOwnerBrandDto[]>(
        `Storefront/ConfigureStorefrontOwner/${selectedOwnerId}`,
        {
          storefrontBrandIds: selectedBrandIds,
          primaryStorefrontBrandId: primaryBrandId,
          defaultStorefrontPriceMargin: ownerDefaultMargin,
          brandMargins: brandRows.filter((brand) => selectedBrandSet.has(brand.storefrontBrandId)).map((brand) => ({
            storefrontBrandId: brand.storefrontBrandId,
            storefrontPriceMargin: marginDraft[brand.storefrontBrandId] ?? null,
          })),
        },
      );
      if (!result.status) {
        message.error(result.message ?? "Owner storefront configuration could not be saved");
        return;
      }
      message.success("Storefront brands and owner margins saved");
      await queryClient.invalidateQueries({ queryKey: ["storefront-owner-brands", selectedOwnerId] });
      await queryClient.invalidateQueries({ queryKey: ["storefront-dashboard", selectedOwnerId] });
    } finally {
      setSavingBrands(false);
    }
  }

  async function payoutAction(payoutId: string, action: "approve" | "reject" | "process") {
    const reason = action === "reject" ? window.prompt("Reason for rejecting this payout") ?? "" : undefined;
    const result = await apiPost<StorefrontPayoutDto>(`admin/storefront/payouts/${payoutId}/${action}`, action === "reject" ? { reason } : undefined);
    if (!result.status) message.error(result.message ?? `Payout could not be ${action}d`);
    else {
      message.success(`Payout ${action}d`);
      await queryClient.invalidateQueries({ queryKey: ["storefront-payouts", selectedOwnerId] });
      await queryClient.invalidateQueries({ queryKey: ["storefront-wallet-stats", selectedOwnerId] });
    }
  }

  async function adjustOwnerWallet(type: "credit" | "debit") {
    if (!selectedOwnerId || ownerAdjustment.amount <= 0 || !ownerAdjustment.reference || !ownerAdjustment.description) {
      message.error("Amount, reference, and description are required");
      return;
    }
    const result = await apiPost<StorefrontWalletTransactionDto>(`admin/storefront/wallets/${selectedOwnerId}/${type}`, ownerAdjustment);
    if (!result.status) message.error(result.message ?? `Wallet ${type} failed`);
    else {
      message.success(`Owner wallet ${type}ed`);
      setOwnerAdjustment({ amount: 0, reference: "", description: "" });
      await queryClient.invalidateQueries({ queryKey: ["storefront-wallet-stats", selectedOwnerId] });
      await queryClient.invalidateQueries({ queryKey: ["storefront-wallet-transactions", selectedOwnerId] });
    }
  }

  async function adjustSuperAdminWallet(type: "credit" | "debit") {
    if (superAdjustment.amount <= 0 || !superAdjustment.reference || !superAdjustment.description) {
      message.error("Amount, reference, and description are required");
      return;
    }
    const result = await apiPost<SuperAdminWalletTransactionDto>(`admin/storefront/superadmin-wallet/${type}`, superAdjustment);
    if (!result.status) message.error(result.message ?? `Settlement wallet ${type} failed`);
    else {
      message.success(`Settlement wallet ${type}ed`);
      setSuperAdjustment({ amount: 0, reference: "", description: "" });
      await queryClient.invalidateQueries({ queryKey: ["storefront-superadmin-wallet"] });
      await queryClient.invalidateQueries({ queryKey: ["storefront-superadmin-wallet-transactions"] });
    }
  }

  async function createCategory() {
    if (!categoryDraft.name.trim()) { message.error("Category name is required"); return; }
    const result = await apiPost<StorefrontCategoryDto>("Storefront/AddStorefrontCategory", { name: categoryDraft.name.trim(), imageUrl: categoryDraft.imageUrl || null, isActive: true });
    if (!result.status) message.error(result.message ?? "Category could not be created");
    else { message.success("Category created"); setCategoryDraft({ name: "", imageUrl: "" }); await queryClient.invalidateQueries({ queryKey: ["storefront-categories"] }); }
  }

  async function assignProducts() {
    const productIds = assignmentDraft.productIds.split(",").map((value) => value.trim()).filter(Boolean);
    if (!assignmentDraft.categoryId || productIds.length === 0) { message.error("Choose a category and enter at least one product ID"); return; }
    const result = await apiPost<boolean>("Storefront/AddProductsToStorefrontCategory", { storefrontCategoryId: assignmentDraft.categoryId, productIds });
    if (!result.status) message.error(result.message ?? "Products could not be assigned");
    else { message.success("Products assigned to category"); setAssignmentDraft({ categoryId: assignmentDraft.categoryId, productIds: "" }); await queryClient.invalidateQueries({ queryKey: ["storefront-categories"] }); }
  }

  async function deleteCategory(categoryId: string) {
    if (!window.confirm("Delete this storefront category?")) return;
    const result = await apiDelete<boolean>(`Storefront/DeleteStorefrontCategory/${categoryId}`);
    if (!result.status) message.error(result.message ?? "Category could not be deleted");
    else { message.success("Category deleted"); await queryClient.invalidateQueries({ queryKey: ["storefront-categories"] }); }
  }

  async function saveBrandTheme() {
    if (!themeBrandId) { message.error("Choose a brand first"); return; }
    try {
      JSON.parse(themeJson);
    } catch {
      message.error("Theme JSON must be valid JSON");
      return;
    }
    const result = await apiPut<import("@/lib/types").StorefrontBrandThemeDto>(`Storefront/SetStorefrontBrandTheme/${themeBrandId}`, { themeName, themeJson, isActive: themeActive });
    if (!result.status) message.error(result.message ?? "Brand theme could not be saved");
    else { message.success("Brand theme saved"); await queryClient.invalidateQueries({ queryKey: ["storefront-brand-theme", themeBrandId] }); await queryClient.invalidateQueries({ queryKey: ["storefront-owner-brands"] }); }
  }

  async function saveGlobalMargin(brand: StorefrontBrandReturnDto) {
    if (!canEditBrands) return;
    const result = await apiPut<StorefrontBrandReturnDto>(
      `Storefront/UpdateStorefrontBrand/${brand.id}`,
      {
        brandId: brand.brandId,
        brandImageUrl: brand.brandImageUrl,
        name: brand.name,
        dynamicsId: brand.dynamicsId,
        storefrontPriceMargin: globalMarginDraft[brand.id] ?? 0,
        isActive: brand.isActive,
      },
    );
    if (!result.status) message.error(result.message ?? "Global brand margin could not be saved");
    else {
      message.success(`${brand.name ?? "Brand"} global margin updated`);
      await queryClient.invalidateQueries({ queryKey: ["storefront-brands-global"] });
      await queryClient.invalidateQueries({ queryKey: ["storefront-owner-brands"] });
    }
  }

  const ownerColumns: TableColumnsType<StorefrontOwnerDetailDto> = [
    {
      title: "Owner",
      key: "owner",
      render: (_, owner) => (
        <div>
          <div className="font-medium">{ownerName(owner)}</div>
          <div className="text-xs text-muted-foreground">{owner.email}</div>
        </div>
      ),
    },
    { title: "Phone", dataIndex: "phoneNumber", render: (value) => value ?? "—" },
    { title: "CAC", dataIndex: "isCacVerified", render: (value: boolean) => value ? <Tag color="success">Verified</Tag> : <Tag>Unverified</Tag> },
    { title: "Invitation", key: "invitation", render: (_, owner) => statusTag(owner) },
    {
      title: "Actions",
      key: "actions",
      align: "right",
      render: (_, owner) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => setSelectedOwnerId(owner.id)}>Manage</Button>
          {canEditOwners && !owner.isInvitationAccepted && (
            <Button
              size="small"
              icon={<MailOutlined />}
              loading={workingOwnerId === owner.id}
              onClick={() => invite(owner.id, owner.isInvited)}
            >
              {owner.isInvited ? "Resend" : "Invite"}
            </Button>
          )}
          {canEditOwners && owner.isInvited && !owner.isInvitationAccepted && (
            <Button size="small" danger loading={workingOwnerId === owner.id} onClick={() => revoke(owner.id)}>Revoke</Button>
          )}
        </Space>
      ),
    },
  ];

  const candidateColumns: TableColumnsType<StorefrontOwnerCandidateDto> = [
    { title: "Customer", key: "customer", render: (_, candidate) => <div><div className="font-medium">{candidateName(candidate)}</div><div className="text-xs text-muted-foreground">{candidate.email ?? "—"}</div></div> },
    { title: "Phone", dataIndex: "phoneNumber", render: (value) => value ?? "—" },
    { title: "CAC", dataIndex: "isCacVerified", render: (value: boolean) => value ? <Tag color="success">Verified</Tag> : <Tag>Unverified</Tag> },
    { title: "Status", key: "status", render: (_, candidate) => candidate.isInvitationAccepted ? <Tag color="success">Accepted</Tag> : candidate.isAlreadyInvited ? <Tag color="processing">Invited</Tag> : <Tag>Available</Tag> },
    { title: "", key: "action", align: "right", render: (_, candidate) => <Button size="small" type="primary" icon={<UserAddOutlined />} disabled={!canEditOwners || candidate.isInvitationAccepted} loading={workingOwnerId === candidate.id} onClick={() => invite(candidate.id, candidate.isAlreadyInvited)}>{candidate.isAlreadyInvited ? "Resend" : "Invite"}</Button> },
  ];

  const brandColumns: TableColumnsType<StorefrontOwnerBrandDto> = [
    { title: "Brand", key: "brand", render: (_, brand) => <Space><Avatar size="small" src={brand.brandImageUrl ?? undefined} icon={<ShopOutlined />} />{brand.name ?? "Unnamed brand"}</Space> },
    { title: "Selected", key: "selected", width: 110, render: (_, brand) => <Switch checked={selectedBrandSet.has(brand.storefrontBrandId)} disabled={!canEditBrands} onChange={(checked) => { setSelectedBrandIds((current) => checked ? [...new Set([...current, brand.storefrontBrandId])] : current.filter((id) => id !== brand.storefrontBrandId)); if (checked && !primaryBrandId) setPrimaryBrandId(brand.storefrontBrandId); if (!checked && primaryBrandId === brand.storefrontBrandId) setPrimaryBrandId(null); }} /> },
    { title: "Primary", key: "primary", width: 110, render: (_, brand) => <Switch checked={primaryBrandId === brand.storefrontBrandId} disabled={!canEditBrands || !selectedBrandSet.has(brand.storefrontBrandId)} onChange={(checked) => setPrimaryBrandId(checked ? brand.storefrontBrandId : null)} /> },
    { title: "Global margin", key: "global", align: "right", render: (_, brand) => `${brand.globalStorefrontPriceMargin}%` },
    { title: "Owner margin", key: "ownerMargin", width: 170, render: (_, brand) => <InputNumber min={0} max={1000} precision={2} addonAfter="%" value={marginDraft[brand.storefrontBrandId] ?? null} placeholder="Global" disabled={!canEditBrands || !selectedBrandSet.has(brand.storefrontBrandId)} onChange={(value) => setMarginDraft((current) => ({ ...current, [brand.storefrontBrandId]: value }))} /> },
    { title: "Theme", key: "theme", render: (_, brand) => brand.themeName ?? "Brand default" },
  ];

  const activityColumns: TableColumnsType<StorefrontDashboardActivityDto> = [
    { title: "Date", dataIndex: "date", render: (value) => formatDate(value) },
    { title: "Activity", dataIndex: "description", render: (value, activity) => <div><div>{value}</div><div className="text-xs text-muted-foreground">{activity.reference}</div></div> },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Status", dataIndex: "status", render: (value) => <Tag>{value}</Tag> },
  ];

  const globalBrandColumns: TableColumnsType<StorefrontBrandReturnDto> = [
    { title: "Brand", dataIndex: "name", render: (value) => value ?? "Unnamed brand" },
    { title: "Dynamics ID", dataIndex: "dynamicsId", render: (value) => value ?? "—" },
    { title: "Global margin", key: "margin", width: 210, render: (_, brand) => <Space><InputNumber min={0} max={1000} precision={2} addonAfter="%" value={globalMarginDraft[brand.id] ?? 0} disabled={!canEditBrands} onChange={(value) => setGlobalMarginDraft((current) => ({ ...current, [brand.id]: value ?? 0 }))} /><Button size="small" type="link" disabled={!canEditBrands} onClick={() => saveGlobalMargin(brand)}>Save</Button></Space> },
  ];

  const payoutColumns: TableColumnsType<StorefrontPayoutDto> = [
    { title: "Requested", dataIndex: "requestedAt", render: (value) => formatDate(value) },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Bank", key: "bank", render: (_, payout) => `${payout.accountName} ••••${payout.accountNumberLast4}` },
    { title: "Status", dataIndex: "status", render: (value) => <Tag color={value === "Paid" ? "success" : value === "Rejected" || value === "Cancelled" ? "error" : "processing"}>{value}</Tag> },
    { title: "Action", key: "action", align: "right", render: (_, payout) => <Space size={4}>{payout.status === "Requested" && <><Button size="small" type="primary" onClick={() => payoutAction(payout.id, "approve")}>Approve</Button><Button size="small" danger onClick={() => payoutAction(payout.id, "reject")}>Reject</Button></>}{(payout.status === "Approved" || payout.status === "Processing") && <Button size="small" onClick={() => payoutAction(payout.id, "process")}>Process</Button>}</Space> },
  ];

  const transactionColumns: TableColumnsType<StorefrontWalletTransactionDto> = [
    { title: "Date", dataIndex: "transactionDate", render: (value) => formatDate(value) },
    { title: "Type", dataIndex: "type", render: (value) => <Tag color={value === "credit" ? "success" : "error"}>{value}</Tag> },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value, row) => <span className={row.type === "credit" ? "text-green-600" : "text-red-600"}>{row.type === "credit" ? "+" : "-"}{formatCurrency(value, "NGN")}</span> },
    { title: "Reference", dataIndex: "reference" },
    { title: "Balance after", dataIndex: "balanceAfter", align: "right", render: (value) => formatCurrency(value, "NGN") },
  ];

  const orderColumns: TableColumnsType<StorefrontWalletOrderDto> = [
    { title: "Order", dataIndex: "orderReference", render: (value, row) => value ?? row.orderId },
    { title: "Customer", dataIndex: "customerName", render: (value) => value ?? "—" },
    { title: "Value", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Commission", dataIndex: "commission", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Status", dataIndex: "commissionStatus", render: (value) => <Tag>{value ?? "—"}</Tag> },
  ];

  const superTransactionColumns: TableColumnsType<SuperAdminWalletTransactionDto> = [
    { title: "Date", dataIndex: "transactionDate", render: (value) => formatDate(value) },
    { title: "Type", dataIndex: "type", render: (value) => <Tag>{value}</Tag> },
    { title: "Amount", dataIndex: "amount", align: "right", render: (value) => formatCurrency(value, "NGN") },
    { title: "Reference", dataIndex: "reference" },
    { title: "Owner", dataIndex: "storefrontOwnerId", render: (value) => value ?? "—" },
  ];

  const categories = categoriesQuery.data?.data ?? [];
  const payouts = payoutsQuery.data?.data ?? [];
  const transactions = walletTransactionsQuery.data?.data ?? [];
  const walletOrders = walletOrdersQuery.data?.data ?? [];
  const superTransactions = superAdminTransactionsQuery.data?.data ?? [];

  const dashboard = dashboardQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Title level={3} className="!m-0">Storefront</Typography.Title>
          <Typography.Text type="secondary">Invite storefront owners, configure their assortment and margins, and monitor settlement activity.</Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { ownersQuery.refetch(); if (selectedOwnerId) { brandsQuery.refetch(); dashboardQuery.refetch(); } }}>Refresh</Button>
      </div>

      <Card title={<Space><UserAddOutlined />Invite a SuperApp customer</Space>}>
        <Typography.Paragraph type="secondary" className="!mb-3">Search for an existing CAC-verified customer. Inviting a customer creates the storefront-owner profile and emails a one-time registration link.</Typography.Paragraph>
        <Input prefix={<MailOutlined />} allowClear value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search by name, email, phone, or company…" />
        {candidateSearch.trim().length > 0 && candidateSearch.trim().length < 2 && <Typography.Text type="secondary" className="mt-2 block">Enter at least two characters to search.</Typography.Text>}
        {debouncedCandidateSearch.trim().length >= 2 && (
          <Table<StorefrontOwnerCandidateDto> className="mt-4" rowKey="id" size="small" dataSource={candidates} columns={candidateColumns} loading={candidatesQuery.isLoading || candidatesQuery.isFetching} pagination={false} locale={{ emptyText: <Empty description="No eligible customer found" /> }} />
        )}
      </Card>

      <Card title="Storefront owners" styles={{ body: { padding: 0 } }}>
        <Table<StorefrontOwnerDetailDto> rowKey="id" dataSource={owners} columns={ownerColumns} loading={ownersQuery.isLoading || ownersQuery.isFetching} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty description="No storefront owners have been invited" /> }} />
      </Card>

      <Card title="Global storefront brand margins">
        <Typography.Paragraph type="secondary" className="!mb-3">This is the fallback margin for every storefront owner-brand selection that does not have an owner-specific override.</Typography.Paragraph>
        <Table<StorefrontBrandReturnDto> rowKey="id" size="small" dataSource={globalBrandRows} columns={globalBrandColumns} loading={globalBrandsQuery.isLoading || globalBrandsQuery.isFetching} pagination={false} locale={{ emptyText: <Empty description="No active storefront brands" /> }} />
      </Card>

      <Card title="Storefront categories">
        <Space wrap className="mb-4">
          <Input placeholder="Category name" value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} />
          <Input placeholder="Category image URL" value={categoryDraft.imageUrl} onChange={(event) => setCategoryDraft((current) => ({ ...current, imageUrl: event.target.value }))} />
          <Button type="primary" disabled={!canEditProducts} onClick={createCategory}>Create category</Button>
        </Space>
        <Table<StorefrontCategoryDto> rowKey="id" size="small" dataSource={categories} loading={categoriesQuery.isLoading} columns={[
          { title: "Category", key: "category", render: (_, category) => <Space><Avatar size="small" src={category.imageUrl ?? undefined} icon={<ShopOutlined />} />{category.name ?? "Unnamed"}</Space> },
          { title: "Products", dataIndex: "productCount" },
          { title: "Action", key: "action", align: "right", render: (_, category) => <Button danger size="small" disabled={!canEditProducts} onClick={() => deleteCategory(category.id)}>Delete</Button> },
        ]} pagination={false} locale={{ emptyText: <Empty description="No storefront categories" /> }} />
        <Space wrap className="mt-4">
          <select className="h-8 rounded border px-2" value={assignmentDraft.categoryId} onChange={(event) => setAssignmentDraft((current) => ({ ...current, categoryId: event.target.value }))}>
            <option value="">Choose category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <Input className="min-w-[320px]" placeholder="Product IDs, comma separated" value={assignmentDraft.productIds} onChange={(event) => setAssignmentDraft((current) => ({ ...current, productIds: event.target.value }))} />
          <Button disabled={!canEditProducts} onClick={assignProducts}>Assign products</Button>
        </Space>
        <Typography.Text type="secondary" className="mt-2 block">Assignment accepts one product ID or a comma-separated list for bulk category assignment.</Typography.Text>
      </Card>

      {selectedOwner && (
        <>
          <Card title={<Space><DashboardOutlined />{ownerName(selectedOwner)} storefront activity</Space>} extra={<RangePicker showTime value={dashboardRange} onChange={(value) => setDashboardRange(value ? [value[0] ?? null, value[1] ?? null] : null)} />}>
            {dashboardQuery.isError && <Alert type="error" showIcon message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Dashboard could not be loaded"} />}
            {dashboard && <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} lg={6}><Kpi title="Gross sales" value={formatCurrency(dashboard.grossSales, "NGN")} /></Col>
              <Col xs={24} sm={12} lg={6}><Kpi title="Wallet balance" value={formatCurrency(dashboard.currentWalletBalance, "NGN")} /></Col>
              <Col xs={24} sm={12} lg={6}><Kpi title="Current commission" value={formatCurrency(dashboard.currentCommission, "NGN")} /></Col>
              <Col xs={24} sm={12} lg={6}><Kpi title="Orders" value={formatNumber(dashboard.totalOrders)} /></Col>
              <Col xs={24} sm={12} lg={6}><Kpi title="Paid orders" value={formatNumber(dashboard.paidOrders)} /></Col>
              <Col xs={24} sm={12} lg={6}><Kpi title="Commission paid" value={formatCurrency(dashboard.commissionPaid, "NGN")} /></Col>
              <Col xs={24} sm={12} lg={6}><Kpi title="Pending commission" value={formatCurrency(dashboard.pendingCommission, "NGN")} /></Col>
              <Col xs={24} sm={12} lg={6}><Kpi title="Reserved for payout" value={formatCurrency(dashboard.reservedForPayout, "NGN")} /></Col>
            </Row>}
          </Card>

          <Card title="Owner brand assortment and margins" extra={<Button type="primary" icon={<SaveOutlined />} disabled={!canEditBrands || !selectedOwner.isInvitationAccepted} loading={savingBrands} onClick={saveOwnerBrands}>Save changes</Button>}>
            {!selectedOwner.isInvitationAccepted && <Alert className="mb-4" type="warning" showIcon message="Brand assortment can be configured after the owner accepts the invitation." />}
            <Space className="mb-4" wrap>
              <Typography.Text strong>Owner default margin</Typography.Text>
              <InputNumber min={0} max={1000} precision={2} addonAfter="%" value={ownerDefaultMargin} placeholder="Global fallback" disabled={!canEditBrands} onChange={(value) => setOwnerDefaultMargin(value)} />
              <Typography.Text type="secondary">Used when a selected brand has no owner-specific override.</Typography.Text>
            </Space>
            <Table<StorefrontOwnerBrandDto> rowKey="storefrontBrandId" size="small" dataSource={brandRows} columns={brandColumns} loading={brandsQuery.isLoading || brandsQuery.isFetching} pagination={false} locale={{ emptyText: <Empty description="No storefront brands configured" /> }} />
            {brandRows.length > 0 && <Typography.Text type="secondary" className="mt-3 block">Leave owner margin blank to use the global brand margin. The primary brand supplies the owner’s automatic theme.</Typography.Text>}
          </Card>

          <Card title="Brand theme templates">
            <Space wrap className="mb-3">
              <select className="h-8 rounded border px-2" value={themeBrandId} onChange={(event) => setThemeBrandId(event.target.value)}>
                <option value="">Choose a brand to edit</option>
                {globalBrandRows.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
              <Input placeholder="Theme name" value={themeName} disabled={!canEditBrands || !themeBrandId} onChange={(event) => setThemeName(event.target.value)} />
              <Switch checked={themeActive} disabled={!canEditBrands || !themeBrandId} onChange={setThemeActive} />
              <Button type="primary" disabled={!canEditBrands || !themeBrandId} onClick={saveBrandTheme}>Save theme</Button>
            </Space>
            <Input.TextArea rows={8} value={themeJson} disabled={!canEditBrands || !themeBrandId} onChange={(event) => setThemeJson(event.target.value)} placeholder='{"primaryColor":"#800020"}' />
            <Typography.Text type="secondary" className="mt-2 block">The storefront automatically uses the selected owner’s primary brand template unless the owner has a custom theme.</Typography.Text>
          </Card>

          <Card title="Recent settlement activity">
            <Table<StorefrontDashboardActivityDto> rowKey={(activity) => `${activity.type}-${activity.reference}-${activity.date}`} size="small" dataSource={dashboard?.recentActivity ?? []} columns={activityColumns} loading={dashboardQuery.isLoading || dashboardQuery.isFetching} pagination={false} locale={{ emptyText: <Empty description="No settlement activity" /> }} />
          </Card>

          <Card title="Owner wallet and payout operations">
            {walletStatsQuery.data && <Row gutter={[12, 12]} className="mb-4">
              <Col xs={12} lg={6}><Kpi title="Wallet balance" value={formatCurrency(walletStatsQuery.data.walletBalance, "NGN")} /></Col>
              <Col xs={12} lg={6}><Kpi title="Revenue" value={formatCurrency(walletStatsQuery.data.revenue, "NGN")} /></Col>
              <Col xs={12} lg={6}><Kpi title="Pending commission" value={formatCurrency(walletStatsQuery.data.pendingCommission, "NGN")} /></Col>
              <Col xs={12} lg={6}><Kpi title="Waiting orders" value={formatNumber(walletStatsQuery.data.ordersWaitingForCommission)} /></Col>
            </Row>}
            <Space wrap className="mb-4">
              <InputNumber min={0} precision={2} placeholder="Adjustment amount" value={ownerAdjustment.amount || null} onChange={(value) => setOwnerAdjustment((current) => ({ ...current, amount: value ?? 0 }))} />
              <Input placeholder="Reference" value={ownerAdjustment.reference} onChange={(event) => setOwnerAdjustment((current) => ({ ...current, reference: event.target.value }))} />
              <Input placeholder="Description" value={ownerAdjustment.description} onChange={(event) => setOwnerAdjustment((current) => ({ ...current, description: event.target.value }))} />
              <Button disabled={!canEditOwners} onClick={() => adjustOwnerWallet("credit")}>Credit owner</Button>
              <Button danger disabled={!canEditOwners} onClick={() => adjustOwnerWallet("debit")}>Debit owner</Button>
            </Space>
            <Tabs items={[
              { key: "ledger", label: "Ledger", children: <Table<StorefrontWalletTransactionDto> rowKey="id" size="small" dataSource={transactions} columns={transactionColumns} loading={walletTransactionsQuery.isLoading} pagination={false} /> },
              { key: "orders", label: "Orders", children: <Table<StorefrontWalletOrderDto> rowKey="orderId" size="small" dataSource={walletOrders} columns={orderColumns} loading={walletOrdersQuery.isLoading} pagination={false} /> },
              { key: "payouts", label: "Payouts", children: <Table<StorefrontPayoutDto> rowKey="id" size="small" dataSource={payouts} columns={payoutColumns} loading={payoutsQuery.isLoading} pagination={false} /> },
            ]} />
          </Card>

          <Card title="SuperApp settlement wallet" extra={superAdminWalletQuery.data && <Typography.Title level={4} className="!m-0">{formatCurrency(superAdminWalletQuery.data.balance, "NGN")}</Typography.Title>}>
            <Typography.Paragraph type="secondary">This is the isolated SuperApp wallet credited by storefront order settlement. It is separate from every storefront owner's wallet.</Typography.Paragraph>
            <Space wrap className="mb-4">
              <InputNumber min={0} precision={2} placeholder="Adjustment amount" value={superAdjustment.amount || null} onChange={(value) => setSuperAdjustment((current) => ({ ...current, amount: value ?? 0 }))} />
              <Input placeholder="Reference" value={superAdjustment.reference} onChange={(event) => setSuperAdjustment((current) => ({ ...current, reference: event.target.value }))} />
              <Input placeholder="Description" value={superAdjustment.description} onChange={(event) => setSuperAdjustment((current) => ({ ...current, description: event.target.value }))} />
              <Button disabled={!canEditOwners} onClick={() => adjustSuperAdminWallet("credit")}>Credit settlement wallet</Button>
              <Button danger disabled={!canEditOwners} onClick={() => adjustSuperAdminWallet("debit")}>Debit settlement wallet</Button>
            </Space>
            <Table<SuperAdminWalletTransactionDto> rowKey="id" size="small" dataSource={superTransactions} columns={superTransactionColumns} loading={superAdminTransactionsQuery.isLoading} pagination={false} />
          </Card>
        </>
      )}
    </div>
  );
}
