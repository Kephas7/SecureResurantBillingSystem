"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import {
  reportsApi,
  type SalesReport,
  type InventoryReport,
  type StaffReport,
  type RefundReport,
} from "../../../lib/api";

type Tab = "sales" | "inventory" | "staff" | "refunds";

const TABS: Tab[] = ["sales", "inventory", "staff", "refunds"];

function money(value: string | number): string {
  return Number(value).toFixed(2);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [startDate, setStartDate] = useState(daysAgoIso(30));
  const [endDate, setEndDate] = useState(todayIso());
  const [activeTab, setActiveTab] = useState<Tab>("sales");

  const [sales, setSales] = useState<SalesReport | null>(null);
  const [inventory, setInventory] = useState<InventoryReport | null>(null);
  const [staff, setStaff] = useState<StaffReport | null>(null);
  const [refunds, setRefunds] = useState<RefundReport | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== "ADMIN" && user.role !== "MANAGER") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.role === "ADMIN" || user?.role === "MANAGER") {
      void generateReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function generateReport(): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const [salesData, inventoryData, staffData, refundsData] = await Promise.all([
        reportsApi.getSales(startDate, endDate),
        reportsApi.getInventory(),
        reportsApi.getStaff(startDate, endDate),
        reportsApi.getRefunds(startDate, endDate),
      ]);
      setSales(salesData);
      setInventory(inventoryData);
      setStaff(staffData);
      setRefunds(refundsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setIsLoading(false);
    }
  }

  if (authLoading || !user) {
    return <p>Loading...</p>;
  }

  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return null;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Sales, staff, and refund analytics.</p>
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{error}</span>
          </div>
        )}

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-body">
            <div className="flex gap-4" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="form-group" style={{ width: "auto" }}>
                <label className="form-label" htmlFor="start-date">
                  Start date
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group" style={{ width: "auto" }}>
                <label className="form-label" htmlFor="end-date">
                  End date
                </label>
                <input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input" />
              </div>
              <button type="button" className="btn btn-primary" disabled={isLoading} onClick={() => void generateReport()}>
                {isLoading ? "Generating..." : "Generate Report"}
              </button>
            </div>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((tab) => (
            <button key={tab} type="button" className={`tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === "sales" && sales && (
          <div>
            <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
              <div className="stat-card">
                <div className="stat-label">Total Revenue</div>
                <div className="stat-value">${money(sales.totalRevenue)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Invoices</div>
                <div className="stat-value">{sales.totalInvoices}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg Order Value</div>
                <div className="stat-value">${money(sales.averageOrderValue)}</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <div className="card-header">
                <h2 className="card-title">Revenue by day</h2>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.revenueByDay.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date}</td>
                        <td>${money(day.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <div className="card-header">
                <h2 className="card-title">Top menu items</h2>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Qty sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.topMenuItems.map((item, index) => (
                      <tr key={item.menuItemId}>
                        <td>{index + 1}</td>
                        <td>{item.name}</td>
                        <td>{item.quantitySold}</td>
                      </tr>
                    ))}
                    {sales.topMenuItems.length === 0 && (
                      <tr>
                        <td colSpan={3}>
                          <div className="empty-state">No sales in this range.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Payment method breakdown</h2>
              </div>
              <div className="card-body">
                <div className="stat-grid">
                  {Object.entries(sales.paymentMethodBreakdown).map(([method, count]) => (
                    <div key={method} className="stat-card" style={{ textAlign: "center" }}>
                      <div className="stat-value">{count}</div>
                      <div className="stat-sub">{method}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "inventory" && inventory && (
          <div className="card">
            {(inventory.lowStockItems.length > 0 || inventory.outOfStockItems.length > 0) && (
              <div style={{ padding: "1.25rem 1.25rem 0" }}>
                <div className="alert alert-danger" style={{ marginBottom: 0 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                  <span>
                    {inventory.outOfStockItems.length} out of stock, {inventory.lowStockItems.length} low on stock
                  </span>
                </div>
              </div>
            )}
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Stock</th>
                    <th>Unit</th>
                    <th>Threshold</th>
                    <th>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {[...inventory.outOfStockItems, ...inventory.lowStockItems]
                    .filter((item, index, arr) => arr.findIndex((i) => i.id === item.id) === index)
                    .map((item) => {
                      const isOut = Number(item.stockQuantity) === 0;
                      const colour = isOut ? "var(--danger)" : "var(--warning)";
                      return (
                        <tr key={item.id}>
                          <td style={{ color: colour, fontWeight: 600 }}>{item.name}</td>
                          <td style={{ color: colour, fontWeight: 600 }}>{item.stockQuantity}</td>
                          <td>{item.unit}</td>
                          <td>{item.lowStockThreshold}</td>
                          <td>{item.supplier?.name ?? "-"}</td>
                        </tr>
                      );
                    })}
                  {inventory.lowStockItems.length === 0 && inventory.outOfStockItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--success)" }}>
                        All {inventory.totalIngredients} ingredients are above their low-stock threshold.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "staff" && staff && (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Waiter</th>
                    <th>Orders taken</th>
                    <th>Revenue generated</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.ordersPerWaiter.map((w) => (
                    <tr key={w.waiterId}>
                      <td>{w.waiterName}</td>
                      <td>{w.orderCount}</td>
                      <td>${money(w.totalRevenue)}</td>
                    </tr>
                  ))}
                  {staff.ordersPerWaiter.length === 0 && (
                    <tr>
                      <td colSpan={3}>
                        <div className="empty-state">No orders in this range.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "refunds" && refunds && (
          <div>
            <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
              <div className="stat-card">
                <div className="stat-label">Total Refunds</div>
                <div className="stat-value">{refunds.totalRefunds}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Refunded</div>
                <div className="stat-value">${money(refunds.totalRefundAmount)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Pending</div>
                <div className="stat-value">{refunds.pendingRefunds}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">By reason</h2>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Reason</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.refundsByReason.map((r) => (
                      <tr key={r.reason}>
                        <td>{r.reason}</td>
                        <td>{r.count}</td>
                      </tr>
                    ))}
                    {refunds.refundsByReason.length === 0 && (
                      <tr>
                        <td colSpan={2}>
                          <div className="empty-state">No refunds in this range.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
