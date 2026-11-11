const express = require("express");
const crypto = require("node:crypto");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { protect } = require("../middleware/authMiddleware");
const { parseRetailerMessage } = require("../services/geminiService");
const { sendText } = require("../services/whatsappService");
const { normalizePhone, validWebhookSignature } = require("../services/phone");
const router = express.Router();

router.get("/status", protect, (req, res) => res.json({ success: true, configured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN) }));

// Meta webhook subscription handshake.
router.get("/webhook", (req, res) => {
  const valid = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN;
  if (!valid) return res.sendStatus(403);
  return res.status(200).send(req.query["hub.challenge"]);
});

async function processMessage(message) {
  if (message.type !== "text" || !message.text?.body || !message.from || !message.id) return;
  if (await Order.exists({ externalMessageId: message.id })) return;
  const normalized = normalizePhone(message.from);
  if (!normalized) return;
  const retailer = await User.findOne({ phone: normalized, role: "retailer" });
  if (!retailer) return; // Never accept an order from an unlinked phone number.
  try {
    const products = await Product.find({ isActive: true }).select("sku name category packSize packUnit dealerPrice stockCases").lean();
    const parsed = await parseRetailerMessage(message.text.body, products);
    if (!parsed.items.length) {
      await sendText(message.from, "Sorry, order samajh nahi aaya. Kripya product aur case quantity ke saath bhejein, ya retailer app mein order review karein.");
      return;
    }
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const items = parsed.items.map((line) => { const p = byId.get(String(line.productId)); return { product: p._id, sku: p.sku, productName: p.name, quantity: line.quantity, unitPrice: p.dealerPrice, lineTotal: Math.round(p.dealerPrice * line.quantity * 100) / 100 }; });
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    const order = await Order.create({ orderNumber: `WA-${Date.now()}-${crypto.randomInt(100, 1000)}`, retailerName: retailer.name, retailer: retailer._id, items, subtotal, status: "pending", source: "whatsapp", externalMessageId: message.id });
    const summary = items.map((i) => `${i.quantity} × ${i.productName}`).join("\n");
    const unresolved = parsed.unmatched.length ? `\nNeeds clarification: ${parsed.unmatched.join(", ")}` : "";
    await sendText(message.from, `Order draft ${order.orderNumber} received:\n${summary}\nEstimated total ₹${subtotal}.${unresolved}\nCompany A's order desk must review it before processing.`);
  } catch (error) {
    console.error("WhatsApp inbound processing failed:", error.message);
    try { await sendText(message.from, "We received your message but could not process it just now. Please try again or contact the order desk."); } catch (sendError) { console.error("WhatsApp reply failed:", sendError.message); }
  }
}

router.post("/webhook", (req, res) => {
  if (!validWebhookSignature(req.body, req.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) return res.sendStatus(401);
  let payload;
  try { payload = JSON.parse(req.body.toString("utf8")); } catch { return res.sendStatus(400); }
  res.sendStatus(200);
  for (const entry of payload.entry || []) for (const change of entry.changes || []) for (const message of change.value?.messages || []) setImmediate(() => processMessage(message).catch((error) => console.error("WhatsApp webhook task failed:", error.message)));
});

module.exports = router;
