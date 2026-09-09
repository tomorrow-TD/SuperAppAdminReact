import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  EyeOutlined,
  MailOutlined,
  ShopOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  getStoreOwners,
  getStorefrontOwners,
  inviteStorefrontOwner,
  resendStorefrontOwnerInvitation,
  revokeStorefrontOwnerInvitation,
} from "@/lib/storefrontApi";
import type {
  StorefrontOwnerDetailDto,
  StorefrontStoreOwnerDto,
} from "@/lib/storefrontTypes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/**
 * Rows shown in the list are the union of:
 *  - `GetStoreOwners` (all CAC-registered users — the id space that
 *    wallet/orders/earnings endpoints key on), and
 *  - `GetStorefrontOwners` (invite/status overlay for users who are store owners).
 *
 * Merging both keeps the page populated (like before) while surfacing the new
 * invitation info.
 */
type OwnerRow = StorefrontStoreOwnerDto & {
  ownerDetail?: StorefrontOwnerDetailDto;
};

function ownerDisplayName(row: { firstName: string | null; lastName: string | null }) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
}

/** Map a StorefrontOwnerDetailDto onto the CAC-user list shape (used as fallback). */
function detailToBase(d: StorefrontOwnerDetailDto): StorefrontStoreOwnerDto {
  return {
    id: d.id ?? "",
    companyName: d.companyName,
    userName: d.userName,
    firstName: d.firstName,
    lastName: d.lastName,
    isCacVerified: d.isCacVerified,
    cacVerifiedAt: null,
  };
}

function ownerLabel(row: OwnerRow) {
  const name = ownerDisplayName(row);
  const company = row.companyName?.trim();
  if (company && name) return `${company} — ${name}`;
  return company || name || row.userName || row.id;
}

function openOwnerPath(row: {
  id: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
}) {
  const params = new URLSearchParams();
  if (row.companyName?.trim()) params.set("company", row.companyName.trim());
  const name = ownerDisplayName(row);
  if (name) params.set("owner", name);
  if (row.userName?.trim()) params.set("user", row.userName.trim());
  const qs = params.toString();
  return `/franchise-store-owners/${row.id}${qs ? `?${qs}` : ""}`;
}

function inviteStatusTag(row: OwnerRow) {
  if (row.ownerDetail?.isInvitationAccepted) return <Tag color="success">Accepted</Tag>;
  if (row.ownerDetail?.isInvited) return <Tag color="processing">Invited</Tag>;
  return <Tag>Not invited</Tag>;
}

function userStatusTag(row: OwnerRow) {
  const o = row.ownerDetail;
  if (o?.isSuspended) return <Tag color="error">Suspended</Tag>;
  if (o?.isDeleted) return <Tag color="error">Deleted</Tag>;
  const status = (o?.userStatus ?? "").toLowerCase();
  if (status === "active") return <Tag color="success">Active</Tag>;
  if (status === "rejected") return <Tag color="error">Rejected</Tag>;
  if (status === "suspended") return <Tag color="error">Suspended</Tag>;
  if (status === "incomplete") return <Tag color="warning">Incomplete</Tag>;
  if (status === "pending") return <Tag color="processing">Pending</Tag>;
  return o?.isActive ? <Tag color="success">Active</Tag> : <Tag>—</Tag>;
}

