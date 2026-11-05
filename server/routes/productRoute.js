
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
    },

    packSize: {
      type: Number,
      required: true,
      min: 1,
    },

    packUnit: {
      type: String,
      required: true,
      default: "pieces",
    },

    dealerPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    stockCases: {
      type: Number,
      required: true,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
