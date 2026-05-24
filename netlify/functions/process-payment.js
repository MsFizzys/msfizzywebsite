const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { sourceId, amount, items, customerEmail, customerName } = body;

  if (!sourceId || !amount || !items) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const payload = JSON.stringify({
    source_id: sourceId,
    idempotency_key: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    amount_money: {
      amount: Math.round(amount), // amount in cents
      currency: "USD",
    },
    buyer_email_address: customerEmail || undefined,
    note: `Ms. Fizzy's order from ${customerName || "customer"}: ${items.map(i => `${i.name} x${i.qty}`).join(", ")}`,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "connect.squareup.com",
      path: "/v2/payments",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Square-Version": "2024-01-18",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const parsed = JSON.parse(data);
        if (res.statusCode === 200 && parsed.payment) {
          resolve({
            statusCode: 200,
            body: JSON.stringify({ success: true, paymentId: parsed.payment.id }),
          });
        } else {
          resolve({
            statusCode: 400,
            body: JSON.stringify({ error: parsed.errors?.[0]?.detail || "Payment failed" }),
          });
        }
      });
    });

    req.on("error", (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });

    req.write(payload);
    req.end();
  });
};
