import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, LoaderCircle, Plus, ReceiptText, Trash2, Wallet, X } from "lucide-react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const number = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
async function api(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("mbb:session-expired"));
    throw new Error(data.message || "Request failed. Please try again.");
  }
  return data;
}
const blankSale = { productName: "", unit: "pieces", weight: "", quantity: "1", amountPaid: "" };
const blankExpense = { category: "Shop rent", description: "", materialName: "", weight: "", rate: "", amount: "" };
const categories = ["Shop rent", "Godown rent", "Electricity bill", "Scrape", "Other"];
const dateTime = value => value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function SalesExpenses({ mode, token, onToast }) {
  const isSales = mode === "sales";
  const [period, setPeriod] = useState("15days");
  const [records, setRecords] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [saleForm, setSaleForm] = useState(blankSale);
  const [expenseForm, setExpenseForm] = useState(blankExpense);

  const loadRecords = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [data, stockData] = await Promise.all([
        api(`/${isSales ? "api/sales" : "api/expenses"}?period=${period}`, token),
        isSales ? api("/api/stock", token).catch(() => []) : Promise.resolve([])
      ]);
      setRecords(data);
      if (isSales) setStock(stockData);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [isSales, period, token]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const totals = useMemo(() => {
    const total = records.reduce((sum, row) => sum + Number(isSales ? row.amountPaid : row.totalAmount), 0);
    const count = records.length;
    return { total, count, average: count ? total / count : 0 };
  }, [records, isSales]);

  const openForm = () => {
    setSaleForm({ ...blankSale, productName: "" });
    setExpenseForm(blankExpense);
    setModal(true);
  };
  const submit = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const payload = isSales ? {
        productName: saleForm.productName.trim(), unit: saleForm.unit,
        weight: saleForm.weight === "" ? null : Number(saleForm.weight),
        quantity: Number(saleForm.quantity), amountPaid: Number(saleForm.amountPaid)
      } : {
        category: expenseForm.category, description: expenseForm.description.trim(),
        materialName: expenseForm.materialName.trim(), weight: expenseForm.weight === "" ? null : Number(expenseForm.weight),
        rate: expenseForm.rate === "" ? null : Number(expenseForm.rate),
        amount: expenseForm.amount === "" ? null : Number(expenseForm.amount)
      };
      await api(isSales ? "/api/sales" : "/api/expenses", token, { method: "POST", body: JSON.stringify(payload) });
      setModal(false); onToast(isSales ? "Sale recorded successfully." : "Expense recorded successfully.");
      await loadRecords();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const removeRecord = async row => {
    if (!window.confirm(`Delete this ${isSales ? "sale" : "expense"} record?`)) return;
    setDeleting(row._id);
    try {
      await api(`/${isSales ? "api/sales" : "api/expenses"}/${row._id}`, token, { method: "DELETE" });
      setRecords(current => current.filter(item => item._id !== row._id));
      onToast(`${isSales ? "Sale" : "Expense"} record deleted.`);
    } catch (e) { setError(e.message); }
    finally { setDeleting(""); }
  };

  return <div className="page-content se-page">
    <section className="page-heading se-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" /> BUSINESS TRACKING</div>
        <h1>{isSales ? <>Sales <span>Register</span></> : <>Expense <span>Register</span></>}</h1>
        <p>{isSales ? "Record customer payments and review your recent sales." : "Track shop costs, rent, bills and scrap purchases in one place."}</p>
      </div>
      <button className="primary-button" onClick={openForm}><Plus size={18} /> Add {isSales ? "sale" : "expense"}</button>
    </section>

    <section className="se-stats-grid">
      <article className="se-stat-card"><div className="se-stat-icon se-green"><CircleDollarSign size={20}/></div><span>{isSales ? "Total sales" : "Total expenses"}</span><strong>{money(totals.total)}</strong><small>{period === "15days" ? "Last 15 days" : period === "month" ? "This calendar month" : "All recorded time"}</small></article>
      <article className="se-stat-card"><div className="se-stat-icon se-blue"><ReceiptText size={20}/></div><span>Total records</span><strong>{number(totals.count)}</strong><small>{isSales ? "Customer transactions" : "Expense transactions"}</small></article>
      <article className="se-stat-card"><div className="se-stat-icon se-amber"><CalendarDays size={20}/></div><span>Average per record</span><strong>{money(totals.average)}</strong><small>For the selected period</small></article>
      <article className="se-stat-card"><div className={`se-stat-icon ${isSales ? "se-violet" : "se-red"}`}>{isSales ? <ArrowUpRight size={20}/> : <ArrowDownRight size={20}/>}</div><span>{isSales ? "Payments collected" : "Recorded outflow"}</span><strong>{money(totals.total)}</strong><small>Based on saved entries</small></article>
    </section>

    <section className="se-panel">
      <div className="se-panel-head"><div><h2>{isSales ? "Sales history" : "Expense history"}</h2><p>Date and time are recorded automatically when saved.</p></div>
        <div className="se-filter" aria-label="Filter records by period">
          <button className={period === "15days" ? "selected" : ""} onClick={() => setPeriod("15days")}>Last 15 days</button>
          <button className={period === "month" ? "selected" : ""} onClick={() => setPeriod("month")}>This month</button>
          <button className={period === "all" ? "selected" : ""} onClick={() => setPeriod("all")}>All time</button>
        </div>
      </div>
      {error && <div className="se-error">{error}<button onClick={() => setError("")}><X size={15}/></button></div>}
      <div className="se-table-wrap"><table className="se-table"><thead><tr>
        <th>Date & time</th>{isSales ? <><th>Product</th><th>Weight</th><th>Quantity</th><th>Amount paid</th></> : <><th>Category</th><th>Details</th><th>Weight</th><th>Rate</th><th>Total amount</th></>}<th>Action</th>
      </tr></thead><tbody>
        {loading ? <tr><td className="se-empty" colSpan={isSales ? 6 : 7}><LoaderCircle className="spin" size={22}/> Loading records…</td></tr> : records.length === 0 ? <tr><td className="se-empty" colSpan={isSales ? 6 : 7}><div className="se-empty-icon">{isSales ? <ReceiptText size={24}/> : <Wallet size={24}/>}</div><strong>No records for this period</strong><span>Add your first {isSales ? "sale" : "expense"} to get started.</span></td></tr> : records.map(row => <tr key={row._id}>
          <td><div className="se-date"><strong>{new Date(row.createdAt).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"})}</strong><span><Clock3 size={12}/> {new Date(row.createdAt).toLocaleTimeString("en-IN", {hour:"2-digit",minute:"2-digit"})}</span></div></td>
          {isSales ? <><td><strong>{row.productName}</strong></td><td>{row.weight != null ? `${number(row.weight)} kg` : "—"}</td><td>{number(row.quantity)} {row.unit === "kg" ? "kg" : "pcs"}</td><td className="se-money">{money(row.amountPaid)}</td></> : <><td><span className={`se-category ${row.category === "Scrape" ? "scrape" : ""}`}>{row.category}</span></td><td><strong>{row.category === "Scrape" ? row.materialName : row.category === "Other" ? row.description : row.category}</strong>{row.category === "Scrape" && <small className="se-subline">Scrap material</small>}</td><td>{row.weight != null ? `${number(row.weight)} kg` : "—"}</td><td>{row.rate != null ? money(row.rate) : "—"}</td><td className="se-money">{money(row.totalAmount)}</td></>}
          <td><button className="se-delete" disabled={deleting === row._id} onClick={() => removeRecord(row)} title="Delete record" aria-label="Delete record">{deleting === row._id ? <LoaderCircle size={16} className="spin"/> : <Trash2 size={16}/>}</button></td>
        </tr>)}
      </tbody></table></div>
      <div className="se-panel-foot"><span>Showing <strong>{records.length}</strong> record{records.length === 1 ? "" : "s"}</span><span><CheckCircle2 size={14}/> Saved to database</span></div>
    </section>

    {modal && <div className="se-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setModal(false); }}><section className="se-modal" role="dialog" aria-modal="true">
      <div className="se-modal-head"><div><div className="eyebrow"><span className="eyebrow-line"/>{isSales ? "NEW TRANSACTION" : "NEW EXPENSE"}</div><h2>Record {isSales ? "a sale" : "an expense"}</h2><p>Date and time will be added automatically.</p></div><button className="icon-button" onClick={() => !saving && setModal(false)}><X size={19}/></button></div>
      <form onSubmit={submit} className="se-form">
        {isSales ? <>
          <label className="se-field full">Product name<input list="mbb-stock-products" value={saleForm.productName} onChange={e => { const name = e.target.value; const match = stock.find(item => item.productName.toLowerCase() === name.toLowerCase()); setSaleForm(f => ({...f, productName:name, unit: match ? match.unit : f.unit})); }} placeholder="Select or type product name" required maxLength="120"/><datalist id="mbb-stock-products">{stock.map(item => <option key={item._id} value={item.productName}/>)}</datalist></label>
          <label className="se-field">Quantity type<select value={saleForm.unit} onChange={e => setSaleForm(f => ({...f,unit:e.target.value}))}><option value="pieces">Pieces</option><option value="kg">Kilograms (kg)</option></select></label>
          <label className="se-field">Quantity sold<input type="number" min="0.001" step="any" value={saleForm.quantity} onChange={e => setSaleForm(f => ({...f,quantity:e.target.value}))} required/></label>
          <label className="se-field">Weight (kg), if applicable<input type="number" min="0.001" step="any" value={saleForm.weight} onChange={e => setSaleForm(f => ({...f,weight:e.target.value}))} placeholder="Optional"/></label>
          <label className="se-field">Amount paid (₹)<input type="number" min="0" step="0.01" value={saleForm.amountPaid} onChange={e => setSaleForm(f => ({...f,amountPaid:e.target.value}))} placeholder="Total amount received" required/></label>
          <div className="se-info full"><Clock3 size={16}/> Sale date and time will be recorded from the server when you save. Amount means the payment received from the customer.</div>
        </> : <>
          <label className="se-field">Expense category<select value={expenseForm.category} onChange={e => setExpenseForm(f => ({...f,category:e.target.value}))}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
          {expenseForm.category === "Other" && <label className="se-field">Specify expense<input value={expenseForm.description} onChange={e => setExpenseForm(f => ({...f,description:e.target.value}))} placeholder="What was this expense?" required maxLength="160"/></label>}
          {expenseForm.category === "Scrape" ? <>
            <label className="se-field full">Material name<input value={expenseForm.materialName} onChange={e => setExpenseForm(f => ({...f,materialName:e.target.value}))} placeholder="e.g. Iron scrap, aluminium" required maxLength="120"/></label>
            <label className="se-field">Weight (kg)<input type="number" min="0.001" step="any" value={expenseForm.weight} onChange={e => setExpenseForm(f => ({...f,weight:e.target.value}))} required/></label>
            <label className="se-field">Rate per kg (₹)<input type="number" min="0" step="0.01" value={expenseForm.rate} onChange={e => setExpenseForm(f => ({...f,rate:e.target.value}))} required/></label>
            <div className="se-calculation full"><span>Automatically calculated total</span><strong>{money(Number(expenseForm.weight || 0) * Number(expenseForm.rate || 0))}</strong><small>Weight × rate per kg</small></div>
          </> : <label className="se-field full">Amount (₹)<input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({...f,amount:e.target.value}))} placeholder="Enter amount paid" required/></label>}
          <div className="se-info full"><Clock3 size={16}/> Expense date and time are automatically recorded when you save.</div>
        </>}
        <div className="se-form-actions full"><button type="button" className="secondary-button" disabled={saving} onClick={() => setModal(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? <><LoaderCircle size={17} className="spin"/> Saving…</> : <><Plus size={17}/> Save {isSales ? "sale" : "expense"}</>}</button></div>
      </form>
    </section></div>}
  </div>;
}
