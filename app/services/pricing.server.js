import { normalizeToPaise } from "./pricing.server";

// Keep normalizeToPaise in the same file to keep imports clean
export function normalizePrice(price) {
  const parsed = parseFloat(price);
  if (isNaN(parsed)) return 0;
  if (typeof price === "string" && price.includes(".")) {
    return Math.round(parsed * 100);
  }
  if (typeof price === "number" && !Number.isInteger(price)) {
    return Math.round(price * 100);
  }
  if (parsed > 0 && parsed < 10000) {
    return Math.round(parsed * 100);
  }
  return Math.round(parsed);
}

/**
 * Calculates custom discount, subtotal, normalized lines, and pricing breakdown.
 * 
 * Group pricing rules:
 * - 4 items for ₹1,599 (159900 paise)
 * - 3 items for ₹1,299 (129900 paise)
 * - 2 items: Buy 1 Get 1 free (B1G1) - discount the cheaper of the two
 * - 1 item: No discount
 * 
 * Sorts all items by price ascending for optimization.
 * 
 * @param {Array<{ variantId?: string, title?: string, price: number|string, quantity: number, attributes?: any[] }>} items 
 * @param {string} [currency="INR"]
 * @returns {{
 *   normalizedLines: Array<any>,
 *   subtotal: number,
 *   discountAmount: number,
 *   finalTotal: number,
 *   pricingBreakdown: {
 *     groupsOf4: { count: number, discount: number, targetPrice: number },
 *     groupsOf3: { count: number, discount: number, targetPrice: number },
 *     b1g1: { count: number, discount: number },
 *     activeDealName: string
 *   },
 *   currency: string
 * }}
 */
export function calculatePricing(items, currency = "INR") {
  let originalSubtotalPaise = 0;
  const flatItemInstances = [];

  // 1. Expand items by quantity and normalize price to paise
  items.forEach((item, itemIdx) => {
    const qty = parseInt(item.quantity, 10) || 0;
    const pricePaise = normalizePrice(item.price);
    originalSubtotalPaise += pricePaise * qty;
    
    for (let i = 0; i < qty; i++) {
      flatItemInstances.push({
        flatId: `${itemIdx}-${i}`,
        originalIdx: itemIdx,
        variantId: item.variantId || null,
        title: item.title || "Custom Product",
        pricePaise,
        attributes: item.attributes || [],
        discountPaise: 0
      });
    }
  });

  // 2. Sort item instances ascending by price to give cheapest combinations first
  flatItemInstances.sort((a, b) => a.pricePaise - b.pricePaise);

  const N = flatItemInstances.length;
  const G = Math.floor(N / 4);
  const R = N % 4;

  let groupDiscountPaise = 0;
  let groupSumPaise = 0;

  // G groups of 4 (the most expensive 4 * G items)
  if (G > 0) {
    const groupStartIdx = R;
    const groupEndIdx = N - 1;
    for (let i = groupStartIdx; i <= groupEndIdx; i++) {
      groupSumPaise += flatItemInstances[i].pricePaise;
    }
    const targetGroupPrice = G * 159900; // ₹1,599 in paise
    if (groupSumPaise > targetGroupPrice) {
      groupDiscountPaise = groupSumPaise - targetGroupPrice;
      
      // Pro-rata allocate group discount to the flat instances in groups of 4
      for (let i = groupStartIdx; i <= groupEndIdx; i++) {
        const share = flatItemInstances[i].pricePaise / groupSumPaise;
        flatItemInstances[i].discountPaise = Math.round(groupDiscountPaise * share);
      }
    }
  }

  let remDiscountPaise = 0;
  let remSumPaise = 0;

  // Remainder items (the cheapest R items in the sorted list)
  if (R === 2) {
    // Buy 1 Get 1: discount the cheaper one (index 0)
    remDiscountPaise = flatItemInstances[0].pricePaise;
    flatItemInstances[0].discountPaise = remDiscountPaise;
  } else if (R === 3) {
    const targetRemPrice = 129900; // ₹1,299 in paise
    for (let i = 0; i < 3; i++) {
      remSumPaise += flatItemInstances[i].pricePaise;
    }
    if (remSumPaise > targetRemPrice) {
      remDiscountPaise = remSumPaise - targetRemPrice;
      
      // Pro-rata allocate remainder 3 discount
      for (let i = 0; i < 3; i++) {
        const share = flatItemInstances[i].pricePaise / remSumPaise;
        flatItemInstances[i].discountPaise = Math.round(remDiscountPaise * share);
      }
    }
  }

  const totalDiscountPaise = groupDiscountPaise + remDiscountPaise;

  // 3. Re-aggregate flat instances back into original lines
  const normalizedLines = items.map((item, originalIdx) => {
    const instances = flatItemInstances.filter(inst => inst.originalIdx === originalIdx);
    const lineOriginalSubtotal = instances.reduce((sum, inst) => sum + inst.pricePaise, 0);
    const lineDiscount = instances.reduce((sum, inst) => sum + inst.discountPaise, 0);
    const lineTotal = lineOriginalSubtotal - lineDiscount;

    return {
      variantId: item.variantId || null,
      title: item.title || "Custom Product",
      price: parseFloat((normalizePrice(item.price) / 100).toFixed(2)),
      quantity: item.quantity,
      attributes: item.attributes || [],
      subtotal: parseFloat((lineOriginalSubtotal / 100).toFixed(2)),
      discount: parseFloat((lineDiscount / 100).toFixed(2)),
      total: parseFloat((lineTotal / 100).toFixed(2))
    };
  });

  // 4. Build active deal name string
  const dealParts = [];
  if (G > 0) {
    dealParts.push(`${G}x (4@₹1,599)`);
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
    normalizedLines,
    subtotal: parseFloat((originalSubtotalPaise / 100).toFixed(2)),
    discountAmount: parseFloat((totalDiscountPaise / 100).toFixed(2)),
    finalTotal: parseFloat(((originalSubtotalPaise - totalDiscountPaise) / 100).toFixed(2)),
    pricingBreakdown: {
      groupsOf4: {
        count: G,
        discount: parseFloat((groupDiscountPaise / 100).toFixed(2)),
        targetPrice: parseFloat(((G * 159900) / 100).toFixed(2))
      },
      groupsOf3: {
        count: R === 3 ? 1 : 0,
        discount: parseFloat((remDiscountPaise / 100).toFixed(2)),
        targetPrice: R === 3 ? 1299.00 : 0.00
      },
      b1g1: {
        count: R === 2 ? 1 : 0,
        discount: R === 2 ? parseFloat((remDiscountPaise / 100).toFixed(2)) : 0.00
      },
      activeDealName
    },
    currency
  };
}
