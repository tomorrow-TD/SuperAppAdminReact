import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Spin,
  Typography,
} from "antd";
import { LockOutlined, ShopOutlined } from "@ant-design/icons";
import {
  STOREFRONT_OWNER_STORAGE_KEY,
  storefrontApiPost,
} from "@/lib/api";
import type {
  StorefrontOwnerAuthResponse,
  StorefrontOwnerInvitationValidationDto,
} from "@/lib/types";

interface FormValues {
  password: string;
  confirmPassword: string;
}

export default function StorefrontOwnerAcceptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();
  const token = searchParams.get("token")?.trim() ?? "";
  const [invitation, setInvitation] =
    useState<StorefrontOwnerInvitationValidationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    let cancelled = false;
    async function validate() {
      if (!token) {
        setError("This invitation link is missing its token.");
        setLoading(false);
        return;
      }
      const result = await storefrontApiPost<StorefrontOwnerInvitationValidationDto>(
        "auth/store-owner/invitation/validate",
        { token },
      );
      if (cancelled) return;
      if (!result.status || !result.data) {
        setError(result.message ?? "This invitation is invalid or expired.");
      } else if (result.data.isAccepted) {
        setError("This invitation has already been accepted. Please sign in.");
      } else {
        setInvitation(result.data);
      }
      setLoading(false);
    }
    void validate();
    return () => { cancelled = true; };
  }, [token]);

  async function onFinish(values: FormValues) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await storefrontApiPost<StorefrontOwnerAuthResponse>(
      "auth/store-owner/invitation/accept",
      { token, ...values },
    );
    if (!result.status || !result.data) {
      setError(result.message ?? "Registration could not be completed.");
      setSubmitting(false);
      return;
    }
    localStorage.setItem(STOREFRONT_OWNER_STORAGE_KEY, JSON.stringify(result.data));
    message.success("Storefront account created");
    navigate("/owner", { replace: true });
  }

  const displayName = invitation
    ? [invitation.firstName, invitation.lastName].filter(Boolean).join(" ")
      || invitation.companyName || invitation.email
    : "Storefront owner";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#fbf0f2] via-white to-[#f7e8ec] px-4 py-10">
      <Card className="w-full max-w-lg !rounded-2xl !shadow-[0_10px_40px_-12px_rgba(128,0,32,0.18)]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#800020] text-white">
            <ShopOutlined className="text-2xl" />
          </div>
          <Typography.Title level={3} className="!mb-1">Open your storefront</Typography.Title>
          <Typography.Text type="secondary">Set a password to complete your TD Africa storefront registration.</Typography.Text>
        </div>

        {loading && <div className="flex justify-center py-10"><Spin size="large" /></div>}
        {!loading && error && (
          <Alert
            type="error"
            showIcon
            message={error}
            action={<Button size="small" onClick={() => navigate("/owner/login")}>Sign in</Button>}
          />
        )}
        {!loading && invitation && (
          <>
            <Alert className="mb-6" type="info" showIcon message={`Invitation for ${displayName}`} description={invitation.email} />
            <Form<FormValues>
              form={form}
              layout="vertical"
              size="large"
              onFinish={onFinish}
              disabled={submitting}
            >
              <Form.Item
                name="password"
                label="Password"
                rules={[{ required: true, min: 8, message: "Use at least 8 characters" }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="At least 8 characters" autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="Confirm password"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Confirm your password" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      return !value || getFieldValue("password") === value
                        ? Promise.resolve()
                        : Promise.reject(new Error("Passwords do not match"));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="Repeat your password" autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                {submitting ? "Creating account…" : "Complete registration"}
              </Button>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}
