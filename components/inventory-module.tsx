"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { apiFetch } from "@/lib/api-client";
import type { AdminUser } from "@/lib/auth-storage";
import { ALL_LOCATIONS, DEFAULT_INVENTORY_PERMISSIONS } from "@/lib/auth-storage";
import { TablePagination } from "@/components/table-pagination";
import { INVENTORY_SUBROUTE_TO_PATH } from "@/lib/routes";
import {
  INVENTORY_CATEGORY_META,
  getBatchExpiryStatus,
  getProductExpiryStatus,
  getProductStockStatus,
  type AuditOperationType,
  type DrugScheduleClassification,
  type InventoryAuditEntry,
  type InventoryCategory,
  type InventoryProduct,
  type InventoryStatus,
  type InventorySubRoute,
  type PharmacyBatch,
  type PharmacyExpiryFilter,
  type RequestUserContext,
  type StockStatusFilter,
  type StockTransaction,
  type StockTransactionType,
} from "@/lib/inventory-types";

type InventoryModuleProps = {
  currentUser: AdminUser;
  subRoute: InventorySubRoute;
  onNavigateSubRoute: (route: InventorySubRoute) => void;
  onNotify: (msg: string) => void;
};

type DashboardReportResponse = {
  metrics: {
    totalProducts: number;
    totalActiveProducts: number;
    totalInactiveProducts: number;
    totalInventoryCategories: number;
    totalStockQuantity: number;
    lowStockCount: number;
    outOfStockCount: number;
    expiringCount: number;
    totalPurchaseValue: number;
    totalRetailValue: number;
  };
  categorySummary: {
    category: InventoryCategory;
    displayName: string;
    totalProducts: number;
    activeProducts: number;
    totalStockQuantity: number;
    purchaseValue: number;
    retailValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    expiringCount: number;
  }[];
  lowStockProducts: InventoryProduct[];
  outOfStockProducts: InventoryProduct[];
  expiringProducts: InventoryProduct[];
  pharmacyBatchAlerts: {
    productId: string;
    sku: string;
    medicineName: string;
    schedule: string;
    batch: PharmacyBatch;
    expiryStatus: "VALID" | "EXPIRING_SOON" | "EXPIRED";
    daysRemaining: number;
  }[];
  recentTransactions: StockTransaction[];
  auditLogs: InventoryAuditEntry[];
};

