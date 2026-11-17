import fs from "node:fs";
import path from "node:path";
import {
  SEED_INVENTORY_AUDIT_LOGS,
  SEED_INVENTORY_PRODUCTS,
  SEED_STOCK_TRANSACTIONS,
} from "@/lib/inventory-seed";
import {
  getBatchExpiryStatus,
  getProductExpiryStatus,
  getProductStockStatus,
  type AuditFieldChange,
  type AuditOperationType,
  type InventoryAuditEntry,
  type InventoryCategory,
  type InventoryProduct,
  type PharmacyBatch,
  type PharmacyExpiryFilter,
  type RequestUserContext,
  type StockStatusFilter,
  type StockTransaction,
  type StockTransactionType,
} from "@/lib/inventory-types";
import type { InventoryRBACPermissions } from "@/lib/auth-storage";

type InventoryDatabaseState = {
  products: InventoryProduct[];
  transactions: StockTransaction[];
  auditLogs: InventoryAuditEntry[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE_PATH = path.join(DATA_DIR, "inventory-db-v1.json");

let memoryDb: InventoryDatabaseState | null = null;

// Row-level mutex locks & global transaction lock to prevent race conditions (Section 6)
const rowLocks = new Map<string, Promise<void>>();
let dbWriteLock: Promise<void> = Promise.resolve();

async function acquireLock<T>(
  lockMap: Map<string, Promise<void>>,
  key: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous = lockMap.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  lockMap.set(
    key,
    previous.then(() => current),
  );
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (lockMap.get(key) === current) {
      lockMap.delete(key);
    }
  }
}

export async function withRowLock<T>(
  productId: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  return acquireLock(rowLocks, productId, fn);
}

export async function withDatabaseTransaction<T>(
  fn: (db: InventoryDatabaseState) => Promise<T> | T,
): Promise<T> {
  const prev = dbWriteLock;
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  dbWriteLock = prev.then(() => current);
  await prev;

  const db = loadDatabase();
  const snapshot: InventoryDatabaseState = JSON.parse(JSON.stringify(db));
  try {
    const result = await fn(db);
    persistDatabase(db);
    return result;
  } catch (error) {
    // Rollback to snapshot on error
    memoryDb = snapshot;
    persistDatabase(snapshot);
    throw error;
  } finally {
    release();
  }
}

export function loadDatabase(): InventoryDatabaseState {
  if (memoryDb) return memoryDb;
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as InventoryDatabaseState;
      if (
        parsed &&
        Array.isArray(parsed.products) &&
        Array.isArray(parsed.transactions) &&
        Array.isArray(parsed.auditLogs)
      ) {
        memoryDb = parsed;
        return memoryDb;
      }
    }
  } catch {
    // Fallback to seed state if file is missing or unreadable
  }

  memoryDb = {
    products: JSON.parse(JSON.stringify(SEED_INVENTORY_PRODUCTS)),
    transactions: JSON.parse(JSON.stringify(SEED_STOCK_TRANSACTIONS)),
    auditLogs: JSON.parse(JSON.stringify(SEED_INVENTORY_AUDIT_LOGS)),
  };
  persistDatabase(memoryDb);
  return memoryDb;
}

function persistDatabase(db: InventoryDatabaseState) {
  memoryDb = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch {
    // Ignore file write errors in read-only environments; memoryDb remains up to date
  }
}

// ================= RBAC & SECURITY VALIDATION (Section 7) =================

export function parseUserContextFromRequest(request: Request): RequestUserContext {
  const rawHeader = request.headers.get("x-user-context");
  if (!rawHeader) {
    throw new AuthorizationError("Authentication required: Missing user context.", 401);
  }
  try {
    const decoded = decodeURIComponent(rawHeader);
    const parsed = JSON.parse(decoded) as RequestUserContext;
    if (!parsed || !parsed.id || !parsed.email || !Array.isArray(parsed.allowedVerticals)) {
      throw new AuthorizationError("Invalid user session context.", 401);
    }
    return parsed;
  } catch (err) {
    if (err instanceof AuthorizationError) throw err;
    throw new AuthorizationError("Malformed authentication header.", 401);
  }
}

export class AuthorizationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export class ValidationError extends Error {
  statusCode = 400;
  errors: string[];
  constructor(errors: string | string[]) {
    const list = Array.isArray(errors) ? errors : [errors];
    super(list.join(" "));
    this.name = "ValidationError";
    this.errors = list;
  }
}

export function requirePermission(
  user: RequestUserContext,
  permission: keyof InventoryRBACPermissions,
  category?: InventoryCategory,
  location?: string,
) {
  if (!user.inventoryPermissions?.[permission]) {
    throw new AuthorizationError(
      `Permission denied: Your account (${user.email}) does not have '${permission}' permission.`,
      403,
    );
  }
  if (category && !user.allowedVerticals.includes(category)) {
    const label = category === "Grocery" ? "Kirana / Grocery" : category;
    throw new AuthorizationError(
      `Category access denied: You are not authorized to access ${label} inventory.`,
      403,
    );
  }
  if (
    location &&
    user.allowedLocations &&
    !user.allowedLocations.includes("ALL") &&
    !user.allowedLocations.includes(location)
  ) {
    throw new AuthorizationError(
      `Location access denied: You are not authorized for store location '${location}'.`,
      403,
    );
  }
}

export function filterProductsByUserScope(
  products: InventoryProduct[],
  user: RequestUserContext,
): InventoryProduct[] {
  return products.filter((p) => {
    if (!user.allowedVerticals.includes(p.inventoryCategory)) return false;
    if (
      user.allowedLocations &&
      !user.allowedLocations.includes("ALL") &&
      !user.allowedLocations.includes(p.storeLocation)
    ) {
      return false;
    }
    return true;
  });
}

// ================= VALIDATION SERVICE (Section 4) =================

