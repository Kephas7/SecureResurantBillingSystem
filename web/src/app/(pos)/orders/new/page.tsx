"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  UtensilsCrossed,
  Grid3x3,
  ChevronLeft,
  ShoppingCart,
  Trash2,
  Send,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../../../../context/auth.context";
import {
  ordersApi,
  tablesApi,
  menuApi,
  type RestaurantTable,
  type MenuCategory,
  type MenuItem,
  type CreateOrderItemPayload,
} from "../../../../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TAX_RATE = 0.13;

interface OrderLineItem {
  menuItemId: string;
  menuItem: MenuItem;
  quantity: number;
  notes: string;
}

function money(value: number): string {
  return value.toFixed(2);
}

export default function PosOrderPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [orderItems, setOrderItems] = useState<OrderLineItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Only WAITER, MANAGER, and ADMIN have any reason to be on this
  // screen (order creation is a waiter action; managers/admins can
  // still reach it for coverage). Everyone else is bounced back to the
  // dashboard - this is a UX convenience only, the server independently
  // enforces who can actually call POST /orders regardless of what this
  // page shows (see OrdersController's @Roles decorator).
  useEffect(() => {
    if (user && user.role !== "WAITER" && user.role !== "MANAGER" && user.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadData(): Promise<void> {
    setLoadError(null);
    try {
      const [tablesData, categoriesData, itemsData] = await Promise.all([
        tablesApi.getAvailable(),
        menuApi.getCategories(),
        menuApi.getAvailableItems(),
      ]);
      setTables(tablesData);
      setCategories(categoriesData);
      setItems(itemsData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load menu");
    }
  }

  const quantityByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of orderItems) {
      map.set(line.menuItemId, line.quantity);
    }
    return map;
  }, [orderItems]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = selectedCategoryId === "all" || item.categoryId === selectedCategoryId;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [items, selectedCategoryId, searchQuery]);

  const subtotal = orderItems.reduce((sum, line) => sum + Number(line.menuItem.price) * line.quantity, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const totalCount = orderItems.reduce((sum, line) => sum + line.quantity, 0);

  function addOrIncrementItem(item: MenuItem): void {
    setOrderItems((prev) => {
      const existing = prev.find((line) => line.menuItemId === item.id);
      if (existing) {
        return prev.map((line) => (line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...prev, { menuItemId: item.id, menuItem: item, quantity: 1, notes: "" }];
    });
  }

  function decrementItem(menuItemId: string): void {
    setOrderItems((prev) =>
      prev
        .map((line) => (line.menuItemId === menuItemId ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function removeItem(menuItemId: string): void {
    setOrderItems((prev) => prev.filter((line) => line.menuItemId !== menuItemId));
  }

  function updateNotes(menuItemId: string, notes: string): void {
    setOrderItems((prev) => prev.map((line) => (line.menuItemId === menuItemId ? { ...line, notes } : line)));
  }

  async function handlePlaceOrder(): Promise<void> {
    if (orderItems.length === 0 || !selectedTableId) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payloadItems: CreateOrderItemPayload[] = orderItems.map((line) => ({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        notes: line.notes || undefined,
      }));
      await ordersApi.create({ tableId: selectedTableId, items: payloadItems });
      router.push("/orders");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="pos-layout">
      <aside className="pos-sidebar">
        <div className="pos-sidebar-logo">
          <UtensilsCrossed size={24} />
        </div>

        <button
          type="button"
          className={`pos-cat-btn${selectedCategoryId === "all" ? " active" : ""}`}
          onClick={() => setSelectedCategoryId("all")}
        >
          <span className="pos-cat-icon">
            <Grid3x3 size={18} />
          </span>
          All
        </button>

        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`pos-cat-btn${selectedCategoryId === category.id ? " active" : ""}`}
            onClick={() => setSelectedCategoryId(category.id)}
            title={category.name}
          >
            <span className="pos-cat-icon">
              <UtensilsCrossed size={18} />
            </span>
            {category.name.length > 8 ? `${category.name.slice(0, 8)}…` : category.name}
          </button>
        ))}
      </aside>

      <div className="pos-main">
        <div className="pos-header">
          <Link href="/orders" className="btn btn-secondary btn-sm">
            <ChevronLeft size={16} />
            Orders
          </Link>
          <div className="pos-search">
            <input
              type="text"
              className="form-input"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <span className="badge badge-gray">{filteredItems.length} items</span>
        </div>

        <div className="pos-items-area">
          {loadError && (
            <div className="alert alert-danger">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
              <span>{loadError}</span>
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="pos-empty">
              <UtensilsCrossed size={32} />
              <span>No items in this category</span>
            </div>
          ) : (
            <div className="pos-item-grid">
              {filteredItems.map((item) => {
                const quantity = quantityByItemId.get(item.id) ?? 0;
                return (
                  <div
                    key={item.id}
                    className={`pos-item-card${quantity > 0 ? " in-order" : ""}`}
                    onClick={() => addOrIncrementItem(item)}
                  >
                    <div className="pos-item-img">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${API_URL}${item.imageUrl}`}
                          alt={item.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <UtensilsCrossed size={28} />
                      )}
                    </div>
                    <div className="pos-item-info">
                      <div className="pos-item-name">{item.name}</div>
                      {item.description && <div className="pos-item-desc">{item.description}</div>}
                      <div className="pos-item-price">${item.price}</div>
                    </div>
                    {quantity > 0 && <div className="pos-qty-badge">{quantity}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="pos-summary">
        <div className="pos-summary-header">
          <h2 className="pos-summary-title">Order</h2>
          <span className="pos-summary-count">{totalCount}</span>
        </div>

        <div className="pos-summary-items">
          {orderItems.length === 0 ? (
            <div className="pos-empty">
              <ShoppingCart size={32} />
              <span>Select items</span>
            </div>
          ) : (
            orderItems.map((line) => (
              <div key={line.menuItemId} className="pos-order-item">
                <div className="pos-order-thumb">
                  {line.menuItem.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${API_URL}${line.menuItem.imageUrl}`} alt={line.menuItem.name} />
                  ) : (
                    <UtensilsCrossed size={18} />
                  )}
                </div>
                <div className="pos-order-info">
                  <div className="pos-order-name">{line.menuItem.name}</div>
                  <div className="pos-qty-controls">
                    <button type="button" className="pos-qty-btn" onClick={() => decrementItem(line.menuItemId)}>
                      −
                    </button>
                    <span className="pos-qty-num">{line.quantity}</span>
                    <button type="button" className="pos-qty-btn" onClick={() => addOrIncrementItem(line.menuItem)}>
                      +
                    </button>
                  </div>
                  <div className="pos-order-line-price">${money(Number(line.menuItem.price) * line.quantity)}</div>
                  <textarea
                    className="pos-notes-input"
                    placeholder="Notes..."
                    rows={1}
                    value={line.notes}
                    onChange={(e) => updateNotes(line.menuItemId, e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="pos-remove-btn"
                  onClick={() => removeItem(line.menuItemId)}
                  aria-label={`Remove ${line.menuItem.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pos-summary-footer">
          <div className="pos-table-selector">
            <label className="form-label" htmlFor="pos-table">
              Table
            </label>
            <select
              id="pos-table"
              className="form-select"
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
            >
              <option value="">Select a table</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.number} ({t.capacity} seats)
                </option>
              ))}
            </select>
          </div>

          <div className="pos-totals">
            <div className="pos-total-row">
              <span>Subtotal</span>
              <span>${money(subtotal)}</span>
            </div>
            <div className="pos-total-row">
              <span>Tax (13%)</span>
              <span>${money(tax)}</span>
            </div>
            <div className="pos-total-row grand">
              <span>Total</span>
              <span>${money(total)}</span>
            </div>
          </div>

          {submitError && (
            <div className="alert alert-danger">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="button"
            className="pos-place-btn"
            disabled={orderItems.length === 0 || !selectedTableId || isSubmitting}
            onClick={() => void handlePlaceOrder()}
          >
            <Send size={16} />
            {isSubmitting ? "Placing Order..." : "Place Order"}
          </button>
        </div>
      </aside>
    </div>
  );
}
