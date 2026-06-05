# Premium Custom Pricing & Checkout App (React Router)

This Shopify React Router app is a consolidated single-server application that handles custom pricing calculation, draft order creation, secure invoice checkout redirection, and Razorpay helper configuration.

It is designed to be hosted on Vercel and is fully compatible with the **Shopify Basic** plan.

---

## ⚠️ Important Integration Notes

> [!WARNING]
> **Razorpay Magic Checkout**: The behavior of Razorpay Magic Checkout on draft-order checkout pages is **UNVERIFIED and runtime-test-dependent**. The app provides isolated, optional Razorpay helper endpoints, but the main checkout flow does not rely on nor guarantee support for Razorpay Magic Checkout overlays on draft-order invoice links.
>
> **Draft Order API Conversion**: Do not assume Draft Orders can be automatically converted into normal standard Checkout API objects. The flow treats Draft Orders as their own entities, fetching the secure `invoiceUrl` directly and redirecting the customer to it.

---

## Guaranteed Deliverables

1. **Server-Side Pricing Engine**: Complete grouping discount rules processed securely on the backend.
2. **Draft Order Creation with Discounts**: High-fidelity line items with a custom applied order discount.
3. **Secure Invoice/Checkout Link Generation**: Secure redirection links retrieved directly from the Draft Order API.
4. **Pipeline Debug UI**: Side-by-side comparative table validating:
   - *Storefront UI Expected Total*
   - *Backend Computed Total*
   - *Shopify Draft Order Total*

---

## Architecture Overview

All server-side and client-side logic is hosted in this folder. It exposes public REST APIs to the storefront theme and provides an embedded Shopify Admin dashboard for health monitoring and testing.

```
├── app/
│   ├── services/
│   │   ├── pricing.server.js     # Pricing engine (bundle discount logic)
│   │   ├── draft-order.server.js # Shopify Draft Order API client wrapper
│   │   ├── validation.server.js  # Request validation and error formatter
│   │   └── razorpay.server.js    # Isolated Razorpay REST order client
│   ├── utils/
│   │   └── cors.js               # CORS response and preflight helper
│   ├── routes/
│   │   ├── api.pricing-preview.jsx  # Storefront price preview API
│   │   ├── api.draft-order.jsx      # Storefront draft order creator API
│   │   ├── api.draft-order-test.jsx # Test/debug comparison API
│   │   ├── api.razorpay.jsx         # Razorpay config & order creation helper
│   │   ├── api.health.jsx           # Diagnostics/readiness check API
│   │   └── app._index.jsx           # Embedded admin dashboard & debug tools
│   ├── shopify.server.js         # Shopify App config & session wrapper
│   └── db.server.js              # Prisma Client export
```

---

## Setup & Environment Variables

Create a `.env` file in the root of this folder (or configure these environment variables in Vercel):