export function validateInventoryPayload(
  payload: Partial<InventoryProduct>,
  existingProducts: InventoryProduct[],
  editingId?: string,
): string[] {
  const errors: string[] = [];

  if (!payload.inventoryCategory || !["Grocery", "Pharmacy", "Mall"].includes(payload.inventoryCategory)) {
    errors.push("A valid inventory category (Kirana, Pharmacy, or Mall) is required.");
  }
  if (!payload.productName?.trim()) {
    errors.push("Product Name is mandatory.");
  }
  if (!payload.sku?.trim()) {
    errors.push("SKU is mandatory.");
  }
  if (!payload.barcode?.trim()) {
    errors.push("Barcode is mandatory.");
  }
  if (!payload.brand?.trim()) {
    errors.push("Brand is mandatory.");
  }
  if (!payload.productCategory?.trim()) {
    errors.push("Product Category is mandatory.");
  }
  if (!payload.supplier?.trim()) {
    errors.push("Supplier is mandatory.");
  }
  if (!payload.unitOfMeasurement?.trim()) {
    errors.push("Unit of Measurement is mandatory.");
  }

  // SKU uniqueness within applicable inventory scope
  if (payload.sku?.trim()) {
    const normalizedSku = payload.sku.trim().toLowerCase();
    const duplicateSku = existingProducts.find(
      (p) =>
        p.id !== editingId &&
        p.inventoryCategory === payload.inventoryCategory &&
        p.sku.trim().toLowerCase() === normalizedSku,
    );
    if (duplicateSku) {
      errors.push(
        `SKU '${payload.sku.trim()}' already exists in ${
          payload.inventoryCategory === "Grocery" ? "Kirana" : payload.inventoryCategory
        } inventory (${duplicateSku.productName}).`,
      );
    }
  }

  // Barcode uniqueness across inventory
  if (payload.barcode?.trim()) {
    const normalizedBarcode = payload.barcode.trim().toLowerCase();
    const duplicateBarcode = existingProducts.find(
      (p) => p.id !== editingId && p.barcode.trim().toLowerCase() === normalizedBarcode,
    );
    if (duplicateBarcode) {
      errors.push(
        `Barcode '${payload.barcode.trim()}' is already assigned to '${duplicateBarcode.productName}' (${duplicateBarcode.sku}).`,
      );
    }
  }

  // Monetary validations
  const purchasePrice = Number(payload.purchasePrice);
  const sellingPrice = Number(payload.sellingPrice);
  const mrp = Number(payload.mrp ?? payload.sellingPrice);

  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    errors.push("Purchase Price must be a valid monetary value greater than 0.");
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    errors.push("Selling Price must be a valid monetary value greater than 0.");
  }
  if (!Number.isFinite(mrp) || mrp <= 0) {
    errors.push("MRP must be a valid monetary value greater than 0.");
  }
  if (Number.isFinite(sellingPrice) && Number.isFinite(mrp) && sellingPrice > mrp) {
    errors.push(`Selling Price (₹${sellingPrice}) cannot exceed MRP (₹${mrp}).`);
  }

  // Stock quantity validations
  const stockQty = Number(editingId ? payload.stockQuantity : payload.initialStockQuantity ?? payload.stockQuantity);
  if (!Number.isFinite(stockQty) || stockQty < 0) {
    errors.push("Stock quantity cannot be negative.");
  }

  const minStock = Number(payload.minimumStockLevel ?? 0);
  const maxStock = Number(payload.maximumStockLevel ?? 0);
  if (!Number.isFinite(minStock) || minStock < 0) {
    errors.push("Minimum Stock Level cannot be negative.");
  }
  if (maxStock > 0 && maxStock < minStock) {
    errors.push("Maximum Stock Level must be greater than or equal to Minimum Stock Level.");
  }

  // Category-specific validations
  if (payload.inventoryCategory === "Grocery") {
    const kf = payload.kiranaFields;
    if (!kf?.grocerySubcategory?.trim()) {
      errors.push("Kirana: Grocery Subcategory is mandatory.");
    }
    if (!kf?.weightVolume?.trim()) {
      errors.push("Kirana: Weight/Volume specification is mandatory.");
    }
    if (!kf?.storageInformation?.trim()) {
      errors.push("Kirana: Storage Information is mandatory.");
    }
    if (kf?.manufacturingDate && kf?.expiryDate && kf.manufacturingDate > kf.expiryDate) {
      errors.push("Kirana: Manufacturing Date cannot be later than Expiry Date.");
    }
  }

  if (payload.inventoryCategory === "Pharmacy") {
    const pf = payload.pharmacyFields;
    if (!pf?.medicineName?.trim()) {
      errors.push("Pharmacy: Medicine Name is mandatory.");
    }
    if (!pf?.genericName?.trim()) {
      errors.push("Pharmacy: Generic Name is mandatory.");
    }
    if (!pf?.composition?.trim()) {
      errors.push("Pharmacy: Composition is mandatory.");
    }
    if (!pf?.manufacturer?.trim()) {
      errors.push("Pharmacy: Manufacturer is mandatory.");
    }
    if (!pf?.applicableLicenceInfo?.trim()) {
      errors.push("Pharmacy: Applicable Licence Information is mandatory.");
    }
    if (!pf?.batches || pf.batches.length === 0) {
      errors.push("Pharmacy: At least one medicine batch is mandatory.");
    } else {
      const seenBatchNos = new Set<string>();
      pf.batches.forEach((b, idx) => {
        const label = `Batch #${idx + 1} (${b.batchNumber || "Unnamed"})`;
        if (!b.batchNumber?.trim()) {
          errors.push(`${label}: Batch Number is required.`);
        } else {
          const norm = b.batchNumber.trim().toLowerCase();
          if (seenBatchNos.has(norm)) {
            errors.push(`${label}: Duplicate Batch Number '${b.batchNumber}' within the same medicine.`);
          }
          seenBatchNos.add(norm);
        }
        if (!b.expiryDate) {
          errors.push(`${label}: Expiry Date is required.`);
        }
        if (b.manufacturingDate && b.expiryDate && b.manufacturingDate > b.expiryDate) {
          errors.push(`${label}: Manufacturing Date cannot be after Expiry Date.`);
        }
        if (!Number.isFinite(Number(b.quantity)) || Number(b.quantity) < 0) {
          errors.push(`${label}: Batch quantity cannot be negative.`);
        }
        if (!Number.isFinite(Number(b.purchasePrice)) || Number(b.purchasePrice) <= 0) {
          errors.push(`${label}: Batch purchase price must be greater than 0.`);
        }
      });
    }
  }

  if (payload.inventoryCategory === "Mall") {
    const mf = payload.mallFields;
    if (!mf?.department?.trim()) {
      errors.push("Mall: Department is mandatory.");
    }
    if (!mf?.productModel?.trim()) {
      errors.push("Mall: Product Model is mandatory.");
    }
    if (!mf?.size?.trim()) {
      errors.push("Mall: Size is mandatory.");
    }
    if (!mf?.colour?.trim()) {
      errors.push("Mall: Colour is mandatory.");
    }
    if (!mf?.warehouseStoreLocation?.trim()) {
      errors.push("Mall: Warehouse/Store Location is mandatory.");
    }
  }

  return errors;
}

