/**
 * Normalizes a price (rupees/decimal or paise/integer) into paise (integer).
 * If the price has a decimal point or is small (e.g. < 10000 and not representing paise),
 * we convert it. To be safe, we assume Shopify prices are either in decimal (e.g., 599.00)
 * or in paise (e.g. 59900). If we detect a float or if a shopify variant price is returned as string
 * like "599.00", we convert to integer paise.
 * @param {number|string} price 
 * @returns {number} price in paise (integer)
 */
export function normalizeToPaise(price) {
  const parsed = parseFloat(price);
  if (isNaN(parsed)) return 0;
  
  // If price is a string with a dot, or a number that represents decimal rupees
  // Shopify API typically returns variant prices as string decimals like "599.00"
  if (typeof price === "string" && price.includes(".")) {
    return Math.round(parsed * 100);
  }
  
  // If it's a number that seems to be decimal (has a fractional part)
  if (typeof price === "number" && !Number.isInteger(price)) {
    return Math.round(price * 100);
  }
  
  // Default: assume it is already in paise if it's a large integer,
  // or if it's a small integer we should clarify.
  // In our context, since standard product prices are typically > 100 rupees (i.e. > 10000 paise),
  // if an integer is less than 10000, we treat it as decimal rupees and convert to paise,
  // unless it represents 0. Let's write a safe conversion.
  if (parsed > 0 && parsed < 10000) {
    // Treat as decimal rupees
    return Math.round(parsed * 100);
  }
  
  return Math.round(parsed);
}

/**
 * Calculates custom discount and subtotal based on the cart line items.
 * 
 * Rules:
 * 1. Expand all items by their quantity into an array of individual item prices.
 * 2. Sort the prices in ascending order.
 * 3. Group items:
 *    - G = floor(N / 4) groups of 4.
 *    - R = N % 4 remainder items.
 * 4. Discount G groups of 4:
 *    - Sum the highest 4 * G items.
 *    - Target group price is G * ₹1,599 (159900 paise).
 *    - Discount is groupSum - targetGroupPrice (if positive).
 * 5. Discount remaining R items (cheapest R items in the sorted array):
 *    - If R == 2: Buy 1 Get 1 free (B1G1). Discount the cheaper of the two (the first one).
 *    - If R == 3: Target price for 3 items is ₹1,299 (129900 paise). Discount is remSum - 129900 (if positive).
 *    - If R == 1 or 0: No discount.
 * 
 * @param {Array<{ price: number|string, quantity: number }>} items 
 * @returns {{
 *   originalSubtotal: number, // in paise
 *   discount: number,         // in paise
 *   customSubtotal: number,   // in paise
 *   originalSubtotalDecimal: number,
 *   discountDecimal: number,
 *   customSubtotalDecimal: number,
 *   activeDealName: string
 * }}
 */
export function calculatePricing(items) {
  let originalSubtotal = 0;
  const allPrices = [];

  // Expand items by quantity and normalize price to paise
  for (const item of items) {
    const qty = parseInt(item.quantity, 10) || 0;
    const itemPricePaise = normalizeToPaise(item.price);
    originalSubtotal += itemPricePaise * qty;
    
    for (let i = 0; i < qty; i++) {
      allPrices.push(itemPricePaise);
    }
  }

  // Sort prices ascending
  allPrices.sort((a, b) => a - b);

  const N = allPrices.length;
  const G = Math.floor(N / 4);
  const R = N % 4;

  let groupSum = 0;
  if (G > 0) {
    const groupStart = R;
    const groupEnd = N - 1;
    for (let i = groupStart; i <= groupEnd; i++) {
      groupSum += allPrices[i];
    }
  }

  let groupDiscount = 0;
  if (G > 0) {
    const targetGroupPrice = G * 159900; // ₹1,599 in paise
    if (groupSum > targetGroupPrice) {
      groupDiscount = groupSum - targetGroupPrice;
    }
  }

  let remDiscount = 0;
  if (R === 2) {
    remDiscount = allPrices[0]; // Cheapest item of the 2 remaining
  } else if (R === 3) {
    const targetRemPrice = 129900; // ₹1,299 in paise
    let remSum = 0;
    for (let i = 0; i < 3; i++) {
      remSum += allPrices[i];
    }
    if (remSum > targetRemPrice) {
      remDiscount = remSum - targetRemPrice;
    }
  }

  const totalDiscount = groupDiscount + remDiscount;
  const customSubtotal = originalSubtotal - totalDiscount;

  // Build active deal name string
  const dealParts = [];
  if (G > 0) {
    for (let i = 0; i < G; i++) {
      dealParts.push("4@₹1,599");
    }
  }
  if (R === 3) {
    dealParts.push("3@₹1,299");
  } else if (R === 2) {
    dealParts.push("B1G1");
  }

  const activeDealName = dealParts.length > 0 
    ? `${dealParts.join(" + ")} — Bundle Deal` 
    : "";

  return {
    originalSubtotal,
    discount: totalDiscount,
    customSubtotal,
    originalSubtotalDecimal: parseFloat((originalSubtotal / 100).toFixed(2)),
    discountDecimal: parseFloat((totalDiscount / 100).toFixed(2)),
    customSubtotalDecimal: parseFloat((customSubtotal / 100).toFixed(2)),
    activeDealName
  };
}