```env
# Shopify App Config
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-vercel-domain.vercel.app
SCOPES=write_products,write_metaobjects,write_metaobject_definitions,write_draft_orders

# Database configuration (for Vercel production hosting, use a persistent database URL)
# DATABASE_URL="postgresql://user:password@host:port/database?schema=public"

# Razorpay Integration (Optional Helpers)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

---

## Supported Flow & Shopify Basic Compatibility

### Why this works on the Shopify Basic plan:
1. **No Shopify Plus Required**: Shopify Plus is required to write custom Shopify checkout scripts or checkout UI extensions (Shopify Functions).
2. **Draft Orders as the Bridge**: Draft orders allow custom price/discount overrides and are supported on all Shopify plans (including Basic).
3. **Redirection to Secure Checkout**: Instead of placing a standard order, when the customer clicks the checkout button on the cart, the theme sends the cart items to our API. The API calculates the custom discounts, creates a draft order inside Shopify with that discount applied, and returns a secure Shopify `invoiceUrl`/`checkoutUrl`. The frontend then redirects the customer directly to this checkout page, which presents the custom discount and supports configured payment gateways (like Razorpay).

---

## Custom Pricing & Discount Rules

The pricing engine groups items in the cart and applies discounts sequentially based on item quantity:

1. **Groups of 4**: Priced at a flat **₹1,599** (e.g. 8 items are priced at $2 \times ₹1,599 = ₹3,198$).
2. **Remainder of 3**: Priced at a flat **₹1,299**.
3. **Remainder of 2 (B1G1)**: Buy 1 Get 1 free. The cheapest item of the two remaining is discounted completely (free).
4. **Remainder of 1**: Purchased at its standard unit price.

*All items are sorted in ascending order of price before applying these rules to ensure the cheapest possible combination is discounted.*

---

## API Endpoints & Payload Examples

All endpoints support cross-origin request sharing (CORS) and handling of preflight `OPTIONS` requests.

### 1. Pricing Preview API
- **Endpoint**: `POST /api/pricing-preview`
- **Description**: Returns calculated discount details and line breakdowns for preview on the cart page.
- **Request Body**:
  ```json
  {
    "items": [
      { "variantId": "gid://shopify/ProductVariant/45678", "price": 599.00, "quantity": 3 },
      { "variantId": "gid://shopify/ProductVariant/12345", "price": 499.00, "quantity": 1 }
    ]
  }
  ```
- **Response Body**:
  ```json
  {
    "normalizedLines": [
      {
        "variantId": "gid://shopify/ProductVariant/45678",
        "title": "Custom Product",
        "price": 599,
        "quantity": 3,
        "attributes": [],
        "subtotal": 1797.00,
        "discount": 515.00,
        "total": 1282.00
      },
      {
        "variantId": "gid://shopify/ProductVariant/12345",
        "title": "Custom Product",
        "price": 499,
        "quantity": 1,
        "attributes": [],
        "subtotal": 499.00,
        "discount": 182.00,
        "total": 317.00
      }
    ],
    "subtotal": 2296.00,
    "discountAmount": 697.00,
    "finalTotal": 1599.00,
    "pricingBreakdown": {
      "groupsOf4": { "count": 1, "discount": 697.00, "targetPrice": 1599.00 },
      "groupsOf3": { "count": 0, "discount": 0.00, "targetPrice": 0.00 },
      "b1g1": { "count": 0, "discount": 0.00 },
      "activeDealName": "1x (4@₹1,599) — Bundle Deal"
    },
    "currency": "INR"
  }
  ```

### 2. Create Draft Order API
- **Endpoint**: `POST /api/draft-order`
- **Description**: Computes discounts, creates a draft order, and returns a checkout link.
- **Request Body**:
  ```json
  {
    "shop": "vaahini-shopify.myshopify.com",
    "items": [
      { "variantId": "gid://shopify/ProductVariant/45678", "price": "599.00", "quantity": 2 },
      { "variantId": "gid://shopify/ProductVariant/12345", "price": "499.00", "quantity": 2 }
    ],
    "customer": {
      "email": "customer@example.com"
    },
    "note": "Custom discounted bundle deal"
  }
  ```
- **Response Body**:
  ```json
  {
    "success": true,
    "draftOrderId": "gid://shopify/DraftOrder/1148924395632",
    "name": "#D105",
    "invoiceUrl": "https://vaahini-shopify.myshopify.com/1234567/checkouts/draft_order_hash_key",
    "checkoutUrl": "https://vaahini-shopify.myshopify.com/1234567/checkouts/draft_order_hash_key",
    "subtotal": 2196.00,
    "discount": 499.00,
    "total": 1697.00,
    "lineItemsSummary": [
      { "variantId": "gid://shopify/ProductVariant/45678", "title": "Product A", "quantity": 2, "originalUnitPrice": 599.00, "total": 1198.00 },
      { "variantId": "gid://shopify/ProductVariant/12345", "title": "Product B", "quantity": 2, "originalUnitPrice": 499.00, "total": 998.00 }
    ],
    "userErrors": []
  }
  ```

### 3. Draft Order Test / Debug API
- **Endpoint**: `POST /api/draft-order-test`
- **Description**: Compares Backend pricing total vs Shopify returned draft order total side-by-side.
- **Request Body**:
  ```json
  {
    "shop": "vaahini-shopify.myshopify.com",
    "prices": [599.00, 599.00, 499.00, 499.00],
    "expectedUiTotal": 1599.00
  }
  ```
- **Response Body**:
  ```json
  {
    "success": true,
    "shop": "vaahini-shopify.myshopify.com",
    "comparison": {
      "expectedUiTotal": 1599.00,
      "backendCalculatedTotal": 1599.00,
      "shopifyReturnedTotal": 1599.00,
      "matchesBackendAndShopify": true,
      "matchesUiAndBackend": true
    },
    "draftOrderDetails": {
      "id": "gid://shopify/DraftOrder/11223344",
      "name": "#D106",
      "subtotal": 2196.00,
      "discount": 597.00,
      "total": 1599.00,
      "invoiceUrl": "https://..."
    }
  }
  ```

### 4. Health & Diagnostics API
- **Endpoint**: `GET /api/health`
- **Description**: Confirms DB connection health and config parameters without leaking private credentials.
- **Response Body**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-06-05T12:00:00.000Z",
    "services": {
      "database": { "healthy": true, "error": null },
      "shopify": { "configured": true, "apiVersion": "2025-10" },
      "razorpay": { "configured": true }
    }
  }
  ```

### 5. Razorpay Helper API (Optional)
- **Endpoint**: `GET /api/razorpay`
  - **Description**: Returns the public Razorpay Key ID.
  - **Response**: `{"keyId": "rzp_live_xxxxxxxxxx"}`
- **Endpoint**: `POST /api/razorpay`
  - **Description**: Creates a Razorpay Order directly using REST basic auth.
  - **Request Body**:
    ```json
    {
      "amount": 1599.00,
      "currency": "INR",
      "receipt": "rcpt_12345"
    }
    ```
  - **Response**:
    ```json
    {
      "success": true,
      "order": {
        "id": "order_Hxz92...",
        "amount": 1599.00,
        "currency": "INR",
        "receipt": "rcpt_12345"
      }
    }
    ```
