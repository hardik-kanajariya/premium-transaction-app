# Premium Custom Pricing & Checkout App

This Shopify React Router application handles custom pricing calculations, dynamic discount code generation, and Draft Order creation to redirect users to a secure Shopify checkout.

Because it utilizes standard Shopify Draft Orders and native Shopify checkouts, it is compatible with the **Shopify Basic** plan and works seamlessly with **any payment gateway/aggregator** (such as Razorpay, Paytm, Cashfree, UPI, Credit Cards, etc.) configured in your Shopify Admin.

---

## Architecture Overview

The backend logic is structured as follows:

```
├── app/
│   ├── services/
│   │   ├── pricing.server.js        # Core pricing engine (bundle discount calculation)
│   │   ├── shopify-token.server.js  # Retrieves and caches offline access token
│   │   └── validation.server.js     # Validates incoming payloads
│   ├── utils/
│   │   └── cors.js                  # CORS headers for cross-origin storefront requests
│   ├── routes/
│   │   ├── api.discount.jsx         # Endpoint to generate discount and create Draft Order
│   │   ├── api.health.jsx           # Diagnostics connectivity check
│   │   ├── auth.install.jsx         # OAuth App Installation initiating point
│   │   └── auth.callback.jsx        # OAuth App Installation callback handler
│   ├── db.server.js                 # Prisma Client configuration
│   └── shopify.server.js            # Shopify React Router configuration wrapper
```

---

## How it Works

1. **Calculate Discount**: The storefront sends the cart contents (items, quantities, prices) to the `/api/discount` endpoint.
2. **Pricing Engine**: The pricing engine (`pricing.server.js`) flattens and sorts the items, applying the bundle pricing rules:
   *   **Groups of 4**: Flat ₹1,599 per group.
   *   **Remainder of 3**: Flat ₹1,299.
   *   **Remainder of 2 (B1G1)**: Buy 1 Get 1 free (the cheapest of the two remaining is free).
   *   **Remainder of 1**: Standard unit price.
3. **Discount Code Creation**: If a discount is applicable, a unique single-use coupon (valid for 1 hour) is created dynamically via the Shopify GraphQL Admin API.
4. **Draft Order Creation**: A Draft Order is created containing the cart's line items. If a discount was generated, the coupon code is appended to the draft order under `discountCodes`.
5. **Redirection URL**: The endpoint returns the draft order's secure `invoiceUrl`.
6. **Checkout**: The storefront redirects the customer to this checkout URL, where the correct discount is applied and standard payment gateways are available.

---

## Setup & Testing

### 1. Environment Variables
Create a `.env` file in the root directory:
```env
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_STORE_DOMAIN=your-development-store.myshopify.com
DATABASE_URL=postgresql://user:password@host:port/database
```

