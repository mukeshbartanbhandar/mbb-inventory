
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
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
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

  // Selling price per piece for pieces-based products; selling price per kilogram for kg-based products.
  sellingPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  sellingPriceBasis: {
    type: String,
    enum: ["piece", "kg"],
    required: false,
  },
}, { timestamps: true });

stockSchema.index({ productName: "text" });

const Admin = mongoose.model("Admin", adminSchema);
const Stock = mongoose.model("Stock", stockSchema);

// -------------------- SALES + EXPENSE SCHEMAS --------------------
const saleSchema = new mongoose.Schema({
  productName: { type: String, required: true, trim: true, maxlength: 120 },
  unit: { type: String, enum: ["pieces", "kg"], default: "pieces" },
  quantity: { type: Number, required: true, min: 0.001 },
  weight: { type: Number, min: 0.001, default: undefined },
  amountPaid: { type: Number, required: true, min: 0 }
}, { timestamps: true });
saleSchema.index({ createdAt: -1 });

const expenseSchema = new mongoose.Schema({
  category: { type: String, enum: ["Shop rent", "Godown rent", "Electricity bill", "Scrape", "Other"], required: true },
  description: { type: String, trim: true, maxlength: 160, default: "" },
  materialName: { type: String, trim: true, maxlength: 120, default: "" },
  weight: { type: Number, min: 0.001, default: undefined },
  rate: { type: Number, min: 0, default: undefined },
  amount: { type: Number, min: 0.01, default: undefined },
  totalAmount: { type: Number, required: true, min: 0 }
}, { timestamps: true });
expenseSchema.index({ createdAt: -1 });

const Sale = mongoose.model("Sale", saleSchema);
const Expense = mongoose.model("Expense", expenseSchema);

// -------------------- OUTSTANDING LEDGER --------------------
const outstandingSchema = new mongoose.Schema({
  type: { type: String, enum: ["payable", "receivable"], required: true },
  partyName: { type: String, required: true, trim: true, maxlength: 120 },
  productName: { type: String, required: true, trim: true, maxlength: 120 },
  amount: { type: Number, required: true, min: 0.01 },
  paidAmount: { type: Number, required: true, min: 0, default: 0 },
  dueDate: { type: String, trim: true, default: "" },
  notes: { type: String, trim: true, maxlength: 300, default: "" }
}, { timestamps: true });
outstandingSchema.index({ type: 1, createdAt: -1 });
const Outstanding = mongoose.model("Outstanding", outstandingSchema);

function periodFilter(period) {
  if (period === "15days") return { createdAt: { $gte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) } };
  if (period === "month") {
    const start = new Date();
    start.setDate(1); start.setHours(0, 0, 0, 0);
    return { createdAt: { $gte: start } };
  }
  return {};
}

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

function adminOnly(req, res, next) {
  if (req.admin?.role !== "admin") {
    return res.status(403).json({ message: "Administrator access is required for this section." });
  }
  next();
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
      "Selling price must be zero or greater."
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
    sellingPriceBasis: unit === "kg" ? "kg" : "piece",
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

    // Fixed read-only staff account requested by the shop owner.
    // Staff can view stock, but stock mutations and admin sections are role-protected below.
    let sessionUser;
    if (username === "member" && password === "member123") {
      sessionUser = { id: "staff-member", username: "member", role: "staff" };
    } else {
      const admin = await Admin.findOne({ username });
      if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
        return res.status(401).json({ message: "Access denied. Invalid username or password." });
      }
      sessionUser = { id: admin._id.toString(), username: admin.username, role: "admin" };
    }

    const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, username: sessionUser.username, role: sessionUser.role });
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

