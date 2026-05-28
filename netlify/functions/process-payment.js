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

async function sendEmail(to, subject, html) {
  const emailPayload = JSON.stringify({
    from: "Ms. Fizzy's <orders@msfizzys.com>",
    to: [to],
    subject,
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

  console.log(`Email to ${to} — status: ${result.statusCode} — body: ${result.body}`);
  return result;
}

function buildItemRows(items) {
  return items.map(item => {
    const lines = [`<strong>${item.name}</strong> x${item.qty} — $${(item.price * item.qty).toFixed(2)}`];
    if (item.detail) lines.push(`<span style="color:#888;font-size:13px;">${item.detail}</span>`);
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #f0e8dc;">${lines.join("<br>")}</td></tr>`;
  }).join("");
}

function buildFulfillmentSection(fulfillment, deliveryAddress, deliveryInstructions) {
  if (fulfillment === "delivery") {
    return `
      <p><strong>Fulfillment:</strong> Delivery</p>
      <p><strong>Address:</strong> ${deliveryAddress}</p>
      ${deliveryInstructions ? `<p><strong>Instructions:</strong> ${deliveryInstructions}</p>` : ""}
    `;
  }
  return `
    <p><strong>Fulfillment:</strong> Pickup</p>
    <p><strong>Pickup Address:</strong> 35 Santa Maria Drive, Novato, CA 94947</p>
    <p style="font-size:13px;color:#888;">We'll contact you with your pickup time after your order is confirmed.</p>
  `;
}

async function sendOwnerNotification(orderDetails) {
  const { customerName, customerEmail, items, fulfillment, deliveryAddress, deliveryInstructions, total, bundleSaving } = orderDetails;

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
        ${buildFulfillmentSection(fulfillment, deliveryAddress, deliveryInstructions)}
        <h2 style="color:#c0392b;">Order Details</h2>
        <table style="width:100%;border-collapse:collapse;">${buildItemRows(items)}</table>
        <div style="margin-top:16px;padding:12px;background:#fdf6ec;border-radius:8px;">
          ${bundleSaving > 0 ? `<p style="margin:4px 0;color:#888;">Bundle Discount: -$${bundleSaving.toFixed(2)}</p>` : ""}
          <p style="margin:4px 0;font-size:18px;font-weight:bold;color:#c0392b;">Total Charged: $${total.toFixed(2)}</p>
        </div>
        <p style="margin-top:24px;color:#888;font-size:12px;">Ordered on ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT</p>
      </div>
    </div>
  `;

  return sendEmail("msfizzysdrinks@gmail.com", `New Order from ${customerName || "a customer"} — $${total.toFixed(2)}`, html);
}

async function sendCustomerConfirmation(orderDetails) {
  const { customerName, customerEmail, items, fulfillment, deliveryAddress, deliveryInstructions, total, bundleSaving } = orderDetails;

  if (!customerEmail) {
    console.log("No customer email provided — skipping confirmation.");
    return;
  }

  const fulfillmentDetails = fulfillment === "delivery"
    ? `<p><strong>Fulfillment:</strong> Delivery to ${deliveryAddress}</p>
       ${deliveryInstructions ? `<p><strong>Delivery Instructions:</strong> ${deliveryInstructions}</p>` : ""}`
    : `<p><strong>Fulfillment:</strong> Pickup</p>
       <p><strong>Pickup Address:</strong> 35 Santa Maria Drive, Novato, CA 94947</p>
       <p style="font-size:13px;color:#888;">We'll reach out with your pickup time soon!</p>`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border:2px solid #d4a843;border-radius:16px;overflow:hidden;">
      <div style="background:#c0392b;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">🥤 Thank You for Your Order!</h1>
      </div>
      <div style="padding:24px;">
        <p style="font-size:16px;">Hi ${customerName || "there"},</p>
        <p style="margin-top:8px;color:#555;">Thank you for ordering from Ms. Fizzy's! We're excited to fizz things up for you. Here's a summary of your order:</p>

        <h2 style="color:#c0392b;margin-top:24px;">Order Summary</h2>
        <table style="width:100%;border-collapse:collapse;">${buildItemRows(items)}</table>
        <div style="margin-top:16px;padding:12px;background:#fdf6ec;border-radius:8px;">
          ${bundleSaving > 0 ? `<p style="margin:4px 0;color:#888;">Bundle Discount: -$${bundleSaving.toFixed(2)}</p>` : ""}
          <p style="margin:4px 0;font-size:18px;font-weight:bold;color:#c0392b;">Total: $${total.toFixed(2)}</p>
        </div>

        <h2 style="color:#c0392b;margin-top:24px;">Fulfillment Details</h2>
        ${fulfillmentDetails}

        <div style="margin-top:32px;padding:16px;background:#fdf6ec;border-radius:10px;text-align:center;">
          <p style="font-family:Georgia,serif;font-size:1.1rem;color:#c0392b;font-style:italic;">"Marin County's First Dirty Soda Company"</p>
          <p style="margin-top:8px;font-size:13px;color:#888;">Questions? Email us at msfizzysdrinks@gmail.com or find us on Instagram @ms.fizzys</p>
        </div>

        <p style="margin-top:24px;color:#888;font-size:12px;text-align:center;">Ordered on ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT</p>
      </div>
    </div>
  `;

  return sendEmail(customerEmail, "Your Ms. Fizzy's Order Confirmation 🥤", html);
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

  console.log("Order received — customer email:", customerEmail || "NOT PROVIDED");

  if (!sourceId || !amount || !items) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const payload = JSON.stringify({
    source_id: sourceId,
    idempotency_key: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    amount_money: { amount: Math.round(amount), currency: "USD" },
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
    const orderDetails = {
      customerName, customerEmail, items, fulfillment,
      deliveryAddress, deliveryInstructions,
      total: amount / 100,
      bundleSaving: bundleSaving || 0,
    };

    try { await sendOwnerNotification(orderDetails); } catch (e) { console.error("Owner email failed:", e); }
    try { await sendCustomerConfirmation(orderDetails); } catch (e) { console.error("Customer email failed:", e); }

    return { statusCode: 200, body: JSON.stringify({ success: true, paymentId: parsed.payment.id }) };
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: parsed.errors?.[0]?.detail || "Payment failed" }) };
  }
};
