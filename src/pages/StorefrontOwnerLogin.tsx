import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Typography,
} from "antd";
import { LockOutlined, MailOutlined, ShopOutlined } from "@ant-design/icons";
import {
  STOREFRONT_OWNER_STORAGE_KEY,
  storefrontApiPost,
} from "@/lib/api";
import type { StorefrontOwnerAuthResponse } from "@/lib/types";

interface FormValues {
  email: string;
  password: string;
}

export default function StorefrontOwnerLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/owner";
  const { message } = AntdApp.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFinish(values: FormValues) {
    setSubmitting(true);
    setError(null);
    const result = await storefrontApiPost<StorefrontOwnerAuthResponse>(
      "auth/store-owner/login",
      values,
    );
    if (!result.status || !result.data) {
      setError(result.message ?? "Invalid storefront owner credentials.");
      setSubmitting(false);
      return;
    }
    localStorage.setItem(STOREFRONT_OWNER_STORAGE_KEY, JSON.stringify(result.data));
    message.success("Signed in to your storefront");
    navigate(returnUrl, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#fbf0f2] via-white to-[#f7e8ec] px-4 py-10">
      <Card className="w-full max-w-md !rounded-2xl !shadow-[0_10px_40px_-12px_rgba(128,0,32,0.18)]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#800020] text-white">
            <ShopOutlined className="text-2xl" />
          </div>
          <Typography.Title level={3} className="!mb-1">Storefront owner login</Typography.Title>
          <Typography.Text type="secondary">Manage your storefront and review settlement activity.</Typography.Text>
        </div>
        {error && <Alert className="mb-5" type="error" showIcon message={error} />}
        <Form<FormValues> layout="vertical" size="large" onFinish={onFinish} disabled={submitting}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input prefix={<MailOutlined />} autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: "Password is required" }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>Sign in</Button>
        </Form>
      </Card>
    </div>
  );
}