app.post("/api/stock", auth, adminOnly, async (req, res) => {
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

app.put("/api/stock/:id", auth, adminOnly, async (req, res) => {
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

app.delete("/api/stock/:id", auth, adminOnly, async (req, res) => {
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


// -------------------- OUTSTANDING LEDGER API (ADMIN ONLY) --------------------
app.get("/api/outstanding", auth, adminOnly, async (_req, res) => {
  try {
    const rows = await Outstanding.find({}).sort({ createdAt: -1 }).lean();
    res.json(rows);
  } catch (error) {
    console.error("Outstanding fetch error:", error);
    res.status(500).json({ message: "Could not load outstanding records." });
  }
});

app.post("/api/outstanding", auth, adminOnly, async (req, res) => {
  try {
    const type = String(req.body.type || "");
    const partyName = String(req.body.partyName || "").trim();
    const productName = String(req.body.productName || "").trim();
    const amount = Number(req.body.amount);
    const paidAmount = Number(req.body.paidAmount || 0);
    const dueDate = String(req.body.dueDate || "").trim();
    const notes = String(req.body.notes || "").trim();
    if (!["payable", "receivable"].includes(type)) return res.status(400).json({ message: "Choose payable or receivable." });
    if (!partyName || !productName) return res.status(400).json({ message: "Name and product / goods are required." });
    if (partyName.length > 120 || productName.length > 120 || notes.length > 300) return res.status(400).json({ message: "One or more fields exceed the allowed length." });
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > amount) return res.status(400).json({ message: "Enter a valid total amount and paid amount. Paid amount cannot exceed total." });
    const row = await Outstanding.create({ type, partyName, productName, amount, paidAmount, dueDate, notes });
    res.status(201).json(row);
  } catch (error) {
    console.error("Outstanding create error:", error);
    res.status(400).json({ message: error.message || "Could not create outstanding record." });
  }
});

app.patch("/api/outstanding/:id/payment", auth, adminOnly, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Payment amount must be greater than zero." });
    const row = await Outstanding.findById(req.params.id);
    if (!row) return res.status(404).json({ message: "Outstanding record not found." });
    if (row.paidAmount + amount > row.amount + 0.001) return res.status(400).json({ message: "Payment cannot exceed the remaining balance." });
    row.paidAmount = Math.min(row.amount, Number((row.paidAmount + amount).toFixed(2)));
    await row.save();
    res.json(row);
  } catch (error) {
    console.error("Outstanding payment error:", error);
    res.status(400).json({ message: error.name === "CastError" ? "Invalid outstanding record ID." : (error.message || "Could not record payment.") });
  }
});

app.delete("/api/outstanding/:id", auth, adminOnly, async (req, res) => {
  try {
    const row = await Outstanding.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: "Outstanding record not found." });
    res.json({ message: "Outstanding record deleted." });
  } catch (error) {
    res.status(400).json({ message: "Invalid outstanding record ID." });
  }
});

// -------------------- ADMIN DASHBOARD ANALYTICS --------------------
app.get("/api/dashboard", auth, adminOnly, async (_req, res) => {
  try {
    const [stock, sales, expenses] = await Promise.all([
      Stock.find({}).sort({ createdAt: -1 }).lean(),
      Sale.find({}).sort({ createdAt: -1 }).lean(),
      Expense.find({}).lean()
    ]);
    const byName = new Map(stock.map(item => [item.productName.trim().toLowerCase(), item]));
    const today = new Date(); today.setHours(0,0,0,0);
    let revenue = 0, estimatedCost = 0, unitsSoldToday = 0;
    const movement = new Map();
    for (const sale of sales) {
      const amount = Number(sale.amountPaid || 0);
      revenue += amount;
      const item = byName.get(String(sale.productName || "").trim().toLowerCase());
      if (item) estimatedCost += Number(sale.quantity || 0) * Number(item.rate || 0);
      const units = Number(sale.quantity || 0);
      const key = String(sale.productName || "Unknown");
      const prev = movement.get(key) || { productName:key, unitsSold:0, revenue:0 };
      prev.unitsSold += units; prev.revenue += amount; movement.set(key, prev);
      if (new Date(sale.createdAt) >= today) unitsSoldToday += units;
    }
    const stockCost = stock.reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.rate||0),0);
    const stockSelling = stock.reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.sellingPrice||0),0);
    const potentialSales = stock.reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.sellingPrice||0),0);
    const slowStock = stock.filter(x => Date.now() - new Date(x.createdAt).getTime() > 90*24*60*60*1000 && Number(x.quantity)>0);
    const scrapTotal = expenses.filter(x=>x.category==="Scrape").reduce((sum,x)=>sum+Number(x.totalAmount||0),0);
    res.json({
      revenue:Number(revenue.toFixed(2)), profit:Number((revenue-estimatedCost).toFixed(2)),
      stockCost:Number(stockCost.toFixed(2)), stockSelling:Number(stockSelling.toFixed(2)),
      potentialSales:Number(potentialSales.toFixed(2)), lowStockCount:stock.filter(x=>Number(x.quantity)<=5).length,
      unitsSoldToday:Number(unitsSoldToday.toFixed(3)), averageBill:sales.length?Number((revenue/sales.length).toFixed(2)):0,
      scrapTotal:Number(scrapTotal.toFixed(2)), productCount:stock.length,
      fastMoving:[...movement.values()].sort((a,b)=>b.unitsSold-a.unitsSold).slice(0,10),
      slowStock:slowStock.map(x=>({_id:x._id,productName:x.productName,quantity:x.quantity,unit:x.unit,createdAt:x.createdAt}))
    });
  } catch (error) {
    console.error("Dashboard analytics error:", error);
    res.status(500).json({message:"Could not load dashboard metrics."});
  }
});

// -------------------- SALES API --------------------
app.get("/api/sales", auth, adminOnly, async (req, res) => {
  try {
    const rows = await Sale.find(periodFilter(String(req.query.period || "15days"))).sort({ createdAt: -1 }).lean();
    res.json(rows);
  } catch (error) {
    console.error("Sales fetch error:", error);
    res.status(500).json({ message: "Could not load sales records." });
  }
});