// ================= LISTING, SEARCH, FILTER & SORT SERVICE (Section 5) =================

export type InventoryQueryOptions = {
  category?: InventoryCategory | "ALL";
  search?: string;
  productCategory?: string;
  brand?: string;
  supplier?: string;
  status?: "ALL" | "Active" | "Inactive";
  stockStatus?: StockStatusFilter;
  expiryStatus?: PharmacyExpiryFilter;
  dateFrom?: string;
  dateTo?: string;
  sortBy?:
    | "productName"
    | "sku"
    | "brand"
    | "stockQuantity"
    | "purchasePrice"
    | "sellingPrice"
    | "status"
    | "updatedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export function queryInventoryProducts(
  user: RequestUserContext,
  options: InventoryQueryOptions,
) {
  requirePermission(
    user,
    "viewInventory",
    options.category && options.category !== "ALL" ? options.category : undefined,
  );

  const db = loadDatabase();
  const scoped = filterProductsByUserScope(db.products, user);

  // Filter by specific category if provided
  const categoryScoped =
    options.category && options.category !== "ALL"
      ? scoped.filter((p) => p.inventoryCategory === options.category)
      : scoped;

  // Build dynamic filter facets from categoryScoped records
  const availableCategories = Array.from(
    new Set(categoryScoped.map((p) => p.productCategory)),
  ).sort();
  const availableBrands = Array.from(new Set(categoryScoped.map((p) => p.brand))).sort();
  const availableSuppliers = Array.from(new Set(categoryScoped.map((p) => p.supplier))).sort();

  // Apply search & filters
  const q = (options.search ?? "").trim().toLowerCase();
  const filtered = categoryScoped.filter((item) => {
    if (q) {
      const batchMatch =
        item.pharmacyFields?.batches?.some((b) =>
          b.batchNumber.toLowerCase().includes(q),
        ) ?? false;
      const genericMatch =
        item.pharmacyFields?.genericName?.toLowerCase().includes(q) ?? false;
      const modelMatch =
        item.mallFields?.productModel?.toLowerCase().includes(q) ?? false;
      const matchesSearch =
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        batchMatch ||
        genericMatch ||
        modelMatch;
      if (!matchesSearch) return false;
    }

    if (
      options.productCategory &&
      options.productCategory !== "ALL" &&
      item.productCategory !== options.productCategory
    ) {
      return false;
    }

    if (options.brand && options.brand !== "ALL" && item.brand !== options.brand) {
      return false;
    }

    if (options.supplier && options.supplier !== "ALL" && item.supplier !== options.supplier) {
      return false;
    }

    if (options.status && options.status !== "ALL" && item.status !== options.status) {
      return false;
    }

    if (options.stockStatus && options.stockStatus !== "ALL") {
      const st = getProductStockStatus(item);
      if (st !== options.stockStatus) return false;
    }

    if (options.expiryStatus && options.expiryStatus !== "ALL") {
      const exp = getProductExpiryStatus(item);
      if (exp.status !== options.expiryStatus) return false;
    }

    if (options.dateFrom) {
      const itemDate = item.createdAt.slice(0, 10);
      if (itemDate < options.dateFrom) return false;
    }

    if (options.dateTo) {
      const itemDate = item.createdAt.slice(0, 10);
      if (itemDate > options.dateTo) return false;
    }

    return true;
  });

  // Sort
  const sortBy = options.sortBy ?? "updatedAt";
  const sortOrder = options.sortOrder ?? "desc";
  const dir = sortOrder === "asc" ? 1 : -1;

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "productName":
        return a.productName.localeCompare(b.productName) * dir;
      case "sku":
        return a.sku.localeCompare(b.sku) * dir;
      case "brand":
        return a.brand.localeCompare(b.brand) * dir;
      case "stockQuantity":
        return (a.stockQuantity - b.stockQuantity) * dir;
      case "purchasePrice":
        return (a.purchasePrice - b.purchasePrice) * dir;
      case "sellingPrice":
        return (a.sellingPrice - b.sellingPrice) * dir;
      case "status":
        return a.status.localeCompare(b.status) * dir;
      case "updatedAt":
      default:
        return a.updatedAt.localeCompare(b.updatedAt) * dir;
    }
  });

  // Server-side pagination
  const pageSize = Math.max(1, Math.min(200, Number(options.pageSize) || 10));
  const totalRecords = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number(options.page) || 1));
  const start = (page - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  return {
    items,
    allFilteredItems: sorted,
    allAuthorizedCategoryItems: categoryScoped,
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages,
    },
    facets: {
      categories: availableCategories,
      brands: availableBrands,
      suppliers: availableSuppliers,
    },
  };
}

// ================= CREATE INVENTORY SERVICE (Section 4, 6, 8) =================

