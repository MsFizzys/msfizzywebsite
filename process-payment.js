const https = require("https");

function httpsRequest(options, payload) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("error", (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function sendOrderEmail(orderDetails) {
  const { customerName, customerEmail, items, fulfillment, deliveryAddress, deliveryInstructions, total, bundleSaving } = orderDetails;

  const itemRows = items.map(item => {
    const lines = [`<strong>${item.name}</strong> x${item.qty} — $${(item.price * item.qty).toFixed(2)}`];
    if (item.detail) lines.push(`<span style="color:#888;font-size:13px;">${item.detail}</span>`);
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #f0e8dc;">${lines.join("<br>")}</td></tr>`;
  }).join("");

  const fulfillmentSection = fulfillment === "delivery"
    ? `<p><strong>Fulfillment:</strong> Delivery</p>
       <p><strong>Address:</strong> ${deliveryAddress}</p>
       ${deliveryInstructions ? `<p><strong>Instructions:</strong> ${deliveryInstructions}</p>` : ""}`
    : `<p><strong>Fulfillment:</strong> Pickup</p>`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border:2px solid #d4a843;border-radius:16px;overflow:hidden;">
      <div style="background:#c0392b;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">🥤 New Ms. Fizzy's Order!</h1>
      </div>
      <div style="padding:24px;">
        <h2 style="color:#c0392b;margin-top:0;">Customer Info</h2>
        <p><strong>Name:</strong> ${customerName || "Not provided"}</p>
        <p><strong>Email:</strong> ${customerEmail || "Not provided"}</p>

        <h2 style="color:#c0392b;">Fulfillment</h2>
        ${fulfillmentSection}

        <h2 style="color:#c0392b;">Order Details</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${itemRows}
        </table>

        <div style="margin-top:16px;padding:12px;background:#fdf6ec;border-radius:8px;">
          ${bundleSaving > 0 ? `<p style="margin:4px 0;color:#888;">Bundle Discount: -$${bundleSaving.toFixed(2)}</p>` : ""}
          <p style="margin:4px 0;font-size:18px;font-weight:bold;color:#c0392b;">Total Charged: $${total.toFixed(2)}</p>
        </div>

        <p style="margin-top:24px;color:#888;font-size:12px;">This order was placed on ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT</p>
      </div>
    </div>
  `;

  const emailPayload = JSON.stringify({
    from: "Ms. Fizzy's Orders <orders@msfizzys.com>",
    to: ["msfizzysdrinks@gmail.com"],
    subject: `New Order from ${customerName || "a customer"} — $${total.toFixed(2)}`,
    html,
  });

  const result = await httpsRequest({
    hostname: "api.resend.com",
    path: "/emails",
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(emailPayload),
    },
  }, emailPayload);

  return result;
}

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

  const { sourceId, amount, items, customerEmail, customerName, fulfillment, deliveryAddress, deliveryInstructions, bundleSaving } = body;

  if (!sourceId || !amount || !items) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const payload = JSON.stringify({
    source_id: sourceId,
    idempotency_key: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    amount_money: {
      amount: Math.round(amount),
      currency: "USD",
    },
    buyer_email_address: customerEmail || undefined,
    note: `Ms. Fizzy's order from ${customerName || "customer"}: ${items.map(i => `${i.name} x${i.qty}`).join(", ")}`,
  });

  const squareResult = await httpsRequest({
    hostname: "connect.squareup.com",
    path: "/v2/payments",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-01-18",
      "Content-Length": Buffer.byteLength(payload),
    },
  }, payload);

  const parsed = JSON.parse(squareResult.body);

  if (squareResult.statusCode === 200 && parsed.payment) {
    // Send order notification email
    try {
      await sendOrderEmail({
        customerName,
        customerEmail,
        items,
        fulfillment,
        deliveryAddress,
        deliveryInstructions,
        total: amount / 100,
        bundleSaving: bundleSaving || 0,
      });
    } catch (emailErr) {
      console.error("Email failed:", emailErr);
      // Don't fail the payment if email fails
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, paymentId: parsed.payment.id }),
    };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: parsed.errors?.[0]?.detail || "Payment failed" }),
    };
  }
};