### 2. Run Database Migrations
Run Prisma to set up the token storage tables:
```bash
npx prisma db push
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. API Endpoint Example
To test the flow, send a `POST` request to `/api/discount`:

*   **Endpoint**: `POST /api/discount`
*   **Payload**:
    ```json
    {
      "shop": "your-development-store.myshopify.com",
      "items": [
        { "variantId": "gid://shopify/ProductVariant/12345", "price": 599.00, "quantity": 4 }
      ]
    }
    ```
*   **Response**:
    ```json
    {
      "success": true,
      "code": "VAAHINI-B4-XXXXXX",
      "discountAmount": 797.00,
      "ruleId": "gid://shopify/DiscountCodeNode/11223344",
      "draftOrderId": "gid://shopify/DraftOrder/55667788",
      "invoiceUrl": "https://your-development-store.myshopify.com/12345/checkouts/draft_order_hash"
    }
    ```

---

## Storefront Theme Integration Guide

To connect your Shopify Storefront Theme (Liquid/JavaScript) to this application, use the following code snippet. 

This script intercepts the standard checkout button action, fetches the current cart items from Shopify's AJAX Cart API, sends them to our app to calculate discounts and create the Draft Order, and then redirects the customer to the secure checkout URL.

### Javascript Snippet (Add to cart page or global theme JS)

```javascript
document.addEventListener("DOMContentLoaded", () => {
  const checkoutButtons = document.querySelectorAll('form[action="/cart"] [name="checkout"], .checkout-btn');

  checkoutButtons.forEach(button => {
    button.addEventListener("click", async (event) => {
      event.preventDefault(); // Stop standard checkout redirect
      
      // Visual feedback for the customer
      const originalText = button.innerHTML || button.value;
      if (button.tagName === "INPUT") {
        button.value = "Preparing checkout...";
      } else {
        button.innerHTML = "Preparing checkout...";
      }
      button.disabled = true;

      try {
        // 1. Fetch current cart items from Shopify AJAX API
        const cartResponse = await fetch("/cart.js");
        const cartData = await cartResponse.json();

        if (!cartData.items || cartData.items.length === 0) {
          alert("Your cart is empty.");
          resetButton();
          return;
        }

        // 2. Map cart items to format required by the Discount App
        const formattedItems = cartData.items.map(item => ({
          variantId: `gid://shopify/ProductVariant/${item.variant_id || item.id}`,
          price: (item.price / 100).toFixed(2), // Convert from cents to currency units
          quantity: item.quantity,
          title: item.title,
          attributes: item.properties ? Object.entries(item.properties).map(([key, value]) => ({
            name: key,
            value: String(value)
          })) : []
        }));

        // 3. Prepare payload
        const payload = {
          shop: window.Shopify.shop,
          items: formattedItems,
          note: cartData.note || "",
          // If customer is logged in, attach their email
          customer: window.theme?.customerEmail || window.meta?.page?.customerId ? {
             email: window.theme?.customerEmail || "" 
          } : null
        };

        // 4. Send to the custom discount app endpoint
        const APP_DISCOUNT_URL = "https://your-app-domain.com/api/discount";
        
        const response = await fetch(APP_DISCOUNT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error("Failed to initialize custom checkout session.");
        }

        const result = await response.json();

        if (result.success) {
          // 5. Apply the coupon code to the storefront cart session.
          // This ensures third-party checkouts (like Shiprocket) read the cart with the discount already applied!
          if (result.code) {
            await fetch(`/discount/${result.code}`);
          }

          // 6. Redirect or proceed
          const isStandardCheckout = button.name === "checkout" || button.classList.contains("shopify-checkout-btn");
          
          if (isStandardCheckout && result.invoiceUrl) {
            // Redirect standard checkout users directly to the secure Draft Order checkout URL
            window.location.href = result.invoiceUrl;
          } else {
            // For Shiprocket or other custom one-click checkout buttons:
            // Since the discount code is now successfully applied to their Shopify session,
            // we can trigger/allow the third-party widget's checkout action.
            console.log("[Vaahini] Discount code applied to session. Proceeding with third-party checkout.");
            
            // If you need to trigger Shiprocket's checkout programmatically, do it here.
            // E.g., if you programmatically clicked their button, let the event bubbles or call their handler.
          }
        } else {
          throw new Error("Checkout URL or code not returned from discount app.");
        }

      } catch (error) {
        console.error("[Vaahini Discount App] Error:", error);
        alert("Something went wrong while preparing your checkout. Redirecting you to standard checkout...");
        // Fallback to standard checkout form submit
        event.target.closest("form")?.submit() || (window.location.href = "/checkout");
      }

      function resetButton() {
        button.disabled = false;
        if (button.tagName === "INPUT") {
          button.value = originalText;
        } else {
          button.innerHTML = originalText;
        }
      }
    });
  });
});
```

### Supporting Third-Party Checkouts (e.g. Shiprocket, Razorpay Magic)

Third-party checkouts read the active storefront cart and customer session. By executing `await fetch('/discount/' + result.code)`, the discount code is saved in the customer's Shopify storefront session. When the Shiprocket checkout pop-up loads, it queries the active Shopify session, imports the coupon code, and displays the correct discounted amount automatically.