export async function createInventoryProduct(
  user: RequestUserContext,
  payload: Partial<InventoryProduct>,
): Promise<{ product: InventoryProduct; transaction: StockTransaction; audit: InventoryAuditEntry }> {
  const category = payload.inventoryCategory as InventoryCategory;
  requirePermission(user, "addInventory", category, payload.storeLocation);

  return withDatabaseTransaction((db) => {
    // For Pharmacy, compute total stock & weighted/latest prices from batches if batches are provided
    let computedInitialStock = Number(payload.initialStockQuantity ?? payload.stockQuantity ?? 0);
    let sanitizedBatches: PharmacyBatch[] = [];

    if (category === "Pharmacy" && payload.pharmacyFields?.batches?.length) {
      sanitizedBatches = payload.pharmacyFields.batches.map((b, i) => ({
        batchId: b.batchId || `bat-${Date.now()}-${i}`,
        batchNumber: b.batchNumber.trim(),
        manufacturingDate: b.manufacturingDate || "2026-01-01",
        expiryDate: b.expiryDate,
        quantity: Math.max(0, Number(b.quantity) || 0),
        purchasePrice: Number(b.purchasePrice) || Number(payload.purchasePrice) || 1,
        sellingPrice: Number(b.sellingPrice) || Number(payload.sellingPrice) || 1,
        mrp: Number(b.mrp) || Number(payload.mrp) || 1,
        location: b.location || payload.storeLocation || "Pharmacy Cold-Chain & Med Vault",
      }));
      computedInitialStock = sanitizedBatches.reduce((sum, b) => sum + b.quantity, 0);
    }

    const candidate: Partial<InventoryProduct> = {
      ...payload,
      initialStockQuantity: computedInitialStock,
      stockQuantity: computedInitialStock,
      pharmacyFields:
        category === "Pharmacy" && payload.pharmacyFields
          ? {
              ...payload.pharmacyFields,
              batches: sanitizedBatches,
            }
          : undefined,
    };

    const validationErrors = validateInventoryPayload(candidate, db.products);
    if (validationErrors.length > 0) {
      throw new ValidationError(validationErrors);
    }

    const now = new Date().toISOString();
    const newId = `prd-${category.toLowerCase().slice(0, 3)}-${Date.now()}`;

    const created: InventoryProduct = {
      id: newId,
      inventoryCategory: category,
      productName: candidate.productName!.trim(),
      sku: candidate.sku!.trim().toUpperCase(),
      barcode: candidate.barcode!.trim(),
      brand: candidate.brand!.trim(),
      productCategory: candidate.productCategory!.trim(),
      description: (candidate.description ?? "").trim(),
      productImage: candidate.productImage?.trim() || "/window.svg",
      supplier: candidate.supplier!.trim(),
      supplierPhone: candidate.supplierPhone?.trim() || "",
      purchasePrice: Number(candidate.purchasePrice),
      sellingPrice: Number(candidate.sellingPrice),
      mrp: Number(candidate.mrp ?? candidate.sellingPrice),
      taxInformation:
        candidate.taxInformation?.trim() || `GST ${candidate.gstPercent ?? 12}%`,
      gstPercent: (candidate.gstPercent ?? 12) as 0 | 5 | 12 | 18 | 28,
      unitOfMeasurement: candidate.unitOfMeasurement!.trim(),
      initialStockQuantity: computedInitialStock,
      stockQuantity: computedInitialStock,
      minimumStockLevel: Number(candidate.minimumStockLevel ?? 10),
      maximumStockLevel: Number(candidate.maximumStockLevel ?? 200),
      status: candidate.status === "Inactive" ? "Inactive" : "Active",
      storeLocation: candidate.storeLocation?.trim() || "Main Store — Ground Floor",
      createdAt: now,
      updatedAt: now,
      createdBy: user.name,
      kiranaFields: category === "Grocery" ? candidate.kiranaFields : undefined,
      pharmacyFields: category === "Pharmacy" ? candidate.pharmacyFields : undefined,
      mallFields: category === "Mall" ? candidate.mallFields : undefined,
    };

    // Every stock initialization MUST generate an INITIAL_ENTRY stock transaction (Section 6)
    const refNo = `TXN-${now.slice(0, 10).replace(/-/g, "")}-${String(
      db.transactions.length + 1,
    ).padStart(4, "0")}`;

    const initialTxn: StockTransaction = {
      id: `txn-${Date.now()}`,
      referenceNumber: refNo,
      productId: created.id,
      sku: created.sku,
      productName: created.productName,
      inventoryCategory: created.inventoryCategory,
      batchNumber:
        category === "Pharmacy"
          ? sanitizedBatches.map((b) => b.batchNumber).join(", ")
          : undefined,
      previousQuantity: 0,
      quantityDelta: created.stockQuantity,
      newQuantity: created.stockQuantity,
      transactionType: "INITIAL_ENTRY",
      reason: `Initial inventory onboarding (${created.stockQuantity} ${created.unitOfMeasurement})`,
      destinationLocation: created.storeLocation,
      performedBy: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      createdAt: now,
    };

    const auditEntry: InventoryAuditEntry = {
      id: `iaud-${Date.now()}`,
      timestamp: now,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      operation: "INVENTORY_CREATED",
      inventoryCategory: created.inventoryCategory,
      recordId: created.id,
      sku: created.sku,
      productName: created.productName,
      summary: `Created ${
        created.inventoryCategory === "Grocery" ? "Kirana" : created.inventoryCategory
      } inventory record '${created.productName}' (${created.sku}) with initial stock ${
        created.stockQuantity
      } ${created.unitOfMeasurement}.`,
      changes: [
        { field: "sku", before: "-", after: created.sku },
        { field: "productName", before: "-", after: created.productName },
        { field: "purchasePrice", before: 0, after: created.purchasePrice },
        { field: "sellingPrice", before: 0, after: created.sellingPrice },
        { field: "stockQuantity", before: 0, after: created.stockQuantity },
        { field: "status", before: "-", after: created.status },
      ],
    };

    db.products.unshift(created);
    db.transactions.unshift(initialTxn);
    db.auditLogs.unshift(auditEntry);

    return { product: created, transaction: initialTxn, audit: auditEntry };
  });
}

// ================= UPDATE / EDIT INVENTORY SERVICE (Section 5, 8) =================

