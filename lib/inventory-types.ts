import type { InventoryRBACPermissions, VendorVerticalPermission } from "@/lib/auth-storage";

export type InventoryCategory = VendorVerticalPermission; // "Grocery" (Kirana) | "Pharmacy" | "Mall"

export type InventoryStatus = "Active" | "Inactive";

export type StockStatusFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "OVERSTOCK";

export type PharmacyExpiryFilter = "ALL" | "VALID" | "EXPIRING_SOON" | "EXPIRED";

export type DrugScheduleClassification =
  | "OTC"
  | "Schedule H"
  | "Schedule H1"
  | "Schedule X"
  | "Schedule G"
  | "Cold-Chain";

export type PharmacyBatch = {
  batchId: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  location: string;
};

export type KiranaSpecificFields = {
  grocerySubcategory: string;
  brand: string;
  unitType: string;
  weightVolume: string;
  mrp: number;
  manufacturingDate: string;
  expiryDate: string;
  storageInformation: string;
};

export type PharmacySpecificFields = {
  medicineName: string;
  genericName: string;
  composition: string;
  manufacturer: string;
  scheduleClassification: DrugScheduleClassification;
  prescriptionRequired: boolean;
  applicableLicenceInfo: string;
  batches: PharmacyBatch[];
};

export type MallSpecificFields = {
  department: string;
  productBrand: string;
  productModel: string;
  productVariant: string;
  size: string;
  colour: string;
  barcode: string;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  warehouseStoreLocation: string;
};

export type InventoryProduct = {
  id: string;
  inventoryCategory: InventoryCategory; // "Grocery" | "Pharmacy" | "Mall"
  // Common Product Fields (Section 4)
  productName: string;
  sku: string;
  barcode: string;
  brand: string;
  productCategory: string;
  description: string;
  productImage: string;
  supplier: string;
  supplierPhone?: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  taxInformation: string; // e.g. "GST 5%", "GST 12%", "GST 18%", "GST 0% (Exempt)"
  gstPercent: 0 | 5 | 12 | 18 | 28;
  unitOfMeasurement: string;
  initialStockQuantity: number;
  stockQuantity: number;
  minimumStockLevel: number;
  maximumStockLevel: number;
  status: InventoryStatus; // "Active" | "Inactive" (Never physically deleted)
  storeLocation: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Category-Specific Fields
  kiranaFields?: KiranaSpecificFields;
  pharmacyFields?: PharmacySpecificFields;
  mallFields?: MallSpecificFields;
};

export type StockTransactionType =
  | "INITIAL_ENTRY"
  | "STOCK_ADDITION"
  | "STOCK_REDUCTION"
  | "STOCK_CORRECTION"
  | "STOCK_TRANSFER"
  | "STOCK_ADJUSTMENT";

export type StockTransaction = {
  id: string;
  referenceNumber: string;
  productId: string;
  sku: string;
  productName: string;
  inventoryCategory: InventoryCategory;
  batchNumber?: string;
  previousQuantity: number;
  quantityDelta: number; // + for added, - for deducted
  newQuantity: number;
  transactionType: StockTransactionType;
  reason: string;
  sourceLocation?: string;
  destinationLocation?: string;
  performedBy: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  createdAt: string;
};

export type AuditOperationType =
  | "INVENTORY_CREATED"
  | "INVENTORY_MODIFIED"
  | "STOCK_ADJUSTED"
  | "SUPPLIER_CHANGED"
  | "PRICE_CHANGED"
  | "STATUS_CHANGED"
  | "BATCH_MODIFIED";

export type AuditFieldChange = {
  field: string;
  before: string | number | boolean;
  after: string | number | boolean;
};

export type InventoryAuditEntry = {
  id: string;
  timestamp: string;
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  operation: AuditOperationType;
  inventoryCategory: InventoryCategory;
  recordId: string;
  sku: string;
  productName: string;
  summary: string;
  changes: AuditFieldChange[];
};

