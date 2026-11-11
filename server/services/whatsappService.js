const graphVersion = () => (process.env.WHATSAPP_API_VERSION || "v27.0").replace(/^v?/, "v");

async function graphPost(phoneNumberId, payload) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !phoneNumberId) throw new Error("WhatsApp Cloud API is not configured.");
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp API returned ${response.status}.`);
  return data;
}

function sendText(to, body) {
  return graphPost(process.env.WHATSAPP_PHONE_NUMBER_ID, { to, type: "text", text: { preview_url: false, body: body.slice(0, 4000) } });
}

function sendStatusTemplate(to, order) {
  const name = process.env.WHATSAPP_STATUS_TEMPLATE;
  if (!name) return Promise.resolve({ skipped: true, reason: "No status template configured" });
  return graphPost(process.env.WHATSAPP_PHONE_NUMBER_ID, {
    to, type: "template", template: { name, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
      components: [{ type: "body", parameters: [
        { type: "text", text: order.orderNumber },
        { type: "text", text: order.status },
        { type: "text", text: `₹${order.subtotal}` },
      ] }] },
  });
}

module.exports = { sendText, sendStatusTemplate };