export async function updateInventoryProduct(
  user: RequestUserContext,
  productId: string,
  updates: Partial<InventoryProduct>,
): Promise<{ product: InventoryProduct; auditEntries: InventoryAuditEntry[] }> {
  return withRowLock(productId, () =>
    withDatabaseTransaction((db) => {
      const idx = db.products.findIndex((p) => p.id === productId);
      if (idx === -1) {
        throw new ValidationError("Inventory record not found.");
      }

      const existing = db.products[idx];
      requirePermission(user, "editInventory", existing.inventoryCategory, existing.storeLocation);

      // Prevent changing inventoryCategory after creation
      const targetCategory = existing.inventoryCategory;

      // Note: Direct stockQuantity changes during metadata edit are only allowed via Pharmacy batch sync or Stock Adjustment service
      let nextStockQty = existing.stockQuantity;
      let nextPharmacyFields = updates.pharmacyFields ?? existing.pharmacyFields;

      if (targetCategory === "Pharmacy" && nextPharmacyFields?.batches) {
        const sanitizedBatches: PharmacyBatch[] = nextPharmacyFields.batches.map((b, i) => ({
          batchId: b.batchId || `bat-${Date.now()}-${i}`,
          batchNumber: b.batchNumber.trim(),
          manufacturingDate: b.manufacturingDate || "2026-01-01",
          expiryDate: b.expiryDate,
          quantity: Math.max(0, Number(b.quantity) || 0),
          purchasePrice: Number(b.purchasePrice) || existing.purchasePrice,
          sellingPrice: Number(b.sellingPrice) || existing.sellingPrice,
          mrp: Number(b.mrp) || existing.mrp,
          location: b.location || existing.storeLocation,
        }));
        nextPharmacyFields = {
          ...nextPharmacyFields,
          batches: sanitizedBatches,
        };
        nextStockQty = sanitizedBatches.reduce((sum, b) => sum + b.quantity, 0);
      }

      const merged: InventoryProduct = {
        ...existing,
        ...updates,
        id: existing.id,
        inventoryCategory: targetCategory,
        stockQuantity: nextStockQty,
        purchasePrice: Number(updates.purchasePrice ?? existing.purchasePrice),
        sellingPrice: Number(updates.sellingPrice ?? existing.sellingPrice),
        mrp: Number(updates.mrp ?? existing.mrp),
        minimumStockLevel: Number(updates.minimumStockLevel ?? existing.minimumStockLevel),
        maximumStockLevel: Number(updates.maximumStockLevel ?? existing.maximumStockLevel),
        pharmacyFields: targetCategory === "Pharmacy" ? nextPharmacyFields : undefined,
        kiranaFields:
          targetCategory === "Grocery"
            ? updates.kiranaFields ?? existing.kiranaFields
            : undefined,
        mallFields:
          targetCategory === "Mall" ? updates.mallFields ?? existing.mallFields : undefined,
        updatedAt: new Date().toISOString(),
      };

      const validationErrors = validateInventoryPayload(merged, db.products, existing.id);
      if (validationErrors.length > 0) {
        throw new ValidationError(validationErrors);
      }

      // Compute detailed before/after audit diffs (Section 8)
      const now = merged.updatedAt;
      const changes: AuditFieldChange[] = [];
      const trackedFields: (keyof InventoryProduct)[] = [
        "productName",
        "sku",
        "barcode",
        "brand",
        "productCategory",
        "supplier",
        "purchasePrice",
        "sellingPrice",
        "mrp",
        "taxInformation",
        "unitOfMeasurement",
        "minimumStockLevel",
        "maximumStockLevel",
        "status",
        "storeLocation",
      ];

      for (const field of trackedFields) {
        const beforeVal = existing[field];
        const afterVal = merged[field];
        if (beforeVal !== afterVal && beforeVal !== undefined && afterVal !== undefined) {
          changes.push({
            field,
            before: String(beforeVal),
            after: String(afterVal),
          });
        }
      }

      // Determine primary audit operation(s)
      const createdAudits: InventoryAuditEntry[] = [];

      if (existing.status !== merged.status) {
        createdAudits.push({
          id: `iaud-${Date.now()}-status`,
          timestamp: now,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          operation: "STATUS_CHANGED",
          inventoryCategory: targetCategory,
          recordId: merged.id,
          sku: merged.sku,
          productName: merged.productName,
          summary: `Changed status of '${merged.productName}' (${merged.sku}) from ${existing.status} to ${merged.status}.`,
          changes: [{ field: "status", before: existing.status, after: merged.status }],
        });
      }

      if (
        existing.purchasePrice !== merged.purchasePrice ||
        existing.sellingPrice !== merged.sellingPrice ||
        existing.mrp !== merged.mrp
      ) {
        createdAudits.push({
          id: `iaud-${Date.now()}-price`,
          timestamp: now,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          operation: "PRICE_CHANGED",
          inventoryCategory: targetCategory,
          recordId: merged.id,
          sku: merged.sku,
          productName: merged.productName,
          summary: `Updated pricing for '${merged.productName}' (Purchase: ₹${existing.purchasePrice}→₹${merged.purchasePrice}, Selling: ₹${existing.sellingPrice}→₹${merged.sellingPrice}, MRP: ₹${existing.mrp}→₹${merged.mrp}).`,
          changes: [
            { field: "purchasePrice", before: existing.purchasePrice, after: merged.purchasePrice },
            { field: "sellingPrice", before: existing.sellingPrice, after: merged.sellingPrice },
            { field: "mrp", before: existing.mrp, after: merged.mrp },
          ],
        });
      }

      if (existing.supplier !== merged.supplier) {
        createdAudits.push({
          id: `iaud-${Date.now()}-sup`,
          timestamp: now,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          operation: "SUPPLIER_CHANGED",
          inventoryCategory: targetCategory,
          recordId: merged.id,
          sku: merged.sku,
          productName: merged.productName,
          summary: `Changed supplier for '${merged.productName}' from '${existing.supplier}' to '${merged.supplier}'.`,
          changes: [{ field: "supplier", before: existing.supplier, after: merged.supplier }],
        });
      }

      // If Pharmacy batches changed, log BATCH_MODIFIED and if stock delta != 0 also log StockTransaction!
      if (targetCategory === "Pharmacy") {
        const oldBatchesJson = JSON.stringify(existing.pharmacyFields?.batches ?? []);
        const newBatchesJson = JSON.stringify(merged.pharmacyFields?.batches ?? []);
        if (oldBatchesJson !== newBatchesJson) {
          createdAudits.push({
            id: `iaud-${Date.now()}-batch`,
            timestamp: now,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
            operation: "BATCH_MODIFIED",
            inventoryCategory: targetCategory,
            recordId: merged.id,
            sku: merged.sku,
            productName: merged.productName,
            summary: `Updated Pharmacy batches for '${merged.productName}' (${
              merged.pharmacyFields?.batches.length ?? 0
            } active batches, total stock ${existing.stockQuantity} → ${merged.stockQuantity}).`,
            changes: [
              {
                field: "batches",
                before: `${existing.pharmacyFields?.batches.length ?? 0} batches (${existing.stockQuantity} units)`,
                after: `${merged.pharmacyFields?.batches.length ?? 0} batches (${merged.stockQuantity} units)`,
              },
            ],
          });

          if (existing.stockQuantity !== merged.stockQuantity) {
            const delta = Number((merged.stockQuantity - existing.stockQuantity).toFixed(2));
            const refNo = `TXN-${now.slice(0, 10).replace(/-/g, "")}-${String(
              db.transactions.length + 1,
            ).padStart(4, "0")}`;
            db.transactions.unshift({
              id: `txn-${Date.now()}-bat`,
              referenceNumber: refNo,
              productId: merged.id,
              sku: merged.sku,
              productName: merged.productName,
              inventoryCategory: merged.inventoryCategory,
              batchNumber: merged.pharmacyFields?.batches.map((b) => b.batchNumber).join(", "),
              previousQuantity: existing.stockQuantity,
              quantityDelta: delta,
              newQuantity: merged.stockQuantity,
              transactionType: "STOCK_CORRECTION",
              reason: "Batch-wise stock synchronization during medicine record update",
              sourceLocation: merged.storeLocation,
              performedBy: { id: user.id, name: user.name, email: user.email, role: user.role },
              createdAt: now,
            });
          }
        }
      }

      if (createdAudits.length === 0) {
        createdAudits.push({
          id: `iaud-${Date.now()}-mod`,
          timestamp: now,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          operation: "INVENTORY_MODIFIED",
          inventoryCategory: targetCategory,
          recordId: merged.id,
          sku: merged.sku,
          productName: merged.productName,
          summary: `Updated product details for '${merged.productName}' (${merged.sku}).`,
          changes:
            changes.length > 0
              ? changes
              : [{ field: "attributes", before: "Previous spec", after: "Updated spec" }],
        });
      }

      db.products[idx] = merged;
      db.auditLogs.unshift(...createdAudits);

      return { product: merged, auditEntries: createdAudits };
    }),
  );
}

