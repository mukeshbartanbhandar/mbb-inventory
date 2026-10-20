import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, Boxes, CalendarDays, CircleDollarSign, Package, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import "./dashboard.css";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const money = value => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(Number(value || 0));
const num = value => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits:2 });
async function getDashboard(token) {
  const r = await fetch(`${API}/api/dashboard`, { headers:{ Authorization:`Bearer ${token}` } });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.message || "Could not load dashboard");
  return data;
}
export default function Dashboard({token}) {
  const [data,setData] = useState(null); const [error,setError] = useState("");
  useEffect(()=>{ let live=true; getDashboard(token).then(d=>{if(live)setData(d)}).catch(e=>{if(live)setError(e.message)}); return ()=>{live=false}; },[token]);
  const cards = data ? [
    ["Total sales / revenue",money(data.revenue),"All recorded sales",CircleDollarSign,"green"],
    ["Estimated total profit",money(data.profit),"Sales minus estimated product cost",TrendingUp,"green"],
    ["Stock valuation · cost",money(data.stockCost),"Current inventory purchase value",Boxes,"blue"],
    ["Stock valuation · selling",money(data.stockSelling),"Potential selling value",TrendingUp,"violet"],
    ["Potential sales",money(data.potentialSales),"Moved here from Stock Entry",CircleDollarSign,"blue"],
    ["Low stock / reorder",num(data.lowStockCount),"Default alert: quantity ≤ 5",AlertTriangle,"amber"],
    ["Units sold today",num(data.unitsSoldToday),"Quantity recorded today",CalendarDays,"blue"],
    ["Average bill value",money(data.averageBill),"Average per sale record · all time",Wallet,"violet"],
    ["Scrap purchase total",money(data.scrapTotal),"Recorded Scrape expenses · all time",Package,"amber"],
    ["Slow / dead stock",num(data.slowStock.length),"Stock entries older than 90 days",TrendingDown,"red"],
    ["Stock items",num(data.productCount),"Unique inventory records",Boxes,"blue"]
  ] : [];
  return <div className="page-content dashboard-page">
    <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> BUSINESS OVERVIEW</div><h1>Business <span>Dashboard</span></h1><p>Sales, profit estimates, stock health and scrap tracking in one place.</p></div><button className="secondary-button" onClick={()=>{setData(null);setError("");getDashboard(token).then(setData).catch(e=>setError(e.message));}}>Refresh data</button></section>
    {error && <div className="dashboard-error">{error}</div>}
    {!data && !error && <p>Loading dashboard metrics…</p>}
    {data && <>
      <section className="dashboard-grid">{cards.map(([label,value,detail,Icon,tone])=><article className="dashboard-card" key={label}><div className={`dashboard-icon ${tone}`}><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
      <div className="dashboard-columns">
        <section className="dashboard-panel"><h2>Fast-moving items · Top 10</h2><p>Ranked by recorded units sold, all time.</p>{data.fastMoving.length ? <div className="dashboard-table-wrap"><table><thead><tr><th>Product</th><th>Units sold</th><th>Revenue</th></tr></thead><tbody>{data.fastMoving.map(x=><tr key={x.productName}><td>{x.productName}</td><td>{num(x.unitsSold)}</td><td>{money(x.revenue)}</td></tr>)}</tbody></table></div>:<p>No sales recorded yet.</p>}</section>
        <section className="dashboard-panel"><h2>Slow-moving / dead stock</h2><p>Inventory entries older than 90 days; entry age is a proxy, not a verified last-sale date.</p>{data.slowStock.length ? <div className="dashboard-table-wrap"><table><thead><tr><th>Product</th><th>Quantity</th><th>Added</th></tr></thead><tbody>{data.slowStock.slice(0,10).map(x=><tr key={x._id}><td>{x.productName}</td><td>{num(x.quantity)} {x.unit}</td><td>{new Date(x.createdAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div>:<p>No stock entries older than 90 days.</p>}</section>
      </div>
      <p className="dashboard-note"><Activity size={15}/> Profit is an estimate using current stock purchase rates matched to sales by product name. For accurate historical profit, record the cost at the time of each sale. Scrap balance currently represents total recorded scrap purchases; no scrap-sale/settlement ledger exists in the supplied app.</p>
    </>}
  </div>;
}
