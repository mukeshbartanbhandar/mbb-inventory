import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, CheckCircle2, CircleDollarSign, Plus, Trash2 } from "lucide-react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const blank = { type: "payable", partyName: "", productName: "", amount: "", paidAmount: "0", dueDate: "", notes: "" };

async function call(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed.");
  return data;
}

export default function Outstanding({ token, onToast }) {
  const [records, setRecords] = useState([]);
  const [type, setType] = useState("payable");
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState({});

  const load = async () => {
    setLoading(true); setError("");
    try { setRecords(await call("/api/outstanding", token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const filtered = records.filter(row => row.type === type);
  const totals = useMemo(() => {
    const rows = records.filter(row => row.type === type);
    return { total: rows.reduce((s, r) => s + Number(r.amount || 0), 0), paid: rows.reduce((s, r) => s + Number(r.paidAmount || 0), 0), due: rows.reduce((s, r) => s + Math.max(0, Number(r.amount || 0) - Number(r.paidAmount || 0)), 0) };
  }, [records, type]);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const startAdd = () => { setForm({ ...blank, type }); setShowForm(true); setError(""); };
  const submit = async e => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await call("/api/outstanding", token, { method: "POST", body: JSON.stringify({ ...form, type, amount: Number(form.amount), paidAmount: Number(form.paidAmount || 0) }) });
      setForm({ ...blank, type }); setShowForm(false); await load(); onToast?.("Outstanding record added.");
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const recordPayment = async row => {
    const amount = Number(payments[row._id] || 0);
    if (!amount || amount <= 0) { setError("Enter a payment amount greater than zero."); return; }
    const due = Number(row.amount) - Number(row.paidAmount || 0);
    if (amount > due + 0.001) { setError(`Payment cannot exceed the outstanding balance of ${money(due)}.`); return; }
    setError("");
    try { await call(`/api/outstanding/${row._id}/payment`, token, { method: "PATCH", body: JSON.stringify({ amount }) }); setPayments(p => ({ ...p, [row._id]: "" })); await load(); onToast?.("Payment recorded."); }
    catch (e) { setError(e.message); }
  };
  const remove = async row => {
    if (!window.confirm(`Delete outstanding record for ${row.partyName}?`)) return;
    try { await call(`/api/outstanding/${row._id}`, token, { method: "DELETE" }); await load(); onToast?.("Record deleted."); }
    catch (e) { setError(e.message); }
  };

  return <div className="page-content outstanding-page">
    <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />PAYMENTS & CREDIT</div><h1>Outstanding <span>Ledger</span></h1><p>Track money you owe suppliers and money customers or borrowers owe you.</p></div><button className="primary-button" onClick={startAdd}><Plus size={17} /> Add record</button></section>
    <div className="outstanding-switch"><button className={type === "payable" ? "active" : ""} onClick={() => { setType("payable"); setShowForm(false); setError(""); }}><ArrowUpRight size={18} /> You need to pay <small>Payables</small></button><button className={type === "receivable" ? "active" : ""} onClick={() => { setType("receivable"); setShowForm(false); setError(""); }}><ArrowDownLeft size={18} /> You need to collect <small>Receivables</small></button></div>
    <div className="outstanding-summary"><div><span>Total amount</span><strong>{money(totals.total)}</strong></div><div><span>Paid / collected</span><strong>{money(totals.paid)}</strong></div><div><span>Remaining balance</span><strong>{money(totals.due)}</strong></div></div>
    {error && <div className="outstanding-error">{error}</div>}
    {showForm && <form className="outstanding-form" onSubmit={submit}><div className="outstanding-form-title"><div><h2>{type === "payable" ? "Add supplier payable" : "Add borrower / customer receivable"}</h2><p>{type === "payable" ? "Record stock or goods purchased from the market on credit." : "Record products borrowed or money customers still owe you."}</p></div><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button></div>
      <div className="outstanding-fields"><label>{type === "payable" ? "Supplier / market name" : "Borrower / customer name"}<input value={form.partyName} onChange={e => update("partyName", e.target.value)} required maxLength="120" placeholder={type === "payable" ? "e.g. Sharma Steel Supplier" : "e.g. Customer name"} /></label><label>Product / goods<input value={form.productName} onChange={e => update("productName", e.target.value)} required maxLength="120" placeholder="e.g. 10 kg steel utensils" /></label><label>Total amount (₹)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => update("amount", e.target.value)} required placeholder="0.00" /></label><label>Already paid (₹)<input type="number" min="0" step="0.01" value={form.paidAmount} onChange={e => update("paidAmount", e.target.value)} required /></label><label>Due date (optional)<input type="date" value={form.dueDate} onChange={e => update("dueDate", e.target.value)} /></label><label className="wide">Notes (optional)<input value={form.notes} onChange={e => update("notes", e.target.value)} maxLength="300" placeholder="Invoice number, payment terms, contact details…" /></label></div>
      <div className="outstanding-form-footer"><span>Remaining balance: <strong>{money(Math.max(0, Number(form.amount || 0) - Number(form.paidAmount || 0)))}</strong></span><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save record"}</button></div>
    </form>}
    <section className="outstanding-list"><div className="outstanding-list-heading"><div><h2>{type === "payable" ? "Supplier payables" : "Borrowers & receivables"}</h2><p>{filtered.length} record{filtered.length === 1 ? "" : "s"}</p></div></div>
      {loading ? <div className="outstanding-empty">Loading outstanding records…</div> : filtered.length === 0 ? <div className="outstanding-empty"><CircleDollarSign size={28} /><strong>No {type === "payable" ? "payables" : "receivables"} recorded yet</strong><span>Add a record to start tracking the balance.</span></div> : <div className="outstanding-cards">{filtered.map(row => { const due = Math.max(0, Number(row.amount) - Number(row.paidAmount || 0)); const settled = due < 0.005; return <article className="outstanding-card" key={row._id}><div className="outstanding-card-top"><div><span className="outstanding-kind">{type === "payable" ? "SUPPLIER / MARKET" : "BORROWER / CUSTOMER"}</span><h3>{row.partyName}</h3><p>{row.productName}</p></div><button className="action-button delete-action" title="Delete record" onClick={() => remove(row)}><Trash2 size={16} /></button></div><div className="outstanding-money-row"><div><span>Total</span><strong>{money(row.amount)}</strong></div><div><span>{type === "payable" ? "Paid" : "Collected"}</span><strong>{money(row.paidAmount)}</strong></div><div><span>Balance due</span><strong className={settled ? "paid-balance" : "due-balance"}>{money(due)}</strong></div></div><div className="outstanding-progress"><span style={{ width: `${Math.min(100, Number(row.amount) > 0 ? Number(row.paidAmount || 0) / Number(row.amount) * 100 : 0)}%` }} /></div><div className="outstanding-meta">{row.dueDate && <span><CalendarDays size={14} /> Due {new Date(`${row.dueDate}T00:00:00`).toLocaleDateString("en-IN")}</span>}{row.notes && <span>{row.notes}</span>}{settled && <span className="paid-label"><CheckCircle2 size={14} /> Settled</span>}</div>{!settled && <div className="outstanding-payment"><label>Record {type === "payable" ? "payment" : "collection"}<div><span>₹</span><input type="number" min="0.01" max={due} step="0.01" placeholder="Amount" value={payments[row._id] || ""} onChange={e => setPayments(p => ({ ...p, [row._id]: e.target.value }))} /></div></label><button className="secondary-button" onClick={() => recordPayment(row)}>Update balance</button></div>}</article>; })}</div>}
    </section>
  </div>;
}