// ================= STOCK MANAGEMENT SERVICE (Section 6) =================

export type StockOperationPayload = {
  productId: string;
  transactionType: StockTransactionType;
  quantity: number; // Positive number representing amount to add/reduce/transfer, or new target quantity for CORRECTION
  reason: string;
  referenceNumber?: string;
  batchNumber?: string;
  newBatch?: {
    batchNumber: string;
    manufacturingDate: string;
    expiryDate: string;
    purchasePrice: number;
    sellingPrice?: number;
    mrp?: number;
  };
  sourceLocation?: string;
  destinationLocation?: string;
};

export async function executeStockOperation(
  user: RequestUserContext,
  payload: StockOperationPayload,
): Promise<{
  product: InventoryProduct;
  transaction: StockTransaction;
  audit: InventoryAuditEntry;
}> {
  if (!payload.productId) {
    throw new ValidationError("Product ID is required for stock operations.");
  }
  if (!payload.reason || !payload.reason.trim()) {
    throw new ValidationError("A transaction reason is mandatory for all stock modifications.");
  }
  const inputQty = Number(payload.quantity);
  if (!Number.isFinite(inputQty) || inputQty < 0) {
    throw new ValidationError("Quantity must be a valid non-negative number.");
  }
  if (
    payload.transactionType !== "STOCK_CORRECTION" &&
    payload.transactionType !== "STOCK_TRANSFER" &&
    inputQty <= 0
  ) {
    throw new ValidationError("Quantity to add, reduce, or adjust must be greater than 0.");
  }

  return withRowLock(payload.productId, () =>
    withDatabaseTransaction((db) => {
      const idx = db.products.findIndex((p) => p.id === payload.productId);
      if (idx === -1) {
        throw new ValidationError("Target product not found.");
      }

      const product = db.products[idx];
      requirePermission(user, "adjustStock", product.inventoryCategory, product.storeLocation);

      const previousQuantity = product.stockQuantity;
      let newQuantity = previousQuantity;
      let quantityDelta = 0;
      const now = new Date().toISOString();

      // Clone product for atomic update
      const updatedProduct: InventoryProduct = JSON.parse(JSON.stringify(product));
      let effectiveBatchNumber = payload.batchNumber?.trim() || undefined;

      // Handle Pharmacy batch-level stock operations (Section 4 & 6)
      if (updatedProduct.inventoryCategory === "Pharmacy" && updatedProduct.pharmacyFields) {
        const batches = updatedProduct.pharmacyFields.batches;

        if (payload.newBatch && payload.newBatch.batchNumber?.trim()) {
          if (
            payload.transactionType !== "STOCK_ADDITION" &&
            payload.transactionType !== "INITIAL_ENTRY"
          ) {
            throw new ValidationError("New batches can only be created during Stock Addition.");
          }
          const nb = payload.newBatch;
          if (!nb.expiryDate) {
            throw new ValidationError("New batch requires a valid Expiry Date.");
          }
          effectiveBatchNumber = nb.batchNumber.trim();
          batches.push({
            batchId: `bat-${Date.now()}`,
            batchNumber: effectiveBatchNumber,
            manufacturingDate: nb.manufacturingDate || now.slice(0, 10),
            expiryDate: nb.expiryDate,
            quantity: inputQty,
            purchasePrice: Number(nb.purchasePrice) || updatedProduct.purchasePrice,
            sellingPrice: Number(nb.sellingPrice) || updatedProduct.sellingPrice,
            mrp: Number(nb.mrp) || updatedProduct.mrp,
            location: payload.destinationLocation || updatedProduct.storeLocation,
          });
        } else {
          const targetBatch = effectiveBatchNumber
            ? batches.find((b) => b.batchNumber === effectiveBatchNumber)
            : batches[0];

          if (!targetBatch) {
            throw new ValidationError(
              `Pharmacy batch '${effectiveBatchNumber || "Default"}' not found for ${updatedProduct.productName}.`,
            );
          }
          effectiveBatchNumber = targetBatch.batchNumber;

          if (
            payload.transactionType === "STOCK_ADDITION" ||
            payload.transactionType === "INITIAL_ENTRY"
          ) {
            targetBatch.quantity = Number((targetBatch.quantity + inputQty).toFixed(2));
          } else if (
            payload.transactionType === "STOCK_REDUCTION" ||
            payload.transactionType === "STOCK_ADJUSTMENT"
          ) {
            if (targetBatch.quantity < inputQty) {
              throw new ValidationError(
                `Insufficient stock in batch '${targetBatch.batchNumber}' (Available: ${targetBatch.quantity}, Requested deduction: ${inputQty}).`,
              );
            }
            targetBatch.quantity = Number((targetBatch.quantity - inputQty).toFixed(2));
          } else if (payload.transactionType === "STOCK_CORRECTION") {
            targetBatch.quantity = Number(inputQty.toFixed(2));
          } else if (payload.transactionType === "STOCK_TRANSFER") {
            if (payload.destinationLocation) {
              targetBatch.location = payload.destinationLocation;
            }
          }
        }

        newQuantity = Number(
          batches.reduce((sum, b) => sum + b.quantity, 0).toFixed(2),
        );
        quantityDelta = Number((newQuantity - previousQuantity).toFixed(2));
      } else {
        // Kirana / Mall Stock Calculation
        switch (payload.transactionType) {
          case "INITIAL_ENTRY":
          case "STOCK_ADDITION":
            quantityDelta = Number(inputQty.toFixed(2));
            newQuantity = Number((previousQuantity + quantityDelta).toFixed(2));
            break;
          case "STOCK_REDUCTION":
          case "STOCK_ADJUSTMENT":
            if (previousQuantity < inputQty) {
              throw new ValidationError(
                `Stock quantity cannot become negative (Current stock: ${previousQuantity} ${product.unitOfMeasurement}, Deduction requested: ${inputQty}).`,
              );
            }
            quantityDelta = Number((-inputQty).toFixed(2));
            newQuantity = Number((previousQuantity + quantityDelta).toFixed(2));
            break;
          case "STOCK_CORRECTION":
            newQuantity = Number(inputQty.toFixed(2));
            quantityDelta = Number((newQuantity - previousQuantity).toFixed(2));
            break;
          case "STOCK_TRANSFER":
            if (!payload.destinationLocation?.trim()) {
              throw new ValidationError(
                "Destination location is required for a Stock Transfer.",
              );
            }
            if (previousQuantity < inputQty) {
              throw new ValidationError(
                `Cannot transfer ${inputQty} ${product.unitOfMeasurement}; only ${previousQuantity} available at ${product.storeLocation}.`,
              );
            }
            quantityDelta = 0; // Total store stock remains constant; location updates
            newQuantity = previousQuantity;
            updatedProduct.storeLocation = payload.destinationLocation.trim();
            if (updatedProduct.mallFields) {
              updatedProduct.mallFields.warehouseStoreLocation =
                payload.destinationLocation.trim();
            }
            break;
        }
      }

      if (newQuantity < 0) {
        throw new ValidationError("Stock quantity cannot be negative.");
      }

      updatedProduct.stockQuantity = newQuantity;
      if (payload.destinationLocation && payload.transactionType === "STOCK_TRANSFER") {
        updatedProduct.storeLocation = payload.destinationLocation;
      }
      updatedProduct.updatedAt = now;

      const refNo =
        payload.referenceNumber?.trim() ||
        `TXN-${now.slice(0, 10).replace(/-/g, "")}-${String(
          db.transactions.length + 1,
        ).padStart(4, "0")}`;

      const transaction: StockTransaction = {
        id: `txn-${Date.now()}`,
        referenceNumber: refNo,
        productId: updatedProduct.id,
        sku: updatedProduct.sku,
        productName: updatedProduct.productName,
        inventoryCategory: updatedProduct.inventoryCategory,
        batchNumber: effectiveBatchNumber,
        previousQuantity,
        quantityDelta,
        newQuantity,
        transactionType: payload.transactionType,
        reason: payload.reason.trim(),
        sourceLocation: payload.sourceLocation || product.storeLocation,
        destinationLocation: payload.destinationLocation || updatedProduct.storeLocation,
        performedBy: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        createdAt: now,
      };

      const audit: InventoryAuditEntry = {
        id: `iaud-${Date.now()}`,
        timestamp: now,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        operation: "STOCK_ADJUSTED",
        inventoryCategory: updatedProduct.inventoryCategory,
        recordId: updatedProduct.id,
        sku: updatedProduct.sku,
        productName: updatedProduct.productName,
        summary: `[${payload.transactionType}] ${updatedProduct.productName} (${
          updatedProduct.sku
        })${effectiveBatchNumber ? ` · Batch ${effectiveBatchNumber}` : ""}: ${previousQuantity} → ${newQuantity} ${
          updatedProduct.unitOfMeasurement
        } (Ref: ${refNo} · Reason: ${payload.reason.trim()})`,
        changes: [
          { field: "stockQuantity", before: previousQuantity, after: newQuantity },
          ...(payload.transactionType === "STOCK_TRANSFER"
            ? [
                {
                  field: "storeLocation",
                  before: product.storeLocation,
                  after: updatedProduct.storeLocation,
                },
              ]
            : []),
        ],
      };

      db.products[idx] = updatedProduct;
      db.transactions.unshift(transaction);
      db.auditLogs.unshift(audit);

      return { product: updatedProduct, transaction, audit };
    }),
  );
}

