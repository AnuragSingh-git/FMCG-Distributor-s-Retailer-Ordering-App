const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { normalizePhone, validWebhookSignature } = require("../services/phone");

test("normalizes Indian mobile numbers into WhatsApp webhook form", () => {
  assert.equal(normalizePhone("+91 98765 43210"), "919876543210");
  assert.equal(normalizePhone("9876543210"), "919876543210");
  assert.equal(normalizePhone("09876543210"), "919876543210");
  assert.equal(normalizePhone("123"), null);
});

test("accepts only a correct WhatsApp webhook HMAC signature", () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = "test-app-secret";
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(validWebhookSignature(raw, signature, secret), true);
  assert.equal(validWebhookSignature(raw, signature, "wrong-secret"), false);
  assert.equal(validWebhookSignature(raw, "sha256=bad", secret), false);
});