app.post("/api/sales", auth, adminOnly, async (req, res) => {
  try {
    const productName = String(req.body.productName || "").trim();
    const unit = req.body.unit === "kg" ? "kg" : "pieces";
    const quantity = Number(req.body.quantity);
    const amountPaid = Number(req.body.amountPaid);
    const weight = req.body.weight === "" || req.body.weight == null ? undefined : Number(req.body.weight);
    if (!productName) return res.status(400).json({ message: "Product name is required." });
    if (productName.length > 120) return res.status(400).json({ message: "Product name must be 120 characters or fewer." });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ message: "Quantity must be greater than zero." });
    if (!Number.isFinite(amountPaid) || amountPaid < 0) return res.status(400).json({ message: "Amount paid must be zero or greater." });
    if (weight !== undefined && (!Number.isFinite(weight) || weight <= 0)) return res.status(400).json({ message: "Weight must be greater than zero when provided." });
    const sale = await Sale.create({ productName, unit, quantity, amountPaid, ...(weight !== undefined ? { weight } : {}) });
    res.status(201).json(sale);
  } catch (error) {
    console.error("Sale create error:", error);
    res.status(400).json({ message: error.message || "Could not record sale." });
  }
});

app.delete("/api/sales/:id", auth, adminOnly, async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ message: "Sale record not found." });
    res.json({ message: "Sale record deleted." });
  } catch {
    res.status(400).json({ message: "Invalid sale record ID." });
  }
});

// -------------------- EXPENSES API --------------------
app.get("/api/expenses", auth, adminOnly, async (req, res) => {
  try {
    const rows = await Expense.find(periodFilter(String(req.query.period || "15days"))).sort({ createdAt: -1 }).lean();
    res.json(rows);
  } catch (error) {
    console.error("Expenses fetch error:", error);
    res.status(500).json({ message: "Could not load expense records." });
  }
});

app.post("/api/expenses", auth, adminOnly, async (req, res) => {
  try {
    const allowed = ["Shop rent", "Godown rent", "Electricity bill", "Scrape", "Other"];
    const category = String(req.body.category || "");
    if (!allowed.includes(category)) return res.status(400).json({ message: "Choose a valid expense category." });
    let payload = { category, totalAmount: 0 };
    if (category === "Scrape") {
      const materialName = String(req.body.materialName || "").trim();
      const weight = Number(req.body.weight);
      const rate = Number(req.body.rate);
      if (!materialName) return res.status(400).json({ message: "Scrap material name is required." });
      if (materialName.length > 120) return res.status(400).json({ message: "Material name must be 120 characters or fewer." });
      if (!Number.isFinite(weight) || weight <= 0) return res.status(400).json({ message: "Scrap weight must be greater than zero." });
      if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ message: "Scrap rate must be zero or greater." });
      payload = { ...payload, materialName, weight, rate, totalAmount: Number((weight * rate).toFixed(2)) };
    } else {
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Expense amount must be greater than zero." });
      payload.amount = amount;
      payload.totalAmount = Number(amount.toFixed(2));
      if (category === "Other") {
        const description = String(req.body.description || "").trim();
        if (!description) return res.status(400).json({ message: "Please specify what the other expense was." });
        if (description.length > 160) return res.status(400).json({ message: "Expense description must be 160 characters or fewer." });
        payload.description = description;
      }
    }
    const expense = await Expense.create(payload);
    res.status(201).json(expense);
  } catch (error) {
    console.error("Expense create error:", error);
    res.status(400).json({ message: error.message || "Could not record expense." });
  }
});

app.delete("/api/expenses/:id", auth, adminOnly, async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense record not found." });
    res.json({ message: "Expense record deleted." });
  } catch {
    res.status(400).json({ message: "Invalid expense record ID." });
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
  .then(async () => {
    console.log("MongoDB connected");

    // One-time compatibility migration: older kg records stored selling price per piece.
    // Convert those prices to the equivalent per-kg selling price while preserving the same total value.
    const legacyStock = await Stock.find({ sellingPriceBasis: { $exists: false } });
    for (const item of legacyStock) {
      if (item.unit === "kg") {
        const quantity = Number(item.quantity || 0);
        const pieces = Number(item.piecesObtained || 0);
        if (quantity > 0 && pieces > 0) {
          item.sellingPrice = Number((Number(item.sellingPrice || 0) * pieces / quantity).toFixed(2));
        }
        item.sellingPriceBasis = "kg";
      } else {
        item.sellingPriceBasis = "piece";
      }
      await item.save();
    }
    if (legacyStock.length) console.log(`Updated selling price basis for ${legacyStock.length} existing stock records.`);

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