// ================= STOCK HISTORY & AUDIT QUERY SERVICE =================

export function queryStockTransactions(
  user: RequestUserContext,
  options: {
    category?: InventoryCategory | "ALL";
    productId?: string;
    transactionType?: StockTransactionType | "ALL";
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  },
) {
  requirePermission(user, "viewStockHistory");

  const db = loadDatabase();
  const scopedTxns = db.transactions.filter((t) =>
    user.allowedVerticals.includes(t.inventoryCategory),
  );

  const q = (options.search ?? "").trim().toLowerCase();
  const filtered = scopedTxns.filter((t) => {
    if (options.category && options.category !== "ALL" && t.inventoryCategory !== options.category) {
      return false;
    }
    if (options.productId && t.productId !== options.productId) {
      return false;
    }
    if (
      options.transactionType &&
      options.transactionType !== "ALL" &&
      t.transactionType !== options.transactionType
    ) {
      return false;
    }
    if (options.dateFrom && t.createdAt.slice(0, 10) < options.dateFrom) {
      return false;
    }
    if (options.dateTo && t.createdAt.slice(0, 10) > options.dateTo) {
      return false;
    }
    if (q) {
      return (
        t.productName.toLowerCase().includes(q) ||
        t.sku.toLowerCase().includes(q) ||
        t.referenceNumber.toLowerCase().includes(q) ||
        t.reason.toLowerCase().includes(q) ||
        (t.batchNumber ?? "").toLowerCase().includes(q) ||
        t.performedBy.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize) || 10));
  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number(options.page) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages,
    },
  };
}

