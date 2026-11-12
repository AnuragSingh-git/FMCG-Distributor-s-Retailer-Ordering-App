
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const aiRoutes = require("./routes/aiRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");

const connectDB = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Keep the raw body for Meta webhook signature verification.
app.use("/api/whatsapp/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SmartWholesale AI API is running!",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    service: "SmartWholesale AI Backend",
  });
});

app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/whatsapp", whatsappRoutes);

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();
