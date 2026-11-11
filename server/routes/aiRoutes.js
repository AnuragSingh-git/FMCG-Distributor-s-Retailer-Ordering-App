const express = require("express");
const Product = require("../models/Product");
const { protect, authorize } = require("../middleware/authMiddleware");
const { parseRetailerMessage } = require("../services/geminiService");
const router = express.Router();

router.post("/parse-order", protect, authorize("retailer"), async (req, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 2000) return res.status(400).json({ success: false, message: "Enter an order message (up to 2,000 characters)." });
  try {
    const products = await Product.find({ isActive: true }).select("sku name category packSize packUnit stockCases").lean();
    const interpretation = await parseRetailerMessage(message, products);
    res.json({ success: true, interpretation });
  } catch (error) {
    res.status(error.status || 502).json({ success: false, message: error.message || "Order interpretation failed." });
  }
});

module.exports = router;