// ================= DASHBOARD & REPORTS SERVICE (Section 8, 9) =================

export function buildInventoryDashboardAndReports(
  user: RequestUserContext,
  categoryFilter?: InventoryCategory | "ALL",
) {
  requirePermission(user, "viewInventory");

  const db = loadDatabase();
  const allPermitted = filterProductsByUserScope(db.products, user);
  const products =
    categoryFilter && categoryFilter !== "ALL"
      ? allPermitted.filter((p) => p.inventoryCategory === categoryFilter)
      : allPermitted;

  const totalProducts = products.length;
  const totalActiveProducts = products.filter((p) => p.status === "Active").length;
  const totalInactiveProducts = products.filter((p) => p.status === "Inactive").length;

  const distinctProductCategories = new Set(products.map((p) => `${p.inventoryCategory}:${p.productCategory}`));
  const totalInventoryCategories = distinctProductCategories.size;

  const totalStockQuantity = Number(
    products.reduce((sum, p) => sum + p.stockQuantity, 0).toFixed(2),
  );

  const lowStockProducts = products.filter(
    (p) => getProductStockStatus(p) === "LOW_STOCK",
  );
  const outOfStockProducts = products.filter(
    (p) => getProductStockStatus(p) === "OUT_OF_STOCK",
  );

  const expiringProducts = products.filter((p) => {
    const exp = getProductExpiryStatus(p);
    return exp.status === "EXPIRING_SOON" || exp.status === "EXPIRED";
  });

  const totalPurchaseValue = Math.round(
    products.reduce((sum, p) => sum + p.stockQuantity * p.purchasePrice, 0),
  );
  const totalRetailValue = Math.round(
    products.reduce((sum, p) => sum + p.stockQuantity * p.sellingPrice, 0),
  );

  // Category-wise inventory summary (Kirana, Pharmacy, Mall)
  const categorySummary = user.allowedVerticals.map((cat) => {
    const catItems = allPermitted.filter((p) => p.inventoryCategory === cat);
    const activeCount = catItems.filter((p) => p.status === "Active").length;
    const stockUnits = Number(catItems.reduce((s, p) => s + p.stockQuantity, 0).toFixed(2));
    const purchaseVal = Math.round(
      catItems.reduce((s, p) => s + p.stockQuantity * p.purchasePrice, 0),
    );
    const sellingVal = Math.round(
      catItems.reduce((s, p) => s + p.stockQuantity * p.sellingPrice, 0),
    );
    const lowCount = catItems.filter((p) => getProductStockStatus(p) === "LOW_STOCK").length;
    const outCount = catItems.filter((p) => getProductStockStatus(p) === "OUT_OF_STOCK").length;
    const expCount = catItems.filter((p) => {
      const st = getProductExpiryStatus(p).status;
      return st === "EXPIRING_SOON" || st === "EXPIRED";
    }).length;

    return {
      category: cat,
      displayName:
        cat === "Grocery" ? "Kirana / Grocery" : cat === "Pharmacy" ? "Pharmacy" : "Mall / Supermarket",
      totalProducts: catItems.length,
      activeProducts: activeCount,
      totalStockQuantity: stockUnits,
      purchaseValue: purchaseVal,
      retailValue: sellingVal,
      lowStockCount: lowCount,
      outOfStockCount: outCount,
      expiringCount: expCount,
    };
  });

  // Pharmacy Batch-wise breakdown for expiry alert monitor
  const pharmacyBatchAlerts: {
    productId: string;
    sku: string;
    medicineName: string;
    schedule: string;
    batch: PharmacyBatch;
    expiryStatus: "VALID" | "EXPIRING_SOON" | "EXPIRED";
    daysRemaining: number;
  }[] = [];

  allPermitted
    .filter((p) => p.inventoryCategory === "Pharmacy" && p.pharmacyFields?.batches)
    .forEach((p) => {
      p.pharmacyFields!.batches.forEach((b) => {
        const exp = getBatchExpiryStatus(b.expiryDate);
        pharmacyBatchAlerts.push({
          productId: p.id,
          sku: p.sku,
          medicineName: p.pharmacyFields!.medicineName || p.productName,
          schedule: p.pharmacyFields!.scheduleClassification,
          batch: b,
          expiryStatus: exp.status,
          daysRemaining: exp.daysRemaining,
        });
      });
    });

  pharmacyBatchAlerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const permittedTransactions = db.transactions
    .filter((t) => user.allowedVerticals.includes(t.inventoryCategory))
    .slice(0, 15);

  const permittedAuditLogs = db.auditLogs
    .filter((a) => user.allowedVerticals.includes(a.inventoryCategory))
    .slice(0, 25);

  return {
    metrics: {
      totalProducts,
      totalActiveProducts,
      totalInactiveProducts,
      totalInventoryCategories,
      totalStockQuantity,
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      expiringCount: expiringProducts.length,
      totalPurchaseValue,
      totalRetailValue,
    },
    categorySummary,
    lowStockProducts,
    outOfStockProducts,
    expiringProducts,
    pharmacyBatchAlerts,
    recentTransactions: permittedTransactions,
    auditLogs: permittedAuditLogs,
  };
}

export function queryAuditLogs(
  user: RequestUserContext,
  options: {
    category?: InventoryCategory | "ALL";
    operation?: AuditOperationType | "ALL";
    recordId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  },
) {
  requirePermission(user, "viewReports");
  const db = loadDatabase();
  const q = (options.search ?? "").trim().toLowerCase();

  const filtered = db.auditLogs.filter((log) => {
    if (!user.allowedVerticals.includes(log.inventoryCategory)) return false;
    if (options.category && options.category !== "ALL" && log.inventoryCategory !== options.category) {
      return false;
    }
    if (options.operation && options.operation !== "ALL" && log.operation !== options.operation) {
      return false;
    }
    if (options.recordId && log.recordId !== options.recordId) {
      return false;
    }
    if (q) {
      return (
        log.productName.toLowerCase().includes(q) ||
        log.sku.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q) ||
        log.user.name.toLowerCase().includes(q) ||
        log.operation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize) || 12));
  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number(options.page) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    pagination: { page, pageSize, totalRecords, totalPages },
  };
}
