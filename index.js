const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
const chatRoutes = require("./routes/chat");
const authRoutes = require("./routes/auth");

// Default route
app.get("/", (req, res) => {
  res.send("Chat App is running");
});

// Use API routes
app.use("/api/auth", authRoutes);
app.use("/api", chatRoutes);

// Start server only after MongoDB is connected
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ MongoDB connected");

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1); // Exit process with failure
  }
};

startServer();

module.exports = app;
