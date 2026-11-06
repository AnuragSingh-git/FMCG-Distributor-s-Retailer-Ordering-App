
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Product = require("./models/Product");

const products = [
  {
    sku: "SKU-BS-075",
    name: "Glucose Biscuits 75g",
    category: "Biscuits",
    packSize: 96,
    packUnit: "pieces",
    dealerPrice: 8.10,
    stockCases: 340,
  },
  {
    sku: "SKU-DT-1KG",
    name: "Detergent Powder 1kg",
    category: "Detergent",
    packSize: 20,
    packUnit: "pieces",
    dealerPrice: 101.50,
    stockCases: 85,
  },
  {
    sku: "SKU-TE-250",
    name: "Tea Leaf 250g",
    category: "Beverages",
    packSize: 40,
    packUnit: "pieces",
    dealerPrice: 118,
    stockCases: 0,
  },
];

const seedProducts = async () => {
  try {
    await connectDB();

    // Replace existing sample products with this seed dataset
    await Product.deleteMany({});

    const insertedProducts = await Product.insertMany(products);

    console.log(`${insertedProducts.length} products inserted successfully.`);
  } catch (error) {
    console.error("Seeding failed:", error.message);
  } finally {
    await mongoose.disconnect();
  }
};

seedProducts();
