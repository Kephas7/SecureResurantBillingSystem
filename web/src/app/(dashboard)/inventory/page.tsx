"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/auth.context";
import {
  inventoryApi,
  type Ingredient,
  type Supplier,
  type CreateIngredientPayload,
  type CreateSupplierPayload,
} from "../../../lib/api";

const EMPTY_INGREDIENT_FORM: CreateIngredientPayload = {
  name: "",
  unit: "",
  stockQuantity: 0,
  lowStockThreshold: 0,
  supplierId: undefined,
};

const EMPTY_SUPPLIER_FORM: CreateSupplierPayload = { name: "", contactInfo: "" };

export default function InventoryPage(): JSX.Element | null {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [lowStock, setLowStock] = useState<Ingredient[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [ingredientForm, setIngredientForm] = useState<CreateIngredientPayload>(EMPTY_INGREDIENT_FORM);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);

  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const [showSupplierForm, setShowSupplierForm] = useState(false);
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
    setShowIngredientForm(false);
    setEditingIngredientId(null);
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
    setShowIngredientForm(true);
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

  async function handleAdjustSubmit(e: React.FormEvent, id: string): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setActionError(null);
    try {
      await inventoryApi.adjustStock(id, { adjustment: Number(adjustment), reason: adjustReason });
      setAdjustingId(null);
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
    setShowSupplierForm(false);
    setEditingSupplierId(null);
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

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Inventory</h1>

      {actionError && <p className="error-msg">{actionError}</p>}
      {loadError && <p className="error-msg">{loadError}</p>}

      {lowStock && lowStock.length > 0 && (
        <div
          className="card"
          style={{ marginBottom: "1.5rem", borderColor: "var(--color-danger)", backgroundColor: "#fef2f2" }}
        >
          <h2 style={{ color: "var(--color-danger)", marginBottom: "0.5rem" }}>Low Stock Alerts</h2>
          <ul style={{ paddingLeft: "1.25rem" }}>
            {lowStock.map((ingredient) => (
              <li key={ingredient.id}>
                {ingredient.name}: {ingredient.stockQuantity} {ingredient.unit} (threshold {ingredient.lowStockThreshold}
                {ingredient.unit}){ingredient.supplier ? ` - ${ingredient.supplier.name}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Ingredients</h2>
          <button type="button" onClick={() => (showIngredientForm ? resetIngredientForm() : setShowIngredientForm(true))}>
            {showIngredientForm ? "Cancel" : "Add Ingredient"}
          </button>
        </div>

        {showIngredientForm && (
          <form
            onSubmit={handleIngredientSubmit}
            className="card"
            style={{ marginBottom: "1rem", display: "grid", gap: "0.75rem", maxWidth: "24rem" }}
          >
            <div>
              <label htmlFor="ing-name">Name</label>
              <input
                id="ing-name"
                required
                value={ingredientForm.name}
                onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="ing-unit">Unit</label>
              <input
                id="ing-unit"
                required
                placeholder="kg, litre, unit..."
                value={ingredientForm.unit}
                onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="ing-stock">Stock quantity</label>
              <input
                id="ing-stock"
                type="number"
                min={0}
                step="0.01"
                required
                value={ingredientForm.stockQuantity}
                onChange={(e) => setIngredientForm({ ...ingredientForm, stockQuantity: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="ing-threshold">Low stock threshold</label>
              <input
                id="ing-threshold"
                type="number"
                min={0}
                step="0.01"
                required
                value={ingredientForm.lowStockThreshold}
                onChange={(e) => setIngredientForm({ ...ingredientForm, lowStockThreshold: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="ing-supplier">Supplier</label>
              <select
                id="ing-supplier"
                value={ingredientForm.supplierId ?? ""}
                onChange={(e) => setIngredientForm({ ...ingredientForm, supplierId: e.target.value || undefined })}
                style={{ width: "100%" }}
              >
                <option value="">No supplier</option>
                {suppliers?.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : editingIngredientId ? "Save" : "Create"}
            </button>
          </form>
        )}

        {!ingredients && <p>Loading ingredients...</p>}
        {ingredients && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.5rem" }}>Name</th>
                  <th style={{ padding: "0.5rem" }}>Stock</th>
                  <th style={{ padding: "0.5rem" }}>Unit</th>
                  <th style={{ padding: "0.5rem" }}>Threshold</th>
                  <th style={{ padding: "0.5rem" }}>Supplier</th>
                  <th style={{ padding: "0.5rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ingredient) => (
                  <Fragment key={ingredient.id}>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.5rem" }}>{ingredient.name}</td>
                      <td style={{ padding: "0.5rem" }}>{ingredient.stockQuantity}</td>
                      <td style={{ padding: "0.5rem" }}>{ingredient.unit}</td>
                      <td style={{ padding: "0.5rem" }}>{ingredient.lowStockThreshold}</td>
                      <td style={{ padding: "0.5rem" }}>{ingredient.supplier?.name ?? "-"}</td>
                      <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
                        <button type="button" onClick={() => startEditIngredient(ingredient)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAdjustingId(adjustingId === ingredient.id ? null : ingredient.id)
                          }
                        >
                          Adjust Stock
                        </button>
                      </td>
                    </tr>
                    {adjustingId === ingredient.id && (
                      <tr>
                        <td colSpan={6} style={{ padding: "0.75rem", backgroundColor: "var(--color-bg)" }}>
                          <form
                            onSubmit={(e) => void handleAdjustSubmit(e, ingredient.id)}
                            style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}
                          >
                            <div>
                              <label htmlFor={`adj-${ingredient.id}`}>Adjustment (+/-)</label>
                              <input
                                id={`adj-${ingredient.id}`}
                                type="number"
                                step="0.01"
                                required
                                value={adjustment}
                                onChange={(e) => setAdjustment(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor={`reason-${ingredient.id}`}>Reason</label>
                              <input
                                id={`reason-${ingredient.id}`}
                                required
                                value={adjustReason}
                                onChange={(e) => setAdjustReason(e.target.value)}
                              />
                            </div>
                            <button type="submit" disabled={isSaving}>
                              {isSaving ? "Saving..." : "Apply"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Suppliers</h2>
          <button type="button" onClick={() => (showSupplierForm ? resetSupplierForm() : setShowSupplierForm(true))}>
            {showSupplierForm ? "Cancel" : "Add Supplier"}
          </button>
        </div>

        {showSupplierForm && (
          <form
            onSubmit={handleSupplierSubmit}
            className="card"
            style={{ marginBottom: "1rem", display: "grid", gap: "0.75rem", maxWidth: "24rem" }}
          >
            <div>
              <label htmlFor="sup-name">Name</label>
              <input
                id="sup-name"
                required
                value={supplierForm.name}
                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="sup-contact">Contact info</label>
              <input
                id="sup-contact"
                value={supplierForm.contactInfo}
                onChange={(e) => setSupplierForm({ ...supplierForm, contactInfo: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : editingSupplierId ? "Save" : "Create"}
            </button>
          </form>
        )}

        {!suppliers && <p>Loading suppliers...</p>}
        {suppliers && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem" }}>Name</th>
                <th style={{ padding: "0.5rem" }}>Contact info</th>
                <th style={{ padding: "0.5rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem" }}>{supplier.name}</td>
                  <td style={{ padding: "0.5rem" }}>{supplier.contactInfo ?? "-"}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSupplierId(supplier.id);
                        setSupplierForm({ name: supplier.name, contactInfo: supplier.contactInfo ?? "" });
                        setShowSupplierForm(true);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
