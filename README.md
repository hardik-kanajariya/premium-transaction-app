# Premium Custom Pricing & Checkout App (React Router)

This Shopify React Router app is a consolidated single-server application that handles custom pricing calculation, draft order creation, secure invoice checkout redirection, and Razorpay helper configuration.

It is designed to be hosted on Vercel and is fully compatible with the **Shopify Basic** plan.

---

## Architecture Overview

All server-side and client-side logic is hosted in this folder. It exposes public REST APIs to the storefront theme and provides an embedded Shopify Admin dashboard for health monitoring and testing.

```
├── app/
│   ├── services/
│   │   └── pricing.server.js     # Pricing engine (bundle discount logic)
│   ├── utils/
│   │   └── cors.js               # CORS response and preflight helper
│   ├── routes/
│   │   ├── api.pricing-preview.jsx # Storefront price preview API
│   │   ├── api.draft-order.jsx   # Storefront draft order creator API
│   │   ├── api.razorpay.jsx      # Razorpay config & verification API
│   │   └── app._index.jsx        # Embedded admin dashboard & debug tools
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
- **Description**: Returns calculated discount details for preview on the cart page.
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
    "originalSubtotal": 229600,
    "discount": 69700,
    "customSubtotal": 159900,
    "originalSubtotalDecimal": 2296.00,
    "discountDecimal": 697.00,
    "customSubtotalDecimal": 1599.00,
    "activeDealName": "4@₹1,599 — Bundle Deal"
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
    "draftOrder": {
      "id": "gid://shopify/DraftOrder/1148924395632",
      "name": "#D105",
      "subtotal": 2196.00,
      "discount": 499.00,
      "total": 1697.00,
      "invoiceUrl": "https://vaahini-shopify.myshopify.com/1234567/checkouts/draft_order_hash_key",
      "checkoutUrl": "https://vaahini-shopify.myshopify.com/1234567/checkouts/draft_order_hash_key"
    }
  }
  ```

### 3. Razorpay Helper API (Optional)
- **Endpoint**: `GET /api/razorpay`
  - **Description**: Returns the public Razorpay Key ID.
  - **Response**: `{"keyId": "rzp_live_xxxxxxxxxx"}`
- **Endpoint**: `POST /api/razorpay`
  - **Description**: Verifies the signature of payments completed directly on a custom storefront.
  - **Request Body**:
    ```json
    {
      "razorpayOrderId": "order_Hxz92...",
      "razorpayPaymentId": "pay_HxzA1...",
      "razorpaySignature": "9b64..."
    }
    ```
  - **Response**: `{"success": true, "message": "Signature verified successfully"}`
