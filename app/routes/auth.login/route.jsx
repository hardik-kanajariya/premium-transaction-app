import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { Form, useActionData, useLoaderData, redirect } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export function normalizeShop(shopInput) {
  if (!shopInput || typeof shopInput !== "string") return null;

  let shop = shopInput.trim();

  // Remove protocol
  shop = shop.replace(/^https?:\/\//i, '');

  // Remove path and query (e.g. /admin, /admin/..., ?..., etc.)
  shop = shop.split('/')[0].split('?')[0];

  // If it doesn't contain a dot, assume it's just the subdomain and append .myshopify.com
  if (!shop.includes('.')) {
    shop = `${shop}.myshopify.com`;
  }

  // Reject invalid custom domains that are not Shopify myshopify domains
  if (!shop.toLowerCase().endsWith('.myshopify.com')) {
    return null;
  }

  // Also validate that there's a valid subdomain before .myshopify.com
  const subdomain = shop.substring(0, shop.length - 14); // length of ".myshopify.com" is 14
  if (!subdomain || !/^[a-zA-Z0-9-]+$/.test(subdomain)) {
    return null;
  }

  return shop.toLowerCase();
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");

  if (shopParam) {
    const normalizedShop = normalizeShop(shopParam);
    if (normalizedShop) {
      if (normalizedShop !== shopParam) {
        url.searchParams.set("shop", normalizedShop);
        throw redirect(url.toString());
      }
      const errors = loginErrorMessage(await login(request));
      return { errors };
    } else {
      return {
        errors: {
          shop: "Please enter a valid shop domain (e.g. vaahinidev.myshopify.com)"
        }
      };
    }
  }

  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const rawShop = formData.get("shop");
  const normalizedShop = normalizeShop(rawShop);

  if (!normalizedShop) {
    return {
      errors: {
        shop: "Please enter a valid shop domain (e.g. vaahinidev.myshopify.com)"
      }
    };
  }

  const url = new URL(request.url);
  const newRequest = new Request(`${url.origin}${url.pathname}?shop=${normalizedShop}`, {
    method: "POST"
  });

  const errors = loginErrorMessage(await login(newRequest));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading="Log in">
            <s-text-field
              name="shop"
              label="Shop domain"
              details="example.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
