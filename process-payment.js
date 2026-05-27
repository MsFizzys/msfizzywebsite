const https = require("https");

function httpsRequest(options, payload) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body: data,
        });
      });
    });

    req.on("error", (e) => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: e.message }),
      });
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error("Request timeout"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendOrderEmail(orderDetails) {
  const {
    customerName,
    customerEmail,
    items,
    fulfillment,
    deliveryAddress,
    deliveryInstructions,
    total,
    bundleSaving,
  } = orderDetails;

  const safeCustomerName = escapeHtml(customerName || "Customer");
  const safeCustomerEmail = escapeHtml(customerEmail || "Not provided");
  const safeDeliveryAddress = escapeHtml(deliveryAddress || "");
  const safeDeliveryInstructions = escapeHtml(deliveryInstructions || "");

  const itemRows = items
    .map((item) => {
      const lines = [
        `<strong>${escapeHtml(item.name)}</strong> x${item.qty} — $${(
          item.price * item.qty
        ).toFixed(2)}`,
      ];

      if (item.detail) {
        lines.push(
          `<span style="color:#888;font-size:13px;">${escapeHtml(
            item.detail
          )}</span>`
        );
      }

      return `<tr><td style="padding:8px 0;border-bottom:1px solid #f0e8dc;">${lines.join(
        "<br>"
      )}</td></tr>`;
    })
    .join("");

  const fulfillmentSection =
    fulfillment === "delivery"
      ? `
        <p><strong>Fulfillment:</strong> Delivery</p>
        <p><strong>Address:</strong> ${safeDeliveryAddress}</p>
        ${
          safeDeliveryInstructions
            ? `<p><strong>Instructions:</strong> ${safeDeliveryInstructions}</p>`
            : ""
        }
      `
      : `<p><strong>Fulfillment:</strong> Pickup</p>`;

  const businessHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border:2px solid #d4a843;border-radius:16px;overflow:hidden;">
      <div style="background:#c0392b;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;">🥤 New Ms. Fizzy's Order!</h1>
      </div>

      <div style="padding:24px;">
        <h2 style="color:#c0392b;margin-top:0;">Customer Info</h2>
        <p><strong>Name:</strong> ${safeCustomerName}</p>
        <p><strong>Email:</strong> ${safeCustomerEmail}</p>

        <h2 style="color:#c0392b;">Fulfillment</h2>
        ${fulfillmentSection}

        <h2 style="color:#c0392b;">Order Details</h2>

        <table style="width:100%;border-collapse:collapse;">
          ${itemRows}
        </table>

        <div style="margin-top:16px;padding:12px;background:#fdf6ec;border-radius:8px;">
          ${
            bundleSaving > 0
              ? `<p style="margin:4px 0;color:#888;">Bundle Discount: -$${bundleSaving.toFixed(
                  2
                )}</p>`
              : ""
          }

          <p style="margin:4px 0;font-size:18px;font-weight:bold;color:#c0392b;">
            Total Charged: $${total.toFixed(2)}
          </p>
        </div>

        <p style="margin-top:24px;color:#888;font-size:12px;">
          This order was placed on ${new Date().toLocaleString("en-US", {
            timeZone: "America/Los_Angeles",
          })} PT
        </p>
      </div>
    </div>
  `;

  const resendHeaders = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };

  // Send business notification email
  const businessPayload = JSON.stringify({
    from: "Ms. Fizzy's Orders <orders@msfizzys.com>",
    to: ["msfizzysdrinks@gmail.com"],
    subject: `New Order from ${safeCustomerName} — $${total.toFixed(2)}`,
    html: businessHtml,
  });

  const businessResult = await httpsRequest(
    {
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        ...resendHeaders,
        "Content-Length": Buffer.byteLength(businessPayload),
      },
    },
    businessPayload
  );

  // Send customer confirmation email
  if (customerEmail) {
    const customerHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border:2px solid #d4a843;border-radius:16px;overflow:hidden;">
        <div style="background:#c0392b;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">🥤 Thanks for your order!</h1>
        </div>

        <div style="padding:24px;">
          <p>Hi ${safeCustomerName},</p>

          <p>
            We received your order from
            <strong>Ms. Fizzy's Dirty Sodas</strong>.
          </p>

          <h2 style="color:#c0392b;">Order Summary</h2>

          <table style="width:100%;border-collapse:collapse;">
            ${itemRows}
          </table>

          <div style="margin-top:16px;padding:12px;background:#fdf6ec;border-radius:8px;">
            ${
              bundleSaving > 0
                ? `<p style="margin:4px 0;color:#888;">Bundle Discount: -$${bundleSaving.toFixed(
                    2
                  )}</p>`
                : ""
            }

            <p style="margin:4px 0;font-size:18px;font-weight:bold;color:#c0392b;">
              Total Paid: $${total.toFixed(2)}
            </p>
          </div>

          <div style="margin-top:20px;">
            ${fulfillmentSection}
          </div>

          <p style="margin-top:24px;">
            Your order will be fulfilled Friday.
          </p>

          <p style="color:#888;font-size:12px;">
            Questions? Reply to this email or message us on Instagram.
          </p>
        </div>
      </div>
    `;

    const customerPayload = JSON.stringify({
      from: "Ms. Fizzy's <orders@msfizzys.com>",
      to: [customerEmail],
      subject: "Your Ms. Fizzy's Order Confirmation 🥤",
      html: customerHtml,
    });

    await httpsRequest(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          ...resendHeaders,
          "Content-Length": Buffer.byteLength(customerPayload),
        },
      },
      customerPayload
    );
  }

  return businessResult;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  let body;

  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }

  const {
    sourceId,
    amount,
    items,
    customerEmail,
    customerName,
    fulfillment,
    deliveryAddress,
    deliveryInstructions,
    bundleSaving,
  } = body;

  if (
    !sourceId ||
    typeof amount !== "number" ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing or invalid required fields" }),
    };
  }

  console.log("Incoming order", {
    customerName,
    customerEmail,
    amount,
    itemCount: items.length,
  });

  const payload = JSON.stringify({
    source_id: sourceId,
    idempotency_key: `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 11)}`,
    amount_money: {
      amount: Math.round(amount),
      currency: "USD",
    },
    buyer_email_address: customerEmail || undefined,
    note: `Ms. Fizzy's order from ${customerName || "customer"}: ${items
      .map((i) => `${i.name} x${i.qty}`)
      .join(", ")}`,
  });

  const squareResult = await httpsRequest(
    {
      hostname: "connect.squareup.com",
      path: "/v2/payments",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Square-Version": "2024-01-18",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    payload
  );

  const parsed = JSON.parse(squareResult.body);

  console.log("Square response status", squareResult.statusCode);

  if (
    squareResult.statusCode >= 200 &&
    squareResult.statusCode < 300 &&
    parsed.payment
  ) {
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
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        paymentId: parsed.payment.id,
      }),
    };
  } else {
    console.error("Square payment failed:", parsed);

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: parsed.errors?.[0]?.detail || "Payment failed",
      }),
    };
  }
};