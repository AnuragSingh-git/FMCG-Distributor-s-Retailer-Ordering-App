const API = "https://generativelanguage.googleapis.com/v1beta/models";

async function parseRetailerMessage(message, products) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("Gemini is not configured. Add GEMINI_API_KEY to server/.env.");
    error.status = 503;
    throw error;
  }
  const catalog = products.map((p) => ({ sku: p.sku, name: p.name, category: p.category, pack: `${p.packSize} ${p.packUnit}`, stockCases: p.stockCases }));
  const schema = {
    type: "OBJECT",
    properties: {
      items: { type: "ARRAY", items: { type: "OBJECT", properties: {
        sku: { type: "STRING", enum: products.map((p) => p.sku) },
        quantity: { type: "INTEGER", minimum: 1, maximum: 10000 },
        confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
        clarification: { type: "STRING" },
      }, required: ["sku", "quantity", "confidence", "clarification"] } },
      unmatched: { type: "ARRAY", items: { type: "STRING" } },
    }, required: ["items", "unmatched"],
  };
  const prompt = `Extract a retailer's intended case order from this Hindi/Hinglish/English message. Match only the exact catalogue SKUs supplied below. Do not invent a SKU or quantity. Quantities mean cases unless the message explicitly says otherwise. Keep uncertain wording in unmatched and use confidence below 0.65 when you are unsure. Return no commentary.\nCATALOGUE: ${JSON.stringify(catalog)}\nMESSAGE: ${message}`;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const response = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? "Gemini is busy. Please try again shortly." : "Gemini could not interpret this message. Please edit it or try again.");
    error.status = response.status === 429 ? 503 : 502;
    throw error;
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!text) throw Object.assign(new Error("Gemini returned no order interpretation."), { status: 502 });
  const result = JSON.parse(text);
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const items = (Array.isArray(result.items) ? result.items : []).flatMap((x) => {
    const product = bySku.get(x.sku);
    const quantity = Number(x.quantity);
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) return [];
    return [{ productId: product._id, sku: product.sku, name: product.name, quantity, confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)), clarification: String(x.clarification || ""), stockCases: product.stockCases, needsReview: Number(x.confidence) < 0.65 || product.stockCases < quantity }];
  });
  return { items, unmatched: (Array.isArray(result.unmatched) ? result.unmatched : []).map(String), requiresConfirmation: true };
}

module.exports = { parseRetailerMessage };