export function InventoryModule({
  currentUser,
  subRoute,
  onNavigateSubRoute,
  onNotify,
}: InventoryModuleProps) {
  const permittedVerticals = useMemo<InventoryCategory[]>(
    () =>
      currentUser.allowedVerticals && currentUser.allowedVerticals.length > 0
        ? currentUser.allowedVerticals
        : ["Grocery", "Pharmacy", "Mall"],
    [currentUser.allowedVerticals],
  );

  const invPerms = useMemo(
    () => currentUser.inventoryPermissions ?? DEFAULT_INVENTORY_PERMISSIONS,
    [currentUser.inventoryPermissions],
  );

  const userContextHeader = useMemo(() => {
    const ctx: RequestUserContext = {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      allowedVerticals: permittedVerticals,
      allowedLocations: currentUser.allowedLocations ?? ["ALL"],
      inventoryPermissions: invPerms,
    };
    return encodeURIComponent(JSON.stringify(ctx));
  }, [currentUser, permittedVerticals, invPerms]);

  // Determine active listing category when on one of the 3 independent listing pages
  const activeListCategory: InventoryCategory = useMemo(() => {
    if (subRoute === "list-pharmacy") return "Pharmacy";
    if (subRoute === "list-mall") return "Mall";
    return "Grocery";
  }, [subRoute]);

  // ==================== 1. DASHBOARD & REPORTS STATE ====================
  const [dashboardData, setDashboardData] = useState<DashboardReportResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardCategoryFilter, setDashboardCategoryFilter] = useState<
    InventoryCategory | "ALL"
  >("ALL");

  // ==================== 2. LISTING PAGE STATE (KIRANA / PHARMACY / MALL) ====================
  const [listItems, setListItems] = useState<InventoryProduct[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listPagination, setListPagination] = useState({
    page: 1,
    pageSize: 8,
    totalRecords: 0,
    totalPages: 1,
  });
  const [listFacets, setListFacets] = useState<{
    categories: string[];
    brands: string[];
    suppliers: string[];
  }>({ categories: [], brands: [], suppliers: [] });

  // Search & Debounce
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Filters
  const [filterProductCategory, setFilterProductCategory] = useState("ALL");
  const [filterBrand, setFilterBrand] = useState("ALL");
  const [filterSupplier, setFilterSupplier] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "Active" | "Inactive">("ALL");
  const [filterStockStatus, setFilterStockStatus] = useState<StockStatusFilter>("ALL");
  const [filterExpiryStatus, setFilterExpiryStatus] = useState<PharmacyExpiryFilter>("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortBy, setSortBy] = useState<
    | "productName"
    | "sku"
    | "brand"
    | "stockQuantity"
    | "purchasePrice"
    | "sellingPrice"
    | "status"
    | "updatedAt"
  >("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [exportScope, setExportScope] = useState<"filtered" | "all">("filtered");
  const [exportingFormat, setExportingFormat] = useState<"" | "excel" | "pdf">("");

  // ==================== 3. VIEW & EDIT MODALS STATE ====================
  const [viewingProduct, setViewingProduct] = useState<InventoryProduct | null>(null);
  const [viewingProductTxns, setViewingProductTxns] = useState<StockTransaction[]>([]);
  const [viewingProductAudits, setViewingProductAudits] = useState<InventoryAuditEntry[]>([]);
  const [viewModalLoading, setViewModalLoading] = useState(false);

  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<string[]>([]);

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // ==================== 4. ADD INVENTORY FORM STATE (Section 4) ====================
  const [addCategory, setAddCategory] = useState<InventoryCategory>(permittedVerticals[0] || "Grocery");
  const [addProductName, setAddProductName] = useState("");
  const [addSku, setAddSku] = useState("KRN-5010");
  const [addBarcode, setAddBarcode] = useState("8901050100018");
  const [addBrand, setAddBrand] = useState("");
  const [addProductCategory, setAddProductCategory] = useState(
    INVENTORY_CATEGORY_META.Grocery.productCategories[0],
  );
  const [addDescription, setAddDescription] = useState("");
  const [addProductImage, setAddProductImage] = useState("/window.svg");
  const [addSupplier, setAddSupplier] = useState(
    INVENTORY_CATEGORY_META.Grocery.defaultSuppliers[0],
  );
  const [addSupplierPhone] = useState("+91 98201 44120");
  const [addPurchasePrice, setAddPurchasePrice] = useState("85");
  const [addSellingPrice, setAddSellingPrice] = useState("105");
  const [addMrp, setAddMrp] = useState("115");
  const [addGstPercent, setAddGstPercent] = useState<0 | 5 | 12 | 18 | 28>(5);
  const [addTaxInfo, setAddTaxInfo] = useState("GST 5%");
  const [addUnit, setAddUnit] = useState("kg");
  const [addInitialStock, setAddInitialStock] = useState("50");
  const [addMinStock, setAddMinStock] = useState("15");
  const [addMaxStock, setAddMaxStock] = useState("250");
  const [addStatus, setAddStatus] = useState<InventoryStatus>("Active");
  const [addLocation, setAddLocation] = useState("Main Store — Ground Floor");

  // Kirana-Specific Form State
  const [krnSubcategory, setKrnSubcategory] = useState(
    INVENTORY_CATEGORY_META.Grocery.subcategoriesOrDepts[0],
  );
  const [krnWeightVolume, setKrnWeightVolume] = useState("25 kg HDPE Bulk Sack");
  const [krnMfgDate, setKrnMfgDate] = useState("2026-10-01");
  const [krnExpDate, setKrnExpDate] = useState("2027-09-30");
  const [krnStorageInfo, setKrnStorageInfo] = useState("Aisle 1 · Dry Grain Bin B-02");

  // Pharmacy-Specific Form State (with Multi-Batch Builder!)
  const [phmMedicineName, setPhmMedicineName] = useState("");
  const [phmGenericName, setPhmGenericName] = useState("");
  const [phmComposition, setPhmComposition] = useState("");
  const [phmManufacturer, setPhmManufacturer] = useState("Cipla Health Lifesciences Ltd.");
  const [phmSchedule, setPhmSchedule] = useState<DrugScheduleClassification>("Schedule H");
  const [phmRxRequired, setPhmRxRequired] = useState(true);
  const [phmLicenceInfo, setPhmLicenceInfo] = useState("DL-20B/21B-MH-MZ1-449812");
  const [phmBatches, setPhmBatches] = useState<PharmacyBatch[]>([
    {
      batchId: "bat-init-1",
      batchNumber: "PH-2611-A1",
      manufacturingDate: "2026-06-01",
      expiryDate: "2028-05-31",
      quantity: 30,
      purchasePrice: 85,
      sellingPrice: 112,
      mrp: 125,
      location: "Med Drawer M-14 (Sched H)",
    },
  ]);

  // Mall-Specific Form State
  const [mllDepartment, setMllDepartment] = useState(
    INVENTORY_CATEGORY_META.Mall.subcategoriesOrDepts[0],
  );
  const [mllModel, setMllModel] = useState("UW-2026-PRO");
  const [mllVariant, setMllVariant] = useState("Regular Fit / Standard Edition");
  const [mllSize, setMllSize] = useState("L (42)");
  const [mllColour, setMllColour] = useState("Navy Blue");
  const [mllWarehouseLoc, setMllWarehouseLoc] = useState("Floor 1 · Bay B-09");

  const [addFormErrors, setAddFormErrors] = useState<string[]>([]);
  const [addSubmitting, setAddSubmitting] = useState(false);

  // ==================== 5. STOCK HISTORY & STOCK ADJUSTMENT STATE ====================
  const [stockTxns, setStockTxns] = useState<StockTransaction[]>([]);
  const [stockTxnsLoading, setStockTxnsLoading] = useState(false);
  const [stockTxnPagination, setStockTxnPagination] = useState({
    page: 1,
    pageSize: 10,
    totalRecords: 0,
    totalPages: 1,
  });
  const [txnFilterCategory, setTxnFilterCategory] = useState<InventoryCategory | "ALL">("ALL");
  const [txnFilterType, setTxnFilterType] = useState<StockTransactionType | "ALL">("ALL");
  const [txnSearch, setTxnSearch] = useState("");
  const [txnDateFrom, setTxnDateFrom] = useState("");
  const [txnDateTo, setTxnDateTo] = useState("");
  const [txnProductIdFilter, setTxnProductIdFilter] = useState<string>("");

  // Stock Adjustment Form State
  const [allAuthorizedProducts, setAllAuthorizedProducts] = useState<InventoryProduct[]>([]);
  const [adjCategory, setAdjCategory] = useState<InventoryCategory>(
    permittedVerticals[0] || "Grocery",
  );
  const [adjProductId, setAdjProductId] = useState("");
  const [adjType, setAdjType] = useState<StockTransactionType>("STOCK_ADDITION");
  const [adjQuantity, setAdjQuantity] = useState("10");
  const [adjReason, setAdjReason] = useState("");
  const [adjReference, setAdjReference] = useState("");
  const [adjBatchMode, setAdjBatchMode] = useState<"existing" | "new">("existing");
  const [adjBatchNumber, setAdjBatchNumber] = useState("");
  const [adjNewBatchNo, setAdjNewBatchNo] = useState("PH-2611-NEW");
  const [adjNewBatchMfg] = useState("2026-10-01");
  const [adjNewBatchExp, setAdjNewBatchExp] = useState("2028-09-30");
  const [adjNewBatchCost, setAdjNewBatchCost] = useState("95");
  const [adjDestLocation, setAdjDestLocation] = useState("Main Store — Ground Floor");
  const [adjSubmitting, setAdjSubmitting] = useState(false);
  const [adjError, setAdjError] = useState("");

  // ==================== 6. REPORTS & AUDIT LOGS STATE ====================
  const [activeReportTab, setActiveReportTab] = useState<
    "valuation" | "low-stock" | "pharmacy-expiry" | "audit-trail"
  >("valuation");
  const [auditLogs, setAuditLogs] = useState<InventoryAuditEntry[]>([]);
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    pageSize: 12,
    totalRecords: 0,
    totalPages: 1,
  });
  const [auditSearch, setAuditSearch] = useState("");
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<InventoryCategory | "ALL">("ALL");
  const [auditOpFilter, setAuditOpFilter] = useState<AuditOperationType | "ALL">("ALL");
  const [auditLoading, setAuditLoading] = useState(false);

  // Additional Pagination States so EVERY listing table has full pagination
  const [threshPage, setThreshPage] = useState(1);
  const [threshPageSize, setThreshPageSize] = useState(4);
  const [threshCollapseOpen, setThreshCollapseOpen] = useState(false);
  const [valPage, setValPage] = useState(1);
  const [valPageSize, setValPageSize] = useState(5);
  const [lowReportPage, setLowReportPage] = useState(1);
  const [lowReportPageSize, setLowReportPageSize] = useState(5);
  const [phmExpPage, setPhmExpPage] = useState(1);
  const [phmExpPageSize, setPhmExpPageSize] = useState(5);

  // Debounce search input (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setListPagination((prev) => ({ ...prev, page: 1 }));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset filters when switching between Kirana, Pharmacy, and Mall listing pages
  useEffect(() => {
    queueMicrotask(() => {
      if (
        subRoute === "list-kirana" ||
        subRoute === "list-pharmacy" ||
        subRoute === "list-mall"
      ) {
        setFilterProductCategory("ALL");
        setFilterBrand("ALL");
        setFilterSupplier("ALL");
        setFilterStatus("ALL");
        setFilterStockStatus("ALL");
        setFilterExpiryStatus("ALL");
        setFilterDateFrom("");
        setFilterDateTo("");
        setSearchInput("");
        setDebouncedSearch("");
        setListPagination((prev) => ({ ...prev, page: 1 }));
      }
    });
  }, [subRoute]);

  // Keep Add Category aligned with permitted verticals
  useEffect(() => {
    queueMicrotask(() => {
      if (!permittedVerticals.includes(addCategory)) {
        handleSwitchAddCategory(permittedVerticals[0]);
      }
      if (!permittedVerticals.includes(adjCategory)) {
        setAdjCategory(permittedVerticals[0]);
      }
    });
  }, [permittedVerticals, addCategory, adjCategory]);

  // Fetch Dashboard & Reports Data
  const fetchDashboardData = useCallback(async () => {
    if (!invPerms.viewInventory) return;
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const res = await apiFetch(
        `/api/inventory/reports?mode=dashboard&category=${dashboardCategoryFilter}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load inventory dashboard.");
      }
      setDashboardData(data as DashboardReportResponse);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setDashboardLoading(false);
    }
  }, [invPerms.viewInventory, dashboardCategoryFilter, userContextHeader]);

  // Fetch Listing Page Data (Server-Side Pagination, Sorting & Filtering)
  const fetchInventoryList = useCallback(async () => {
    if (!invPerms.viewInventory) return;
    if (!permittedVerticals.includes(activeListCategory)) {
      setListItems([]);
      setListError(
        `Access Restricted: Your user profile does not have permission for ${INVENTORY_CATEGORY_META[activeListCategory].displayName}.`,
      );
      return;
    }

    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({
        category: activeListCategory,
        search: debouncedSearch,
        productCategory: filterProductCategory,
        brand: filterBrand,
        supplier: filterSupplier,
        status: filterStatus,
        stockStatus: filterStockStatus,
        expiryStatus: filterExpiryStatus,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        sortBy,
        sortOrder,
        page: String(listPagination.page),
        pageSize: String(listPagination.pageSize),
      });

      const res = await apiFetch(`/api/inventory?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load inventory records.");
      }
      setListItems(data.items || []);
      setListPagination(data.pagination);
      setListFacets(data.facets || { categories: [], brands: [], suppliers: [] });
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Error loading inventory list.");
    } finally {
      setListLoading(false);
    }
  }, [
    invPerms.viewInventory,
    permittedVerticals,
    activeListCategory,
    debouncedSearch,
    filterProductCategory,
    filterBrand,
    filterSupplier,
    filterStatus,
    filterStockStatus,
    filterExpiryStatus,
    filterDateFrom,
    filterDateTo,
    sortBy,
    sortOrder,
    listPagination.page,
    listPagination.pageSize,
    userContextHeader,
  ]);

  // Fetch Stock Transactions History
  const fetchStockHistory = useCallback(async () => {
    if (!invPerms.viewStockHistory) return;
    setStockTxnsLoading(true);
    try {
      const params = new URLSearchParams({
        category: txnFilterCategory,
        transactionType: txnFilterType,
        search: txnSearch,
        dateFrom: txnDateFrom,
        dateTo: txnDateTo,
        page: String(stockTxnPagination.page),
        pageSize: String(stockTxnPagination.pageSize),
      });
      if (txnProductIdFilter) {
        params.set("productId", txnProductIdFilter);
      }

      const res = await apiFetch(`/api/inventory/stock?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setStockTxns(data.items || []);
        setStockTxnPagination(data.pagination);
      }
    } finally {
      setStockTxnsLoading(false);
    }
  }, [
    invPerms.viewStockHistory,
    txnFilterCategory,
    txnFilterType,
    txnSearch,
    txnDateFrom,
    txnDateTo,
    txnProductIdFilter,
    stockTxnPagination.page,
    stockTxnPagination.pageSize,
    userContextHeader,
  ]);

  // Fetch all authorized products for the Stock Adjustment selector
  const fetchAuthorizedProductsForAdjustment = useCallback(async () => {
    if (!invPerms.viewInventory) return;
    try {
      const res = await apiFetch(`/api/inventory?category=ALL&pageSize=200`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) {
        setAllAuthorizedProducts(data.items);
      }
    } catch {
      // ignore
    }
  }, [invPerms.viewInventory, userContextHeader]);

  // Fetch Audit Logs for Reports
  const fetchAuditHistory = useCallback(async () => {
    if (!invPerms.viewReports) return;
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        mode: "audit",
        category: auditCategoryFilter,
        operation: auditOpFilter,
        search: auditSearch,
        page: String(auditPagination.page),
        pageSize: String(auditPagination.pageSize),
      });
      const res = await apiFetch(`/api/inventory/reports?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data.items || []);
        setAuditPagination(data.pagination);
      }
    } finally {
      setAuditLoading(false);
    }
  }, [
    invPerms.viewReports,
    auditCategoryFilter,
    auditOpFilter,
    auditSearch,
    auditPagination.page,
    auditPagination.pageSize,
    userContextHeader,
  ]);

  // Trigger appropriate fetch when subRoute or dependencies change
  useEffect(() => {
    queueMicrotask(() => {
      fetchAuthorizedProductsForAdjustment();
      if (subRoute === "dashboard" || subRoute === "reports") {
        fetchDashboardData();
      }
      if (
        subRoute === "list-kirana" ||
        subRoute === "list-pharmacy" ||
        subRoute === "list-mall"
      ) {
        fetchInventoryList();
      }
      if (subRoute === "stock-history") {
        fetchStockHistory();
      }
      if (subRoute === "stock-adjustment") {
        fetchStockHistory();
      }
      if (subRoute === "reports") {
        fetchAuditHistory();
      }
    });
  }, [
    subRoute,
    fetchDashboardData,
    fetchInventoryList,
    fetchStockHistory,
    fetchAuthorizedProductsForAdjustment,
    fetchAuditHistory,
  ]);

  // Keep Stock Adjustment selected product & batch synced with selected category
  const adjCategoryProducts = useMemo(
    () => allAuthorizedProducts.filter((p) => p.inventoryCategory === adjCategory),
    [allAuthorizedProducts, adjCategory],
  );

  const selectedAdjProduct = useMemo(
    () =>
      adjCategoryProducts.find((p) => p.id === adjProductId) ||
      adjCategoryProducts[0] ||
      null,
    [adjCategoryProducts, adjProductId],
  );

  useEffect(() => {
    queueMicrotask(() => {
      if (selectedAdjProduct && selectedAdjProduct.id !== adjProductId) {
        setAdjProductId(selectedAdjProduct.id);
      }
      if (
        selectedAdjProduct?.inventoryCategory === "Pharmacy" &&
        selectedAdjProduct.pharmacyFields?.batches?.length
      ) {
        const firstBatch = selectedAdjProduct.pharmacyFields.batches[0].batchNumber;
        if (
          !adjBatchNumber ||
          !selectedAdjProduct.pharmacyFields.batches.some((b) => b.batchNumber === adjBatchNumber)
        ) {
          setAdjBatchNumber(firstBatch);
        }
      }
    });
  }, [selectedAdjProduct, adjProductId, adjBatchNumber]);

  // ==================== HANDLERS ====================

  function handleSwitchAddCategory(cat: InventoryCategory) {
    const meta = INVENTORY_CATEGORY_META[cat];
    const rand4 = Math.floor(1000 + Math.random() * 8999);
    const rand8 = Math.floor(10000000 + Math.random() * 89999999);
    setAddCategory(cat);
    setAddSku(`${meta.skuPrefix}-${rand4}`);
    setAddBarcode(`${meta.barcodePrefix}${rand8}9`);
    setAddProductCategory(meta.productCategories[0]);
    setAddUnit(meta.units[0]);
    setAddSupplier(meta.defaultSuppliers[0]);
    setAddLocation(meta.locations[0]);
    setAddFormErrors([]);
  }

  function handleAddPharmacyBatchRow() {
    const nextIdx = phmBatches.length + 1;
    setPhmBatches((prev) => [
      ...prev,
      {
        batchId: `bat-new-${Date.now()}-${nextIdx}`,
        batchNumber: `PH-2611-B${nextIdx}`,
        manufacturingDate: "2026-08-01",
        expiryDate: "2028-07-31",
        quantity: 20,
        purchasePrice: Number(addPurchasePrice) || 85,
        sellingPrice: Number(addSellingPrice) || 112,
        mrp: Number(addMrp) || 125,
        location: addLocation,
      },
    ]);
  }

  function handleRemovePharmacyBatchRow(batchId: string) {
    if (phmBatches.length <= 1) {
      onNotify("Pharmacy medicine must have at least one batch.");
      return;
    }
    setPhmBatches((prev) => prev.filter((b) => b.batchId !== batchId));
  }

  function handleUpdatePharmacyBatchRow(
    batchId: string,
    field: keyof PharmacyBatch,
    value: string | number,
  ) {
    setPhmBatches((prev) =>
      prev.map((b) => (b.batchId === batchId ? { ...b, [field]: value } : b)),
    );
  }

  async function handleSubmitAddInventory(e: FormEvent) {
    e.preventDefault();
    setAddFormErrors([]);

    if (!invPerms.addInventory) {
      setAddFormErrors(["Permission denied: You do not have 'Add Inventory' permission."]);
      return;
    }

    const totalPhmStock = phmBatches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
    const effectiveInitStock =
      addCategory === "Pharmacy" ? totalPhmStock : Number(addInitialStock) || 0;

    const payload: Partial<InventoryProduct> = {
      inventoryCategory: addCategory,
      productName:
        addCategory === "Pharmacy" && phmMedicineName.trim()
          ? phmMedicineName.trim()
          : addProductName.trim(),
      sku: addSku.trim(),
      barcode: addBarcode.trim(),
      brand: addBrand.trim(),
      productCategory: addProductCategory,
      description: addDescription.trim(),
      productImage: addProductImage.trim() || "/window.svg",
      supplier: addSupplier.trim(),
      supplierPhone: addSupplierPhone.trim(),
      purchasePrice: Number(addPurchasePrice),
      sellingPrice: Number(addSellingPrice),
      mrp: Number(addMrp),
      gstPercent: addGstPercent,
      taxInformation: addTaxInfo.trim() || `GST ${addGstPercent}%`,
      unitOfMeasurement: addUnit,
      initialStockQuantity: effectiveInitStock,
      stockQuantity: effectiveInitStock,
      minimumStockLevel: Number(addMinStock),
      maximumStockLevel: Number(addMaxStock),
      status: addStatus,
      storeLocation: addLocation,
      kiranaFields:
        addCategory === "Grocery"
          ? {
              grocerySubcategory: krnSubcategory,
              brand: addBrand.trim(),
              unitType: addUnit,
              weightVolume: krnWeightVolume.trim(),
              mrp: Number(addMrp),
              manufacturingDate: krnMfgDate,
              expiryDate: krnExpDate,
              storageInformation: krnStorageInfo.trim(),
            }
          : undefined,
      pharmacyFields:
        addCategory === "Pharmacy"
          ? {
              medicineName: (phmMedicineName || addProductName).trim(),
              genericName: phmGenericName.trim(),
              composition: phmComposition.trim(),
              manufacturer: phmManufacturer.trim(),
              scheduleClassification: phmSchedule,
              prescriptionRequired: phmRxRequired,
              applicableLicenceInfo: phmLicenceInfo.trim(),
              batches: phmBatches.map((b) => ({
                ...b,
                quantity: Number(b.quantity) || 0,
                purchasePrice: Number(b.purchasePrice) || Number(addPurchasePrice),
                sellingPrice: Number(b.sellingPrice) || Number(addSellingPrice),
                mrp: Number(b.mrp) || Number(addMrp),
              })),
            }
          : undefined,
      mallFields:
        addCategory === "Mall"
          ? {
              department: mllDepartment,
              productBrand: addBrand.trim(),
              productModel: mllModel.trim(),
              productVariant: mllVariant.trim(),
              size: mllSize.trim(),
              colour: mllColour.trim(),
              barcode: addBarcode.trim(),
              mrp: Number(addMrp),
              purchasePrice: Number(addPurchasePrice),
              sellingPrice: Number(addSellingPrice),
              warehouseStoreLocation: mllWarehouseLoc.trim() || addLocation,
            }
          : undefined,
    };

    setAddSubmitting(true);
    try {
      const res = await apiFetch("/api/inventory", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddFormErrors(data.errors || [data.error || "Validation failed."]);
        return;
      }

      const created: InventoryProduct = data.product;
      onNotify(
        `Created ${INVENTORY_CATEGORY_META[created.inventoryCategory].displayName} product "${created.productName}" (${created.sku}) with initial stock transaction ${data.transaction.referenceNumber}!`,
      );

      // Reset form & navigate to that category's listing page
      setAddProductName("");
      setPhmMedicineName("");
      handleSwitchAddCategory(addCategory);
      fetchAuthorizedProductsForAdjustment();

      if (addCategory === "Grocery") onNavigateSubRoute("list-kirana");
      else if (addCategory === "Pharmacy") onNavigateSubRoute("list-pharmacy");
      else onNavigateSubRoute("list-mall");
    } catch {
      setAddFormErrors(["Network error while creating inventory product."]);
    } finally {
      setAddSubmitting(false);
    }
  }

  function handleSortColumn(
    column:
      | "productName"
      | "sku"
      | "brand"
      | "stockQuantity"
      | "purchasePrice"
      | "sellingPrice"
      | "status"
      | "updatedAt",
  ) {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  }

  async function handleExportInventory(
    format: "excel" | "pdf",
    categoryOverride?: InventoryCategory | "ALL",
  ) {
    if (!invPerms.exportInventory) {
      onNotify("Permission denied: Your role does not have 'Export Inventory' permission.");
      return;
    }
    const targetCat = categoryOverride ?? activeListCategory;
    setExportingFormat(format);
    try {
      const params = new URLSearchParams({
        category: targetCat,
        format,
        scope: exportScope,
        search: debouncedSearch,
        productCategory: filterProductCategory,
        brand: filterBrand,
        supplier: filterSupplier,
        status: filterStatus,
        stockStatus: filterStockStatus,
        expiryStatus: filterExpiryStatus,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        sortBy,
        sortOrder,
      });

      const res = await apiFetch(`/api/inventory/export?${params.toString()}`);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Export failed.");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename =
        filenameMatch?.[1] ||
        `inventory-export-${targetCat.toLowerCase()}.${format === "excel" ? "xls" : "pdf"}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      onNotify(
        `Exported ${exportScope === "all" ? "all authorized" : "filtered"} ${
          targetCat === "ALL" ? "multi-category" : INVENTORY_CATEGORY_META[targetCat].displayName
        } records to ${format.toUpperCase()} (${filename}).`,
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportingFormat("");
    }
  }

  async function openViewModal(product: InventoryProduct) {
    setViewingProduct(product);
    setViewModalLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${product.id}`);
      const data = await res.json();
      if (res.ok) {
        setViewingProduct(data.product);
        setViewingProductTxns(data.transactions || []);
        setViewingProductAudits(data.auditLogs || []);
      }
    } finally {
      setViewModalLoading(false);
    }
  }

  function openEditModal(product: InventoryProduct) {
    if (!invPerms.editInventory) {
      onNotify("Permission denied: Your account does not have 'Edit Inventory' permission.");
      return;
    }
    setEditingProduct(JSON.parse(JSON.stringify(product)));
    setEditErrors([]);
  }

  async function saveEditedProduct(e: FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    setEditSaving(true);
    setEditErrors([]);
    try {
      const res = await apiFetch(`/api/inventory/${editingProduct.id}`, {
        method: "PUT",
        body: JSON.stringify(editingProduct),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditErrors(data.errors || [data.error || "Failed to update product."]);
        return;
      }
      onNotify(
        `Updated "${data.product.productName}" (${data.product.sku}) and recorded ${
          data.auditEntries?.length || 1
        } audit log entry(s).`,
      );
      setEditingProduct(null);
      fetchInventoryList();
      fetchDashboardData();
      fetchAuthorizedProductsForAdjustment();
    } catch {
      setEditErrors(["Network error while saving inventory modifications."]);
    } finally {
      setEditSaving(false);
    }
  }

  function toggleProductActiveStatusWithConfirmation(product: InventoryProduct) {
    if (!invPerms.editInventory) {
      onNotify("Permission denied: You cannot modify product status.");
      return;
    }
    const nextStatus: InventoryStatus = product.status === "Active" ? "Inactive" : "Active";
    setConfirmDialog({
      title: `${nextStatus === "Inactive" ? "Deactivate" : "Activate"} Inventory Record?`,
      message:
        nextStatus === "Inactive"
          ? `Are you sure you want to mark "${product.productName}" (${product.sku}) as Inactive? Per governance rules, inventory records are never deleted and remain preserved in historical stock and audit ledgers.`
          : `Re-activate "${product.productName}" (${product.sku}) for active store operations?`,
      confirmLabel: nextStatus === "Inactive" ? "Mark Inactive" : "Mark Active",
      danger: nextStatus === "Inactive",
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await apiFetch(`/api/inventory/${product.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: nextStatus }),
        });
        if (res.ok) {
          onNotify(
            `Changed status of "${product.productName}" (${product.sku}) to ${nextStatus} (logged in Audit History).`,
          );
          fetchInventoryList();
          fetchDashboardData();
          fetchAuthorizedProductsForAdjustment();
        } else {
          const err = await res.json().catch(() => ({}));
          onNotify(err.error || "Could not update status.");
        }
      },
    });
  }

  function handleStockAdjustmentSubmit(e: FormEvent) {
    e.preventDefault();
    setAdjError("");
    if (!invPerms.adjustStock) {
      setAdjError("Permission denied: Your account does not have 'Adjust Stock' permission.");
      return;
    }
    if (!selectedAdjProduct) {
      setAdjError("Please select a product.");
      return;
    }
    if (!adjReason.trim()) {
      setAdjError("A mandatory transaction reason is required for every stock modification.");
      return;
    }
    const qty = Number(adjQuantity);
    if (!Number.isFinite(qty) || qty < 0) {
      setAdjError("Please enter a valid non-negative quantity.");
      return;
    }

    setConfirmDialog({
      title: "Confirm Stock Transaction",
      message: `Execute ${adjType.replace("STOCK_", "")} of ${qty} ${
        selectedAdjProduct.unitOfMeasurement
      } on "${selectedAdjProduct.productName}" (${selectedAdjProduct.sku})? Reason: "${adjReason.trim()}". This will generate an immutable Stock Transaction and Audit Log.`,
      confirmLabel: "Commit Stock Transaction",
      danger: adjType === "STOCK_REDUCTION" || adjType === "STOCK_ADJUSTMENT",
      onConfirm: async () => {
        setConfirmDialog(null);
        setAdjSubmitting(true);
        try {
          const res = await apiFetch("/api/inventory/stock", {
            method: "POST",
            body: JSON.stringify({
              productId: selectedAdjProduct.id,
              transactionType: adjType,
              quantity: qty,
              reason: adjReason.trim(),
              referenceNumber: adjReference.trim() || undefined,
              batchNumber:
                selectedAdjProduct.inventoryCategory === "Pharmacy" &&
                adjBatchMode === "existing"
                  ? adjBatchNumber
                  : undefined,
              newBatch:
                selectedAdjProduct.inventoryCategory === "Pharmacy" &&
                adjBatchMode === "new" &&
                adjType === "STOCK_ADDITION"
                  ? {
                      batchNumber: adjNewBatchNo.trim(),
                      manufacturingDate: adjNewBatchMfg,
                      expiryDate: adjNewBatchExp,
                      purchasePrice: Number(adjNewBatchCost) || selectedAdjProduct.purchasePrice,
                    }
                  : undefined,
              sourceLocation: selectedAdjProduct.storeLocation,
              destinationLocation:
                adjType === "STOCK_TRANSFER"
                  ? adjDestLocation
                  : selectedAdjProduct.storeLocation,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setAdjError(data.error || "Stock operation failed.");
            return;
          }
          onNotify(
            `Stock transaction ${data.transaction.referenceNumber} committed: ${data.product.productName} (${data.transaction.previousQuantity} → ${data.transaction.newQuantity} ${data.product.unitOfMeasurement}).`,
          );
          setAdjReason("");
          setAdjReference("");
          fetchAuthorizedProductsForAdjustment();
          fetchStockHistory();
          fetchDashboardData();
        } catch {
          setAdjError("Network error while executing stock transaction.");
        } finally {
          setAdjSubmitting(false);
        }
      },
    });
  }

  // ==================== RENDER HELPERS ====================

  function renderStockBadge(product: InventoryProduct) {
    const st = getProductStockStatus(product);
    if (st === "OUT_OF_STOCK") {
      return <span className="pill alert-month">Out of Stock (0)</span>;
    }
    if (st === "LOW_STOCK") {
      return (
        <span className="pill waiting">
          Low Stock ({product.stockQuantity} &le; {product.minimumStockLevel})
        </span>
      );
    }
    if (st === "OVERSTOCK") {
      return <span className="pill in-review">Overstock ({product.stockQuantity})</span>;
    }
    return <span className="pill ready">In Stock ({product.stockQuantity})</span>;
  }

  function renderExpiryBadge(product: InventoryProduct) {
    const exp = getProductExpiryStatus(product);
    if (exp.earliestExpiry === "N/A") {
      return <small>Non-Perishable</small>;
    }
    if (exp.status === "EXPIRED") {
      return (
        <span className="pill alert-month">
          🚨 Expired ({exp.earliestExpiry})
        </span>
      );
    }
    if (exp.status === "EXPIRING_SOON") {
      return (
        <span className="pill waiting">
          ⚠ Expiring in {exp.daysRemaining}d ({exp.earliestExpiry})
        </span>
      );
    }
    return (
      <span className="pill ready">
        Valid ({exp.earliestExpiry})
      </span>
    );
  }

  const addCatMeta = INVENTORY_CATEGORY_META[addCategory];

  // Determine the active category scope for the current page (Kirana, Pharmacy, Mall, or ALL permitted)
  const currentPageCategoryScope: InventoryCategory | "ALL" = (() => {
    if (subRoute === "list-kirana") return "Grocery";
    if (subRoute === "list-pharmacy") return "Pharmacy";
    if (subRoute === "list-mall") return "Mall";
    if (subRoute === "add-inventory") return addCategory;
    if (subRoute === "stock-adjustment") return adjCategory;
    if (subRoute === "stock-history") return txnFilterCategory;
    if (subRoute === "reports") return auditCategoryFilter;
    return dashboardCategoryFilter;
  })();

  const currentPageScopeLabel =
    currentPageCategoryScope === "ALL"
      ? permittedVerticals
          .map((v) => INVENTORY_CATEGORY_META[v].displayName)
          .join(" + ")
      : INVENTORY_CATEGORY_META[currentPageCategoryScope].displayName;

  // Permission-based & page-scoped Stock <= Threshold filter
  const canViewThresholdAlerts =
    invPerms.viewInventory &&
    invPerms.viewStock &&
    (currentPageCategoryScope === "ALL" ||
      permittedVerticals.includes(currentPageCategoryScope));

  const pageThresholdStockItems = canViewThresholdAlerts
    ? allAuthorizedProducts.filter((item) => {
        if (!permittedVerticals.includes(item.inventoryCategory)) return false;
        if (
          currentPageCategoryScope !== "ALL" &&
          item.inventoryCategory !== currentPageCategoryScope
        ) {
          return false;
        }
        return item.stockQuantity <= item.minimumStockLevel;
      })
    : [];

  function handleReplenishFromThresholdAlert(item: InventoryProduct) {
    setAdjCategory(item.inventoryCategory);
    setAdjProductId(item.id);
    setAdjType("STOCK_ADDITION");
    const suggestedAdd = Math.max(
      10,
      Number((item.minimumStockLevel * 2 - item.stockQuantity).toFixed(2)),
    );
    setAdjQuantity(String(suggestedAdd));
    setAdjReason(
      `Threshold replenishment for ${item.sku} (Current: ${item.stockQuantity} <= Min Threshold: ${item.minimumStockLevel})`,
    );
    onNavigateSubRoute("stock-adjustment");
  }

  return (
    <div className="kirana-section-stack">
      {/* Sub-Navigation Pills Bar for Inventory Module (react-router-dom NavLinks) */}
      <div className="inventory-subnav-bar" role="navigation" aria-label="Inventory Module Navigation">
        <NavLink
          to={INVENTORY_SUBROUTE_TO_PATH.dashboard}
          className={({ isActive }) =>
            `inv-navlink-pill${isActive || subRoute === "dashboard" ? " active" : ""}`
          }
        >
          📊 Inventory Dashboard
        </NavLink>
        {invPerms.addInventory && (
          <NavLink
            to={INVENTORY_SUBROUTE_TO_PATH["add-inventory"]}
            className={({ isActive }) =>
              `inv-navlink-pill${isActive || subRoute === "add-inventory" ? " active" : ""}`
            }
          >
            ＋ Add Inventory
          </NavLink>
        )}
        {permittedVerticals.includes("Grocery") && (
          <NavLink
            to={INVENTORY_SUBROUTE_TO_PATH["list-kirana"]}
            className={({ isActive }) =>
              `inv-navlink-pill${
                isActive || subRoute === "list-kirana" ? " active grocery" : ""
              }`
            }
          >
            🛒 Kirana List
          </NavLink>
        )}
        {permittedVerticals.includes("Pharmacy") && (
          <NavLink
            to={INVENTORY_SUBROUTE_TO_PATH["list-pharmacy"]}
            className={({ isActive }) =>
              `inv-navlink-pill${
                isActive || subRoute === "list-pharmacy" ? " active pharmacy" : ""
              }`
            }
          >
            💊 Pharmacy List
          </NavLink>
        )}
        {permittedVerticals.includes("Mall") && (
          <NavLink
            to={INVENTORY_SUBROUTE_TO_PATH["list-mall"]}
            className={({ isActive }) =>
              `inv-navlink-pill${isActive || subRoute === "list-mall" ? " active mall" : ""}`
            }
          >
            🏬 Mall List
          </NavLink>
        )}
        {invPerms.viewStockHistory && (
          <NavLink
            to={INVENTORY_SUBROUTE_TO_PATH["stock-history"]}
            onClick={() => setTxnProductIdFilter("")}
            className={({ isActive }) =>
              `inv-navlink-pill${isActive || subRoute === "stock-history" ? " active" : ""}`
            }
          >
            📜 Stock History
          </NavLink>
        )}
        {invPerms.adjustStock && (
          <NavLink
            to={INVENTORY_SUBROUTE_TO_PATH["stock-adjustment"]}
            className={({ isActive }) =>
              `inv-navlink-pill${isActive || subRoute === "stock-adjustment" ? " active" : ""}`
            }
          >
            ⚖ Stock Adjustment
          </NavLink>
        )}
        {invPerms.viewReports && (
          <NavLink
            to={INVENTORY_SUBROUTE_TO_PATH.reports}
            className={({ isActive }) =>
              `inv-navlink-pill${isActive || subRoute === "reports" ? " active" : ""}`
            }
          >
            📈 Reports & Audit Logs
          </NavLink>
        )}
      </div>

      {/* PERMISSION-BASED PAGE-SCOPED STOCK <= THRESHOLD ALERT COLLAPSE BAR */}
      {canViewThresholdAlerts && pageThresholdStockItems.length > 0 && (
        <article
          className={`dashboard-card threshold-alert-card${
            threshCollapseOpen ? " is-expanded" : " is-collapsed"
          }`}
          role="region"
          aria-label="Stock at or below minimum threshold alert table"
        >
          <button
            type="button"
            className="threshold-collapse-trigger"
            aria-expanded={threshCollapseOpen}
            onClick={() => setThreshCollapseOpen((prev) => !prev)}
          >
            <div className="threshold-collapse-left">
              <p className="card-eyebrow">
                ⚠ PERMISSION-SCOPED STOCK THRESHOLD ALERT · {currentPageScopeLabel.toUpperCase()}
              </p>
              <h2>
                {pageThresholdStockItems.length} {currentPageScopeLabel} product(s) with Stock &le; Minimum Threshold
              </h2>
            </div>

            <div className="threshold-collapse-right">
              <span className="pill alert-month">
                {pageThresholdStockItems.filter((i) => i.stockQuantity <= 0).length} Out of Stock ·{" "}
                {pageThresholdStockItems.filter((i) => i.stockQuantity > 0).length} Low / At Threshold
              </span>
              <span className="threshold-collapse-toggle-pill">
                <span>{threshCollapseOpen ? "Hide List" : "Show List"}</span>
                <span className={`threshold-collapse-chevron${threshCollapseOpen ? " open" : ""}`}>
                  ▾
                </span>
              </span>
            </div>
          </button>

          {threshCollapseOpen && (
            <div className="threshold-collapse-body">
              <div className="kirana-table-wrap">
                <table className="kirana-table">
                  <thead>
                    <tr>
                      <th>SKU & Category</th>
                      <th>Product & Brand</th>
                      <th>Category-Specific Spec / Batch</th>
                      <th>Supplier & Location</th>
                      <th>Current Stock</th>
                      <th>Min Threshold</th>
                      <th>Shortfall / Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageThresholdStockItems
                      .slice(
                        (Math.min(
                          threshPage,
                          Math.max(1, Math.ceil(pageThresholdStockItems.length / threshPageSize)),
                        ) -
                          1) *
                          threshPageSize,
                        Math.min(
                          threshPage,
                          Math.max(1, Math.ceil(pageThresholdStockItems.length / threshPageSize)),
                        ) * threshPageSize,
                      )
                      .map((item) => {
                        const shortfall = Number(
                          Math.max(0, item.minimumStockLevel - item.stockQuantity).toFixed(2),
                        );
                        const isOut = item.stockQuantity <= 0;
                        const isEqual = item.stockQuantity === item.minimumStockLevel;
                        return (
                          <tr key={`thresh-${item.id}`}>
                            <td>
                              <div className="status-cell-stack">
                                <span
                                  className={`vertical-tag vertical-${item.inventoryCategory.toLowerCase()}`}
                                >
                                  {INVENTORY_CATEGORY_META[item.inventoryCategory].shortName}
                                </span>
                                <code className="perm-code-chip">{item.sku}</code>
                              </div>
                            </td>
                            <td>
                              <strong>{item.productName}</strong>
                              <small>
                                {item.brand} · {item.productCategory}
                              </small>
                            </td>
                            <td>
                              {item.inventoryCategory === "Grocery" && item.kiranaFields && (
                                <>
                                  <strong>{item.kiranaFields.grocerySubcategory}</strong>
                                  <small>{item.kiranaFields.weightVolume}</small>
                                </>
                              )}
                              {item.inventoryCategory === "Pharmacy" && item.pharmacyFields && (
                                <>
                                  <strong>
                                    {item.pharmacyFields.genericName} (
                                    {item.pharmacyFields.scheduleClassification})
                                  </strong>
                                  <small>
                                    Batches:{" "}
                                    {item.pharmacyFields.batches
                                      .map((b) => `${b.batchNumber}(${b.quantity})`)
                                      .join(", ")}
                                  </small>
                                </>
                              )}
                              {item.inventoryCategory === "Mall" && item.mallFields && (
                                <>
                                  <strong>
                                    {item.mallFields.department} · {item.mallFields.productModel}
                                  </strong>
                                  <small>
                                    Size: {item.mallFields.size} · Colour: {item.mallFields.colour}
                                  </small>
                                </>
                              )}
                            </td>
                            <td>
                              <strong>{item.supplier}</strong>
                              <small>{item.storeLocation}</small>
                            </td>
                            <td>
                              <strong className="text-danger">
                                {item.stockQuantity} {item.unitOfMeasurement}
                              </strong>
                            </td>
                            <td>
                              <strong>
                                {item.minimumStockLevel} {item.unitOfMeasurement}
                              </strong>
                              <small>Max: {item.maximumStockLevel}</small>
                            </td>
                            <td>
                              <div className="status-cell-stack">
                                {isOut ? (
                                  <span className="pill alert-month">
                                    🚨 Out of Stock (-{shortfall} below min)
                                  </span>
                                ) : isEqual ? (
                                  <span className="pill waiting">
                                    ⚠ Equal to Threshold ({item.stockQuantity} ={" "}
                                    {item.minimumStockLevel})
                                  </span>
                                ) : (
                                  <span className="pill waiting">
                                    ⚠ Below Threshold (-{shortfall} {item.unitOfMeasurement})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="table-action-stack">
                                {invPerms.adjustStock && (
                                  <button
                                    type="button"
                                    className="approve-button"
                                    onClick={() => handleReplenishFromThresholdAlert(item)}
                                  >
                                    + Replenish Stock
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="subtle-button"
                                  onClick={() => openViewModal(item)}
                                >
                                  👁 View
                                </button>
                                {invPerms.editInventory && (
                                  <button
                                    type="button"
                                    className="subtle-button"
                                    onClick={() => openEditModal(item)}
                                  >
                                    ✎ Edit
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <TablePagination
                totalRecords={pageThresholdStockItems.length}
                page={threshPage}
                pageSize={threshPageSize}
                onPageChange={setThreshPage}
                onPageSizeChange={setThreshPageSize}
                pageSizeOptions={[4, 8, 12]}
                itemLabel={`threshold alert items (${currentPageScopeLabel})`}
              />
            </div>
          )}
        </article>
      )}

      {/* =====================================================================
          VIEW 1: INVENTORY DASHBOARD (Section 9)
      ===================================================================== */}
      {subRoute === "dashboard" && (
        <div className="kirana-section-stack">
          <article className="dashboard-card">
            <div className="card-heading">
              <div>
                <p className="card-eyebrow">INVENTORY MANAGEMENT DASHBOARD (ROLE-SCOPED)</p>
                <h2>
                  Real-time inventory KPIs, category valuation, stock alerts & recent transactions
                </h2>
              </div>
              <div className="header-actions">
                <select
                  className="inv-select-compact"
                  value={dashboardCategoryFilter}
                  onChange={(e) =>
                    setDashboardCategoryFilter(e.target.value as InventoryCategory | "ALL")
                  }
                  aria-label="Filter dashboard by category"
                >
                  <option value="ALL">
                    All Permitted Categories ({permittedVerticals.length})
                  </option>
                  {permittedVerticals.includes("Grocery") && (
                    <option value="Grocery">🛒 Kirana / Grocery</option>
                  )}
                  {permittedVerticals.includes("Pharmacy") && (
                    <option value="Pharmacy">💊 Pharmacy</option>
                  )}
                  {permittedVerticals.includes("Mall") && (
                    <option value="Mall">🏬 Mall / Supermarket</option>
                  )}
                </select>
                {invPerms.addInventory && (
                  <button
                    type="button"
                    className="approve-button"
                    onClick={() => onNavigateSubRoute("add-inventory")}
                  >
                    + Add Inventory
                  </button>
                )}
              </div>
            </div>

            {dashboardLoading && !dashboardData ? (
              <div className="inv-skeleton-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="inv-skeleton-card" />
                ))}
              </div>
            ) : dashboardError ? (
              <div className="dashboard-alert" role="alert">
                {dashboardError}
              </div>
            ) : (
              dashboardData && (
                <>
                  {/* 8 KPI Cards required by Section 9 */}
                  <div className="inv-kpi-grid-8">
                    <div className="inv-kpi-box">
                      <span>Total Products</span>
                      <strong>{dashboardData.metrics.totalProducts}</strong>
                      <small>Authorized SKUs in scope</small>
                    </div>
                    <div className="inv-kpi-box">
                      <span>Total Active Products</span>
                      <strong className="text-success">
                        {dashboardData.metrics.totalActiveProducts}
                      </strong>
                      <small>{dashboardData.metrics.totalInactiveProducts} Inactive (Archived)</small>
                    </div>
                    <div className="inv-kpi-box">
                      <span>Inventory Categories</span>
                      <strong>{dashboardData.metrics.totalInventoryCategories}</strong>
                      <small>Across {permittedVerticals.length} permitted verticals</small>
                    </div>
                    <div className="inv-kpi-box">
                      <span>Total Stock Quantity</span>
                      <strong>{dashboardData.metrics.totalStockQuantity.toLocaleString()}</strong>
                      <small>Combined stock units</small>
                    </div>
                    <div className="inv-kpi-box warning">
                      <span>Low Stock Products</span>
                      <strong>{dashboardData.metrics.lowStockCount}</strong>
                      <small>At or below minimum level</small>
                    </div>
                    <div className="inv-kpi-box danger">
                      <span>Out-of-Stock Products</span>
                      <strong className="text-danger">
                        {dashboardData.metrics.outOfStockCount}
                      </strong>
                      <small>Zero stock — urgent reorder</small>
                    </div>
                    <div className="inv-kpi-box warning">
                      <span>Expiring / Expired</span>
                      <strong>{dashboardData.metrics.expiringCount}</strong>
                      <small>Within 90 days or expired</small>
                    </div>
                    <div className="inv-kpi-box highlight">
                      <span>Total Purchase Value</span>
                      <strong>
                        ₹{dashboardData.metrics.totalPurchaseValue.toLocaleString()}
                      </strong>
                      <small>
                        Retail Val: ₹{dashboardData.metrics.totalRetailValue.toLocaleString()}
                      </small>
                    </div>
                  </div>
                </>
              )
            )}
          </article>

          {/* Category-wise Inventory Summary */}
          {dashboardData && (
            <article className="dashboard-card">
              <div className="card-heading">
                <div>
                  <p className="card-eyebrow">CATEGORY-WISE INVENTORY SUMMARY</p>
                  <h2>Independent vertical metrics across Kirana, Pharmacy, and Mall</h2>
                </div>
              </div>

              <div className="dormancy-summary-grid">
                {dashboardData.categorySummary.map((cat) => (
                  <div
                    key={cat.category}
                    className={`dormancy-tier-card ${
                      cat.category === "Grocery"
                        ? "tier-active"
                        : cat.category === "Pharmacy"
                          ? "tier-week"
                          : "tier-month"
                    }`}
                  >
                    <span>
                      {INVENTORY_CATEGORY_META[cat.category].icon}{" "}
                      {cat.displayName.toUpperCase()}
                    </span>
                    <strong>
                      {cat.totalProducts} Products ({cat.activeProducts} Active)
                    </strong>
                    <small>
                      Total Stock: <b>{cat.totalStockQuantity} units</b> · Purchase Valuation:{" "}
                      <b>₹{cat.purchaseValue.toLocaleString()}</b> (Retail: ₹
                      {cat.retailValue.toLocaleString()})
                    </small>
                    <small>
                      Low Stock: <b>{cat.lowStockCount}</b> · Out of Stock:{" "}
                      <b className={cat.outOfStockCount > 0 ? "text-danger" : ""}>
                        {cat.outOfStockCount}
                      </b>{" "}
                      · Expiring: <b>{cat.expiringCount}</b>
                    </small>
                    <div style={{ marginTop: "10px" }}>
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={() =>
                          onNavigateSubRoute(
                            cat.category === "Grocery"
                              ? "list-kirana"
                              : cat.category === "Pharmacy"
                                ? "list-pharmacy"
                                : "list-mall",
                          )
                        }
                      >
                        Open {cat.displayName} List →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          {/* Alerts + Recent Activity Split */}
          {dashboardData && (
            <section className="dashboard-content-grid">
              <article className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <p className="card-eyebrow">STOCK & EXPIRY ALERTS</p>
                    <h2>Low-stock, out-of-stock & expiring batches requiring attention</h2>
                  </div>
                  {invPerms.adjustStock && (
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() => onNavigateSubRoute("stock-adjustment")}
                    >
                      Adjust Stock →
                    </button>
                  )}
                </div>

                <div className="pipeline-list">
                  {[
                    ...dashboardData.outOfStockProducts,
                    ...dashboardData.lowStockProducts,
                    ...dashboardData.expiringProducts,
                  ]
                    .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
                    .slice(0, 6)
                    .map((item) => {
                      const st = getProductStockStatus(item);
                      const exp = getProductExpiryStatus(item);
                      return (
                        <div className="pipeline-row" key={item.id}>
                          <span
                            className={`pipeline-icon ${
                              st === "OUT_OF_STOCK" || exp.status === "EXPIRED"
                                ? "orange"
                                : "blue"
                            }`}
                          >
                            !
                          </span>
                          <div>
                            <strong>
                              [{item.sku}] {item.productName}
                            </strong>
                            <small>
                              Stock: {item.stockQuantity} {item.unitOfMeasurement} (Min:{" "}
                              {item.minimumStockLevel}) · Supplier: {item.supplier}
                            </small>
                          </div>
                          <div className="table-action-stack">
                            {renderStockBadge(item)}
                            {(exp.status === "EXPIRED" || exp.status === "EXPIRING_SOON") &&
                              renderExpiryBadge(item)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </article>

              <article className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <p className="card-eyebrow">RECENT INVENTORY ACTIVITIES</p>
                    <h2>Latest stock transactions & audit modifications</h2>
                  </div>
                  {invPerms.viewStockHistory && (
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() => onNavigateSubRoute("stock-history")}
                    >
                      Full History →
                    </button>
                  )}
                </div>

                <div className="pipeline-list">
                  {dashboardData.recentTransactions.slice(0, 5).map((txn) => (
                    <div className="pipeline-row" key={txn.id}>
                      <span
                        className={`pipeline-icon ${
                          txn.quantityDelta >= 0 ? "blue" : "orange"
                        }`}
                      >
                        {txn.quantityDelta >= 0 ? "＋" : "－"}
                      </span>
                      <div>
                        <strong>
                          {txn.referenceNumber} · {txn.productName} ({txn.sku})
                        </strong>
                        <small>
                          {txn.transactionType.replace("STOCK_", "")}: {txn.previousQuantity} →{" "}
                          <b>{txn.newQuantity}</b> · {txn.reason} · By {txn.performedBy.name}
                        </small>
                      </div>
                      <span
                        className={`pill ${txn.quantityDelta >= 0 ? "ready" : "waiting"}`}
                      >
                        {txn.quantityDelta > 0
                          ? `+${txn.quantityDelta}`
                          : txn.quantityDelta}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}
        </div>
      )}

      {/* =====================================================================
          VIEW 2: DEDICATED ADD INVENTORY PAGE (Section 4)
      ===================================================================== */}
      {subRoute === "add-inventory" && (
        <article className="dashboard-card">
          <div className="card-heading">
            <div>
              <p className="card-eyebrow">SECTION 4 · DEDICATED ADD INVENTORY PAGE</p>
              <h2>
                Select an authorized inventory category and enter common + category-specific attributes
              </h2>
            </div>
            <span className={`vertical-tag vertical-${addCategory.toLowerCase()}`}>
              {addCatMeta.icon} {addCatMeta.displayName}
            </span>
          </div>

          {!invPerms.addInventory ? (
            <div className="empty-state">
              <span>🔒</span>
              <strong>Add Inventory Permission Required</strong>
              <p>Your user profile does not have permission to create inventory records.</p>
            </div>
          ) : (
            <form className="universal-inventory-form" onSubmit={handleSubmitAddInventory}>
              {/* Step 1: Select Inventory Category (Only categories authorized for logged-in user) */}
              <div>
                <p className="card-eyebrow" style={{ marginBottom: "8px" }}>
                  STEP 1: SELECT AUTHORIZED INVENTORY CATEGORY ({permittedVerticals.length} PERMITTED)
                </p>
                <div className="vertical-switcher" role="radiogroup" aria-label="Inventory Category">
                  {permittedVerticals.map((cat) => {
                    const meta = INVENTORY_CATEGORY_META[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={addCategory === cat ? "active" : ""}
                        onClick={() => handleSwitchAddCategory(cat)}
                      >
                        <strong>
                          {meta.icon} {meta.displayName}
                        </strong>
                        <small>
                          {cat === "Grocery" && "Subcategory, Weight/Volume, MRP, Storage & Expiry"}
                          {cat === "Pharmacy" &&
                            "Generic, Composition, Schedule/Rx, Licence & Multi-Batch"}
                          {cat === "Mall" &&
                            "Department, Brand, Model, Variant, Size, Colour & Location"}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>

              {addFormErrors.length > 0 && (
                <div className="dashboard-alert" role="alert">
                  <strong>Please fix the following validation errors:</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
                    {addFormErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Step 2: Common Product Fields (Section 4) */}
              <div>
                <p className="card-eyebrow" style={{ marginBottom: "8px" }}>
                  STEP 2: COMMON PRODUCT FIELDS ({addCatMeta.displayName.toUpperCase()})
                </p>
                <div className="universal-form-grid">
                  <label className="kirana-label">
                    Product Name *
                    <input
                      required
                      value={addProductName}
                      onChange={(e) => {
                        setAddProductName(e.target.value);
                        if (addCategory === "Pharmacy" && !phmMedicineName) {
                          setPhmMedicineName(e.target.value);
                        }
                      }}
                      placeholder={
                        addCategory === "Grocery"
                          ? "e.g. Organic Indrayani Rice (Loose)"
                          : addCategory === "Pharmacy"
                            ? "e.g. PanTop-40 Gastro-Resistant Strip"
                            : "e.g. Classic Denim Jacket (Indigo)"
                      }
                    />
                  </label>

                  <label className="kirana-label">
                    SKU (Unique in {addCatMeta.shortName}) *
                    <input
                      required
                      value={addSku}
                      onChange={(e) => setAddSku(e.target.value)}
                      placeholder={`${addCatMeta.skuPrefix}-5010`}
                    />
                  </label>

                  <label className="kirana-label">
                    Barcode (Unique EAN/UPC) *
                    <input
                      required
                      value={addBarcode}
                      onChange={(e) => setAddBarcode(e.target.value)}
                      placeholder="8901050100018"
                    />
                  </label>

                  <label className="kirana-label">
                    Brand *
                    <input
                      required
                      value={addBrand}
                      onChange={(e) => setAddBrand(e.target.value)}
                      placeholder={
                        addCategory === "Grocery"
                          ? "e.g. Fortune / Store Staple"
                          : addCategory === "Pharmacy"
                            ? "e.g. Sun Pharma / Cipla"
                            : "e.g. Levi's / Philips"
                      }
                    />
                  </label>

                  <label className="kirana-label">
                    Product Category *
                    <select
                      value={addProductCategory}
                      onChange={(e) => setAddProductCategory(e.target.value)}
                    >
                      {addCatMeta.productCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="kirana-label">
                    Supplier *
                    <input
                      required
                      list="supplier-options"
                      value={addSupplier}
                      onChange={(e) => setAddSupplier(e.target.value)}
                      placeholder="Select or type supplier name"
                    />
                    <datalist id="supplier-options">
                      {addCatMeta.defaultSuppliers.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </label>

                  <label className="kirana-label">
                    Purchase Price (₹) *
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={addPurchasePrice}
                      onChange={(e) => setAddPurchasePrice(e.target.value)}
                    />
                  </label>

                  <label className="kirana-label">
                    Selling Price (₹) *
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={addSellingPrice}
                      onChange={(e) => setAddSellingPrice(e.target.value)}
                    />
                  </label>

                  <label className="kirana-label">
                    MRP (₹) *
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={addMrp}
                      onChange={(e) => setAddMrp(e.target.value)}
                    />
                  </label>

                  <label className="kirana-label">
                    Tax Information (GST Slab) *
                    <select
                      value={addGstPercent}
                      onChange={(e) => {
                        const rate = Number(e.target.value) as 0 | 5 | 12 | 18 | 28;
                        setAddGstPercent(rate);
                        setAddTaxInfo(`GST ${rate}%`);
                      }}
                    >
                      <option value={0}>GST 0% (Exempt / Unbranded Staple)</option>
                      <option value={5}>GST 5% (Essential / Life-Saving)</option>
                      <option value={12}>GST 12% (Standard / Pharma Formulations)</option>
                      <option value={18}>GST 18% (FMCG / Electronics / Apparel)</option>
                      <option value={28}>GST 28% (Luxury / White Goods)</option>
                    </select>
                  </label>

                  <label className="kirana-label">
                    Unit of Measurement *
                    <select value={addUnit} onChange={(e) => setAddUnit(e.target.value)}>
                      {addCatMeta.units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="kirana-label">
                    Initial Stock Quantity ({addUnit}) *
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      disabled={addCategory === "Pharmacy"}
                      value={
                        addCategory === "Pharmacy"
                          ? phmBatches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
                          : addInitialStock
                      }
                      onChange={(e) => setAddInitialStock(e.target.value)}
                    />
                  </label>

                  <label className="kirana-label">
                    Minimum Stock Level (Alert Threshold) *
                    <input
                      type="number"
                      min="0"
                      required
                      value={addMinStock}
                      onChange={(e) => setAddMinStock(e.target.value)}
                    />
                  </label>

                  <label className="kirana-label">
                    Maximum Stock Level *
                    <input
                      type="number"
                      min="1"
                      required
                      value={addMaxStock}
                      onChange={(e) => setAddMaxStock(e.target.value)}
                    />
                  </label>

                  <label className="kirana-label">
                    Store / Warehouse Location *
                    <select value={addLocation} onChange={(e) => setAddLocation(e.target.value)}>
                      {addCatMeta.locations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="kirana-label">
                    Status (Active / Inactive) *
                    <select
                      value={addStatus}
                      onChange={(e) => setAddStatus(e.target.value as InventoryStatus)}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </label>

                  <label className="kirana-label">
                    Product Image URL
                    <input
                      value={addProductImage}
                      onChange={(e) => setAddProductImage(e.target.value)}
                      placeholder="/window.svg"
                    />
                  </label>

                  <label className="kirana-label">
                    Description
                    <input
                      value={addDescription}
                      onChange={(e) => setAddDescription(e.target.value)}
                      placeholder="Product specification, packaging & handling notes..."
                    />
                  </label>
                </div>
              </div>

              {/* Step 3A: KIRANA-SPECIFIC FIELDS */}
              {addCategory === "Grocery" && (
                <div>
                  <p className="card-eyebrow" style={{ marginBottom: "8px" }}>
                    STEP 3: KIRANA / GROCERY-SPECIFIC FIELDS
                  </p>
                  <div className="universal-form-grid">
                    <label className="kirana-label">
                      Grocery Subcategory *
                      <select
                        value={krnSubcategory}
                        onChange={(e) => setKrnSubcategory(e.target.value)}
                      >
                        {INVENTORY_CATEGORY_META.Grocery.subcategoriesOrDepts.map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="kirana-label">
                      Weight / Volume Specification *
                      <input
                        required
                        value={krnWeightVolume}
                        onChange={(e) => setKrnWeightVolume(e.target.value)}
                        placeholder="e.g. 50 kg Sack / 1L Pouch"
                      />
                    </label>

                    <label className="kirana-label">
                      Manufacturing / Packing Date
                      <input
                        type="date"
                        value={krnMfgDate}
                        onChange={(e) => setKrnMfgDate(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Expiry / Best-Before Date
                      <input
                        type="date"
                        value={krnExpDate}
                        onChange={(e) => setKrnExpDate(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label" style={{ gridColumn: "span 2" }}>
                      Storage Information (Bin / Aisle / Temperature) *
                      <input
                        required
                        value={krnStorageInfo}
                        onChange={(e) => setKrnStorageInfo(e.target.value)}
                        placeholder="e.g. Aisle 1 · Bin S-02 (Keep dry, away from direct sunlight)"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Step 3B: PHARMACY-SPECIFIC FIELDS + MULTI-BATCH BUILDER */}
              {addCategory === "Pharmacy" && (
                <div>
                  <p className="card-eyebrow" style={{ marginBottom: "8px" }}>
                    STEP 3: PHARMACY-SPECIFIC FIELDS & MULTI-BATCH STOCK MANAGEMENT
                  </p>
                  <div className="universal-form-grid">
                    <label className="kirana-label">
                      Medicine Name *
                      <input
                        required
                        value={phmMedicineName || addProductName}
                        onChange={(e) => {
                          setPhmMedicineName(e.target.value);
                          setAddProductName(e.target.value);
                        }}
                        placeholder="e.g. AmoxiClav-625 LB Tablets"
                      />
                    </label>

                    <label className="kirana-label">
                      Generic Name *
                      <input
                        required
                        value={phmGenericName}
                        onChange={(e) => setPhmGenericName(e.target.value)}
                        placeholder="e.g. Amoxicillin + Potassium Clavulanate"
                      />
                    </label>

                    <label className="kirana-label">
                      Salt Composition & Strength *
                      <input
                        required
                        value={phmComposition}
                        onChange={(e) => setPhmComposition(e.target.value)}
                        placeholder="e.g. Amoxicillin 500mg + Clavulanic Acid 125mg"
                      />
                    </label>

                    <label className="kirana-label">
                      Manufacturer *
                      <input
                        required
                        value={phmManufacturer}
                        onChange={(e) => setPhmManufacturer(e.target.value)}
                        placeholder="e.g. Cipla Health Lifesciences Ltd."
                      />
                    </label>

                    <label className="kirana-label">
                      Schedule / Drug Classification *
                      <select
                        value={phmSchedule}
                        onChange={(e) =>
                          setPhmSchedule(e.target.value as DrugScheduleClassification)
                        }
                      >
                        <option value="OTC">OTC (Over The Counter)</option>
                        <option value="Schedule H">Schedule H (Rx Required)</option>
                        <option value="Schedule H1">Schedule H1 (Strict Register)</option>
                        <option value="Schedule X">Schedule X (Narcotic / Controlled)</option>
                        <option value="Schedule G">Schedule G (Medical Supervision)</option>
                        <option value="Cold-Chain">Cold-Chain (2°C – 8°C)</option>
                      </select>
                    </label>

                    <label className="kirana-label">
                      Prescription Requirement *
                      <select
                        value={phmRxRequired ? "yes" : "no"}
                        onChange={(e) => setPhmRxRequired(e.target.value === "yes")}
                      >
                        <option value="yes">Yes — Doctor Prescription Mandatory</option>
                        <option value="no">No — OTC Dispensing Permitted</option>
                      </select>
                    </label>

                    <label className="kirana-label" style={{ gridColumn: "span 3" }}>
                      Applicable Drug Licence Information (Form 20B / 21B / FSSAI / Cosmetic Lic.) *
                      <input
                        required
                        value={phmLicenceInfo}
                        onChange={(e) => setPhmLicenceInfo(e.target.value)}
                        placeholder="e.g. DL-20B/21B-MH-MZ1-449812"
                      />
                    </label>
                  </div>

                  {/* Multi-Batch Table Builder */}
                  <div className="kirana-form-box" style={{ marginTop: "12px" }}>
                    <div className="card-heading">
                      <div>
                        <p className="card-eyebrow">
                          PHARMACY MULTI-BATCH TRACKER (QUANTITY, EXPIRY & PURCHASE PRICE PER BATCH)
                        </p>
                        <strong>
                          Total Medicine Stock across {phmBatches.length} Batch(es):{" "}
                          {phmBatches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)} {addUnit}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={handleAddPharmacyBatchRow}
                      >
                        + Add Another Batch
                      </button>
                    </div>

                    <div className="kirana-table-wrap">
                      <table className="kirana-table">
                        <thead>
                          <tr>
                            <th>Batch Number *</th>
                            <th>Mfg Date *</th>
                            <th>Expiry Date *</th>
                            <th>Batch Qty *</th>
                            <th>Purchase Price (₹) *</th>
                            <th>Selling Price (₹)</th>
                            <th>MRP (₹)</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {phmBatches.map((batch) => (
                            <tr key={batch.batchId}>
                              <td>
                                <input
                                  required
                                  className="inv-table-input"
                                  value={batch.batchNumber}
                                  onChange={(e) =>
                                    handleUpdatePharmacyBatchRow(
                                      batch.batchId,
                                      "batchNumber",
                                      e.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  required
                                  className="inv-table-input"
                                  value={batch.manufacturingDate}
                                  onChange={(e) =>
                                    handleUpdatePharmacyBatchRow(
                                      batch.batchId,
                                      "manufacturingDate",
                                      e.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  required
                                  className="inv-table-input"
                                  value={batch.expiryDate}
                                  onChange={(e) =>
                                    handleUpdatePharmacyBatchRow(
                                      batch.batchId,
                                      "expiryDate",
                                      e.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  required
                                  className="inv-table-input"
                                  value={batch.quantity}
                                  onChange={(e) =>
                                    handleUpdatePharmacyBatchRow(
                                      batch.batchId,
                                      "quantity",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  required
                                  className="inv-table-input"
                                  value={batch.purchasePrice}
                                  onChange={(e) =>
                                    handleUpdatePharmacyBatchRow(
                                      batch.batchId,
                                      "purchasePrice",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  className="inv-table-input"
                                  value={batch.sellingPrice}
                                  onChange={(e) =>
                                    handleUpdatePharmacyBatchRow(
                                      batch.batchId,
                                      "sellingPrice",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  className="inv-table-input"
                                  value={batch.mrp}
                                  onChange={(e) =>
                                    handleUpdatePharmacyBatchRow(
                                      batch.batchId,
                                      "mrp",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="subtle-button"
                                  onClick={() => handleRemovePharmacyBatchRow(batch.batchId)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3C: MALL-SPECIFIC FIELDS */}
              {addCategory === "Mall" && (
                <div>
                  <p className="card-eyebrow" style={{ marginBottom: "8px" }}>
                    STEP 3: MALL / SUPERMARKET-SPECIFIC FIELDS
                  </p>
                  <div className="universal-form-grid">
                    <label className="kirana-label">
                      Department *
                      <select
                        value={mllDepartment}
                        onChange={(e) => setMllDepartment(e.target.value)}
                      >
                        {INVENTORY_CATEGORY_META.Mall.subcategoriesOrDepts.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="kirana-label">
                      Product Model *
                      <input
                        required
                        value={mllModel}
                        onChange={(e) => setMllModel(e.target.value)}
                        placeholder="e.g. UW-LINEN-AW26 / AC-IND-1800"
                      />
                    </label>

                    <label className="kirana-label">
                      Product Variant *
                      <input
                        required
                        value={mllVariant}
                        onChange={(e) => setMllVariant(e.target.value)}
                        placeholder="e.g. Slim Fit / Feather Touch LED"
                      />
                    </label>

                    <label className="kirana-label">
                      Size *
                      <input
                        required
                        value={mllSize}
                        onChange={(e) => setMllSize(e.target.value)}
                        placeholder="e.g. L (42 cm) / UK 9 / Standard"
                      />
                    </label>

                    <label className="kirana-label">
                      Colour *
                      <input
                        required
                        value={mllColour}
                        onChange={(e) => setMllColour(e.target.value)}
                        placeholder="e.g. Olive Green / Matte Obsidian Black"
                      />
                    </label>

                    <label className="kirana-label">
                      Warehouse / Store Aisle Location *
                      <input
                        required
                        value={mllWarehouseLoc}
                        onChange={(e) => setMllWarehouseLoc(e.target.value)}
                        placeholder="e.g. Floor 1 · Bay B-09 · Rack R-03"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="action-row-split">
                <small className="form-helper-note">
                  Every newly created product automatically generates an <b>INITIAL_ENTRY</b> stock transaction and an <b>INVENTORY_CREATED</b> audit record.
                </small>
                <button type="submit" className="approve-button" disabled={addSubmitting}>
                  {addSubmitting
                    ? "Saving & Generating Initial Stock Transaction..."
                    : `＋ Create ${addCatMeta.displayName} Product`}
                </button>
              </div>
            </form>
          )}
        </article>
      )}

      {/* =====================================================================
          VIEW 3: THREE INDEPENDENT INVENTORY LISTING PAGES (Section 5)
          - Kirana Inventory List (list-kirana)
          - Pharmacy Inventory List (list-pharmacy)
          - Mall Inventory List (list-mall)
      ===================================================================== */}
      {(subRoute === "list-kirana" ||
        subRoute === "list-pharmacy" ||
        subRoute === "list-mall") && (
        <article className="dashboard-card">
          <div className="card-heading">
            <div>
              <p className="card-eyebrow">
                SECTION 5 · INDEPENDENT {INVENTORY_CATEGORY_META[activeListCategory].displayName.toUpperCase()} INVENTORY LISTING
              </p>
              <h2>
                {INVENTORY_CATEGORY_META[activeListCategory].icon}{" "}
                {INVENTORY_CATEGORY_META[activeListCategory].displayName} Inventory List (
                {listPagination.totalRecords} records)
              </h2>
            </div>

            <div className="header-actions">
              {invPerms.exportInventory && (
                <>
                  <select
                    className="inv-select-compact"
                    value={exportScope}
                    onChange={(e) => setExportScope(e.target.value as "filtered" | "all")}
                    aria-label="Export Scope"
                  >
                    <option value="filtered">Export Filtered Records</option>
                    <option value="all">Export All Authorized Records</option>
                  </select>
                  <button
                    type="button"
                    className="subtle-button"
                    disabled={exportingFormat !== ""}
                    onClick={() => handleExportInventory("excel")}
                  >
                    {exportingFormat === "excel" ? "Generating Excel..." : "⬇ Export Excel (.xls)"}
                  </button>
                  <button
                    type="button"
                    className="subtle-button"
                    disabled={exportingFormat !== ""}
                    onClick={() => handleExportInventory("pdf")}
                  >
                    {exportingFormat === "pdf" ? "Generating PDF..." : "⬇ Export PDF (.pdf)"}
                  </button>
                </>
              )}
              {invPerms.addInventory && (
                <button
                  type="button"
                  className="approve-button"
                  onClick={() => {
                    handleSwitchAddCategory(activeListCategory);
                    onNavigateSubRoute("add-inventory");
                  }}
                >
                  + Add {INVENTORY_CATEGORY_META[activeListCategory].shortName} SKU
                </button>
              )}
            </div>
          </div>

          {/* Dynamic Debounced Search + Multi-Dimension Filter Panel */}
          <div className="inv-filter-panel">
            <div className="list-toolbar" style={{ marginTop: 0 }}>
              <div className="list-search-box">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={`Debounced search in ${INVENTORY_CATEGORY_META[activeListCategory].shortName} by Product Name, SKU, Barcode, Brand${
                    activeListCategory === "Pharmacy" ? ", Generic Name, or Batch No..." : "..."
                  }`}
                  aria-label="Search inventory"
                />
              </div>

              <div className="list-filter-controls">
                <select
                  value={filterProductCategory}
                  onChange={(e) => {
                    setFilterProductCategory(e.target.value);
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                  aria-label="Filter by product category"
                >
                  <option value="ALL">All Categories</option>
                  {listFacets.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={filterBrand}
                  onChange={(e) => {
                    setFilterBrand(e.target.value);
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                  aria-label="Filter by brand"
                >
                  <option value="ALL">All Brands</option>
                  {listFacets.brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                <select
                  value={filterSupplier}
                  onChange={(e) => {
                    setFilterSupplier(e.target.value);
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                  aria-label="Filter by supplier"
                >
                  <option value="ALL">All Suppliers</option>
                  {listFacets.suppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value as "ALL" | "Active" | "Inactive");
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                  aria-label="Filter by Active/Inactive status"
                >
                  <option value="ALL">All Statuses (Active + Inactive)</option>
                  <option value="Active">✓ Active Only</option>
                  <option value="Inactive">⏸ Inactive Only</option>
                </select>

                <select
                  value={filterStockStatus}
                  onChange={(e) => {
                    setFilterStockStatus(e.target.value as StockStatusFilter);
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                  aria-label="Filter by stock status"
                >
                  <option value="ALL">All Stock States</option>
                  <option value="IN_STOCK">In Stock</option>
                  <option value="LOW_STOCK">⚠ Low Stock</option>
                  <option value="OUT_OF_STOCK">🚨 Out of Stock</option>
                  <option value="OVERSTOCK">Overstock</option>
                </select>

                {activeListCategory === "Pharmacy" && (
                  <select
                    value={filterExpiryStatus}
                    onChange={(e) => {
                      setFilterExpiryStatus(e.target.value as PharmacyExpiryFilter);
                      setListPagination((p) => ({ ...p, page: 1 }));
                    }}
                    aria-label="Filter by Pharmacy expiry status"
                  >
                    <option value="ALL">All Expiry States</option>
                    <option value="VALID">✓ Valid Shelf Life (&gt;90d)</option>
                    <option value="EXPIRING_SOON">⚠ Expiring Soon (&le;90d)</option>
                    <option value="EXPIRED">🚨 Expired Batch</option>
                  </select>
                )}
              </div>
            </div>

            <div className="inv-filter-secondary-row">
              <div className="inv-date-range-group">
                <span>Created Date Range:</span>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => {
                    setFilterDateFrom(e.target.value);
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                  aria-label="Date from"
                />
                <span>to</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => {
                    setFilterDateTo(e.target.value);
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                  aria-label="Date to"
                />
              </div>

              <div className="list-filter-controls">
                <label className="page-size-label">
                  Page Size:
                  <select
                    value={listPagination.pageSize}
                    onChange={(e) =>
                      setListPagination((p) => ({
                        ...p,
                        pageSize: Number(e.target.value),
                        page: 1,
                      }))
                    }
                  >
                    <option value={5}>5 / page</option>
                    <option value={8}>8 / page</option>
                    <option value={15}>15 / page</option>
                    <option value={25}>25 / page</option>
                  </select>
                </label>

                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => {
                    setSearchInput("");
                    setDebouncedSearch("");
                    setFilterProductCategory("ALL");
                    setFilterBrand("ALL");
                    setFilterSupplier("ALL");
                    setFilterStatus("ALL");
                    setFilterStockStatus("ALL");
                    setFilterExpiryStatus("ALL");
                    setFilterDateFrom("");
                    setFilterDateTo("");
                    setListPagination((p) => ({ ...p, page: 1 }));
                  }}
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>

          {/* Listing Table with Loading Skeleton, Error State, Empty State & Sortable Columns */}
          {listError ? (
            <div className="dashboard-alert" role="alert" style={{ marginTop: "14px" }}>
              <strong>Error:</strong> {listError}{" "}
              <button type="button" className="subtle-button" onClick={fetchInventoryList}>
                Retry
              </button>
            </div>
          ) : (
            <div className="kirana-table-wrap">
              <table className="kirana-table">
                <thead>
                  <tr>
                    <th
                      className="sortable-th"
                      onClick={() => handleSortColumn("sku")}
                    >
                      SKU & Barcode {sortBy === "sku" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                    <th
                      className="sortable-th"
                      onClick={() => handleSortColumn("productName")}
                    >
                      Product & Category{" "}
                      {sortBy === "productName" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                    <th
                      className="sortable-th"
                      onClick={() => handleSortColumn("brand")}
                    >
                      Brand & Supplier{" "}
                      {sortBy === "brand" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                    <th>
                      {activeListCategory === "Grocery" && "Kirana Spec & Storage"}
                      {activeListCategory === "Pharmacy" && "Generic, Schedule & Batches"}
                      {activeListCategory === "Mall" && "Dept, Model, Size & Colour"}
                    </th>
                    <th
                      className="sortable-th"
                      onClick={() => handleSortColumn("stockQuantity")}
                    >
                      Stock Status{" "}
                      {sortBy === "stockQuantity" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                    <th
                      className="sortable-th"
                      onClick={() => handleSortColumn("sellingPrice")}
                    >
                      Purchase → Selling (MRP){" "}
                      {sortBy === "sellingPrice" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                    <th
                      className="sortable-th"
                      onClick={() => handleSortColumn("status")}
                    >
                      Record Status{" "}
                      {sortBy === "status" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                    <th>Actions (No Delete)</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <tr key={idx}>
                        <td colSpan={8}>
                          <div className="inv-skeleton-row" />
                        </td>
                      </tr>
                    ))
                  ) : listItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-table-cell">
                        <div className="empty-state" style={{ padding: "18px 8px" }}>
                          <span>📦</span>
                          <strong>
                            No {INVENTORY_CATEGORY_META[activeListCategory].displayName} records match your filters
                          </strong>
                          <p>
                            Try clearing your search query or adjusting the category, stock, or date filters.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    listItems.map((item) => (
                      <tr
                        key={item.id}
                        className={item.status === "Inactive" ? "perm-row-disabled" : ""}
                      >
                        <td>
                          <code className="perm-code-chip">{item.sku}</code>
                          <small>EAN: {item.barcode}</small>
                        </td>
                        <td>
                          <strong>{item.productName}</strong>
                          <small>
                            {item.productCategory} · {item.storeLocation}
                          </small>
                        </td>
                        <td>
                          <strong>{item.brand}</strong>
                          <small>{item.supplier}</small>
                        </td>
                        <td>
                          {item.inventoryCategory === "Grocery" && item.kiranaFields && (
                            <>
                              <strong>
                                {item.kiranaFields.grocerySubcategory} ·{" "}
                                {item.kiranaFields.weightVolume}
                              </strong>
                              <small>{item.kiranaFields.storageInformation}</small>
                              {renderExpiryBadge(item)}
                            </>
                          )}
                          {item.inventoryCategory === "Pharmacy" && item.pharmacyFields && (
                            <>
                              <strong>
                                {item.pharmacyFields.genericName} (
                                {item.pharmacyFields.scheduleClassification})
                              </strong>
                              <small>
                                {item.pharmacyFields.prescriptionRequired
                                  ? "Rx Mandatory"
                                  : "OTC"}{" "}
                                · {item.pharmacyFields.batches.length} Batch(es):{" "}
                                {item.pharmacyFields.batches
                                  .map((b) => `${b.batchNumber}(${b.quantity})`)
                                  .join(", ")}
                              </small>
                              {renderExpiryBadge(item)}
                            </>
                          )}
                          {item.inventoryCategory === "Mall" && item.mallFields && (
                            <>
                              <strong>
                                {item.mallFields.department} · {item.mallFields.productModel}
                              </strong>
                              <small>
                                Variant: {item.mallFields.productVariant} · Size:{" "}
                                {item.mallFields.size} · Colour: {item.mallFields.colour}
                              </small>
                            </>
                          )}
                        </td>
                        <td>
                          {invPerms.viewStock ? (
                            <>
                              <strong>
                                {item.stockQuantity} {item.unitOfMeasurement}
                              </strong>
                              <small>
                                Min: {item.minimumStockLevel} · Max: {item.maximumStockLevel}
                              </small>
                              {renderStockBadge(item)}
                            </>
                          ) : (
                            <span className="pill waiting">Stock Hidden</span>
                          )}
                        </td>
                        <td>
                          <strong>
                            ₹{item.purchasePrice} → ₹{item.sellingPrice}
                          </strong>
                          <small>
                            MRP: ₹{item.mrp} · {item.taxInformation}
                          </small>
                        </td>
                        <td>
                          <div className="status-cell-stack">
                            <span
                              className={`pill ${
                                item.status === "Active" ? "ready" : "waiting"
                              }`}
                            >
                              {item.status}
                            </span>
                            {invPerms.editInventory && (
                              <button
                                type="button"
                                className="subtle-button"
                                onClick={() =>
                                  toggleProductActiveStatusWithConfirmation(item)
                                }
                              >
                                Set {item.status === "Active" ? "Inactive" : "Active"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="table-action-stack">
                            <button
                              type="button"
                              className="subtle-button"
                              onClick={() => openViewModal(item)}
                            >
                              👁 View Inventory
                            </button>
                            {invPerms.editInventory && (
                              <button
                                type="button"
                                className="approve-button"
                                onClick={() => openEditModal(item)}
                              >
                                ✎ Edit Inventory
                              </button>
                            )}
                            {invPerms.viewStockHistory && (
                              <button
                                type="button"
                                className="subtle-button"
                                onClick={() => {
                                  setTxnProductIdFilter(item.id);
                                  setTxnFilterCategory(item.inventoryCategory);
                                  onNavigateSubRoute("stock-history");
                                }}
                              >
                                📜 Stock History
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Server-Side Pagination Footer */}
          <div className="list-pagination-bar">
            <span>
              Showing{" "}
              <b>
                {listPagination.totalRecords === 0
                  ? 0
                  : (listPagination.page - 1) * listPagination.pageSize + 1}
                –
                {Math.min(
                  listPagination.page * listPagination.pageSize,
                  listPagination.totalRecords,
                )}
              </b>{" "}
              of <b>{listPagination.totalRecords}</b> total{" "}
              {INVENTORY_CATEGORY_META[activeListCategory].displayName} records (Server-Paginated)
            </span>
            <div className="pagination-buttons">
              <button
                type="button"
                disabled={listPagination.page <= 1}
                onClick={() =>
                  setListPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
                }
              >
                ← Prev
              </button>
              {Array.from({ length: listPagination.totalPages }, (_, i) => i + 1).map(
                (pNum) => (
                  <button
                    key={pNum}
                    type="button"
                    className={pNum === listPagination.page ? "active" : ""}
                    onClick={() => setListPagination((p) => ({ ...p, page: pNum }))}
                  >
                    {pNum}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={listPagination.page >= listPagination.totalPages}
                onClick={() =>
                  setListPagination((p) => ({
                    ...p,
                    page: Math.min(p.totalPages, p.page + 1),
                  }))
                }
              >
                Next →
              </button>
            </div>
          </div>
        </article>
      )}

      {/* =====================================================================
          VIEW 4: STOCK HISTORY PAGE (Section 6)
      ===================================================================== */}
      {subRoute === "stock-history" && (
        <article className="dashboard-card">
          <div className="card-heading">
            <div>
              <p className="card-eyebrow">SECTION 6 · IMMUTABLE STOCK TRANSACTION LEDGER</p>
              <h2>
                Stock History — Previous Qty, Added/Deducted Delta, New Qty, Reference, Reason & User
              </h2>
            </div>
            <div className="header-actions">
              {txnProductIdFilter && (
                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => setTxnProductIdFilter("")}
                >
                  ✕ Clear Product Filter (Show All)
                </button>
              )}
              {invPerms.adjustStock && (
                <button
                  type="button"
                  className="approve-button"
                  onClick={() => onNavigateSubRoute("stock-adjustment")}
                >
                  ⚖ New Stock Adjustment
                </button>
              )}
            </div>
          </div>

          <div className="list-toolbar">
            <div className="list-search-box">
              <input
                type="search"
                value={txnSearch}
                onChange={(e) => {
                  setTxnSearch(e.target.value);
                  setStockTxnPagination((p) => ({ ...p, page: 1 }));
                }}
                placeholder="Search transactions by Reference No, SKU, Product Name, Batch, Reason, or User..."
              />
            </div>
            <div className="list-filter-controls">
              <select
                value={txnFilterCategory}
                onChange={(e) => {
                  setTxnFilterCategory(e.target.value as InventoryCategory | "ALL");
                  setStockTxnPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="ALL">All Permitted Categories</option>
                {permittedVerticals.includes("Grocery") && (
                  <option value="Grocery">🛒 Kirana</option>
                )}
                {permittedVerticals.includes("Pharmacy") && (
                  <option value="Pharmacy">💊 Pharmacy</option>
                )}
                {permittedVerticals.includes("Mall") && (
                  <option value="Mall">🏬 Mall</option>
                )}
              </select>

              <select
                value={txnFilterType}
                onChange={(e) => {
                  setTxnFilterType(e.target.value as StockTransactionType | "ALL");
                  setStockTxnPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="ALL">All Transaction Types</option>
                <option value="INITIAL_ENTRY">Initial Stock Entry</option>
                <option value="STOCK_ADDITION">Stock Addition (+)</option>
                <option value="STOCK_REDUCTION">Stock Reduction (-)</option>
                <option value="STOCK_CORRECTION">Stock Correction</option>
                <option value="STOCK_TRANSFER">Stock Transfer</option>
                <option value="STOCK_ADJUSTMENT">Stock Adjustment</option>
              </select>

              <input
                type="date"
                value={txnDateFrom}
                onChange={(e) => setTxnDateFrom(e.target.value)}
                aria-label="From date"
              />
              <input
                type="date"
                value={txnDateTo}
                onChange={(e) => setTxnDateTo(e.target.value)}
                aria-label="To date"
              />
            </div>
          </div>

          <div className="kirana-table-wrap">
            <table className="kirana-table">
              <thead>
                <tr>
                  <th>Reference No & Date/Time</th>
                  <th>Category & Product (SKU)</th>
                  <th>Transaction Type & Batch</th>
                  <th>Previous Qty</th>
                  <th>Added / Deducted</th>
                  <th>New Qty</th>
                  <th>Reason & Location</th>
                  <th>Performed By</th>
                </tr>
              </thead>
              <tbody>
                {stockTxnsLoading ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="inv-skeleton-row" />
                    </td>
                  </tr>
                ) : stockTxns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-table-cell">
                      No stock transactions match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  stockTxns.map((txn) => (
                    <tr key={txn.id}>
                      <td>
                        <code className="perm-code-chip">{txn.referenceNumber}</code>
                        <small>
                          {new Date(txn.createdAt).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`vertical-tag vertical-${txn.inventoryCategory.toLowerCase()}`}
                        >
                          {INVENTORY_CATEGORY_META[txn.inventoryCategory].shortName}
                        </span>
                        <strong>{txn.productName}</strong>
                        <small>{txn.sku}</small>
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            txn.transactionType === "STOCK_ADDITION" ||
                            txn.transactionType === "INITIAL_ENTRY"
                              ? "ready"
                              : txn.transactionType === "STOCK_TRANSFER"
                                ? "in-review"
                                : "waiting"
                          }`}
                        >
                          {txn.transactionType.replace(/_/g, " ")}
                        </span>
                        {txn.batchNumber && <small>Batch: {txn.batchNumber}</small>}
                      </td>
                      <td>
                        <strong>{txn.previousQuantity}</strong>
                      </td>
                      <td>
                        <strong
                          className={
                            txn.quantityDelta > 0
                              ? "text-success"
                              : txn.quantityDelta < 0
                                ? "text-danger"
                                : ""
                          }
                        >
                          {txn.quantityDelta > 0
                            ? `+${txn.quantityDelta}`
                            : txn.quantityDelta}
                        </strong>
                      </td>
                      <td>
                        <strong>{txn.newQuantity}</strong>
                      </td>
                      <td>
                        <strong>{txn.reason}</strong>
                        <small>
                          {txn.transactionType === "STOCK_TRANSFER"
                            ? `${txn.sourceLocation} → ${txn.destinationLocation}`
                            : txn.destinationLocation || txn.sourceLocation}
                        </small>
                      </td>
                      <td>
                        <strong>{txn.performedBy.name}</strong>
                        <small>{txn.performedBy.email}</small>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="list-pagination-bar">
            <span>
              Total Stock Transactions: <b>{stockTxnPagination.totalRecords}</b>
            </span>
            <div className="pagination-buttons">
              <button
                type="button"
                disabled={stockTxnPagination.page <= 1}
                onClick={() =>
                  setStockTxnPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
                }
              >
                ← Prev
              </button>
              {Array.from(
                { length: stockTxnPagination.totalPages },
                (_, i) => i + 1,
              ).map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  className={pNum === stockTxnPagination.page ? "active" : ""}
                  onClick={() => setStockTxnPagination((p) => ({ ...p, page: pNum }))}
                >
                  {pNum}
                </button>
              ))}
              <button
                type="button"
                disabled={stockTxnPagination.page >= stockTxnPagination.totalPages}
                onClick={() =>
                  setStockTxnPagination((p) => ({
                    ...p,
                    page: Math.min(p.totalPages, p.page + 1),
                  }))
                }
              >
                Next →
              </button>
            </div>
          </div>
        </article>
      )}

      {/* =====================================================================
          VIEW 5: STOCK ADJUSTMENT & STOCK MANAGEMENT SERVICE (Section 6)
      ===================================================================== */}
      {subRoute === "stock-adjustment" && (
        <div className="kirana-section-stack">
          <article className="dashboard-card">
            <div className="card-heading">
              <div>
                <p className="card-eyebrow">
                  SECTION 6 · ATOMIC STOCK MANAGEMENT SERVICE (ROW-LEVEL LOCKED)
                </p>
                <h2>
                  Stock Addition, Reduction, Physical Count Correction, Location Transfer & Adjustment
                </h2>
              </div>
              <span className="pill ready">Mandatory Transaction Logging Active</span>
            </div>

            {!invPerms.adjustStock ? (
              <div className="empty-state">
                <span>🔒</span>
                <strong>Adjust Stock Permission Required</strong>
                <p>Your user role does not have permission to modify stock quantities.</p>
              </div>
            ) : (
              <form className="universal-inventory-form" onSubmit={handleStockAdjustmentSubmit}>
                {adjError && (
                  <div className="dashboard-alert" role="alert">
                    {adjError}
                  </div>
                )}

                <div className="stock-adj-grid">
                  <label className="kirana-label">
                    <span className="field-title-line">1. Authorized Category *</span>
                    <select
                      value={adjCategory}
                      onChange={(e) =>
                        setAdjCategory(e.target.value as InventoryCategory)
                      }
                    >
                      {permittedVerticals.map((v) => (
                        <option key={v} value={v}>
                          {INVENTORY_CATEGORY_META[v].icon}{" "}
                          {INVENTORY_CATEGORY_META[v].displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="kirana-label">
                    <span className="field-title-line">2. Select Product SKU *</span>
                    <select
                      value={selectedAdjProduct?.id || ""}
                      onChange={(e) => setAdjProductId(e.target.value)}
                    >
                      {adjCategoryProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.sku}] {p.productName} ({p.stockQuantity}{" "}
                          {p.unitOfMeasurement})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="kirana-label">
                    <span className="field-title-line">3. Stock Operation Type *</span>
                    <select
                      value={adjType}
                      onChange={(e) =>
                        setAdjType(e.target.value as StockTransactionType)
                      }
                    >
                      <option value="STOCK_ADDITION">
                        Stock Addition (+ Purchase / Replenishment)
                      </option>
                      <option value="STOCK_REDUCTION">
                        Stock Reduction (- Sale / Dispense / Damage)
                      </option>
                      <option value="STOCK_ADJUSTMENT">
                        Stock Adjustment (- Shrinkage / Breakage / RTV)
                      </option>
                      <option value="STOCK_CORRECTION">
                        Stock Correction (= Physical Audit Count Override)
                      </option>
                      <option value="STOCK_TRANSFER">
                        Stock Transfer (⇄ Move Between Locations)
                      </option>
                    </select>
                  </label>

                  <label className="kirana-label">
                    <span className="field-title-line">
                      4. {adjType === "STOCK_CORRECTION" ? "Audit Count *" : "Quantity *"} (
                      {selectedAdjProduct?.unitOfMeasurement || "Units"})
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={adjQuantity}
                      onChange={(e) => setAdjQuantity(e.target.value)}
                    />
                  </label>

                  <label className="kirana-label">
                    <span className="field-title-line">5. Reference Number (Optional)</span>
                    <input
                      value={adjReference}
                      onChange={(e) => setAdjReference(e.target.value)}
                      placeholder="e.g. PO-2026-994 (Auto if blank)"
                    />
                  </label>

                  <label className="kirana-label">
                    <span className="field-title-line">
                      6. {adjType === "STOCK_TRANSFER" ? "Destination Location *" : "Store Location"}
                    </span>
                    <select
                      value={
                        adjType === "STOCK_TRANSFER"
                          ? adjDestLocation
                          : selectedAdjProduct?.storeLocation || adjDestLocation
                      }
                      disabled={adjType !== "STOCK_TRANSFER"}
                      onChange={(e) => setAdjDestLocation(e.target.value)}
                    >
                      {ALL_LOCATIONS.filter((l) => l !== "ALL").map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Pharmacy Batch-Wise Selection in a dedicated aligned sub-grid */}
                  {selectedAdjProduct?.inventoryCategory === "Pharmacy" && (
                    <div
                      className={`stock-adj-batch-box ${
                        adjBatchMode === "new" ? "four-cols" : "two-cols"
                      }`}
                    >
                      <label className="kirana-label">
                        <span className="field-title-line">Pharmacy Batch Mode *</span>
                        <select
                          value={adjBatchMode}
                          onChange={(e) =>
                            setAdjBatchMode(e.target.value as "existing" | "new")
                          }
                        >
                          <option value="existing">Modify Existing Medicine Batch</option>
                          {adjType === "STOCK_ADDITION" && (
                            <option value="new">+ Receive Brand-New Batch</option>
                          )}
                        </select>
                      </label>

                      {adjBatchMode === "existing" ? (
                        <label className="kirana-label">
                          <span className="field-title-line">Select Medicine Batch *</span>
                          <select
                            value={adjBatchNumber}
                            onChange={(e) => setAdjBatchNumber(e.target.value)}
                          >
                            {selectedAdjProduct.pharmacyFields?.batches.map((b) => (
                              <option key={b.batchId} value={b.batchNumber}>
                                Batch {b.batchNumber} — Available: {b.quantity} · Exp:{" "}
                                {b.expiryDate} · Cost: ₹{b.purchasePrice}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <>
                          <label className="kirana-label">
                            <span className="field-title-line">New Batch Number *</span>
                            <input
                              required
                              value={adjNewBatchNo}
                              onChange={(e) => setAdjNewBatchNo(e.target.value)}
                            />
                          </label>
                          <label className="kirana-label">
                            <span className="field-title-line">New Batch Expiry Date *</span>
                            <input
                              type="date"
                              required
                              value={adjNewBatchExp}
                              onChange={(e) => setAdjNewBatchExp(e.target.value)}
                            />
                          </label>
                          <label className="kirana-label">
                            <span className="field-title-line">New Batch Purchase Price (₹) *</span>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              required
                              value={adjNewBatchCost}
                              onChange={(e) => setAdjNewBatchCost(e.target.value)}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  <label className="kirana-label col-span-full">
                    <span className="field-title-line">7. Mandatory Transaction Reason *</span>
                    <input
                      required
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      placeholder="e.g. Supplier Invoice #SGT-402 received / Physical cycle count adjustment / Damaged pack write-off"
                    />
                  </label>
                </div>

                {/* Live Stock Impact Preview */}
                {selectedAdjProduct && (
                  <div className="variance-banner" style={{ marginTop: 0 }}>
                    <div>
                      <span>Previous Quantity</span>
                      <strong>
                        {selectedAdjProduct.stockQuantity}{" "}
                        {selectedAdjProduct.unitOfMeasurement}
                      </strong>
                    </div>
                    <div>
                      <span>Operation & Quantity Delta</span>
                      <strong>
                        {adjType.replace("STOCK_", "")} ({adjQuantity}{" "}
                        {selectedAdjProduct.unitOfMeasurement})
                      </strong>
                    </div>
                    <div>
                      <span>Performers & Governance</span>
                      <strong>
                        {currentUser.name} ({currentUser.email})
                      </strong>
                    </div>
                  </div>
                )}

                <div className="action-row-split">
                  <small className="form-helper-note">
                    Stock quantities are never updated without generating a corresponding immutable Stock Transaction and Audit Log.
                  </small>
                  <button
                    type="submit"
                    className="approve-button"
                    disabled={adjSubmitting}
                  >
                    {adjSubmitting
                      ? "Executing Locked Transaction..."
                      : "Commit Stock Modification"}
                  </button>
                </div>
              </form>
            )}
          </article>
        </div>
      )}

      {/* =====================================================================
          VIEW 6: INVENTORY REPORTS & IMMUTABLE AUDIT HISTORY (Section 3, 8, 9)
      ===================================================================== */}
      {subRoute === "reports" && (
        <div className="kirana-section-stack">
          <article className="dashboard-card">
            <div className="card-heading">
              <div>
                <p className="card-eyebrow">
                  SERVER-SIDE INVENTORY REPORTS & IMMUTABLE AUDIT HISTORY
                </p>
                <h2>
                  Valuation summaries, low-stock alerts, Pharmacy batch expiry & compliance audit trail
                </h2>
              </div>
              {invPerms.exportInventory && (
                <div className="header-actions">
                  <button
                    type="button"
                    className="subtle-button"
                    onClick={() => handleExportInventory("excel", "ALL")}
                  >
                    ⬇ Export Full Excel Report (.xls)
                  </button>
                  <button
                    type="button"
                    className="approve-button"
                    onClick={() => handleExportInventory("pdf", "ALL")}
                  >
                    ⬇ Export Server PDF Report (.pdf)
                  </button>
                </div>
              )}
            </div>

            <div className="permission-subtabs four-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "valuation"}
                className={activeReportTab === "valuation" ? "active" : ""}
                onClick={() => setActiveReportTab("valuation")}
              >
                1. Category Valuation Report
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "low-stock"}
                className={activeReportTab === "low-stock" ? "active" : ""}
                onClick={() => setActiveReportTab("low-stock")}
              >
                2. Low & Out-of-Stock Report
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "pharmacy-expiry"}
                className={activeReportTab === "pharmacy-expiry" ? "active" : ""}
                onClick={() => setActiveReportTab("pharmacy-expiry")}
              >
                3. Pharmacy Batch & Expiry
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeReportTab === "audit-trail"}
                className={activeReportTab === "audit-trail" ? "active" : ""}
                onClick={() => setActiveReportTab("audit-trail")}
              >
                4. Immutable Audit History
              </button>
            </div>

            {/* Report Tab 1: Category Valuation */}
            {activeReportTab === "valuation" && dashboardData && (
              <>
                <div className="kirana-table-wrap">
                  <table className="kirana-table">
                    <thead>
                      <tr>
                        <th>Inventory Category</th>
                        <th>Total SKUs</th>
                        <th>Active SKUs</th>
                        <th>Total Stock Units</th>
                        <th>Purchase Valuation (₹)</th>
                        <th>Retail Valuation (₹)</th>
                        <th>Projected Gross Margin</th>
                        <th>Export Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.categorySummary
                        .slice((valPage - 1) * valPageSize, valPage * valPageSize)
                        .map((row) => {
                          const profit = row.retailValue - row.purchaseValue;
                          const marginPct =
                            row.retailValue > 0
                              ? ((profit / row.retailValue) * 100).toFixed(1)
                              : "0.0";
                          return (
                            <tr key={row.category}>
                              <td>
                                <span
                                  className={`vertical-tag vertical-${row.category.toLowerCase()}`}
                                >
                                  {row.displayName}
                                </span>
                              </td>
                              <td>
                                <strong>{row.totalProducts}</strong>
                              </td>
                              <td>{row.activeProducts}</td>
                              <td>
                                <strong>{row.totalStockQuantity}</strong>
                              </td>
                              <td>
                                <strong>₹{row.purchaseValue.toLocaleString()}</strong>
                              </td>
                              <td>
                                <strong>₹{row.retailValue.toLocaleString()}</strong>
                              </td>
                              <td>
                                <span className="pill ready">
                                  +₹{profit.toLocaleString()} ({marginPct}%)
                                </span>
                              </td>
                              <td>
                                <div className="table-action-stack">
                                  <button
                                    type="button"
                                    className="subtle-button"
                                    onClick={() => handleExportInventory("excel", row.category)}
                                  >
                                    Excel
                                  </button>
                                  <button
                                    type="button"
                                    className="subtle-button"
                                    onClick={() => handleExportInventory("pdf", row.category)}
                                  >
                                    PDF
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalRecords={dashboardData.categorySummary.length}
                  page={valPage}
                  pageSize={valPageSize}
                  onPageChange={setValPage}
                  onPageSizeChange={setValPageSize}
                  pageSizeOptions={[3, 5, 10]}
                  itemLabel="inventory categories"
                />
              </>
            )}

            {/* Report Tab 2: Low Stock & Out-of-Stock */}
            {activeReportTab === "low-stock" && dashboardData && (
              <>
                <div className="kirana-table-wrap">
                  <table className="kirana-table">
                    <thead>
                      <tr>
                        <th>SKU & Category</th>
                        <th>Product Name</th>
                        <th>Supplier</th>
                        <th>Current Stock</th>
                        <th>Min / Max Threshold</th>
                        <th>Recommended Reorder Qty</th>
                        <th>Alert Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...dashboardData.outOfStockProducts,
                        ...dashboardData.lowStockProducts,
                      ]
                        .slice(
                          (lowReportPage - 1) * lowReportPageSize,
                          lowReportPage * lowReportPageSize,
                        )
                        .map((p) => {
                          const reorderQty = Math.max(
                            p.minimumStockLevel * 2,
                            p.maximumStockLevel - p.stockQuantity,
                          );
                          return (
                            <tr key={p.id}>
                              <td>
                                <code className="perm-code-chip">{p.sku}</code>
                                <small>
                                  {INVENTORY_CATEGORY_META[p.inventoryCategory].displayName}
                                </small>
                              </td>
                              <td>
                                <strong>{p.productName}</strong>
                                <small>{p.brand}</small>
                              </td>
                              <td>
                                <strong>{p.supplier}</strong>
                                <small>{p.supplierPhone}</small>
                              </td>
                              <td>
                                <strong
                                  className={p.stockQuantity <= 0 ? "text-danger" : ""}
                                >
                                  {p.stockQuantity} {p.unitOfMeasurement}
                                </strong>
                              </td>
                              <td>
                                Min: {p.minimumStockLevel} / Max: {p.maximumStockLevel}
                              </td>
                              <td>
                                <strong>
                                  +{reorderQty} {p.unitOfMeasurement} (₹
                                  {Math.round(reorderQty * p.purchasePrice).toLocaleString()})
                                </strong>
                              </td>
                              <td>{renderStockBadge(p)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalRecords={
                    dashboardData.outOfStockProducts.length +
                    dashboardData.lowStockProducts.length
                  }
                  page={lowReportPage}
                  pageSize={lowReportPageSize}
                  onPageChange={setLowReportPage}
                  onPageSizeChange={setLowReportPageSize}
                  pageSizeOptions={[5, 10, 20]}
                  itemLabel="low / out-of-stock products"
                />
              </>
            )}

            {/* Report Tab 3: Pharmacy Batch & Expiry Report */}
            {activeReportTab === "pharmacy-expiry" && dashboardData && (
              <>
                <div className="kirana-table-wrap">
                  <table className="kirana-table">
                    <thead>
                      <tr>
                        <th>Medicine & SKU</th>
                        <th>Batch Number</th>
                        <th>Schedule</th>
                        <th>Mfg Date → Expiry Date</th>
                        <th>Batch Qty</th>
                        <th>Batch Purchase Price</th>
                        <th>Expiry Compliance Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.pharmacyBatchAlerts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-table-cell">
                            No Pharmacy batches in your permitted scope.
                          </td>
                        </tr>
                      ) : (
                        dashboardData.pharmacyBatchAlerts
                          .slice(
                            (phmExpPage - 1) * phmExpPageSize,
                            phmExpPage * phmExpPageSize,
                          )
                          .map((entry) => (
                            <tr key={entry.batch.batchId}>
                              <td>
                                <strong>{entry.medicineName}</strong>
                                <small>{entry.sku}</small>
                              </td>
                              <td>
                                <code className="perm-code-chip">
                                  {entry.batch.batchNumber}
                                </code>
                              </td>
                              <td>
                                <span className="pill in-review">{entry.schedule}</span>
                              </td>
                              <td>
                                <strong>
                                  {entry.batch.manufacturingDate} → {entry.batch.expiryDate}
                                </strong>
                              </td>
                              <td>
                                <strong>{entry.batch.quantity} units</strong>
                              </td>
                              <td>₹{entry.batch.purchasePrice}</td>
                              <td>
                                {entry.expiryStatus === "EXPIRED" ? (
                                  <span className="pill alert-month">
                                    🚨 Expired ({Math.abs(entry.daysRemaining)}d ago)
                                  </span>
                                ) : entry.expiryStatus === "EXPIRING_SOON" ? (
                                  <span className="pill waiting">
                                    ⚠ Expiring Soon ({entry.daysRemaining}d left)
                                  </span>
                                ) : (
                                  <span className="pill ready">
                                    ✓ Valid ({entry.daysRemaining}d remaining)
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalRecords={dashboardData.pharmacyBatchAlerts.length}
                  page={phmExpPage}
                  pageSize={phmExpPageSize}
                  onPageChange={setPhmExpPage}
                  onPageSizeChange={setPhmExpPageSize}
                  pageSizeOptions={[5, 10, 20]}
                  itemLabel="pharmacy batches"
                />
              </>
            )}

            {/* Report Tab 4: Immutable Audit History (Section 8) */}
            {activeReportTab === "audit-trail" && (
              <div>
                <div className="list-toolbar">
                  <div className="list-search-box">
                    <input
                      type="search"
                      value={auditSearch}
                      onChange={(e) => {
                        setAuditSearch(e.target.value);
                        setAuditPagination((p) => ({ ...p, page: 1 }));
                      }}
                      placeholder="Search audit trail by SKU, Product Name, User, or Operation..."
                    />
                  </div>
                  <div className="list-filter-controls">
                    <select
                      value={auditCategoryFilter}
                      onChange={(e) => {
                        setAuditCategoryFilter(
                          e.target.value as InventoryCategory | "ALL",
                        );
                        setAuditPagination((p) => ({ ...p, page: 1 }));
                      }}
                    >
                      <option value="ALL">All Categories</option>
                      {permittedVerticals.includes("Grocery") && (
                        <option value="Grocery">Kirana</option>
                      )}
                      {permittedVerticals.includes("Pharmacy") && (
                        <option value="Pharmacy">Pharmacy</option>
                      )}
                      {permittedVerticals.includes("Mall") && (
                        <option value="Mall">Mall</option>
                      )}
                    </select>

                    <select
                      value={auditOpFilter}
                      onChange={(e) => {
                        setAuditOpFilter(e.target.value as AuditOperationType | "ALL");
                        setAuditPagination((p) => ({ ...p, page: 1 }));
                      }}
                    >
                      <option value="ALL">All Audited Operations</option>
                      <option value="INVENTORY_CREATED">Inventory Creation</option>
                      <option value="INVENTORY_MODIFIED">Inventory Modification</option>
                      <option value="STOCK_ADJUSTED">Stock Adjustment</option>
                      <option value="SUPPLIER_CHANGED">Supplier Changes</option>
                      <option value="PRICE_CHANGED">Price Changes</option>
                      <option value="STATUS_CHANGED">Status Changes</option>
                      <option value="BATCH_MODIFIED">Batch Modifications</option>
                    </select>
                  </div>
                </div>

                <div className="kirana-table-wrap">
                  <table className="kirana-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User & Role</th>
                        <th>Operation</th>
                        <th>Affected Record (SKU)</th>
                        <th>Audit Summary & Before → After Values</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLoading ? (
                        <tr>
                          <td colSpan={5}>
                            <div className="inv-skeleton-row" />
                          </td>
                        </tr>
                      ) : auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="empty-table-cell">
                            No audit records match your filter.
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td>
                              <strong>
                                {new Date(log.timestamp).toLocaleString("en-IN", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </strong>
                              <small>Immutable Audit Record</small>
                            </td>
                            <td>
                              <strong>{log.user.name}</strong>
                              <small>
                                {log.user.role || "Admin"} · {log.user.email}
                              </small>
                            </td>
                            <td>
                              <span className="perm-type-badge type-user">
                                {log.operation.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td>
                              <div className="status-cell-stack">
                                <code className="perm-code-chip">{log.sku}</code>
                                <strong>{log.productName}</strong>
                              </div>
                            </td>
                            <td>
                              <strong>{log.summary}</strong>
                              <div className="audit-diff-chips">
                                {log.changes.map((c, idx) => (
                                  <span key={idx} className="audit-diff-item">
                                    <b>{c.field}:</b> {String(c.before)} →{" "}
                                    <ins>{String(c.after)}</ins>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <TablePagination
                  totalRecords={auditPagination.totalRecords}
                  page={auditPagination.page}
                  pageSize={auditPagination.pageSize}
                  onPageChange={(nextPage) =>
                    setAuditPagination((p) => ({ ...p, page: nextPage }))
                  }
                  onPageSizeChange={(nextSize) =>
                    setAuditPagination((p) => ({ ...p, pageSize: nextSize, page: 1 }))
                  }
                  pageSizeOptions={[6, 12, 24]}
                  itemLabel="immutable audit log records"
                />
              </div>
            )}
          </article>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: VIEW INVENTORY DETAILS + BATCHES + HISTORY
      ===================================================================== */}
      {viewingProduct && (
        <div
          className="inv-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-modal-title"
        >
          <div className="inv-modal-card">
            <div className="card-heading">
              <div>
                <p className="card-eyebrow">
                  VIEW INVENTORY RECORD ·{" "}
                  {INVENTORY_CATEGORY_META[viewingProduct.inventoryCategory].displayName.toUpperCase()}
                </p>
                <h2 id="view-modal-title">
                  {viewingProduct.productName} ({viewingProduct.sku})
                </h2>
              </div>
              <button
                type="button"
                className="subtle-button"
                onClick={() => setViewingProduct(null)}
              >
                ✕ Close
              </button>
            </div>

            {viewModalLoading ? (
              <div className="inv-skeleton-row" />
            ) : (
              <div className="kirana-section-stack">
                <div className="universal-form-grid">
                  <div>
                    <small className="card-eyebrow">SKU & BARCODE</small>
                    <strong>
                      {viewingProduct.sku} · {viewingProduct.barcode}
                    </strong>
                  </div>
                  <div>
                    <small className="card-eyebrow">BRAND & CATEGORY</small>
                    <strong>
                      {viewingProduct.brand} · {viewingProduct.productCategory}
                    </strong>
                  </div>
                  <div>
                    <small className="card-eyebrow">SUPPLIER</small>
                    <strong>
                      {viewingProduct.supplier} ({viewingProduct.supplierPhone || "N/A"})
                    </strong>
                  </div>
                  <div>
                    <small className="card-eyebrow">PRICING & TAX</small>
                    <strong>
                      Cost: ₹{viewingProduct.purchasePrice} · Sell: ₹
                      {viewingProduct.sellingPrice} · MRP: ₹{viewingProduct.mrp} (
                      {viewingProduct.taxInformation})
                    </strong>
                  </div>
                  <div>
                    <small className="card-eyebrow">LIVE STOCK & THRESHOLDS</small>
                    <strong>
                      {viewingProduct.stockQuantity} {viewingProduct.unitOfMeasurement} (Min:{" "}
                      {viewingProduct.minimumStockLevel} / Max:{" "}
                      {viewingProduct.maximumStockLevel})
                    </strong>
                  </div>
                  <div>
                    <small className="card-eyebrow">STATUS & LOCATION</small>
                    <strong>
                      {viewingProduct.status} · {viewingProduct.storeLocation}
                    </strong>
                  </div>
                </div>

                {/* Category-Specific Section */}
                {viewingProduct.inventoryCategory === "Grocery" &&
                  viewingProduct.kiranaFields && (
                    <div className="kirana-form-box">
                      <p className="card-eyebrow">KIRANA-SPECIFIC ATTRIBUTES</p>
                      <p style={{ margin: 0, fontSize: "11px" }}>
                        <b>Subcategory:</b> {viewingProduct.kiranaFields.grocerySubcategory} |{" "}
                        <b>Weight/Volume:</b> {viewingProduct.kiranaFields.weightVolume} |{" "}
                        <b>Mfg:</b> {viewingProduct.kiranaFields.manufacturingDate || "N/A"} |{" "}
                        <b>Expiry:</b> {viewingProduct.kiranaFields.expiryDate || "N/A"} |{" "}
                        <b>Storage:</b> {viewingProduct.kiranaFields.storageInformation}
                      </p>
                    </div>
                  )}

                {viewingProduct.inventoryCategory === "Pharmacy" &&
                  viewingProduct.pharmacyFields && (
                    <div className="kirana-form-box">
                      <p className="card-eyebrow">
                        PHARMACY-SPECIFIC ATTRIBUTES & MULTI-BATCH BREAKDOWN
                      </p>
                      <p style={{ margin: 0, fontSize: "11px" }}>
                        <b>Generic Name:</b> {viewingProduct.pharmacyFields.genericName} |{" "}
                        <b>Composition:</b> {viewingProduct.pharmacyFields.composition} |{" "}
                        <b>Manufacturer:</b> {viewingProduct.pharmacyFields.manufacturer} |{" "}
                        <b>Schedule:</b> {viewingProduct.pharmacyFields.scheduleClassification} |{" "}
                        <b>Rx Required:</b>{" "}
                        {viewingProduct.pharmacyFields.prescriptionRequired ? "Yes" : "No"} |{" "}
                        <b>Licence:</b> {viewingProduct.pharmacyFields.applicableLicenceInfo}
                      </p>
                      <div className="kirana-table-wrap">
                        <table className="kirana-table">
                          <thead>
                            <tr>
                              <th>Batch No</th>
                              <th>Mfg Date</th>
                              <th>Expiry Date</th>
                              <th>Batch Qty</th>
                              <th>Purchase Price</th>
                              <th>Selling Price</th>
                              <th>MRP</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {viewingProduct.pharmacyFields.batches.map((b) => {
                              const exp = getBatchExpiryStatus(b.expiryDate);
                              return (
                                <tr key={b.batchId}>
                                  <td>
                                    <code>{b.batchNumber}</code>
                                  </td>
                                  <td>{b.manufacturingDate}</td>
                                  <td>{b.expiryDate}</td>
                                  <td>
                                    <strong>{b.quantity}</strong>
                                  </td>
                                  <td>₹{b.purchasePrice}</td>
                                  <td>₹{b.sellingPrice}</td>
                                  <td>₹{b.mrp}</td>
                                  <td>
                                    <span
                                      className={`pill ${
                                        exp.status === "EXPIRED"
                                          ? "alert-month"
                                          : exp.status === "EXPIRING_SOON"
                                            ? "waiting"
                                            : "ready"
                                      }`}
                                    >
                                      {exp.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                {viewingProduct.inventoryCategory === "Mall" &&
                  viewingProduct.mallFields && (
                    <div className="kirana-form-box">
                      <p className="card-eyebrow">MALL / SUPERMARKET-SPECIFIC ATTRIBUTES</p>
                      <p style={{ margin: 0, fontSize: "11px" }}>
                        <b>Department:</b> {viewingProduct.mallFields.department} |{" "}
                        <b>Model:</b> {viewingProduct.mallFields.productModel} |{" "}
                        <b>Variant:</b> {viewingProduct.mallFields.productVariant} |{" "}
                        <b>Size:</b> {viewingProduct.mallFields.size} | <b>Colour:</b>{" "}
                        {viewingProduct.mallFields.colour} | <b>Location:</b>{" "}
                        {viewingProduct.mallFields.warehouseStoreLocation}
                      </p>
                    </div>
                  )}

                {/* Recent Stock & Audit Logs for this Product */}
                <div className="kirana-form-box">
                  <p className="card-eyebrow">
                    RECENT STOCK TRANSACTIONS ({viewingProductTxns.length}) & AUDIT LOGS (
                    {viewingProductAudits.length})
                  </p>
                  <div className="pipeline-list" style={{ marginTop: "6px" }}>
                    {viewingProductTxns.slice(0, 4).map((t) => (
                      <div className="pipeline-row" key={t.id}>
                        <span className="pipeline-icon blue">⇄</span>
                        <div>
                          <strong>
                            {t.referenceNumber} · {t.transactionType.replace(/_/g, " ")} (
                            {t.previousQuantity} → {t.newQuantity})
                          </strong>
                          <small>
                            {t.reason} · By {t.performedBy.name} on{" "}
                            {new Date(t.createdAt).toLocaleDateString()}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: EDIT INVENTORY MODAL (WITH AUDITED DIFFS & MULTI-BATCH EDIT)
      ===================================================================== */}
      {editingProduct && (
        <div
          className="inv-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-modal-title"
        >
          <div className="inv-modal-card">
            <div className="card-heading">
              <div>
                <p className="card-eyebrow">
                  EDIT INVENTORY RECORD (AUDITED MODIFICATION)
                </p>
                <h2 id="edit-modal-title">
                  Edit {editingProduct.productName} ({editingProduct.sku})
                </h2>
              </div>
              <button
                type="button"
                className="subtle-button"
                onClick={() => setEditingProduct(null)}
              >
                ✕ Cancel
              </button>
            </div>

            <form className="universal-inventory-form" onSubmit={saveEditedProduct}>
              {editErrors.length > 0 && (
                <div className="dashboard-alert" role="alert">
                  {editErrors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}

              <div className="universal-form-grid">
                <label className="kirana-label">
                  Product Name *
                  <input
                    required
                    value={editingProduct.productName}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, productName: e.target.value })
                    }
                  />
                </label>

                <label className="kirana-label">
                  SKU *
                  <input
                    required
                    value={editingProduct.sku}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, sku: e.target.value })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Barcode *
                  <input
                    required
                    value={editingProduct.barcode}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, barcode: e.target.value })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Brand *
                  <input
                    required
                    value={editingProduct.brand}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, brand: e.target.value })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Supplier *
                  <input
                    required
                    value={editingProduct.supplier}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, supplier: e.target.value })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Status (Active / Inactive) *
                  <select
                    value={editingProduct.status}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        status: e.target.value as InventoryStatus,
                      })
                    }
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive (Preserved in Ledger)</option>
                  </select>
                </label>

                <label className="kirana-label">
                  Purchase Price (₹) *
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.purchasePrice}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        purchasePrice: Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Selling Price (₹) *
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.sellingPrice}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        sellingPrice: Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label className="kirana-label">
                  MRP (₹) *
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.mrp}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        mrp: Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Min Stock Level *
                  <input
                    type="number"
                    required
                    value={editingProduct.minimumStockLevel}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        minimumStockLevel: Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Max Stock Level *
                  <input
                    type="number"
                    required
                    value={editingProduct.maximumStockLevel}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        maximumStockLevel: Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label className="kirana-label">
                  Store Location *
                  <input
                    required
                    value={editingProduct.storeLocation}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        storeLocation: e.target.value,
                      })
                    }
                  />
                </label>
              </div>

              {/* Pharmacy Multi-Batch Editor inside Edit Modal */}
              {editingProduct.inventoryCategory === "Pharmacy" &&
                editingProduct.pharmacyFields && (
                  <div className="kirana-form-box">
                    <div className="card-heading">
                      <strong>Edit Pharmacy Batches (Syncs stock & logs BATCH_MODIFIED)</strong>
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={() => {
                          const pf = editingProduct.pharmacyFields!;
                          setEditingProduct({
                            ...editingProduct,
                            pharmacyFields: {
                              ...pf,
                              batches: [
                                ...pf.batches,
                                {
                                  batchId: `bat-ed-${Date.now()}`,
                                  batchNumber: `PH-NEW-${pf.batches.length + 1}`,
                                  manufacturingDate: "2026-09-01",
                                  expiryDate: "2028-08-31",
                                  quantity: 10,
                                  purchasePrice: editingProduct.purchasePrice,
                                  sellingPrice: editingProduct.sellingPrice,
                                  mrp: editingProduct.mrp,
                                  location: editingProduct.storeLocation,
                                },
                              ],
                            },
                          });
                        }}
                      >
                        + Add Batch
                      </button>
                    </div>
                    <div className="kirana-table-wrap">
                      <table className="kirana-table">
                        <thead>
                          <tr>
                            <th>Batch No</th>
                            <th>Expiry Date</th>
                            <th>Quantity</th>
                            <th>Purchase Price (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editingProduct.pharmacyFields.batches.map((b, bIdx) => (
                            <tr key={b.batchId}>
                              <td>
                                <input
                                  className="inv-table-input"
                                  value={b.batchNumber}
                                  onChange={(e) => {
                                    const nextBatches = [
                                      ...editingProduct.pharmacyFields!.batches,
                                    ];
                                    nextBatches[bIdx] = {
                                      ...nextBatches[bIdx],
                                      batchNumber: e.target.value,
                                    };
                                    setEditingProduct({
                                      ...editingProduct,
                                      pharmacyFields: {
                                        ...editingProduct.pharmacyFields!,
                                        batches: nextBatches,
                                      },
                                    });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  className="inv-table-input"
                                  value={b.expiryDate}
                                  onChange={(e) => {
                                    const nextBatches = [
                                      ...editingProduct.pharmacyFields!.batches,
                                    ];
                                    nextBatches[bIdx] = {
                                      ...nextBatches[bIdx],
                                      expiryDate: e.target.value,
                                    };
                                    setEditingProduct({
                                      ...editingProduct,
                                      pharmacyFields: {
                                        ...editingProduct.pharmacyFields!,
                                        batches: nextBatches,
                                      },
                                    });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  className="inv-table-input"
                                  value={b.quantity}
                                  onChange={(e) => {
                                    const nextBatches = [
                                      ...editingProduct.pharmacyFields!.batches,
                                    ];
                                    nextBatches[bIdx] = {
                                      ...nextBatches[bIdx],
                                      quantity: Number(e.target.value),
                                    };
                                    setEditingProduct({
                                      ...editingProduct,
                                      pharmacyFields: {
                                        ...editingProduct.pharmacyFields!,
                                        batches: nextBatches,
                                      },
                                    });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="inv-table-input"
                                  value={b.purchasePrice}
                                  onChange={(e) => {
                                    const nextBatches = [
                                      ...editingProduct.pharmacyFields!.batches,
                                    ];
                                    nextBatches[bIdx] = {
                                      ...nextBatches[bIdx],
                                      purchasePrice: Number(e.target.value),
                                    };
                                    setEditingProduct({
                                      ...editingProduct,
                                      pharmacyFields: {
                                        ...editingProduct.pharmacyFields!,
                                        batches: nextBatches,
                                      },
                                    });
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              <div className="action-row-split">
                <small className="form-helper-note">
                  All changes are validated on the server and logged with before/after values in the Audit History.
                </small>
                <div className="table-action-stack">
                  <button
                    type="button"
                    className="subtle-button"
                    onClick={() => setEditingProduct(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="approve-button" disabled={editSaving}>
                    {editSaving ? "Saving..." : "✓ Save Audited Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CONFIRMATION DIALOG (Section 12)
      ===================================================================== */}
      {confirmDialog && (
        <div
          className="inv-modal-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="inv-modal-card confirm-card">
            <h2 id="confirm-dialog-title">{confirmDialog.title}</h2>
            <p style={{ fontSize: "12px", color: "#555e6b", lineHeight: 1.55 }}>
              {confirmDialog.message}
            </p>
            <div className="action-row-split" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="subtle-button"
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="approve-button"
                onClick={confirmDialog.onConfirm}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
