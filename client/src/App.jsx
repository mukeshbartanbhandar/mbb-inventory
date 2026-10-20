
import React, { useEffect, useMemo, useState } from "react";
import {
  CookingPot, Search, Plus, Pencil, Trash2, LogOut, Boxes,
  PackageCheck, IndianRupee, X, Eye, EyeOff, LoaderCircle,
  ShieldCheck, ArrowUpRight, Menu, ReceiptText, Wallet
} from "lucide-react";
import SalesExpenses from "./SalesExpenses.jsx";
import Dashboard from "./Dashboard.jsx";
import "./sales-expenses.css";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const emptyForm = {
  productName: "",
  quantity: "",
  unit: "pieces",
  rate: "",
  piecesObtained: "",
  sellingPrice: ""
};

const money = value =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));

const number = value =>
  Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 3
  });

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event("mbb:session-expired"));
    }
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
}

export default function App() {
  // Start in staff mode on every app load; admin must sign in when opening an admin section.
  const [token, setToken] = useState(() => sessionStorage.getItem("mbb_role") ? (sessionStorage.getItem("mbb_token") || "") : "");
  const [username, setUsername] = useState(() => sessionStorage.getItem("mbb_user") || "");
  const [role, setRole] = useState(() => sessionStorage.getItem("mbb_role") || "");
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activePage, setActivePage] = useState("stock");
  const [loginOpen, setLoginOpen] = useState(() => !(sessionStorage.getItem("mbb_token") && sessionStorage.getItem("mbb_role")));
  const [requestedPage, setRequestedPage] = useState("stock");

  const logout = () => {
    sessionStorage.removeItem("mbb_token");
    sessionStorage.removeItem("mbb_user");
    sessionStorage.removeItem("mbb_role");
    setToken("");
    setUsername("");
    setRole("");
    setItems([]);
    setActivePage("stock");
    setLoginOpen(true);
  };

  useEffect(() => {
    const handler = () => logout();

    window.addEventListener("mbb:session-expired", handler);

    return () =>
      window.removeEventListener("mbb:session-expired", handler);
  }, []);

  useEffect(() => {
    if (!toast) return;

    const id = setTimeout(() => setToast(""), 3000);

    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setPageError("");

    const timeout = setTimeout(async () => {
      try {
        const data = await request(
          `/api/stock?search=${encodeURIComponent(search)}`,
          { token }
        );

        if (active) setItems(data);
      } catch (error) {
        if (active) setPageError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [token, search]);

  const stats = useMemo(() => ({
    products: items.length,

    units: items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    ),

    stockValue: items.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 0) * Number(item.rate || 0),
      0
    ),

    potentialSales: items.reduce(
      (sum, item) =>
        sum +
        (item.unit === "kg"
          ? Number(item.piecesObtained || 0)
          : Number(item.quantity || 0)) *
          Number(item.sellingPrice || 0),
      0
    ),
  }), [items]);

  const login = async credentials => {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });

    sessionStorage.setItem("mbb_token", data.token);
    sessionStorage.setItem("mbb_user", data.username);
    sessionStorage.setItem("mbb_role", data.role);

    setToken(data.token);
    setUsername(data.username);
    setRole(data.role);
    setActivePage(data.role === "admin" ? requestedPage : "stock");
    setToast(data.role === "admin" ? "Admin access granted." : "Staff access granted. Stock is read-only.");
    return data;
  };

  const navigateTo = page => {
    setMobileMenu(false);
    if (["dashboard", "sales", "expenses"].includes(page) && role !== "admin") {
      setToast("Access denied. Admin login required.");
      return;
    }
    setActivePage(page);
  };

  const handleLogin = async credentials => {
    const data = await login(credentials);
    setActivePage(data.role === "admin" ? requestedPage : "stock");
    setLoginOpen(false);
  };

  const cancelAdminLogin = () => {
    // The app requires a valid staff or admin login before showing stock data.
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = item => {
    setEditing(item._id);

    setForm({
      productName: item.productName,
      quantity: String(item.quantity),
      unit: item.unit || "pieces",
      rate: String(item.rate),
      piecesObtained:
        item.piecesObtained != null
          ? String(item.piecesObtained)
          : "",
      sellingPrice: String(item.sellingPrice),
    });

    setModalOpen(true);
  };

  const saveStock = async event => {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        productName: form.productName.trim(),
        quantity: Number(form.quantity),
        unit: form.unit,
        rate: Number(form.rate),
        piecesObtained:
          form.unit === "kg" ? Number(form.piecesObtained) : null,
        sellingPrice: Number(form.sellingPrice),
      };

      await request(
        editing ? `/api/stock/${editing}` : "/api/stock",
        {
          token,
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      setModalOpen(false);
      setForm(emptyForm);
      setEditing(null);

      setToast(editing ? "Stock item updated." : "Stock item added.");

      const data = await request(
        `/api/stock?search=${encodeURIComponent(search)}`,
        { token }
      );

      setItems(data);
    } catch (error) {
      setToast(error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteStock = async item => {
    if (
      !window.confirm(
        `Delete "${item.productName}" from stock? This cannot be undone.`
      )
    ) return;

    setDeletingId(item._id);

    try {
      await request(`/api/stock/${item._id}`, {
        token,
        method: "DELETE",
      });

      setItems(current =>
        current.filter(row => row._id !== item._id)
      );

      setToast("Stock item deleted.");
    } catch (error) {
      setToast(error.message);
    } finally {
      setDeletingId("");
    }
  };

  const totalCost = item =>
    Number(item.quantity) * Number(item.rate);

  const costPerPiece = item => {
    if (item.unit === "kg") {
      const pieces = Number(item.piecesObtained || 0);

      return pieces > 0
        ? totalCost(item) / pieces
        : 0;
    }

    return Number(item.rate);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <CookingPot size={25} strokeWidth={1.9} />
          </div>

          <div>
            <div className="brand-name">MBB<span>.</span></div>
            <div className="brand-subtitle">MUKESH BARTAN BHANDAR</div>
          </div>

          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>

        <div className="shop-label">WORKSPACE</div>
        {role === "admin" && <button className={`nav-item ${activePage === "dashboard" ? "nav-active" : ""}`} onClick={() => navigateTo("dashboard")}><IndianRupee size={18}/><span>Dashboard</span>{activePage === "dashboard" && <span className="nav-dot" />}</button>}

        <button className={`nav-item ${activePage === "stock" ? "nav-active" : ""}`} onClick={() => navigateTo("stock")}>
          <Boxes size={18} />
          <span>Stock Entry</span>
          {activePage === "stock" && <span className="nav-dot" />}
        </button>
        {role === "admin" && <button className={`nav-item ${activePage === "sales" ? "nav-active" : ""}`} onClick={() => navigateTo("sales")}>
          <ReceiptText size={18} />
          <span>Sales</span>
          {activePage === "sales" && <span className="nav-dot" />}
        </button>}
        {role === "admin" && <button className={`nav-item ${activePage === "expenses" ? "nav-active" : ""}`} onClick={() => navigateTo("expenses")}>
          <Wallet size={18} />
          <span>Expenses</span>
          {activePage === "expenses" && <span className="nav-dot" />}
        </button>}

        <div className="sidebar-bottom">
          <div className="secure-note">
            <ShieldCheck size={17} />
            <span>{role === "admin" ? "Admin session active" : "Staff: read-only access"}</span>
          </div>

          <div className="profile">
            <div className="avatar">
              {(username || "S").slice(0, 1).toUpperCase()}
            </div>

            <div className="profile-info">
              <strong>{username || "Staff"}</strong>
              <span>{role === "admin" ? "Administrator" : "Read-only staff"}</span>
            </div>

            {token && <button
              className="icon-button logout-button"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={17} />
            </button>}
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu-button"
            onClick={() => setMobileMenu(true)}
            aria-label="Open menu"
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{activePage === "dashboard" ? "Dashboard" : activePage === "stock" ? "Stock Entry" : activePage === "sales" ? "Sales" : "Expenses"}</strong>
          </div>

          <div className="topbar-right">
            <span className="status-dot" />
            <span>System online</span>
            <div className="top-avatar">
              {(username || "S").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        {activePage === "dashboard" ? <Dashboard token={token} /> : activePage === "stock" ? <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                INVENTORY MANAGEMENT
              </div>

              <h1>Stock <span>Entry</span></h1>

              <p>
                Keep your inventory organised, accurate, and ready for business.
              </p>
            </div>

            {role === "admin" && <button
              className="primary-button add-top-button"
              onClick={openAdd}
            >
              <Plus size={18} /> Add New Product
            </button>}
          </section>

          <section className="stats-grid">
            <StatCard
              icon={<PackageCheck size={19} />}
              label="Total products"
              value={number(stats.products)}
              detail="Unique stock items"
              tone="green"
            />

            <StatCard
              icon={<Boxes size={19} />}
              label="Total quantity"
              value={number(stats.units)}
              detail="Across listed products"
              tone="blue"
            />

            <StatCard
              icon={<IndianRupee size={19} />}
              label="Stock cost value"
              value={money(stats.stockValue)}
              detail="Quantity × purchase rate"
              tone="amber"
            />


          </section>

          <section className="inventory-panel">
            <div className="panel-heading">
              <div>
                <h2>Inventory list</h2>
                <p>Manage product quantities and pricing</p>
              </div>

              <div className="record-count">
                <span className="record-count-dot" />
                {items.length} {items.length === 1 ? "record" : "records"}
              </div>
            </div>

            <div className="toolbar">
              <label className="search-box">
                <Search size={18} />

                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search by product name..."
                  aria-label="Search products"
                />

                {search && (
                  <button
                    type="button"
                    className="clear-search"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}

                <kbd>⌕</kbd>
              </label>

              {role === "admin" && <button
                className="primary-button toolbar-add"
                onClick={openAdd}
              >
                <Plus size={17} /> <span>Add Product</span>
              </button>}
            </div>

            {pageError && (
              <div className="error-banner">
                {pageError}
                <button onClick={() => setPageError("")}>Dismiss</button>
              </div>
            )}

            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th className="serial-col">S.NO.</th>
                    <th>PRODUCT NAME</th>
                    <th>WEIGHT / PIECES</th>
                    <th>RATE</th>
                    <th>TOTAL</th>
                    <th>COST / PIECE</th>
                    <th>SELLING / PIECE</th>
                    {role === "admin" && <th className="actions-col">ACTIONS</th>}
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={role === "admin" ? 8 : 7} className="state-cell">
                        <LoaderCircle className="spin" size={22} />
                        Loading inventory...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={role === "admin" ? 8 : 7} className="state-cell">
                        <div className="empty-icon">
                          <Boxes size={24} />
                        </div>

                        <strong>
                          {search
                            ? "No matching products"
                            : "Your inventory is empty"}
                        </strong>

                        <span>
                          {search
                            ? "Try a different product name."
                            : "Add your first product to get started."}
                        </span>

                        {!search && (
                          <button
                            type="button"
                            className="primary-button empty-add"
                            onClick={openAdd}
                          >
                            <Plus size={16} /> Add First Product
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item._id}>
                        <td className="serial-cell">
                          {String(index + 1).padStart(2, "0")}
                        </td>

                        <td>
                          <div className="product-cell">
                            <div className="product-icon">
                              <CookingPot size={17} />
                            </div>
                            <strong>{item.productName}</strong>
                          </div>
                        </td>

                        <td>
                          <span className="quantity-pill">
                            {number(item.quantity)}
                            {" "}
                            <small>
                              {item.unit === "kg" ? "kg" : "pcs"}
                            </small>
                          </span>

                          {item.unit === "kg" &&
                            Number(item.piecesObtained) > 0 && (
                              <div>
                                <small>
                                  {number(item.piecesObtained)} pieces
                                </small>
                              </div>
                            )}
                        </td>

                        <td>
                          {money(item.rate)}
                          <div>
                            <small>
                              {item.unit === "kg" ? "per kg" : "per piece"}
                            </small>
                          </div>
                        </td>

                        <td className="total-cell">
                          {money(totalCost(item))}
                        </td>

                        <td>{money(costPerPiece(item))}</td>

                        <td>
                          <span className="selling-price">
                            {money(item.sellingPrice)}
                          </span>
                        </td>

                        {role === "admin" && <td className="actions-cell">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="action-button edit-action"
                              onClick={() => openEdit(item)}
                              aria-label={`Edit ${item.productName}`}
                              title="Edit product"
                            >
                              <Pencil size={14} /> <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              className="action-button delete-action"
                              onClick={() => deleteStock(item)}
                              disabled={deletingId === item._id}
                              aria-label={`Delete ${item.productName}`}
                              title="Delete product"
                            >
                              {deletingId === item._id ? (
                                <LoaderCircle size={14} className="spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                              <span>{deletingId === item._id ? "Deleting" : "Delete"}</span>
                            </button>
                          </div>
                        </td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel-footer">
              <span>
                Showing <strong>{items.length}</strong>{" "}
                {items.length === 1 ? "item" : "items"}
                {search ? " matching your search" : ""}
              </span>

              <span>
                <span className="footer-dot" />
                Inventory synced with database
              </span>
            </div>
          </section>

          <footer className="page-footer">
            <span>
              © {new Date().getFullYear()} MBB · Mukesh Bartan Bhandar
            </span>

            <span>
              Built for everyday business{" "}
              <span className="footer-heart">♥</span>
            </span>
          </footer>
        </div> : <SalesExpenses mode={activePage} token={token} onToast={setToast} />}
      </main>

      {loginOpen && <LoginScreen onLogin={handleLogin} onCancel={cancelAdminLogin} />}

      {modalOpen && (
        <StockModal
          form={form}
          setForm={setForm}
          editing={Boolean(editing)}
          saving={saving}
          onClose={() => !saving && setModalOpen(false)}
          onSubmit={saveStock}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">✓</span>
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, detail, tone }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" title={value}>{value}</div>
      <div className="stat-detail">{detail}</div>
    </article>
  );
}

function LoginScreen({ onLogin, onCancel }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async event => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await onLogin({ username, password });
    } catch (err) {
      setError(err.message || "Access denied. Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen" style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
      <div className="login-decoration decoration-one" />
      <div className="login-decoration decoration-two" />

      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark">
            <CookingPot size={28} />
          </div>

          <div>
            <div className="brand-name">MBB<span>.</span></div>
            <div className="brand-subtitle">MUKESH BARTAN BHANDAR</div>
          </div>
        </div>

        <div className="login-intro">
          <div className="eyebrow">
            <span className="eyebrow-line" /> SECURE LOGIN
          </div>
          <h1>Welcome <span>back.</span></h1>
          <p>Sign in to view stock or manage the shop.</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="field-label" htmlFor="username">
Username
          </label>

          <input
            id="username"
            className="form-input"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter your username"
            required
          />

          <div className="password-label">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <span>Keep it secure</span>
          </div>

          <div className="password-input-wrap">
            <input
              id="password"
              className="form-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            className="primary-button login-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderCircle size={18} className="spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign in <ArrowUpRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="login-security">
          <ShieldCheck size={16} />
          <span>Staff can view stock only. Admin can manage all sections.</span>
        </div>
      </div>

      <div className="login-bottom">
        © {new Date().getFullYear()} MBB · Mukesh Bartan Bhandar
      </div>
    </div>
  );
}

function StockModal({
  form,
  setForm,
  editing,
  saving,
  onClose,
  onSubmit
}) {
  const update = (key, value) =>
    setForm(current => ({ ...current, [key]: value }));

  const quantity = Number(form.quantity || 0);
  const rate = Number(form.rate || 0);
  const piecesObtained = Number(form.piecesObtained || 0);

  const total = quantity * rate;

  const costPerPiece =
    form.unit === "kg"
      ? piecesObtained > 0
        ? total / piecesObtained
        : 0
      : rate;

  useEffect(() => {
    const handler = event => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="stock-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              {editing ? "UPDATE INVENTORY" : "NEW INVENTORY ITEM"}
            </div>

            <h2 id="modal-title">
              {editing ? "Edit product" : "Add a product"}
            </h2>

            <p>Enter the product and pricing details below.</p>
          </div>

          <button
            className="icon-button modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="form-field full-field">
              <label className="field-label" htmlFor="productName">
                Product name <span>*</span>
              </label>

              <input
                id="productName"
                className="form-input"
                value={form.productName}
                onChange={e => update("productName", e.target.value)}
                placeholder="e.g. Stainless steel kadai"
                maxLength="120"
                required
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="unit">
                Quantity type <span>*</span>
              </label>

              <select
                id="unit"
                className="form-input"
                value={form.unit}
                onChange={e => {
                  const unit = e.target.value;
                  update("unit", unit);
                }}
              >
                <option value="pieces">Pieces</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="quantity">
                {form.unit === "kg" ? "Weight (kg)" : "Number of pieces"}
                <span> *</span>
              </label>

              <input
                id="quantity"
                className="form-input"
                type="number"
                min="0.001"
                step="any"
                value={form.quantity}
                onChange={e => update("quantity", e.target.value)}
                placeholder={form.unit === "kg" ? "e.g. 10" : "e.g. 24"}
                required
              />
            </div>

            {form.unit === "kg" && (
              <div className="form-field">
                <label className="field-label" htmlFor="piecesObtained">
                  Pieces obtained <span>*</span>
                </label>

                <input
                  id="piecesObtained"
                  className="form-input"
                  type="number"
                  min="1"
                  step="1"
                  value={form.piecesObtained}
                  onChange={e =>
                    update("piecesObtained", e.target.value)
                  }
                  placeholder="e.g. 20"
                  required
                />
              </div>
            )}

            <div className="form-field">
              <label className="field-label" htmlFor="rate">
                {form.unit === "kg"
                  ? "Purchase rate per kg"
                  : "Purchase rate per piece"}
                <span> *</span>
              </label>

              <div className="input-with-prefix">
                <span>₹</span>
                <input
                  id="rate"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.rate}
                  onChange={e => update("rate", e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <small>
                {form.unit === "kg"
                  ? "Cost of one kilogram"
                  : "Cost of one piece"}
              </small>
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="sellingPrice">
                Selling price / piece <span>*</span>
              </label>

              <div className="input-with-prefix">
                <span>₹</span>
                <input
                  id="sellingPrice"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={e => update("sellingPrice", e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <small>Price at which one piece will be sold</small>
            </div>
          </div>

          <div className="calculation-preview">
            <div>
              <span>Total purchase value</span>
              <strong>{money(total)}</strong>
            </div>

            <div>
              <span>
                {form.unit === "kg" ? "Cost per piece" : "Cost per piece"}
              </span>
              <strong>{money(costPerPiece)}</strong>
            </div>

            {form.unit === "kg" && (
              <div>
                <span>Estimated selling value</span>
                <strong>
                  {money(piecesObtained * Number(form.sellingPrice || 0))}
                </strong>
              </div>
            )}

            <span className="calc-note">
              {form.unit === "kg"
                ? "Total purchase value is divided by pieces obtained to calculate the cost per piece."
                : "Total purchase value and cost per piece are calculated automatically."}
            </span>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  Saving...
                </>
              ) : (
                <>
                  <PackageCheck size={17} />
                  {editing ? "Save changes" : "Save product"}
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