export type RequestUserContext = {
  id: string;
  name: string;
  email: string;
  role?: string;
  allowedVerticals: InventoryCategory[];
  allowedLocations?: string[];
  inventoryPermissions: InventoryRBACPermissions;
};

export type InventorySubRoute =
  | "dashboard"
  | "add-inventory"
  | "list-kirana"
  | "list-pharmacy"
  | "list-mall"
  | "stock-history"
  | "stock-adjustment"
  | "reports";

export const INVENTORY_CATEGORY_META: Record<
  InventoryCategory,
  {
    displayName: string;
    shortName: string;
    icon: string;
    skuPrefix: string;
    barcodePrefix: string;
    productCategories: string[];
    subcategoriesOrDepts: string[];
    units: string[];
    defaultSuppliers: string[];
    locations: string[];
  }
> = {
  Grocery: {
    displayName: "Kirana / Grocery",
    shortName: "Kirana",
    icon: "🛒",
    skuPrefix: "KRN",
    barcodePrefix: "8901",
    productCategories: [
      "Staples & Grains",
      "Pulses & Lentils",
      "Spices & Masalas",
      "Edible Oils & Ghee",
      "Packaged FMCG & Snacks",
      "Bakery, Dairy & Beverages",
      "Dry Fruits & Nuts",
    ],
    subcategoriesOrDepts: [
      "Loose Bulk Grain",
      "Sortex Unpolished Dal",
      "Cold-Pressed / Refined Oil",
      "Whole & Ground Spices",
      "Biscuits & Confectionery",
      "Daily Dairy & Refrigerated",
    ],
    units: ["kg", "grams", "Litre", "ml", "Pack", "Pouch", "Tin (15L)", "Sack (50kg)"],
    defaultSuppliers: [
      "Shree Ganesh Trading Co.",
      "Mahalaxmi Agro Pulses",
      "Metro FMCG Distributors",
      "Annapurna Grain Wholesale",
    ],
    locations: [
      "Main Store — Ground Floor",
      "Kirana Bulk Godown — Wing A",
      "Aisle 1 · Bin S-01",
      "Aisle 2 · Pulse Rack D-04",
      "Cold Chiller Bay C-01",
    ],
  },
  Pharmacy: {
    displayName: "Pharmacy / Medical",
    shortName: "Pharmacy",
    icon: "💊",
    skuPrefix: "PHM",
    barcodePrefix: "8904",
    productCategories: [
      "Antibiotics & Anti-Infectives",
      "Cardiac & Diabetic Care",
      "Analgesics & Antipyretics",
      "Derma & Cosmeceuticals",
      "Respiratory & Syrups",
      "Vitamins & Nutraceuticals",
      "Surgical & Diagnostics",
    ],
    subcategoriesOrDepts: [
      "Schedule H Prescription",
      "Schedule H1 Controlled",
      "OTC Counter Care",
      "Cold-Chain (2°C–8°C)",
      "Injectable / Vial",
    ],
    units: [
      "Strip (10 Tabs)",
      "Strip (15 Tabs)",
      "Bottle (100ml)",
      "Vial / Ampoule",
      "Tube (30g)",
      "Box (10×10 Strips)",
      "Unit / Device",
    ],
    defaultSuppliers: [
      "Apex Medico Pharma Hub",
      "LifeLine BioPharma Distributors",
      "MedPlus Surgical & ColdChain",
      "SunCare Formulations Ltd.",
    ],
    locations: [
      "Pharmacy Cold-Chain & Med Vault",
      "Med Drawer M-14 (Sched H)",
      "OTC Glass Bay G-02",
      "Cold Rack R-2 (2°C–8°C)",
      "Surgical Cabinet S-05",
    ],
  },
  Mall: {
    displayName: "Mall / Supermarket",
    shortName: "Mall",
    icon: "🏬",
    skuPrefix: "MLL",
    barcodePrefix: "8907",
    productCategories: [
      "Apparel & Fashion",
      "Home & Kitchen Appliances",
      "Footwear & Travel Gear",
      "Cosmetics & Personal Care",
      "Consumer Electronics",
      "Home Decor & Furnishings",
    ],
    subcategoriesOrDepts: [
      "Men's & Women's Casualwear",
      "Small Kitchen Appliances",
      "Smart Electronics & Audio",
      "Luxury Fragrance & Beauty",
      "Athletic & Casual Footwear",
      "Bed & Bath Linen",
    ],
    units: ["Piece", "Unit (Boxed)", "Pair", "Set", "Combo Pack", "Master Carton"],
    defaultSuppliers: [
      "VogueLine Retail Apparels",
      "ElectroMart National Distributors",
      "UrbanHome Lifestyle Imports",
      "GlowCosmetics Distribution",
    ],
    locations: [
      "Mall Floor 1 — Apparel & Lifestyle",
      "Mall Floor 2 — Appliances & Electronics",
      "Floor 1 · Bay B-09",
      "Floor 2 · Electronics Zone E-3",
      "Central Mall Warehouse W-2",
    ],
  },
};

