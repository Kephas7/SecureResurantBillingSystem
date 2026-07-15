"use client";

import { useEffect, useState } from "react";
import { Plus, AlertCircle, UtensilsCrossed } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import { menuApi, type MenuCategory, type MenuItem } from "../../../lib/api";
import { ImageUpload } from "../../../components/menu/ImageUpload";
import Modal from "../../../components/ui/Modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface CategoryFormState {
  name: string;
}

interface ItemFormState {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  isAvailable: boolean;
  imageUrl: string | null;
}

const EMPTY_ITEM_FORM: ItemFormState = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  isAvailable: true,
  imageUrl: null,
};

export default function MenuPage(): JSX.Element {
  const { user, isLoading: authLoading } = useAuth();

  const [categories, setCategories] = useState<MenuCategory[] | null>(null);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({ name: "" });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const [showItemPanel, setShowItemPanel] = useState(false);
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
    setShowCategoryPanel(false);
    setEditingCategoryId(null);
    setActionError(null);
  }

  function openCreateCategoryPanel(): void {
    setCategoryForm({ name: "" });
    setEditingCategoryId(null);
    setActionError(null);
    setShowCategoryPanel(true);
  }

  function resetItemForm(): void {
    setItemForm(EMPTY_ITEM_FORM);
    setShowItemPanel(false);
    setEditingItemId(null);
    setActionError(null);
  }

  function openCreateItemPanel(): void {
    setItemForm(EMPTY_ITEM_FORM);
    setEditingItemId(null);
    setActionError(null);
    setShowItemPanel(true);
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
        isAvailable: itemForm.isAvailable,
        imageUrl: itemForm.imageUrl ?? undefined,
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
      isAvailable: item.isAvailable,
      imageUrl: item.imageUrl ?? null,
    });
    setActionError(null);
    setShowItemPanel(true);
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
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Menu</h1>
          <p className="page-subtitle">Categories, items, and availability.</p>
        </div>
      </div>

      <div className="page-content">
        {loadError && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{loadError}</span>
          </div>
        )}
        {actionError && !showCategoryPanel && !showItemPanel && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{actionError}</span>
          </div>
        )}

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-header">
            <h2 className="card-title">Categories</h2>
            {canManage && (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreateCategoryPanel}>
                <Plus size={14} />
                Add Category
              </button>
            )}
          </div>
          <div className="card-body">
            {!categories && <p>Loading categories...</p>}
            {categories && categories.length === 0 && <p className="text-muted">No categories yet.</p>}
            {categories && categories.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {categories.map((category) => {
                  const itemCount = category._count?.items ?? items?.filter((item) => item.categoryId === category.id).length ?? 0;
                  return (
                    <div
                      key={category.id}
                      className="flex items-center justify-between"
                      style={{ padding: "0.625rem 0", borderBottom: "1px solid var(--border)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{category.name}</span>
                        <span className="badge badge-gray">{itemCount}</span>
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setCategoryForm({ name: category.name });
                              setActionError(null);
                              setShowCategoryPanel(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyId === category.id}
                            onClick={() => void handleDeleteCategory(category.id)}
                          >
                            {busyId === category.id ? "..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Menu Items</h2>
            {canManage && (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreateItemPanel}>
                <Plus size={14} />
                Add Item
              </button>
            )}
          </div>
          <div className="card-body">
            {!items && <p>Loading items...</p>}
            {items && items.length === 0 && <p className="text-muted">No menu items yet.</p>}
            {items && items.length > 0 && (
              <div className="menu-item-grid">
                {items.map((item) => (
                  <div key={item.id} className="menu-item-card">
                    <div className="menu-item-card-img">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${API_URL}${item.imageUrl}`}
                          alt={item.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <UtensilsCrossed size={32} style={{ color: "var(--text-muted)" }} />
                      )}
                    </div>
                    <div className="menu-item-card-body">
                      <div className="menu-item-card-name">{item.name}</div>
                      <div>
                        <span className="badge badge-blue">{item.category?.name ?? "-"}</span>
                      </div>
                      {item.description && (
                        <p
                          className="text-muted"
                          style={{
                            fontSize: "0.75rem",
                            margin: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {item.description}
                        </p>
                      )}
                      <div className="menu-item-card-price">${item.price}</div>
                      <div className="menu-item-card-footer">
                        {canManage ? (
                          <button
                            type="button"
                            className={`toggle${item.isAvailable ? " toggle-on" : ""}`}
                            disabled={busyId === item.id}
                            onClick={() => void handleToggleItem(item.id)}
                            aria-label={item.isAvailable ? "Mark unavailable" : "Mark available"}
                          />
                        ) : (
                          <span className={`badge ${item.isAvailable ? "badge-green" : "badge-gray"}`}>
                            {item.isAvailable ? "Available" : "Unavailable"}
                          </span>
                        )}
                        {canManage && (
                          <div className="flex gap-2">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEditItem(item)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={busyId === item.id}
                              onClick={() => void handleDeleteItem(item.id)}
                            >
                              {busyId === item.id ? "..." : "Delete"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {canManage && (
        <Modal
          isOpen={showCategoryPanel}
          onClose={resetCategoryForm}
          title={editingCategoryId ? "Edit Category" : "Add Category"}
          size="sm"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={resetCategoryForm}>
                Cancel
              </button>
              <button type="submit" form="category-form" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving..." : editingCategoryId ? "Save" : "Create"}
              </button>
            </>
          }
        >
          {actionError && (
            <div className="alert alert-danger" style={{ marginBottom: 0 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
              <span>{actionError}</span>
            </div>
          )}
          <form id="category-form" onSubmit={handleCategorySubmit} style={{ display: "contents" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="category-name">
                Name
              </label>
              <input
                id="category-name"
                required
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ name: e.target.value })}
                className="form-input"
              />
            </div>
          </form>
        </Modal>
      )}

      {canManage && (
        <Modal
          isOpen={showItemPanel}
          onClose={resetItemForm}
          title={editingItemId ? "Edit Item" : "Add Item"}
          size="lg"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={resetItemForm}>
                Cancel
              </button>
              <button type="submit" form="item-form" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving..." : editingItemId ? "Save" : "Create"}
              </button>
            </>
          }
        >
          {actionError && (
            <div className="alert alert-danger" style={{ marginBottom: 0 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
              <span>{actionError}</span>
            </div>
          )}
          <form id="item-form" onSubmit={handleItemSubmit} style={{ display: "contents" }}>
            <div className="form-group">
              <label className="form-label">Image</label>
              <ImageUpload
                currentImageUrl={itemForm.imageUrl}
                onUpload={(url) => setItemForm((prev) => ({ ...prev, imageUrl: url }))}
                onDelete={() => setItemForm((prev) => ({ ...prev, imageUrl: null }))}
                disabled={isSaving}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="item-name">
                Name
              </label>
              <input
                id="item-name"
                required
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="item-description">
                Description
              </label>
              <input
                id="item-description"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="item-price">
                Price
              </label>
              <input
                id="item-price"
                type="number"
                min={0}
                step="0.01"
                required
                value={itemForm.price}
                onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="item-category">
                Category
              </label>
              <select
                id="item-category"
                required
                value={itemForm.categoryId}
                onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                className="form-select"
              >
                <option value="">Select a category</option>
                {categories?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Available</label>
              <button
                type="button"
                className={`toggle${itemForm.isAvailable ? " toggle-on" : ""}`}
                onClick={() => setItemForm({ ...itemForm, isAvailable: !itemForm.isAvailable })}
                aria-label="Toggle availability"
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
