"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../context/auth.context";
import { menuApi, type MenuCategory, type MenuItem } from "../../../lib/api";

interface CategoryFormState {
  name: string;
}

interface ItemFormState {
  name: string;
  description: string;
  price: string;
  categoryId: string;
}

const EMPTY_ITEM_FORM: ItemFormState = { name: "", description: "", price: "", categoryId: "" };

export default function MenuPage(): JSX.Element {
  const { user, isLoading: authLoading } = useAuth();

  const [categories, setCategories] = useState<MenuCategory[] | null>(null);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({ name: "" });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Kitchen staff only need to see what's currently available to cook;
  // every other staff role sees the full menu including unavailable items.
  const isKitchen = user?.role === "KITCHEN";
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";

  useEffect(() => {
    if (user) {
      void loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadData(): Promise<void> {
    setLoadError(null);
    try {
      const [categoriesData, itemsData] = await Promise.all([
        menuApi.getCategories(),
        isKitchen ? menuApi.getAvailableItems() : menuApi.getItems(),
      ]);
      setCategories(categoriesData);
      setItems(itemsData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load menu");
    }
  }

  function resetCategoryForm(): void {
    setCategoryForm({ name: "" });
    setShowCategoryForm(false);
    setEditingCategoryId(null);
  }

  function resetItemForm(): void {
    setItemForm(EMPTY_ITEM_FORM);
    setShowItemForm(false);
    setEditingItemId(null);
  }

  async function handleCategorySubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setActionError(null);
    try {
      if (editingCategoryId) {
        await menuApi.updateCategory(editingCategoryId, categoryForm);
      } else {
        await menuApi.createCategory(categoryForm);
      }
      resetCategoryForm();
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save category");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCategory(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await menuApi.deleteCategory(id);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setBusyId(null);
    }
  }

  async function handleItemSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setActionError(null);
    try {
      const payload = {
        name: itemForm.name,
        description: itemForm.description || undefined,
        price: Number(itemForm.price),
        categoryId: itemForm.categoryId,
      };
      if (editingItemId) {
        await menuApi.updateItem(editingItemId, payload);
      } else {
        await menuApi.createItem(payload);
      }
      resetItemForm();
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save menu item");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditItem(item: MenuItem): void {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      description: item.description ?? "",
      price: item.price,
      categoryId: item.categoryId,
    });
    setShowItemForm(true);
  }

  async function handleToggleItem(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await menuApi.toggleItem(id);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to toggle availability");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteItem(id: string): Promise<void> {
    setBusyId(id);
    setActionError(null);
    try {
      await menuApi.deleteItem(id);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete menu item");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !user) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Menu</h1>

      {loadError && <p className="error-msg">{loadError}</p>}
      {actionError && <p className="error-msg">{actionError}</p>}

      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Categories</h2>
          {canManage && (
            <button type="button" onClick={() => (showCategoryForm ? resetCategoryForm() : setShowCategoryForm(true))}>
              {showCategoryForm ? "Cancel" : "Add Category"}
            </button>
          )}
        </div>

        {showCategoryForm && canManage && (
          <form onSubmit={handleCategorySubmit} className="card" style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", alignItems: "flex-end", maxWidth: "24rem" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="category-name">Name</label>
              <input
                id="category-name"
                required
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ name: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : editingCategoryId ? "Save" : "Create"}
            </button>
          </form>
        )}

        {!categories && <p>Loading categories...</p>}
        {categories && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {categories.map((category) => {
              const isExpanded = expandedCategoryId === category.id;
              const categoryItems = items?.filter((item) => item.categoryId === category.id) ?? [];

              return (
                <div key={category.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedCategoryId(isExpanded ? null : category.id)}
                      style={{ background: "none", color: "inherit", fontWeight: 600, padding: 0 }}
                    >
                      {isExpanded ? "▾" : "▸"} {category.name} ({category._count?.items ?? categoryItems.length})
                    </button>
                    {canManage && (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(category.id);
                            setCategoryForm({ name: category.name });
                            setShowCategoryForm(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === category.id}
                          onClick={() => void handleDeleteCategory(category.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <ul style={{ marginTop: "0.75rem", paddingLeft: "1.25rem" }}>
                      {categoryItems.length === 0 && <li style={{ color: "var(--color-text-muted)" }}>No items</li>}
                      {categoryItems.map((item) => (
                        <li key={item.id}>
                          {item.name} - ${item.price} {!item.isAvailable && "(unavailable)"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Menu Items</h2>
          {canManage && (
            <button type="button" onClick={() => (showItemForm ? resetItemForm() : setShowItemForm(true))}>
              {showItemForm ? "Cancel" : "Add Item"}
            </button>
          )}
        </div>

        {showItemForm && canManage && (
          <form onSubmit={handleItemSubmit} className="card" style={{ marginBottom: "1rem", display: "grid", gap: "0.75rem", maxWidth: "24rem" }}>
            <div>
              <label htmlFor="item-name">Name</label>
              <input
                id="item-name"
                required
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="item-description">Description</label>
              <input
                id="item-description"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="item-price">Price</label>
              <input
                id="item-price"
                type="number"
                min={0}
                step="0.01"
                required
                value={itemForm.price}
                onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="item-category">Category</label>
              <select
                id="item-category"
                required
                value={itemForm.categoryId}
                onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                style={{ width: "100%" }}
              >
                <option value="">Select a category</option>
                {categories?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : editingItemId ? "Save" : "Create"}
            </button>
          </form>
        )}

        {!items && <p>Loading items...</p>}
        {items && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.5rem" }}>Name</th>
                  <th style={{ padding: "0.5rem" }}>Category</th>
                  <th style={{ padding: "0.5rem" }}>Price</th>
                  <th style={{ padding: "0.5rem" }}>Available</th>
                  {canManage && <th style={{ padding: "0.5rem" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem" }}>{item.name}</td>
                    <td style={{ padding: "0.5rem" }}>{item.category?.name ?? "-"}</td>
                    <td style={{ padding: "0.5rem" }}>${item.price}</td>
                    <td style={{ padding: "0.5rem" }}>
                      {canManage ? (
                        <input
                          type="checkbox"
                          checked={item.isAvailable}
                          disabled={busyId === item.id}
                          onChange={() => void handleToggleItem(item.id)}
                        />
                      ) : item.isAvailable ? (
                        "Yes"
                      ) : (
                        "No"
                      )}
                    </td>
                    {canManage && (
                      <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
                        <button type="button" onClick={() => startEditItem(item)}>
                          Edit
                        </button>
                        <button type="button" disabled={busyId === item.id} onClick={() => void handleDeleteItem(item.id)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
