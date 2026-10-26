/**
 * Vaahini Bundle Engine — Backend Pricing Calculator
 *
 * Implements the bundle pricing algorithm:
 *   1. Flatten cart items into individual units
 *   2. Sort ascending by price (cheapest first)
 *   3. Partition: cheapest R items → remainder tier, most expensive 5×G items → group-of-5 tier
 *   4. Calculate discounts per tier with pro-rata allocation and rounding reconciliation
 *
 * All internal math is done in paise (integer) to avoid floating-point drift.
 */

// ─── Bundle Price Constants (paise) ───────────────────────────────────────────
const GROUP_OF_5_PRICE_PAISE = 159900; // ₹1,599.00
const GROUP_OF_4_PRICE_PAISE = 129900; // ₹1,299.00
const GROUP_OF_3_PRICE_PAISE = 89900;  // ₹899.00

/**
 * Normalizes a price input (string or number, rupees or paise) to integer paise.
 * Assumes: values with decimals or under ₹10,000 are in rupees; otherwise already paise.
 *
 * @param {number|string} price — raw price value
 * @returns {number} price in paise (integer)
 */
export function normalizeToPaise(price) {
  const parsed = parseFloat(price);
  if (isNaN(parsed)) return 0;

  // If it's a string with a decimal point → treat as rupees
  if (typeof price === "string" && price.includes(".")) {
    return Math.round(parsed * 100);
  }
  // If it's a float → treat as rupees
  if (typeof price === "number" && !Number.isInteger(price)) {
    return Math.round(price * 100);
  }
  // Small integers (< 10000) → likely rupees
  if (parsed > 0 && parsed < 10000) {
    return Math.round(parsed * 100);
  }
  // Already paise
  return Math.round(parsed);
}

/**
 * Converts paise (integer) to rupees (2-decimal float).
 * @param {number} paise
 * @returns {number}
 */
function paiseToRupees(paise) {
  return parseFloat((paise / 100).toFixed(2));
}

/**
 * Allocates a total discount proportionally across items, with rounding reconciliation
 * on the final item to prevent penny discrepancies.
 *
 * @param {Array<{pricePaise: number}>} items — the flat item instances in this group
 * @param {number} totalDiscountPaise — total discount to distribute
 * @param {number} groupSumPaise — original price sum of all items in this group
 */
function allocateDiscountProRata(items, totalDiscountPaise, groupSumPaise) {
  if (totalDiscountPaise <= 0 || groupSumPaise <= 0 || items.length === 0) return;

  let allocatedSoFar = 0;

  for (let i = 0; i < items.length; i++) {
    if (i === items.length - 1) {
      // Final item gets the remainder to guarantee exact total
      items[i].discountPaise = totalDiscountPaise - allocatedSoFar;
    } else {
      const share = items[i].pricePaise / groupSumPaise;
      items[i].discountPaise = Math.round(totalDiscountPaise * share);
      allocatedSoFar += items[i].discountPaise;
    }
  }
}

/**
 * Calculates custom bundle discounts, per-line breakdowns, and pricing summary.
 *
 * @param {Array<{
 *   variantId?: string,
 *   title?: string,
 *   price: number|string,
 *   quantity: number,
 *   attributes?: Array<{key?: string, name?: string, value: string}>
 * }>} items — cart line items
 * @param {string} [currency="INR"]
 * @returns {{
 *   normalizedLines: Array<{
 *     variantId: string|null, title: string, price: number, quantity: number,
 *     attributes: any[], subtotal: number, discount: number, total: number
 *   }>,
 *   subtotal: number,
 *   discountAmount: number,
 *   finalTotal: number,
 *   pricingBreakdown: {
 *     groupsOf5: { count: number, discount: number, targetPrice: number },
 *     groupsOf4: { count: number, discount: number, targetPrice: number },
 *     groupsOf3: { count: number, discount: number, targetPrice: number },
 *     b1g1:      { count: number, discount: number },
 *     activeDealName: string
 *   },
 *   currency: string
 * }}
 */
