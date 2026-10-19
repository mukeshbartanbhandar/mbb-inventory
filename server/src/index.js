
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.MONGO_URI || !JWT_SECRET) {
  console.error("Missing MONGO_URI or JWT_SECRET in server/.env");
  process.exit(1);
}

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json({ limit: "20kb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

// -------------------- ADMIN SCHEMA --------------------

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
}, { timestamps: true });

// -------------------- STOCK SCHEMA --------------------

const stockSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },

  // Quantity means pieces for pieces-based products
  // and kilograms for kg-based products.
  quantity: {
    type: Number,
    required: true,
    min: 0.001,
  },

  unit: {
    type: String,
    enum: ["pieces", "kg"],
    default: "pieces",
    required: true,
  },

  // For unit "pieces": purchase cost per piece.
  // For unit "kg": purchase cost per kilogram.
  rate: {
    type: Number,
    required: true,
    min: 0,
  },

  // Used for kg products to calculate cost per piece.
  // Example: 10 kg produces 25 pieces.
  // For pieces-based products, this field is not required.
  piecesObtained: {
    type: Number,
    min: 1,
    validate: {
      validator: function (value) {
        if (this.unit === "kg") {
          return Number.isFinite(value) && value >= 1;
        }
        return value == null ||
          (Number.isFinite(value) && value >= 1);
      },
      message: "Pieces obtained must be at least 1 for kg products.",
    },
  },

  // Selling price of one individual piece.
  sellingPrice: {
    type: Number,
    required: true,
    min: 0,
  },
}, { timestamps: true });

stockSchema.index({ productName: "text" });

const Admin = mongoose.model("Admin", adminSchema);
const Stock = mongoose.model("Stock", stockSchema);

// -------------------- AUTHENTICATION --------------------

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      message: "Please log in to continue.",
    });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Session expired. Please log in again.",
    });
  }
}

// -------------------- STOCK VALIDATION --------------------

function stockPayload(body) {
  const productName = String(body.productName || "").trim();
  const quantity = Number(body.quantity);
  const rate = Number(body.rate);
  const sellingPrice = Number(body.sellingPrice);
  const unit = body.unit === "kg" ? "kg" : "pieces";

  let piecesObtained;

  if (unit === "kg") {
    piecesObtained = Number(body.piecesObtained);
  } else if (
    body.piecesObtained !== undefined &&
    body.piecesObtained !== null &&
    body.piecesObtained !== ""
  ) {
    piecesObtained = Number(body.piecesObtained);
  }

  if (!productName) {
    throw new Error("Product name is required.");
  }

  if (productName.length > 120) {
    throw new Error(
      "Product name must be 120 characters or fewer."
    );
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Purchase rate must be zero or greater.");
  }

  if (
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0
  ) {
    throw new Error(
      "Selling price per piece must be zero or greater."
    );
  }

  if (
    unit === "kg" &&
    (!Number.isFinite(piecesObtained) || piecesObtained < 1)
  ) {
    throw new Error(
      "For kg products, enter the number of pieces obtained."
    );
  }

  if (
    unit === "pieces" &&
    piecesObtained !== undefined &&
    (!Number.isFinite(piecesObtained) || piecesObtained < 1)
  ) {
    throw new Error(
      "Pieces obtained must be at least 1."
    );
  }

  const payload = {
    productName,
    quantity,
    unit,
    rate,
    sellingPrice,
  };

  if (unit === "kg") {
    payload.piecesObtained = piecesObtained;
  } else if (piecesObtained !== undefined) {
    payload.piecesObtained = piecesObtained;
  } else {
    payload.piecesObtained = undefined;
  }

  return payload;
}

// -------------------- CALCULATIONS --------------------

function formatStock(item) {
  const quantity = Number(item.quantity);
  const rate = Number(item.rate);

  // Total purchase cost:
  // quantity × purchase rate.
  const total = quantity * rate;

  // For pieces, rate is already the cost per piece.
  // For kg, divide total cost by the pieces obtained.
  const costPerPiece = item.unit === "kg"
    ? (
        Number(item.piecesObtained) > 0
          ? total / Number(item.piecesObtained)
          : 0
      )
    : rate;

  return {
    ...item,
    total: Number(total.toFixed(2)),
    costPerPiece: Number(costPerPiece.toFixed(2)),
  };
}

// -------------------- HEALTH CHECK --------------------

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// -------------------- ADMIN LOGIN --------------------

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        message: "Enter username and password.",
      });
    }

    const admin = await Admin.findOne({ username });

    if (
      !admin ||
      !(await bcrypt.compare(password, admin.passwordHash))
    ) {
      return res.status(401).json({
        message: "Incorrect username or password.",
      });
    }

    const token = jwt.sign(
      {
        id: admin._id.toString(),
        username: admin.username,
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      username: admin.username,
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Unable to log in right now.",
    });
  }
});

// -------------------- GET ALL STOCK --------------------

app.get("/api/stock", auth, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();

    const escapedSearch = search.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const filter = search
      ? {
          productName: {
            $regex: escapedSearch,
            $options: "i",
          },
        }
      : {};

    const items = await Stock.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json(items.map(formatStock));
  } catch (error) {
    console.error("Stock fetch error:", error);

    res.status(500).json({
      message: "Could not load stock records.",
    });
  }
});

// -------------------- ADD STOCK --------------------

app.post("/api/stock", auth, async (req, res) => {
  try {
    const payload = stockPayload(req.body);
    const item = await Stock.create(payload);

    res.status(201).json(
      formatStock(item.toObject())
    );
  } catch (error) {
    console.error("Stock create error:", error);

    res.status(
      error.name === "ValidationError" ? 400 : 400
    ).json({
      message: error.message || "Could not create stock record.",
    });
  }
});

// -------------------- UPDATE STOCK --------------------

app.put("/api/stock/:id", auth, async (req, res) => {
  try {
    const payload = stockPayload(req.body);

    const item = await Stock.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!item) {
      return res.status(404).json({
        message: "Stock record not found.",
      });
    }

    res.json(formatStock(item.toObject()));
  } catch (error) {
    console.error("Stock update error:", error);

    const status = error.name === "CastError" ? 404 : 400;

    res.status(status).json({
      message: error.message || "Could not update stock record.",
    });
  }
});

// -------------------- DELETE STOCK --------------------

app.delete("/api/stock/:id", auth, async (req, res) => {
  try {
    const item = await Stock.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Stock record not found.",
      });
    }

    res.json({
      message: "Stock record deleted.",
    });
  } catch (error) {
    console.error("Stock delete error:", error);

    res.status(400).json({
      message: "Invalid stock record ID.",
    });
  }
});

// -------------------- ERROR HANDLER --------------------

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    message: "Unexpected server error.",
  });
});

// -------------------- DATABASE + SERVER --------------------

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log(
        `MBB API running on http://localhost:${PORT}`
      );
    });
  })
  .catch(error => {
    console.error(
      "MongoDB connection failed:",
      error.message
    );

    process.exit(1);
  });
