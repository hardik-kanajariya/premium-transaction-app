/**
 * Creates a Razorpay order for a computed amount.
 * Since we do not install external NPM packages, we make direct HTTP requests using native fetch.
 * 
 * @param {number} amountPaise - Amount in paise (integer)
 * @param {string} [currency="INR"] - Currency code
 * @param {string} [receipt] - Receipt string identifier
 * @returns {Promise<{ id: string, amount: number, currency: string, receipt: string }>}
 */
export async function createRazorpayOrder(amountPaise, currency = "INR", receipt = "") {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured.");
  }

  const payload = {
    amount: Math.round(amountPaise), // must be integer paise
    currency,
    receipt: receipt || `rcpt_${Date.now()}`
  };

  const authString = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authString}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Razorpay API Error (${response.status}): ${errorText}`);
  }

  const responseJson = await response.json();

  return {
    id: responseJson.id,
    amount: parseFloat((responseJson.amount / 100).toFixed(2)),
    currency: responseJson.currency,
    receipt: responseJson.receipt
  };
}