export function calculatePricing(items, currency = "INR") {
  let originalSubtotalPaise = 0;
  const flatItemInstances = [];

  // ── Step 1: Flatten by quantity and normalize price to paise ──────────────
  items.forEach((item, itemIdx) => {
    const qty = parseInt(item.quantity, 10) || 0;
    const pricePaise = normalizeToPaise(item.price);
    originalSubtotalPaise += pricePaise * qty;
    const isWaistChain = Boolean(
      item.isWaistChain ||
      (item.title && /waist\s*chain/i.test(item.title))
    );

    for (let i = 0; i < qty; i++) {
      flatItemInstances.push({
        flatId: `${itemIdx}-${i}`,
        originalIdx: itemIdx,
        variantId: item.variantId || null,
        title: item.title || "Custom Product",
        pricePaise,
        isWaistChain,
        attributes: item.attributes || [],
        discountPaise: 0,
      });
    }
  });

  const waistChainInstances = flatItemInstances.filter((inst) => inst.isWaistChain);
  const regularInstances = flatItemInstances.filter((inst) => !inst.isWaistChain);

  // ── Step 2a: Waist Chain B1G1 Pricing (exclusive offer) ────────────────────
  waistChainInstances.sort((a, b) => a.pricePaise - b.pricePaise);
  const numWaistPairs = Math.floor(waistChainInstances.length / 2);
  let waistChainDiscountPaise = 0;
  for (let i = 0; i < numWaistPairs; i++) {
    waistChainInstances[i].discountPaise = waistChainInstances[i].pricePaise;
    waistChainDiscountPaise += waistChainInstances[i].pricePaise;
  }

  // ── Step 2b: Regular Items Tiered Bundles ──────────────────────────────────
  regularInstances.sort((a, b) => a.pricePaise - b.pricePaise);

  const N = regularInstances.length;
  const G = Math.floor(N / 5);
  const R = N % 5;

  let groupDiscountPaise = 0;
  let groupSumPaise = 0;

  if (G > 0) {
    const groupStartIdx = R;
    const groupEndIdx = N - 1;
    const groupItems = regularInstances.slice(groupStartIdx, groupEndIdx + 1);

    for (const inst of groupItems) {
      groupSumPaise += inst.pricePaise;
    }

    const targetGroupPrice = G * GROUP_OF_5_PRICE_PAISE;
    if (groupSumPaise > targetGroupPrice) {
      groupDiscountPaise = groupSumPaise - targetGroupPrice;
      allocateDiscountProRata(groupItems, groupDiscountPaise, groupSumPaise);
    }
  }

  let remDiscountPaise = 0;
  let remSumPaise = 0;

  if (R === 2) {
    remDiscountPaise = regularInstances[0].pricePaise;
    regularInstances[0].discountPaise = remDiscountPaise;
  } else if (R === 3) {
    const remItems = regularInstances.slice(0, 3);
    for (const inst of remItems) {
      remSumPaise += inst.pricePaise;
    }
    if (remSumPaise > GROUP_OF_3_PRICE_PAISE) {
      remDiscountPaise = remSumPaise - GROUP_OF_3_PRICE_PAISE;
      allocateDiscountProRata(remItems, remDiscountPaise, remSumPaise);
    }
  } else if (R === 4) {
    const remItems = regularInstances.slice(0, 4);
    for (const inst of remItems) {
      remSumPaise += inst.pricePaise;
    }
    if (remSumPaise > GROUP_OF_4_PRICE_PAISE) {
      remDiscountPaise = remSumPaise - GROUP_OF_4_PRICE_PAISE;
      allocateDiscountProRata(remItems, remDiscountPaise, remSumPaise);
    }
  }

  const regularDiscountPaise = groupDiscountPaise + remDiscountPaise;
  const totalDiscountPaise = waistChainDiscountPaise + regularDiscountPaise;

  // ── Step 3: Re-aggregate flat instances back into original line items ──────
  const normalizedLines = items.map((item, originalIdx) => {
    const instances = flatItemInstances.filter(
      (inst) => inst.originalIdx === originalIdx,
    );
    const lineOriginalSubtotal = instances.reduce(
      (sum, inst) => sum + inst.pricePaise,
      0,
    );
    const lineDiscount = instances.reduce(
      (sum, inst) => sum + inst.discountPaise,
      0,
    );
    const lineTotal = lineOriginalSubtotal - lineDiscount;

    return {
      variantId: item.variantId || null,
      title: item.title || "Custom Product",
      price: paiseToRupees(normalizeToPaise(item.price)),
      quantity: parseInt(item.quantity, 10) || 0,
      attributes: item.attributes || [],
      subtotal: paiseToRupees(lineOriginalSubtotal),
      discount: paiseToRupees(lineDiscount),
      total: paiseToRupees(lineTotal),
    };
  });

  // ── Step 4: Build human-readable deal name ─────────────────────────────────
  const dealParts = [];
  if (numWaistPairs > 0) {
    dealParts.push(`Waist Chain B1G1`);
  }
  if (G > 0) {
    dealParts.push(`${G}x 5@₹1,599`);
  }
  if (R === 4) {
    dealParts.push("4@₹1,299");
  } else if (R === 3) {
    dealParts.push("3@₹899");
  } else if (R === 2) {
    dealParts.push("B1G1");
  }

  const activeDealName =
    dealParts.length > 0
      ? `${dealParts.join(" + ")} — Bundle Deal`
      : "";

  return {
    normalizedLines,
    subtotal: paiseToRupees(originalSubtotalPaise),
    discountAmount: paiseToRupees(totalDiscountPaise),
    finalTotal: paiseToRupees(originalSubtotalPaise - totalDiscountPaise),
    pricingBreakdown: {
      waistChain: {
        count: waistChainInstances.length,
        pairs: numWaistPairs,
        discount: paiseToRupees(waistChainDiscountPaise),
      },
      groupsOf5: {
        count: G,
        discount: paiseToRupees(groupDiscountPaise),
        targetPrice: paiseToRupees(G * GROUP_OF_5_PRICE_PAISE),
      },
      groupsOf4: {
        count: R === 4 ? 1 : 0,
        discount: R === 4 ? paiseToRupees(remDiscountPaise) : 0.0,
        targetPrice: R === 4 ? 1299.0 : 0.0,
      },
      groupsOf3: {
        count: R === 3 ? 1 : 0,
        discount: R === 3 ? paiseToRupees(remDiscountPaise) : 0.0,
        targetPrice: R === 3 ? paiseToRupees(GROUP_OF_3_PRICE_PAISE) : 0.0,
      },
      b1g1: {
        count: R === 2 ? 1 : 0,
        discount: R === 2 ? paiseToRupees(remDiscountPaise) : 0.0,
      },
      activeDealName,
    },
    currency,
  };
}
