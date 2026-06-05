import { unauthenticated } from "../shopify.server";
import { calculatePricing } from "./pricing.server";

/**
 * Normalizes raw Shopify draft order response data into a clean shape.
 * @param {any} draftOrder — raw GraphQL response node
 * @param {number} discountAmount — computed discount in rupees
 * @returns {any}
 */
export function normalizeDraftOrderResponse(draftOrder, discountAmount) {
  const lineItems = (draftOrder.lineItems?.edges || []).map((edge) => {
    const node = edge.node;
    return {
      variantId: node.variant?.id || null,
      title: node.title,
      quantity: node.quantity,
      originalUnitPrice: parseFloat(node.originalUnitPrice) || 0,
      total: node.quantity * (parseFloat(node.originalUnitPrice) || 0),
    };
  });

  return {
    success: true,
    draftOrderId: draftOrder.id,
    name: draftOrder.name,
    invoiceUrl: draftOrder.invoiceUrl,
    checkoutUrl: draftOrder.invoiceUrl,
    subtotal: parseFloat(draftOrder.subtotalPrice) || 0,
    discount: parseFloat(discountAmount.toFixed(2)),
    total: parseFloat(draftOrder.totalPrice) || 0,
    lineItemsSummary: lineItems,
    userErrors: [],
  };
}

/**
 * Creates a Shopify Draft Order via GraphQL mutation with bundle discounts applied.
 *
 * Flow:
 *   1. Authenticate with Shopify using offline session
 *   2. Run pricing calculation on the backend
 *   3. Build GraphQL line items with originalUnitPrice
 *   4. Attach order-level appliedDiscount with the computed bundle discount
 *   5. Execute draftOrderCreate mutation
 *
 * @param {string} shop — Shopify store domain (e.g. "vaahini-dev.myshopify.com")
 * @param {{
 *   items: Array<{ variantId?: string, title?: string, price: number, quantity: number, attributes?: any[] }>,
 *   customer?: { email?: string, firstName?: string, lastName?: string },
 *   shippingAddress?: any,
 *   billingAddress?: any,
 *   note?: string,
 *   noteAttributes?: Array<{ name: string, value: string }>
 * }} params
 * @returns {Promise<any>}
 */
export async function createShopifyDraftOrder(shop, params) {
  const {
    items,
    customer,
    shippingAddress,
    billingAddress,
    note,
    noteAttributes,
  } = params;

  // 1. Get authenticated Shopify admin client using offline session
  let admin;
  try {
    const authSession = await unauthenticated.admin(shop);
    admin = authSession.admin;
  } catch (error) {
    throw new Error(
      `Failed to resolve Shopify session for shop ${shop}. Please ensure the app is installed.`,
    );
  }

  // 2. Run pricing calculation on the backend
  const pricing = calculatePricing(items);

  // 3. Build GraphQL mutation line items input
  const lineItemsInput = items.map((item) => {
    const lineItem = {
      quantity: parseInt(item.quantity, 10),
    };

    if (item.variantId) {
      lineItem.variantId = item.variantId;
    } else {
      lineItem.title = item.title || "Custom Product";
    }

    // Force unit price to prevent template discrepancy
    if (item.price) {
      lineItem.originalUnitPrice = parseFloat(item.price).toFixed(2);
    }

    // Add line item attributes if provided
    if (item.attributes && item.attributes.length > 0) {
      lineItem.customAttributes = item.attributes.map((attr) => ({
        key: attr.key || attr.name,
        value: String(attr.value),
      }));
    }

    return lineItem;
  });

  // 4. Structure draft order input
  const draftOrderInput = {
    lineItems: lineItemsInput,
    note: note || "Custom discounted transaction created by Premium Transaction App",
  };

  // Attach customer email
  if (customer && customer.email) {
    draftOrderInput.email = customer.email;
  }

  if (shippingAddress) {
    draftOrderInput.shippingAddress = shippingAddress;
  }
  if (billingAddress) {
    draftOrderInput.billingAddress = billingAddress;
  }

  // Attach note attributes
  if (noteAttributes && noteAttributes.length > 0) {
    draftOrderInput.noteAttributes = noteAttributes.map((attr) => ({
      key: attr.key || attr.name,
      value: String(attr.value),
    }));
  }

  // Apply order-level bundle discount
  if (pricing.discountAmount > 0) {
    draftOrderInput.appliedDiscount = {
      title: pricing.pricingBreakdown.activeDealName || "Bundle Deal",
      description: `Vaahini Bundle: ${pricing.pricingBreakdown.activeDealName || "Custom discount"}`,
      value: pricing.discountAmount,
      valueType: "FIXED_AMOUNT",
      amount: pricing.discountAmount.toFixed(2),
    };
  }

  // 5. Run GraphQL mutation
  const mutation = `#graphql
    mutation appDraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          invoiceUrl
          subtotalPrice
          totalPrice
          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
                originalUnitPrice
                variant {
                  id
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      input: draftOrderInput,
    },
  });

  const responseJson = await response.json();

  if (responseJson.errors) {
    return {
      success: false,
      userErrors: responseJson.errors.map((err) => ({
        field: ["global"],
        message: err.message,
      })),
    };
  }

  const { draftOrder, userErrors } = responseJson.data.draftOrderCreate;

  if (userErrors && userErrors.length > 0) {
    return {
      success: false,
      userErrors,
    };
  }

  // 6. Normalize and return draft order payload
  return normalizeDraftOrderResponse(draftOrder, pricing.discountAmount);
}
