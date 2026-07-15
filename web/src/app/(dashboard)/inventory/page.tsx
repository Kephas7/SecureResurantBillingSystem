"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "../../../context/auth.context";
import {
  inventoryApi,
  type Ingredient,
  type Supplier,
  type CreateIngredientPayload,
  type CreateSupplierPayload,
} from "../../../lib/api";
import Modal from "../../../components/ui/Modal";

const EMPTY_INGREDIENT_FORM: CreateIngredientPayload = {
  name: "",
  unit: "",
  stockQuantity: 0,
  lowStockThreshold: 0,
  supplierId: undefined,
};

const EMPTY_SUPPLIER_FORM: CreateSupplierPayload = { name: "", contactInfo: "" };

function stockColour(ingredient: Ingredient): string | undefined {
  const stock = Number(ingredient.stockQuantity);
  const threshold = Number(ingredient.lowStockThreshold);
  if (stock < 0) return "var(--danger)";
  if (stock <= threshold) return "var(--warning)";
  return undefined;
}

export default function InventoryPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [lowStock, setLowStock] = useState<Ingredient[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showIngredientPanel, setShowIngredientPanel] = useState(false);
  const [ingredientForm, setIngredientForm] = useState<CreateIngredientPayload>(EMPTY_INGREDIENT_FORM);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);

  const [adjustingIngredient, setAdjustingIngredient] = useState<Ingredient | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const [showSupplierPanel, setShowSupplierPanel] = useState(false);
  const [supplierForm, setSupplierForm] = useState<CreateSupplierPayload>(EMPTY_SUPPLIER_FORM);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== "ADMIN" && user.role !== "MANAGER") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.role === "ADMIN" || user?.role === "MANAGER") {
      void loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadAll(): Promise<void> {
    setLoadError(null);
    try {
      const [ingredientsData, lowStockData, suppliersData] = await Promise.all([
        inventoryApi.getIngredients(),
        inventoryApi.getLowStock(),
        inventoryApi.getSuppliers(),
      ]);
      setIngredients(ingredientsData);
      setLowStock(lowStockData);
      setSuppliers(suppliersData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load inventory");
    }
  }

  function resetIngredientForm(): void {
    setIngredientForm(EMPTY_INGREDIENT_FORM);
    setShowIngredientPanel(false);
    setEditingIngredientId(null);
    setActionError(null);
  }

  function openCreateIngredientPanel(): void {
    setIngredientForm(EMPTY_INGREDIENT_FORM);
    setEditingIngredientId(null);
    setActionError(null);
    setShowIngredientPanel(true);
  }

  function startEditIngredient(ingredient: Ingredient): void {
    setEditingIngredientId(ingredient.id);
    setIngredientForm({
      name: ingredient.name,
      unit: ingredient.unit,
      stockQuantity: Number(ingredient.stockQuantity),
      lowStockThreshold: Number(ingredient.lowStockThreshold),
      supplierId: ingredient.supplierId ?? undefined,
    });
    setActionError(null);
    setShowIngredientPanel(true);
  }

  async function handleIngredientSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setActionError(null);
    try {
      if (editingIngredientId) {
        await inventoryApi.updateIngredient(editingIngredientId, ingredientForm);
      } else {
        await inventoryApi.createIngredient(ingredientForm);
      }
      resetIngredientForm();
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save ingredient");
    } finally {
      setIsSaving(false);
    }
  }

  function openAdjustPanel(ingredient: Ingredient): void {
    setAdjustingIngredient(ingredient);
    setAdjustment("");
    setAdjustReason("");
    setActionError(null);
  }

  async function handleAdjustSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!adjustingIngredient) return;
    setIsSaving(true);
    setActionError(null);
    try {
      await inventoryApi.adjustStock(adjustingIngredient.id, { adjustment: Number(adjustment), reason: adjustReason });
      setAdjustingIngredient(null);
      setAdjustment("");
      setAdjustReason("");
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setIsSaving(false);
    }
  }

  function resetSupplierForm(): void {
    setSupplierForm(EMPTY_SUPPLIER_FORM);
    setShowSupplierPanel(false);
    setEditingSupplierId(null);
    setActionError(null);
  }

  function openCreateSupplierPanel(): void {
    setSupplierForm(EMPTY_SUPPLIER_FORM);
    setEditingSupplierId(null);
    setActionError(null);
    setShowSupplierPanel(true);
  }

  async function handleSupplierSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setActionError(null);
    try {
      if (editingSupplierId) {
        await inventoryApi.updateSupplier(editingSupplierId, supplierForm);
      } else {
        await inventoryApi.createSupplier(supplierForm);
      }
      resetSupplierForm();
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save supplier");
    } finally {
      setIsSaving(false);
    }
  }

  if (authLoading || !user) {
    return <p>Loading...</p>;
  }

  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return null;
  }

  const anyPanelOpen = showIngredientPanel || Boolean(adjustingIngredient) || showSupplierPanel;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Stock levels and suppliers.</p>
        </div>
      </div>

      <div className="page-content">
        {actionError && !anyPanelOpen && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{actionError}</span>
          </div>
        )}
        {loadError && (
          <div className="alert alert-danger">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <span>{loadError}</span>
          </div>
        )}

        {lowStock && lowStock.length > 0 && (
          <div className="alert alert-danger">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
            <div>
              <strong>Low Stock Alerts</strong>
              <ul style={{ marginTop: "0.375rem", paddingLeft: "1.25rem" }}>
                {lowStock.map((ingredient) => (
                  <li key={ingredient.id}>
                    {ingredient.name}: {ingredient.stockQuantity} {ingredient.unit} (threshold {ingredient.lowStockThreshold}
                    {ingredient.unit}){ingredient.supplier ? ` - ${ingredient.supplier.name}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-header">
            <h2 className="card-title">Ingredients</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateIngredientPanel}>
              <Plus size={14} />
              Add Ingredient
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!ingredients && <p style={{ padding: "1.25rem" }}>Loading ingredients...</p>}
            {ingredients && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Stock</th>
                      <th>Unit</th>
                      <th>Threshold</th>
                      <th>Supplier</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ingredient) => (
                      <tr key={ingredient.id}>
                        <td>{ingredient.name}</td>
                        <td style={{ color: stockColour(ingredient), fontWeight: stockColour(ingredient) ? 600 : undefined }}>
                          {ingredient.stockQuantity}
                        </td>
                        <td>{ingredient.unit}</td>
                        <td>{ingredient.lowStockThreshold}</td>
                        <td>{ingredient.supplier?.name ?? "-"}</td>
                        <td>
                          <div className="flex gap-2">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEditIngredient(ingredient)}>
                              Edit
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAdjustPanel(ingredient)}>
                              Adjust Stock
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Suppliers</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateSupplierPanel}>
              <Plus size={14} />
              Add Supplier
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!suppliers && <p style={{ padding: "1.25rem" }}>Loading suppliers...</p>}
            {suppliers && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact info</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id}>
                        <td>{supplier.name}</td>
                        <td>{supplier.contactInfo ?? "-"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditingSupplierId(supplier.id);
                              setSupplierForm({ name: supplier.name, contactInfo: supplier.contactInfo ?? "" });
                              setActionError(null);
                              setShowSupplierPanel(true);
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={showIngredientPanel}
        onClose={resetIngredientForm}
        title={editingIngredientId ? "Edit Ingredient" : "Add Ingredient"}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={resetIngredientForm}>
              Cancel
            </button>
            <button type="submit" form="ingredient-form" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? "Saving..." : editingIngredientId ? "Save" : "Create"}
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
        <form id="ingredient-form" onSubmit={handleIngredientSubmit} style={{ display: "contents" }}>
          <div className="form-group">
            <label className="form-label" htmlFor="ing-name">
              Name
            </label>
            <input
              id="ing-name"
              required
              value={ingredientForm.name}
              onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ing-unit">
              Unit
            </label>
            <input
              id="ing-unit"
              required
              placeholder="kg, litre, unit..."
              value={ingredientForm.unit}
              onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ing-stock">
              Stock quantity
            </label>
            <input
              id="ing-stock"
              type="number"
              min={0}
              step="0.01"
              required
              value={ingredientForm.stockQuantity}
              onChange={(e) => setIngredientForm({ ...ingredientForm, stockQuantity: Number(e.target.value) })}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ing-threshold">
              Low stock threshold
            </label>
            <input
              id="ing-threshold"
              type="number"
              min={0}
              step="0.01"
              required
              value={ingredientForm.lowStockThreshold}
              onChange={(e) => setIngredientForm({ ...ingredientForm, lowStockThreshold: Number(e.target.value) })}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ing-supplier">
              Supplier
            </label>
            <select
              id="ing-supplier"
              value={ingredientForm.supplierId ?? ""}
              onChange={(e) => setIngredientForm({ ...ingredientForm, supplierId: e.target.value || undefined })}
              className="form-select"
            >
              <option value="">No supplier</option>
              {suppliers?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(adjustingIngredient)}
        onClose={() => setAdjustingIngredient(null)}
        title={adjustingIngredient ? `Adjust Stock - ${adjustingIngredient.name}` : "Adjust Stock"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAdjustingIngredient(null)}>
              Cancel
            </button>
            <button type="submit" form="adjust-stock-form" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? "Saving..." : "Apply"}
            </button>
          </>
        }
      >
        {adjustingIngredient && (
          <>
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: 0 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
                <span>{actionError}</span>
              </div>
            )}
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Current stock: {adjustingIngredient.stockQuantity} {adjustingIngredient.unit}
            </p>
            <form id="adjust-stock-form" onSubmit={handleAdjustSubmit} style={{ display: "contents" }}>
              <div className="form-group">
                <label className="form-label" htmlFor="adjustment">
                  Adjustment (+/-)
                </label>
                <input
                  id="adjustment"
                  type="number"
                  step="0.01"
                  required
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="adjust-reason">
                  Reason
                </label>
                <input
                  id="adjust-reason"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="form-input"
                />
              </div>
            </form>
          </>
        )}
      </Modal>

      <Modal
        isOpen={showSupplierPanel}
        onClose={resetSupplierForm}
        title={editingSupplierId ? "Edit Supplier" : "Add Supplier"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={resetSupplierForm}>
              Cancel
            </button>
            <button type="submit" form="supplier-form" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? "Saving..." : editingSupplierId ? "Save" : "Create"}
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
        <form id="supplier-form" onSubmit={handleSupplierSubmit} style={{ display: "contents" }}>
          <div className="form-group">
            <label className="form-label" htmlFor="sup-name">
              Name
            </label>
            <input
              id="sup-name"
              required
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sup-contact">
              Contact info
            </label>
            <input
              id="sup-contact"
              value={supplierForm.contactInfo}
              onChange={(e) => setSupplierForm({ ...supplierForm, contactInfo: e.target.value })}
              className="form-input"
            />
          </div>
        </form>
      </Modal>
    </>
  );
}
