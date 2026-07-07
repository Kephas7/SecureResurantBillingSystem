"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/auth.context";
import {
  reportsApi,
  type SalesReport,
  type InventoryReport,
  type StaffReport,
  type RefundReport,
} from "../../../lib/api";

type Tab = "sales" | "inventory" | "staff" | "refunds";

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
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Reports</h1>

      <div className="card" style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label htmlFor="start-date">Start date</label>
          <br />
          <input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="end-date">End date</label>
          <br />
          <input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button type="button" disabled={isLoading} onClick={() => void generateReport()}>
          {isLoading ? "Generating..." : "Generate Report"}
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--color-border)" }}>
        {(["sales", "inventory", "staff", "refunds"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none",
              color: activeTab === tab ? "var(--color-primary)" : "inherit",
              borderBottom: activeTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
              borderRadius: 0,
              padding: "0.5rem 0",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "sales" && sales && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div className="card">
              <h3>Total Revenue</h3>
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>${money(sales.totalRevenue)}</p>
            </div>
            <div className="card">
              <h3>Total Invoices</h3>
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{sales.totalInvoices}</p>
            </div>
            <div className="card">
              <h3>Avg Order Value</h3>
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>${money(sales.averageOrderValue)}</p>
            </div>
          </div>

          <h3 style={{ marginBottom: "0.5rem" }}>Revenue by day</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem" }}>Date</th>
                <th style={{ padding: "0.5rem" }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sales.revenueByDay.map((day) => (
                <tr key={day.date} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem" }}>{day.date}</td>
                  <td style={{ padding: "0.5rem" }}>${money(day.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginBottom: "0.5rem" }}>Top menu items</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem" }}>#</th>
                <th style={{ padding: "0.5rem" }}>Name</th>
                <th style={{ padding: "0.5rem" }}>Qty sold</th>
              </tr>
            </thead>
            <tbody>
              {sales.topMenuItems.map((item, index) => (
                <tr key={item.menuItemId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem" }}>{index + 1}</td>
                  <td style={{ padding: "0.5rem" }}>{item.name}</td>
                  <td style={{ padding: "0.5rem" }}>{item.quantitySold}</td>
                </tr>
              ))}
              {sales.topMenuItems.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "0.5rem", color: "var(--color-text-muted)" }}>
                    No sales in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <h3 style={{ marginBottom: "0.5rem" }}>Payment method breakdown</h3>
          <div style={{ display: "flex", gap: "1rem" }}>
            {Object.entries(sales.paymentMethodBreakdown).map(([method, count]) => (
              <div key={method} className="card" style={{ textAlign: "center", minWidth: "100px" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{count}</div>
                <div style={{ color: "var(--color-text-muted)" }}>{method}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "inventory" && inventory && (
        <div>
          {(inventory.lowStockItems.length > 0 || inventory.outOfStockItems.length > 0) && (
            <div
              className="card"
              style={{ marginBottom: "1.5rem", borderColor: "var(--color-danger)", backgroundColor: "#fef2f2" }}
            >
              <h3 style={{ color: "var(--color-danger)" }}>
                {inventory.outOfStockItems.length} out of stock, {inventory.lowStockItems.length} low on stock
              </h3>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem" }}>Name</th>
                <th style={{ padding: "0.5rem" }}>Stock</th>
                <th style={{ padding: "0.5rem" }}>Unit</th>
                <th style={{ padding: "0.5rem" }}>Threshold</th>
                <th style={{ padding: "0.5rem" }}>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {[...inventory.outOfStockItems, ...inventory.lowStockItems]
                .filter((item, index, arr) => arr.findIndex((i) => i.id === item.id) === index)
                .map((item) => {
                  const isOut = Number(item.stockQuantity) === 0;
                  const colour = isOut ? "var(--color-danger)" : "var(--color-warning)";
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.5rem", color: colour }}>{item.name}</td>
                      <td style={{ padding: "0.5rem", color: colour }}>{item.stockQuantity}</td>
                      <td style={{ padding: "0.5rem" }}>{item.unit}</td>
                      <td style={{ padding: "0.5rem" }}>{item.lowStockThreshold}</td>
                      <td style={{ padding: "0.5rem" }}>{item.supplier?.name ?? "-"}</td>
                    </tr>
                  );
                })}
              {inventory.lowStockItems.length === 0 && inventory.outOfStockItems.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "0.5rem", color: "var(--color-success)" }}>
                    All {inventory.totalIngredients} ingredients are above their low-stock threshold.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "staff" && staff && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "0.5rem" }}>Waiter</th>
              <th style={{ padding: "0.5rem" }}>Orders taken</th>
              <th style={{ padding: "0.5rem" }}>Revenue generated</th>
            </tr>
          </thead>
          <tbody>
            {staff.ordersPerWaiter.map((w) => (
              <tr key={w.waiterId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.5rem" }}>{w.waiterName}</td>
                <td style={{ padding: "0.5rem" }}>{w.orderCount}</td>
                <td style={{ padding: "0.5rem" }}>${money(w.totalRevenue)}</td>
              </tr>
            ))}
            {staff.ordersPerWaiter.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: "0.5rem", color: "var(--color-text-muted)" }}>
                  No orders in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {activeTab === "refunds" && refunds && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div className="card">
              <h3>Total Refunds</h3>
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{refunds.totalRefunds}</p>
            </div>
            <div className="card">
              <h3>Total Refunded</h3>
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>${money(refunds.totalRefundAmount)}</p>
            </div>
            <div className="card">
              <h3>Pending</h3>
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{refunds.pendingRefunds}</p>
            </div>
          </div>

          <h3 style={{ marginBottom: "0.5rem" }}>By reason</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem" }}>Reason</th>
                <th style={{ padding: "0.5rem" }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {refunds.refundsByReason.map((r) => (
                <tr key={r.reason} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem" }}>{r.reason}</td>
                  <td style={{ padding: "0.5rem" }}>{r.count}</td>
                </tr>
              ))}
              {refunds.refundsByReason.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: "0.5rem", color: "var(--color-text-muted)" }}>
                    No refunds in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
