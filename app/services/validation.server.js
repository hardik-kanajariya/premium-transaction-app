/**
 * Formats a standardized error response object.
 * @param {string} message 
 * @param {number} status 
 * @param {any} [details] 
 * @returns {{ error: string, status: number, details: any }}
 */
export function formatError(message, status = 400, details = null) {
  return {
    error: message,
    status,
    details
  };
}

/**
 * Validates request input for the pricing preview API.
 * @param {any} body 
 * @returns {{ valid: boolean, error?: string, cleanData?: any }}
 */
export function validatePricingPreviewInput(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request payload. Expected JSON object." };
  }

  const { items, customer } = body;

  if (!items || !Array.isArray(items)) {
    return { valid: false, error: "Missing or invalid 'items' field. It must be an array." };
  }

  const cleanItems = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "object" || item === null) {
      return { valid: false, error: `Item at index ${i} is not a valid object.` };
    }

    const price = parseFloat(item.price);
    const quantity = parseInt(item.quantity, 10);

    if (isNaN(price) || price < 0) {
      return { valid: false, error: `Item at index ${i} has an invalid or negative 'price'.` };
    }
    if (isNaN(quantity) || quantity <= 0) {
      return { valid: false, error: `Item at index ${i} has an invalid or non-positive 'quantity'.` };
    }

    cleanItems.push({
      variantId: item.variantId || null,
      title: item.title || "Custom Product",
      price,
      quantity,
      attributes: Array.isArray(item.attributes) ? item.attributes : []
    });
  }

  return {
    valid: true,
    cleanData: {
      items: cleanItems,
      customer: customer && typeof customer === "object" ? customer : null,
      currency: body.currency || "INR"
    }
  };
}

/**
 * Validates request input for draft order creation.
 * @param {any} body 
 * @returns {{ valid: boolean, error?: string, cleanData?: any }}
 */
export function validateDraftOrderInput(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request payload. Expected JSON object." };
  }

  const { shop } = body;
  if (!shop || typeof shop !== "string" || shop.trim() === "") {
    return { valid: false, error: "Missing or invalid required field: 'shop' (Shopify store domain)." };
  }

  const itemsValidation = validatePricingPreviewInput(body);
  if (!itemsValidation.valid) {
    return itemsValidation;
  }

  return {
    valid: true,
    cleanData: {
      shop: shop.trim(),
      items: itemsValidation.cleanData.items,
      customer: itemsValidation.cleanData.customer,
      shippingAddress: body.shippingAddress && typeof body.shippingAddress === "object" ? body.shippingAddress : null,
      billingAddress: body.billingAddress && typeof body.billingAddress === "object" ? body.billingAddress : null,
      note: typeof body.note === "string" ? body.note : null,
      noteAttributes: Array.isArray(body.noteAttributes) ? body.noteAttributes : []
    }
  };
}