export function getBatchExpiryStatus(
  expiryDate: string,
  referenceDateStr = "2026-11-17",
): { status: "VALID" | "EXPIRING_SOON" | "EXPIRED"; daysRemaining: number } {
  if (!expiryDate) return { status: "VALID", daysRemaining: 365 };
  const ref = new Date(referenceDateStr).getTime();
  const exp = new Date(expiryDate).getTime();
  if (Number.isNaN(exp)) return { status: "VALID", daysRemaining: 365 };
  const daysRemaining = Math.ceil((exp - ref) / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) {
    return { status: "EXPIRED", daysRemaining };
  }
  if (daysRemaining <= 90) {
    return { status: "EXPIRING_SOON", daysRemaining };
  }
  return { status: "VALID", daysRemaining };
}

export function getProductExpiryStatus(
  product: InventoryProduct,
  referenceDateStr = "2026-11-17",
): { status: "VALID" | "EXPIRING_SOON" | "EXPIRED"; earliestExpiry: string; daysRemaining: number } {
  if (product.inventoryCategory === "Pharmacy" && product.pharmacyFields?.batches?.length) {
    const activeBatches = product.pharmacyFields.batches.filter((b) => b.quantity > 0);
    const list = activeBatches.length > 0 ? activeBatches : product.pharmacyFields.batches;
    let earliest = list[0];
    for (const b of list) {
      if (b.expiryDate && (!earliest.expiryDate || b.expiryDate < earliest.expiryDate)) {
        earliest = b;
      }
    }
    const res = getBatchExpiryStatus(earliest.expiryDate, referenceDateStr);
    // Also check if any batch with stock is expired
    const anyExpired = list.some(
      (b) => getBatchExpiryStatus(b.expiryDate, referenceDateStr).status === "EXPIRED",
    );
    const anySoon = list.some(
      (b) => getBatchExpiryStatus(b.expiryDate, referenceDateStr).status === "EXPIRING_SOON",
    );
    return {
      status: anyExpired ? "EXPIRED" : anySoon ? "EXPIRING_SOON" : res.status,
      earliestExpiry: earliest.expiryDate,
      daysRemaining: res.daysRemaining,
    };
  }

  if (product.inventoryCategory === "Grocery" && product.kiranaFields?.expiryDate) {
    const res = getBatchExpiryStatus(product.kiranaFields.expiryDate, referenceDateStr);
    return {
      status: res.status,
      earliestExpiry: product.kiranaFields.expiryDate,
      daysRemaining: res.daysRemaining,
    };
  }

  return { status: "VALID", earliestExpiry: "N/A", daysRemaining: 999 };
}

export function getProductStockStatus(
  product: InventoryProduct,
): "OUT_OF_STOCK" | "LOW_STOCK" | "OVERSTOCK" | "IN_STOCK" {
  if (product.stockQuantity <= 0) return "OUT_OF_STOCK";
  if (product.stockQuantity <= product.minimumStockLevel) return "LOW_STOCK";
  if (product.maximumStockLevel > 0 && product.stockQuantity > product.maximumStockLevel) {
    return "OVERSTOCK";
  }
  return "IN_STOCK";
}