export default function FranchiseStoreOwnersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pendingOwnerId, setPendingOwnerId] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      PageSize: pageSize,
      PageNumber: page,
      SearchString: debouncedSearch.trim() || undefined,
    }),
    [pageSize, page, debouncedSearch],
  );

  // Base list: CAC-registered users via GetStoreOwners, with a fallback to
  // GetStorefrontOwners when the primary fails (e.g. returns 500).
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["storefront", "store-owners", queryParams],
    queryFn: async () => {
      const primary = await getStoreOwners(queryParams);
      if (primary.status && primary.data?.data?.length) {
        return { data: primary.data.data, count: Number(primary.data.count ?? 0) };
      }
      const fallback = await getStorefrontOwners(queryParams);
      if (fallback.status && fallback.data) {
        return {
          data: (fallback.data.data ?? []).map(detailToBase),
          count: Number(fallback.data.count ?? 0),
        };
      }
      if (!primary.status && !fallback.status) {
        throw new Error(primary.message ?? fallback.message ?? "Failed to load store owners");
      }
      return { data: [], count: 0 };
    },
  });

  // Overlay: invite/status info for users who are store owners.
  const overlayQuery = useQuery({
    queryKey: ["storefront", "store-owners-manage-overlay"],
    queryFn: async () => {
      const res = await getStorefrontOwners({ PageSize: 500, PageNumber: 1 });
      if (!res.status) return [];
      return res.data?.data ?? [];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError) {
      message.error(
        error instanceof Error ? error.message : "Unable to load store owners.",
      );
    }
  }, [isError, error, message]);

  const rows = useMemo<OwnerRow[]>(() => {
    const base = data?.data ?? [];
    const overlay = overlayQuery.data ?? [];

    const byId = new Map<string, StorefrontOwnerDetailDto>();
    const byUserName = new Map<string, StorefrontOwnerDetailDto>();
    for (const o of overlay) {
      if (o.id) byId.set(o.id, o);
      if (o.userName) byUserName.set(o.userName.toLowerCase(), o);
    }

    return base.map((b) => ({
      ...b,
      ownerDetail: byId.get(b.id) ?? byUserName.get((b.userName ?? "").toLowerCase()),
    }));
  }, [data?.data, overlayQuery.data]);

  const totalItems = Number(data?.count ?? 0);

  async function runOwnerAction(
    ownerId: string,
    action: "invite" | "resend" | "revoke",
  ) {
    setPendingOwnerId(ownerId);
    try {
      const res =
        action === "invite"
          ? await inviteStorefrontOwner(ownerId)
          : action === "resend"
            ? await resendStorefrontOwnerInvitation(ownerId)
            : await revokeStorefrontOwnerInvitation(ownerId);
      if (!res.status) {
        message.error(res.message ?? "Action failed");
      } else {
        message.success(res.message ?? "Done");
        queryClient.invalidateQueries({ queryKey: ["storefront", "store-owners-manage-overlay"] });
      }
    } finally {
      setPendingOwnerId(null);
    }
  }

  const columns: TableColumnsType<OwnerRow> = [
    {
      title: "Company",
      dataIndex: "companyName",
      render: (v: string | null, row) => (
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-[#800020] hover:underline"
          onClick={() => navigate(openOwnerPath(row))}
        >
          {v?.trim() || "—"}
        </button>
      ),
    },
    {
      title: "Owner",
      key: "owner",
      render: (_, row) => ownerDisplayName(row) || "—",
    },
    {
      title: "Username",
      dataIndex: "userName",
      render: (v: string | null) => (
        <span className="text-xs text-muted-foreground">{v ?? "—"}</span>
      ),
    },
    {
      title: "CAC verified",
      dataIndex: "isCacVerified",
      width: 120,
      render: (v: boolean) => (
        <Tag color={v ? "success" : "default"}>{v ? "Yes" : "No"}</Tag>
      ),
    },
    {
      title: "Invite",
      key: "invite",
      width: 110,
      render: (_, row) => inviteStatusTag(row),
    },
    {
      title: "Status",
      key: "status",
      width: 120,
      render: (_, row) => userStatusTag(row),
    },
    {
      title: "",
      key: "actions",
      width: 190,
      align: "right",
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(openOwnerPath(row))}
            title="View owner"
          />
          {!row.ownerDetail?.isInvited && (
            <Popconfirm
              title={`Invite ${ownerLabel(row)}?`}
              description="This will send a store owner invitation by email."
              okText="Invite"
              onConfirm={() => runOwnerAction(row.id, "invite")}
            >
              <Button
                size="small"
                icon={<MailOutlined />}
                loading={pendingOwnerId === row.id}
                title="Invite owner"
              />
            </Popconfirm>
          )}
          {row.ownerDetail?.isInvited && !row.ownerDetail?.isInvitationAccepted && (
            <>
              <Button
                size="small"
                icon={<MailOutlined />}
                loading={pendingOwnerId === row.id}
                onClick={() => runOwnerAction(row.id, "resend")}
                title="Resend invitation"
              />
              <Popconfirm
                title={`Revoke invitation for ${ownerLabel(row)}?`}
                okText="Revoke"
                okButtonProps={{ danger: true }}
                onConfirm={() => runOwnerAction(row.id, "revoke")}
              >
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  loading={pendingOwnerId === row.id}
                  title="Revoke invitation"
                />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Typography.Title level={3} className="!m-0">
            Franchise store owners
          </Typography.Title>
          <Typography.Text type="secondary">
            CAC-verified users. Invite one to make them a store owner.
          </Typography.Text>
        </div>
      </div>

      <Card styles={{ body: { padding: 16 } }}>
        <Input
          allowClear
          placeholder="Search company, name, or username…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          prefix={<ShopOutlined className="text-muted-foreground" />}
        />
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <Table<OwnerRow>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={isLoading || isFetching}
          locale={{ emptyText: <Empty description="No store owners" /> }}
          pagination={{
            current: page,
            pageSize,
            total: totalItems,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}
