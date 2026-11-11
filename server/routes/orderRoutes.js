
const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { protect, authorize } = require("../middleware/authMiddleware");
const { sendStatusTemplate } = require("../services/whatsappService");
const { normalizePhone } = require("../services/phone");

const router = express.Router();

// Create a new order
router.post("/", protect, authorize("retailer"), async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty.",
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Too many different products in one order.",
      });
    }

    const quantities = new Map();

    for (const item of items) {
      if (
        !mongoose.isValidObjectId(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 10000
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product or quantity.",
        });
      }

      const current = quantities.get(item.productId) || 0;
      quantities.set(item.productId, current + item.quantity);
    }

    const session = await mongoose.startSession();
    let createdOrder;

    try {
      await session.withTransaction(async () => {
        const orderItems = [];
        let subtotal = 0;

        for (const [productId, quantity] of quantities) {
          const product = await Product.findOneAndUpdate(
            {
              _id: productId,
              isActive: true,
              stockCases: { $gte: quantity },
            },
            {
              $inc: { stockCases: -quantity },
            },
            {
              new: true,
              session,
            }
          );

          if (!product) {
            throw new Error(
              `Product ${productId} is unavailable or has insufficient stock.`
            );
          }

          const lineTotal = Math.round(
            product.dealerPrice * quantity * 100
          ) / 100;

          subtotal += lineTotal;

          orderItems.push({
            product: product._id,
            sku: product.sku,
            productName: product.name,
            quantity,
            unitPrice: product.dealerPrice,
            lineTotal,
          });
        }

        subtotal = Math.round(subtotal * 100) / 100;

        const orderNumber =
          `SW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const orders = await Order.create(
          [
            {
              orderNumber,
              retailerName: req.user.name,
              retailer: req.user._id,
              items: orderItems,
              subtotal,
              status: "pending",
            },
          ],
          { session }
        );

        createdOrder = orders[0];
      });
    } finally {
      await session.endSession();
    }

    res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      order: createdOrder,
    });
  } catch (error) {
    console.error("Order creation error:", error.message);

    res.status(400).json({
      success: false,
      message: error.message || "Unable to place order.",
    });
  }
});

// Get orders (temporary demo endpoint)
router.get("/",protect, authorize("orderdesk"), async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("items.product", "name sku");

    res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to fetch orders.",
    });
  }
});

// Order-desk approval and optional approved-template WhatsApp notification.
router.patch("/:id/status", protect, authorize("orderdesk"), async (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be approved or rejected." });
  }
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(req.params.id).session(session);
        if (!order) throw new Error("Order not found.");
        if (order.status !== "pending") throw new Error("Only pending orders can be reviewed.");

        if (order.source === "whatsapp" && status === "approved") {
          for (const item of order.items) {
            const product = await Product.findOneAndUpdate(
              { _id: item.product, isActive: true, stockCases: { $gte: item.quantity } },
              { $inc: { stockCases: -item.quantity } },
              { new: true, session }
            );
            if (!product) throw new Error(`${item.productName} no longer has enough stock.`);
          }
        } else if (order.source !== "whatsapp" && status === "rejected") {
          for (const item of order.items) await Product.updateOne({ _id: item.product }, { $inc: { stockCases: item.quantity } }, { session });
        }

        order.status = status;
        await order.save({ session });
      });
    } finally { await session.endSession(); }
    const order = await Order.findById(req.params.id).populate("retailer", "phone");
    let whatsappNotified = false;
    let whatsappMessage = "";
    if (order.retailer?.phone && process.env.WHATSAPP_STATUS_TEMPLATE) {
      try {
        await sendStatusTemplate(normalizePhone(order.retailer.phone), order);
        whatsappNotified = true;
      } catch (error) { whatsappMessage = `Order saved; WhatsApp notification failed: ${error.message}`; }
    } else if (!order.retailer?.phone) {
      whatsappMessage = "Order saved; retailer has no linked WhatsApp number.";
    } else {
      whatsappMessage = "Order saved; set an approved WHATSAPP_STATUS_TEMPLATE to send a status update.";
    }
    res.json({ success: true, order, whatsappNotified, whatsappMessage });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || "Unable to update order." });
  }
});

module.exports = router;
