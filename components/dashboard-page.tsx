"use client";

import { useEffect, useRef, useState, type FormEvent, type UIEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ALL_MENU_KEYS,
  ALL_MODULE_KEYS,
  ALL_VERTICALS,
  DEFAULT_INVENTORY_PERMISSIONS,
  clearSession,
  normalizeUserPermissions,
  readSession,
  readUsers,
  saveSession,
  saveUsers,
  type AdminUser,
  type MenuPermissionKey,
  type ModulePermissionKey,
  type VendorVerticalPermission,
} from "@/lib/auth-storage";
import { InventoryModule } from "@/components/inventory-module";
import { TablePagination, paginateSlice } from "@/components/table-pagination";
import { UserPermissionModule } from "@/components/user-permission-module";
import type { InventorySubRoute } from "@/lib/inventory-types";
import {
  APP_ROUTES,
  INVENTORY_SUBROUTE_TO_PATH,
  MENU_KEY_TO_PATH,
  resolveRouteFromPathname,
} from "@/lib/routes";
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_COMBOS,
  INITIAL_INVENTORY,
  INITIAL_KHATA_CUSTOMERS,
  INITIAL_OCR_INVOICE,
  INITIAL_RTV_ITEMS,
  INITIAL_SUPPLIERS,
  INITIAL_WHATSAPP_ORDERS,
  VENDOR_VERTICAL_CONFIG,
  type DeadStockCombo,
  type KhataCustomer,
  type LooseInventoryItem,
  type OcrInvoiceLine,
  type RtvEntry,
  type StaffAuditEntry,
  type SupplierQuote,
  type VendorVertical,
  type WhatsAppOrder,
} from "@/lib/kirana-data";

type ActiveTab = MenuPermissionKey;

const INVENTORY_STORAGE_KEY = "vendor-purchase-universal-inventory-v1";

const SEED_STAFF_USERS: AdminUser[] = [
  {
    id: "staff-pharmacy-lead",
    name: "Dr. Neha Verma",
    email: "pharmacy@vendor.test",
    company: "LifeCare Medico & Pharmacy",
    role: "Pharmacy Manager",
    passwordHash: "seeded-staff-account",
    approved: true,
    createdAt: "2026-11-10T09:00:00.000Z",
    allowedVerticals: ["Pharmacy"],
    userPermissions: {
      canAddInventory: true,
      canNotifyVendors: true,
      canOverridePrice: true,
      canApproveUsers: false,
    },
    menuPermissions: [
      "overview",
      "inventory-hub",
      "store-floor",
      "profit-guard",
      "suppliers-khata",
      "gst-pulse",
    ],
    modulePermissions: [
      "posBilling",
      "ocrScanner",
      "barcodeGenerator",
      "marginDrift",
      "autoPo",
      "gstExport",
    ],
  },
  {
    id: "staff-mall-head",
    name: "Arjun Mehta",
    email: "mall@vendor.test",
    company: "Metro Square Supermarket & Mall",
    role: "Supermarket Floor Head",
    passwordHash: "seeded-staff-account",
    approved: true,
    createdAt: "2026-11-12T10:30:00.000Z",
    allowedVerticals: ["Mall"],
    userPermissions: {
      canAddInventory: true,
      canNotifyVendors: true,
      canOverridePrice: false,
      canApproveUsers: false,
    },
    menuPermissions: [
      "overview",
      "inventory-hub",
      "store-floor",
      "profit-guard",
      "retention",
      "gst-pulse",
    ],
    modulePermissions: [
      "posBilling",
      "barcodeGenerator",
      "comboBuilder",
      "auditLogs",
      "whatsappAi",
      "gstExport",
    ],
  },
  {
    id: "staff-grocery-lead",
    name: "Ramesh Gupta",
    email: "ramesh.kirana@vendor.test",
    company: "Shree Ganesh Kirana & Superstore",
    role: "Procurement Lead",
    passwordHash: "seeded-staff-account",
    approved: true,
    createdAt: "2026-11-13T08:15:00.000Z",
    allowedVerticals: ["Grocery"],
    userPermissions: {
      canAddInventory: true,
      canNotifyVendors: true,
      canOverridePrice: true,
      canApproveUsers: false,
    },
    menuPermissions: [
      "overview",
      "inventory-hub",
      "store-floor",
      "suppliers-khata",
      "retention",
    ],
    modulePermissions: [
      "posBilling",
      "ocrScanner",
      "barcodeGenerator",
      "autoPo",
      "digitalKhata",
      "whatsappAi",
    ],
  },
  {
    id: "staff-pharma-chemist",
    name: "Kiran Deshmukh",
    email: "kiran.rx@vendor.test",
    company: "LifeCare Medico & Pharmacy",
    role: "Registered Pharmacist",
    passwordHash: "seeded-staff-account",
    approved: true,
    createdAt: "2026-11-14T11:20:00.000Z",
    allowedVerticals: ["Pharmacy"],
    userPermissions: {
      canAddInventory: true,
      canNotifyVendors: false,
      canOverridePrice: false,
      canApproveUsers: false,
    },
    menuPermissions: ["overview", "inventory-hub", "store-floor"],
    modulePermissions: ["posBilling", "ocrScanner", "barcodeGenerator"],
  },
  {
    id: "staff-finance-auditor",
    name: "Priya Nair",
    email: "priya.audit@vendor.test",
    company: "VendorPurchase Retail Group",
    role: "Finance Reviewer",
    passwordHash: "seeded-staff-account",
    approved: true,
    createdAt: "2026-11-14T15:45:00.000Z",
    allowedVerticals: ["Grocery", "Pharmacy", "Mall"],
    userPermissions: {
      canAddInventory: false,
      canNotifyVendors: true,
      canOverridePrice: true,
      canApproveUsers: false,
    },
    menuPermissions: ["overview", "profit-guard", "suppliers-khata", "gst-pulse"],
    modulePermissions: ["marginDrift", "auditLogs", "autoPo", "digitalKhata", "gstExport"],
  },
  {
    id: "staff-mall-cashier",
    name: "Sandeep Kulkarni",
    email: "sandeep.pos@vendor.test",
    company: "Metro Square Supermarket & Mall",
    role: "POS Counter Cashier",
    passwordHash: "seeded-staff-account",
    approved: true,
    createdAt: "2026-11-15T09:10:00.000Z",
    allowedVerticals: ["Grocery", "Mall"],
    userPermissions: {
      canAddInventory: false,
      canNotifyVendors: false,
      canOverridePrice: false,
      canApproveUsers: false,
    },
    menuPermissions: ["overview", "store-floor", "retention"],
    modulePermissions: ["posBilling", "barcodeGenerator", "comboBuilder", "whatsappAi"],
  },
  {
    id: "staff-pending-vendor",
    name: "Ankit Sharma",
    email: "ankit.supply@vendor.test",
    company: "Apex Medico & Surgical",
    role: "Vendor Manager",
    passwordHash: "seeded-staff-account",
    approved: false,
    createdAt: "2026-11-16T07:30:00.000Z",
    allowedVerticals: ["Pharmacy", "Grocery"],
    userPermissions: {
      canAddInventory: true,
      canNotifyVendors: true,
      canOverridePrice: false,
      canApproveUsers: false,
    },
    menuPermissions: ["overview", "inventory-hub", "suppliers-khata"],
    modulePermissions: ["ocrScanner", "autoPo"],
  },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState("");
  const [inventoryMenuOpen, setInventoryMenuOpen] = useState(true);
  const [inventoryListSubOpen, setInventoryListSubOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [toastMessage, setToastMessage] = useState("");
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("up");
  const [isScrolled, setIsScrolled] = useState(false);
  const lastScrollTopRef = useRef(0);

  function handleMainScroll(e: UIEvent<HTMLElement>) {
    const currentTop = e.currentTarget.scrollTop;
    const delta = currentTop - lastScrollTopRef.current;
    setIsScrolled(currentTop > 12);
    if (Math.abs(delta) > 4) {
      setScrollDirection(delta > 0 ? "down" : "up");
      lastScrollTopRef.current = currentTop;
    }
  }

  // Derive activeTab and inventorySubRoute from current react-router-dom URL pathname
  const { activeTab, inventorySubRoute } = resolveRouteFromPathname(location.pathname);

  function setActiveTab(tab: ActiveTab) {
    navigate(MENU_KEY_TO_PATH[tab]);
  }

  // Active vertical scope within what the logged-in user is permitted to see
  const [activeVerticalScope, setActiveVerticalScope] = useState<"ALL" | VendorVertical>("ALL");

  // Universal Multi-Vendor Inventory & operational state
  const [inventory, setInventory] = useState<LooseInventoryItem[]>(INITIAL_INVENTORY);
  const [ocrLines] = useState<OcrInvoiceLine[]>(INITIAL_OCR_INVOICE);
  const [ocrImported, setOcrImported] = useState(false);
  const [auditLogs] = useState<StaffAuditEntry[]>(INITIAL_AUDIT_LOGS);
  const [combos, setCombos] = useState<DeadStockCombo[]>(INITIAL_COMBOS);
  const [suppliers, setSuppliers] = useState<SupplierQuote[]>(INITIAL_SUPPLIERS);
  const [rtvItems, setRtvItems] = useState<RtvEntry[]>(INITIAL_RTV_ITEMS);
  const [khataCustomers, setKhataCustomers] = useState<KhataCustomer[]>(INITIAL_KHATA_CUSTOMERS);
  const [waOrders, setWaOrders] = useState<WhatsAppOrder[]>(INITIAL_WHATSAPP_ORDERS);

  // Universal Add-Inventory Form State (Supports Grocery, Pharmacy, Mall)
  const [newVendorType, setNewVendorType] = useState<VendorVertical>("Grocery");
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("KRN-5012");
  const [newCategory, setNewCategory] = useState(VENDOR_VERTICAL_CONFIG.Grocery.categories[0]);
  const [newUnitType, setNewUnitType] = useState(VENDOR_VERTICAL_CONFIG.Grocery.unitTypes[0]);
  const [newIsLoose, setNewIsLoose] = useState(true);
  const [newBulkLabel, setNewBulkLabel] = useState("50 kg Sack (×2)");
  const [newLocation, setNewLocation] = useState("Aisle 1 · Bin S-04");
  const [newAttributeNote, setNewAttributeNote] = useState("FSSAI Grade-A · Loose Split Enabled");
  const [newStockQty, setNewStockQty] = useState("100");
  const [newReorderLevel, setNewReorderLevel] = useState("25");
  const [newCostPrice, setNewCostPrice] = useState("52");
  const [newRetailPrice, setNewRetailPrice] = useState("60");
  const [newMrpPrice, setNewMrpPrice] = useState("65");
  const [newGstSlab, setNewGstSlab] = useState<0 | 5 | 12 | 18>(5);
  const [newBatchNo, setNewBatchNo] = useState("B-2611-NEW");
  const [newExpiryDate, setNewExpiryDate] = useState("2027-09-30");
  const [newDaysUnused, setNewDaysUnused] = useState("0");
  const [newSupplierName, setNewSupplierName] = useState(
    VENDOR_VERTICAL_CONFIG.Grocery.defaultSupplier,
  );
  const [newSupplierPhone, setNewSupplierPhone] = useState(
    VENDOR_VERTICAL_CONFIG.Grocery.defaultSupplierPhone,
  );

  // Dormancy Filter State
  const [dormancyFilter, setDormancyFilter] = useState<"ALL" | "WEEK_PLUS" | "MONTH_PLUS" | "ACTIVE">(
    "ALL",
  );

  // Store-Floor POS Billing calculator state (works for Grocery, Pharmacy, and Supermarket!)
  const [selectedPosItemId, setSelectedPosItemId] = useState<string>("inv-1");
  const [billingMode, setBillingMode] = useState<"rupee" | "weight">("rupee");
  const [rupeeInput, setRupeeInput] = useState<string>("50");
  const [gramsInput, setGramsInput] = useState<string>("1000");
  const [pharmacyTabsInput, setPharmacyTabsInput] = useState<string>("5"); // e.g., 5 loose tablets from strip
  const [mallUnitsInput, setMallUnitsInput] = useState<string>("1");
  const [pouchPackCount, setPouchPackCount] = useState<number>(10);
  const [posCart, setPosCart] = useState<
    { id: string; label: string; weightLabel: string; amount: number; barcode: string }[]
  >([
    {
      id: "cart-init-1",
      label: "M-30 Refined Sugar (₹50 loose split)",
      weightLabel: "1.136 kg (1,136 g)",
      amount: 50,
      barcode: "290301101136",
    },
  ]);

  // Profit Protection state
  const [marginThreshold, setMarginThreshold] = useState<number>(10);

  // Table Pagination State across Dashboard & Store-Operations Listings
  const [dashThreshPage, setDashThreshPage] = useState(1);
  const [dashThreshPageSize, setDashThreshPageSize] = useState(5);
  const [dashThreshCollapseOpen, setDashThreshCollapseOpen] = useState(false);
  const [ovInvPage, setOvInvPage] = useState(1);
  const [ovInvPageSize, setOvInvPageSize] = useState(5);
  const [hubInvPage, setHubInvPage] = useState(1);
  const [hubInvPageSize, setHubInvPageSize] = useState(5);
  const [ocrPage, setOcrPage] = useState(1);
  const [ocrPageSize, setOcrPageSize] = useState(5);
  const [driftPage, setDriftPage] = useState(1);
  const [driftPageSize, setDriftPageSize] = useState(5);
  const [gstPage, setGstPage] = useState(1);
  const [gstPageSize, setGstPageSize] = useState(4);

  // RTV quick form state
  const [newRtvItem, setNewRtvItem] = useState("");
  const [newRtvSupplier, setNewRtvSupplier] = useState("Shree Ganesh Trading Co.");
  const [newRtvReason, setNewRtvReason] = useState<RtvEntry["reason"]>("Rodent/Pest Damage");
  const [newRtvAmount, setNewRtvAmount] = useState("320");

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const session = readSession();
        if (!session) {
          navigate(APP_ROUTES.LOGIN, { replace: true });
          return;
        }
        let storedUsers = readUsers();
        // Ensure seeded staff accounts exist so the User Module has Pharmacy & Supermarket profiles
        const existingIds = new Set(storedUsers.map((u) => u.id));
        const missingSeeds = SEED_STAFF_USERS.filter((s) => !existingIds.has(s.id));
        if (missingSeeds.length > 0) {
          storedUsers = [...storedUsers, ...missingSeeds.map((s) => normalizeUserPermissions(s))];
          saveUsers(storedUsers);
        }

        const current = storedUsers.find((item) => item.id === session.id);
        if (!current?.approved) {
          clearSession();
          navigate(APP_ROUTES.LOGIN, { replace: true });
          return;
        }
        const normalizedCurrent = normalizeUserPermissions(current);
        setUser(normalizedCurrent);
        setAllUsers(storedUsers);
        setPendingUsers(storedUsers.filter((item) => !item.approved));

        // Sync initial vertical scope to user's permitted verticals
        if (normalizedCurrent.allowedVerticals.length === 1) {
          const singleVert = normalizedCurrent.allowedVerticals[0];
          setActiveVerticalScope(singleVert);
          setNewVendorType(singleVert);
        }

        // Load persisted universal inventory if present
        const savedInv = localStorage.getItem(INVENTORY_STORAGE_KEY);
        if (savedInv) {
          const parsed = JSON.parse(savedInv) as LooseInventoryItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setInventory(parsed);
          }
        }
      } catch {
        setLoadError("Saved account data could not be loaded. Please sign in again.");
        clearSession();
        navigate(APP_ROUTES.LOGIN, { replace: true });
      }
    });
  }, [navigate]);

  // Derived User Permission Helpers
  const permittedVerticals: VendorVerticalPermission[] = user?.allowedVerticals ?? ALL_VERTICALS;
  const permittedMenus: MenuPermissionKey[] = user?.menuPermissions ?? ALL_MENU_KEYS;
  const permittedModules: ModulePermissionKey[] = user?.modulePermissions ?? ALL_MODULE_KEYS;
  const userActions = user?.userPermissions ?? {
    canAddInventory: true,
    canNotifyVendors: true,
    canOverridePrice: true,
    canApproveUsers: true,
  };

  function hasModule(mod: ModulePermissionKey) {
    return permittedModules.includes(mod);
  }

  function handleVerticalChange(vertical: VendorVertical) {
    const cfg = VENDOR_VERTICAL_CONFIG[vertical];
    const randomSuffix = Math.floor(1000 + Math.random() * 8999);
    setNewVendorType(vertical);
    setNewSku(`${cfg.skuPrefix}-${randomSuffix}`);
    setNewCategory(cfg.categories[0]);
    setNewUnitType(cfg.unitTypes[0]);
    setNewIsLoose(vertical === "Grocery");
    setNewBulkLabel(
      vertical === "Grocery"
        ? "50 kg Sack (×2)"
        : vertical === "Pharmacy"
          ? "10×10 Blister Box"
          : "Master Carton (12 pcs)",
    );
    setNewLocation(
      vertical === "Grocery"
        ? "Aisle 1 · Bin S-04"
        : vertical === "Pharmacy"
          ? "Med Drawer M-08"
          : "Floor 1 · Zone B-04",
    );
    setNewAttributeNote(
      vertical === "Grocery"
        ? "FSSAI Certified · Loose Split Ready"
        : vertical === "Pharmacy"
          ? "Paracetamol 650mg · Schedule OTC"
          : "Size L · Barcode / RFID Tagged",
    );
    setNewSupplierName(cfg.defaultSupplier);
    setNewSupplierPhone(cfg.defaultSupplierPhone);
  }

  function handleUpdateUserPermissions(updatedTarget: AdminUser) {
    const normalized = normalizeUserPermissions(updatedTarget);
    const nextUsers = allUsers.map((u) => (u.id === normalized.id ? normalized : u));
    saveUsers(nextUsers);
    setAllUsers(nextUsers);
    setPendingUsers(nextUsers.filter((u) => !u.approved));

    if (user && normalized.id === user.id) {
      saveSession(normalized);
      setUser(normalized);
      // Keep activeVerticalScope and newVendorType aligned with the user's permitted verticals
      if (!normalized.allowedVerticals.includes(newVendorType)) {
        handleVerticalChange(normalized.allowedVerticals[0]);
      }
      if (
        normalized.allowedVerticals.length === 1 ||
        (activeVerticalScope !== "ALL" &&
          !normalized.allowedVerticals.includes(activeVerticalScope))
      ) {
        setActiveVerticalScope(
          normalized.allowedVerticals.length === 1 ? normalized.allowedVerticals[0] : "ALL",
        );
      }
    }
  }

  function updateInventoryAndPersist(updater: (prev: LooseInventoryItem[]) => LooseInventoryItem[]) {
    setInventory((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors in prototype
      }
      return next;
    });
  }

  function notify(msg: string) {
    setToastMessage(msg);
  }

  function handleAddInventorySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userActions.canAddInventory) {
      notify("Permission denied: Your user profile does not have 'Add & Edit Inventory' permission.");
      return;
    }
    if (!permittedVerticals.includes(newVendorType)) {
      notify(`Permission denied: You do not have access to add ${newVendorType} inventory.`);
      return;
    }
    if (!newName.trim()) {
      notify("Please enter a product name.");
      return;
    }

    const stock = Math.max(1, Number(newStockQty) || 1);
    const reorder = Math.max(1, Number(newReorderLevel) || 5);
    const cost = Math.max(1, Number(newCostPrice) || 10);
    const retail = Math.max(cost, Number(newRetailPrice) || cost);
    const mrp = Math.max(retail, Number(newMrpPrice) || retail);
    const unusedDays = Math.max(0, Number(newDaysUnused) || 0);

    const createdItem: LooseInventoryItem = {
      id: `inv-${Date.now()}`,
      sku:
        newSku.trim() ||
        `${VENDOR_VERTICAL_CONFIG[newVendorType].skuPrefix}-${Date.now().toString().slice(-4)}`,
      name: newName.trim(),
      vendorType: newVendorType,
      category: newCategory,
      isLoose: newIsLoose,
      unitType: newUnitType,
      bulkUnitLabel: newBulkLabel.trim() || "Standard Master Pack",
      storageLocation: newLocation.trim() || "Main Store Rack",
      attributeNote: newAttributeNote.trim() || "Standard Retail SKU",
      stockKg: stock,
      reorderLevelKg: reorder,
      costPerKg: cost,
      prevCostPerKg: cost,
      mrpPerKg: mrp,
      retailPricePerKg: retail,
      gstSlab: newGstSlab,
      batchNo: newBatchNo.trim() || "BATCH-2026",
      expiryDate: newExpiryDate || "2027-12-31",
      daysInStock: Math.max(1, unusedDays),
      daysUnused: unusedDays,
      lastUsedDate: unusedDays === 0 ? "Added just now" : `${unusedDays} days ago`,
      supplierId: `sup-custom-${Date.now()}`,
      supplierName: newSupplierName.trim() || VENDOR_VERTICAL_CONFIG[newVendorType].defaultSupplier,
      supplierPhone:
        newSupplierPhone.trim() || VENDOR_VERTICAL_CONFIG[newVendorType].defaultSupplierPhone,
    };

    updateInventoryAndPersist((prev) => [createdItem, ...prev]);
    setNewName("");
    setNewSku(
      `${VENDOR_VERTICAL_CONFIG[newVendorType].skuPrefix}-${Math.floor(1000 + Math.random() * 8999)}`,
    );

    if (unusedDays >= 30) {
      notify(
        `Added "${createdItem.name}" (${createdItem.vendorType}) — 🚨 Flagged for >1 Month Dormancy (${unusedDays}d unused)!`,
      );
    } else if (unusedDays >= 7) {
      notify(
        `Added "${createdItem.name}" (${createdItem.vendorType}) — ⚠ Flagged for >1 Week Inactivity (${unusedDays}d unused).`,
      );
    } else {
      notify(
        `Added "${createdItem.name}" (${stock} ${createdItem.unitType}) under ${createdItem.vendorType} inventory.`,
      );
    }
  }

  function notifyVendorForDormantItem(item: LooseInventoryItem) {
    if (!userActions.canNotifyVendors) {
      notify("Permission denied: Your user profile cannot dispatch vendor notifications.");
      return;
    }
    const stamp = "Notified Today via WhatsApp/SMS";
    updateInventoryAndPersist((prev) =>
      prev.map((candidate) =>
        candidate.id === item.id ? { ...candidate, vendorNotifiedAt: stamp } : candidate,
      ),
    );
    const tierLabel = item.daysUnused >= 30 ? "MONTHLY (>30d)" : "WEEKLY (>7d)";
    const lockedValue = Math.round(item.stockKg * item.costPerKg).toLocaleString();
    notify(
      `[${tierLabel} DORMANCY ALERT] Sent vendor alert to ${item.supplierName} (${item.supplierPhone || "Registered Vendor"}) for "${item.name}" (Batch ${item.batchNo}, unused for ${item.daysUnused} days, ₹${lockedValue} value).`,
    );
  }

  function notifyAllDormantVendors() {
    if (!userActions.canNotifyVendors) {
      notify("Permission denied: Your user profile cannot dispatch vendor notifications.");
      return;
    }
    const dormantList = permittedInventory.filter((i) => i.daysUnused >= 7);
    if (dormantList.length === 0) {
      notify("All permitted products have been used within the last 7 days!");
      return;
    }
    const stamp = "Notified Today (Bulk Alert)";
    const permittedIds = new Set(dormantList.map((i) => i.id));
    updateInventoryAndPersist((prev) =>
      prev.map((item) => (permittedIds.has(item.id) ? { ...item, vendorNotifiedAt: stamp } : item)),
    );
    const monthCount = dormantList.filter((i) => i.daysUnused >= 30).length;
    const weekCount = dormantList.filter((i) => i.daysUnused >= 7 && i.daysUnused < 30).length;
    notify(
      `Dispatched Dormant Inventory Notifications for ${dormantList.length} products (${monthCount} unused >1 month, ${weekCount} unused >1 week) to their vendors.`,
    );
  }

  function recordItemUsage(itemId: string) {
    updateInventoryAndPersist((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              stockKg: Number(Math.max(0, item.stockKg - 1).toFixed(2)),
              daysUnused: 0,
              lastUsedDate: "Used just now",
            }
          : item,
      ),
    );
    notify("Recorded product usage/sale and reset unused dormancy timer to 0 days.");
  }

  function simulateIdleDays(itemId: string, addDays: number) {
    updateInventoryAndPersist((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const nextUnused = item.daysUnused + addDays;
        return {
          ...item,
          daysUnused: nextUnused,
          daysInStock: Math.max(item.daysInStock, nextUnused),
          lastUsedDate: `${nextUnused} days ago`,
        };
      }),
    );
    notify(`Simulated +${addDays} idle days to test >1 week / >1 month vendor dormancy alerts.`);
  }

  function approve(email: string) {
    if (!userActions.canApproveUsers) {
      notify("Permission denied: Your user profile cannot approve admin signups.");
      return;
    }
    try {
      const users = readUsers().map((candidate) =>
        candidate.email.toLowerCase() === email.toLowerCase()
          ? { ...candidate, approved: true }
          : candidate,
      );
      saveUsers(users);
      setAllUsers(users);
      setPendingUsers(users.filter((candidate) => !candidate.approved));
      notify(`Approved admin access for ${email}.`);
    } catch {
      setLoadError("Approval could not be saved. Please try again.");
    }
  }

  function signOut() {
    clearSession();
    navigate(APP_ROUTES.LOGIN, { replace: true });
  }

  // Filter inventory strictly to the logged-in user's permitted verticals + active scope
  const permittedInventory = inventory.filter((item) => {
    if (!permittedVerticals.includes(item.vendorType)) return false;
    if (activeVerticalScope !== "ALL" && item.vendorType !== activeVerticalScope) return false;
    return true;
  });

  // Derived Margin Drift & Dormancy Alerts for permitted inventory
  const marginAlerts = permittedInventory.map((item) => {
    const marginPct = ((item.retailPricePerKg - item.costPerKg) / item.retailPricePerKg) * 100;
    const prevMarginPct =
      ((item.retailPricePerKg - item.prevCostPerKg) / item.retailPricePerKg) * 100;
    const costDrift = item.costPerKg - item.prevCostPerKg;
    const isDrifted = marginPct < marginThreshold;
    return {
      ...item,
      marginPct: Number(marginPct.toFixed(1)),
      prevMarginPct: Number(prevMarginPct.toFixed(1)),
      costDrift: Number(costDrift.toFixed(2)),
      isDrifted,
    };
  });

  const filteredInventory = marginAlerts.filter((item) => {
    if (dormancyFilter === "WEEK_PLUS" && item.daysUnused < 7) return false;
    if (dormancyFilter === "MONTH_PLUS" && item.daysUnused < 30) return false;
    if (dormancyFilter === "ACTIVE" && item.daysUnused >= 7) return false;
    return true;
  });

  // POS Item Selection (works across Grocery, Pharmacy, and Supermarket!)
  const selectedPosItem =
    permittedInventory.find((item) => item.id === selectedPosItemId) ||
    permittedInventory[0] ||
    inventory[0];

  const posCalculation = (() => {
    const rate = selectedPosItem.retailPricePerKg;
    if (selectedPosItem.vendorType === "Pharmacy") {
      // Pharmacy Strip-to-Tablet split or full unit dispensing
      const tabs = Math.max(1, Number(pharmacyTabsInput) || 1);
      const isStripItem = selectedPosItem.unitType.toLowerCase().includes("strip");
      const price = isStripItem ? Math.round((rate / 10) * tabs) : Math.round(rate * tabs);
      const qtyDeducted = isStripItem ? Number((tabs / 10).toFixed(2)) : tabs;
      return {
        rupees: price,
        qtyDeducted,
        unitSummary: isStripItem
          ? `${tabs} Tablets (${qtyDeducted} Strip) · Rx Batch ${selectedPosItem.batchNo}`
          : `${tabs} ${selectedPosItem.unitType} · Batch ${selectedPosItem.batchNo}`,
        barcode: `79${selectedPosItem.sku.replace(/\D/g, "")}${String(tabs).padStart(4, "0")}`,
      };
    }

    if (selectedPosItem.vendorType === "Mall") {
      // Supermarket / Mall unit & multi-pack billing
      const units = Math.max(1, Number(mallUnitsInput) || 1);
      const price = Math.round(rate * units);
      return {
        rupees: price,
        qtyDeducted: units,
        unitSummary: `${units} × ${selectedPosItem.unitType} (${selectedPosItem.attributeNote})`,
        barcode: `89${selectedPosItem.sku.replace(/\D/g, "")}${String(units).padStart(4, "0")}`,
      };
    }

    // Grocery Loose & Weighted Billing
    if (billingMode === "rupee") {
      const rupees = Math.max(1, Number(rupeeInput) || 0);
      const weightKg = rupees / rate;
      const weightGrams = Math.round(weightKg * 1000);
      return {
        rupees,
        qtyDeducted: Number(weightKg.toFixed(3)),
        unitSummary: `${weightKg.toFixed(3)} kg (${weightGrams} g)`,
        barcode: `29${selectedPosItem.sku.replace(/\D/g, "")}${String(weightGrams).padStart(5, "0")}`,
      };
    } else {
      const grams = Math.max(10, Number(gramsInput) || 0);
      const weightKg = grams / 1000;
      const rupees = Math.round(weightKg * rate);
      return {
        rupees,
        qtyDeducted: Number(weightKg.toFixed(3)),
        unitSummary: `${weightKg.toFixed(3)} kg (${grams} g)`,
        barcode: `29${selectedPosItem.sku.replace(/\D/g, "")}${String(grams).padStart(5, "0")}`,
      };
    }
  })();

  const driftedCount = marginAlerts.filter((item) => item.isDrifted).length;
  const lowStockCount = permittedInventory.filter(
    (item) => item.stockKg <= item.reorderLevelKg,
  ).length;
  const unusedWeekCount = permittedInventory.filter(
    (item) => item.daysUnused >= 7 && item.daysUnused < 30,
  ).length;
  const unusedMonthCount = permittedInventory.filter((item) => item.daysUnused >= 30).length;
  const totalDormantCount = unusedWeekCount + unusedMonthCount;
  const dormantCapitalValue = permittedInventory
    .filter((item) => item.daysUnused >= 7)
    .reduce((sum, item) => sum + Math.round(item.stockKg * item.costPerKg), 0);

  function addPosItemToBill() {
    const entry = {
      id: `cart-${Date.now()}`,
      label: `[${selectedPosItem.vendorType === "Mall" ? "Supermarket" : selectedPosItem.vendorType}] ${selectedPosItem.name}`,
      weightLabel: posCalculation.unitSummary,
      amount: posCalculation.rupees,
      barcode: posCalculation.barcode,
    };
    setPosCart((prev) => [entry, ...prev]);
    updateInventoryAndPersist((prev) =>
      prev.map((item) =>
        item.id === selectedPosItem.id
          ? {
              ...item,
              stockKg: Number(
                Math.max(0, item.stockKg - posCalculation.qtyDeducted).toFixed(2),
              ),
              daysUnused: 0,
              lastUsedDate: "Sold just now",
            }
          : item,
      ),
    );
    notify(
      `Added ${selectedPosItem.name} (${posCalculation.unitSummary} — ₹${posCalculation.rupees}) to POS bill & reset unused timer.`,
    );
  }

  function applyComboToPos(combo: DeadStockCombo) {
    setPosCart((prev) => [
      {
        id: `combo-${Date.now()}`,
        label: `[COMBO] ${combo.title}`,
        weightLabel: `${combo.slowItemName} + ${combo.fastStapleName}`,
        amount: combo.comboPrice,
        barcode: `9900${combo.id.replace(/\D/g, "")}259`,
      },
      ...prev,
    ]);
    setCombos((prev) =>
      prev.map((c) =>
        c.id === combo.id ? { ...c, redemptionsToday: c.redemptionsToday + 1 } : c,
      ),
    );
    notify(
      `Applied "${combo.title}" at ₹${combo.comboPrice} (Saved ₹${combo.regularPrice - combo.comboPrice})!`,
    );
  }

  function importOcrInvoice() {
    if (ocrImported) return;
    setOcrImported(true);
    updateInventoryAndPersist((prev) =>
      prev.map((item) => {
        if (item.id === "inv-1") return { ...item, stockKg: item.stockKg + 100, batchNo: "B-2611-S9" };
        if (item.id === "inv-3") return { ...item, stockKg: item.stockKg + 50, batchNo: "B-2611-T4" };
        return item;
      }),
    );
    notify("OCR Invoice #SGT-9942 imported into inventory.");
  }

  function fixItemMargin(itemId: string) {
    if (!userActions.canOverridePrice) {
      notify("Permission denied: Your user profile cannot override retail prices.");
      return;
    }
    updateInventoryAndPersist((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const targetPrice = Math.min(
          item.mrpPerKg,
          Math.ceil(item.costPerKg / (1 - (marginThreshold + 2) / 100)),
        );
        return { ...item, retailPricePerKg: targetPrice };
      }),
    );
    notify("Updated retail selling price to restore target profit margin within MRP limits.");
  }

  function addRtvEntry() {
    if (!newRtvItem.trim()) return;
    const deduction = Math.max(10, Number(newRtvAmount) || 0);
    const created: RtvEntry = {
      id: `rtv-${Date.now()}`,
      itemName: newRtvItem.trim(),
      supplierName: newRtvSupplier,
      reason: newRtvReason,
      qtyLabel: "Logged Batch",
      deductionAmount: deduction,
      loggedAt: "Just now",
      settled: false,
    };
    setRtvItems((prev) => [created, ...prev]);
    setSuppliers((prev) =>
      prev.map((sup) =>
        sup.supplierName === newRtvSupplier
          ? { ...sup, rtvDeduction: sup.rtvDeduction + deduction }
          : sup,
      ),
    );
    setNewRtvItem("");
    notify(
      `Logged "${created.itemName}" (₹${deduction}) to Return-to-Vendor bucket. Auto-deducted from ${newRtvSupplier}'s next payout.`,
    );
  }

  function sendWhatsAppReminder(customerId: string) {
    setKhataCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId ? { ...c, lastReminderSent: "Sent via WhatsApp just now" } : c,
      ),
    );
    const target = khataCustomers.find((c) => c.id === customerId);
    if (target) {
      notify(
        `Sent polite WhatsApp Udhaar reminder with direct UPI link (₹${target.creditUsed}) to ${target.name}.`,
      );
    }
  }

  function advanceWaOrder(orderId: string) {
    setWaOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const nextStatus: WhatsAppOrder["status"] =
          order.status === "PARSED"
            ? "PICKING"
            : order.status === "PICKING"
              ? "PAYMENT_SENT"
              : "COMPLETED";
        return { ...order, status: nextStatus };
      }),
    );
    notify("Updated WhatsApp order workflow & sent helper pick-list / UPI link.");
  }

  if (!user) {
    return (
      <main className="dashboard-loading">
        <p role="status">{loadError || "Checking your admin session…"}</p>
      </main>
    );
  }

  const cartTotal = posCart.reduce((acc, item) => acc + item.amount, 0);
  const effectiveAddVertical = permittedVerticals.includes(newVendorType)
    ? newVendorType
    : permittedVerticals[0];
  const currentVerticalConfig = VENDOR_VERTICAL_CONFIG[effectiveAddVertical];

  const activeVerticalLabel =
    activeVerticalScope === "ALL"
      ? permittedVerticals.map((v) => (v === "Mall" ? "Supermarket" : v)).join(" + ")
      : activeVerticalScope === "Mall"
        ? "Supermarket / Mall"
        : activeVerticalScope;

  const invPerms = user.inventoryPermissions ?? DEFAULT_INVENTORY_PERMISSIONS;

  function openInventoryRoute(route: InventorySubRoute) {
    setInventoryMenuOpen(true);
    if (route === "list-kirana" || route === "list-pharmacy" || route === "list-mall") {
      setInventoryListSubOpen(true);
    }
    navigate(INVENTORY_SUBROUTE_TO_PATH[route]);
  }

  return (
    <main className={`dashboard-page${themeMode === "dark" ? " dark-mode" : ""}`}>
      <div className={`dashboard-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <aside
          className={`dashboard-sidebar looking-glass-sidebar${
            sidebarCollapsed ? " collapsed" : ""
          }`}
          aria-label="Primary application sidebar"
        >
          <div className="sidebar-brand-row">
            <Link
              to={APP_ROUTES.INVENTORY_DASHBOARD}
              className="brand-lockup"
              title="VendorPurchase Home"
            >
              <span className="brand-mark" aria-hidden="true">V</span>
              {!sidebarCollapsed && (
                <span className="brand-wordmark">
                  Vendor<span className="brand-accent">Purchase</span>
                </span>
              )}
            </Link>
          </div>

          <p className="sidebar-label">PERMITTED MENUS</p>
          <nav aria-label="Dashboard navigation" className="dashboard-nav">
            {permittedMenus.includes("overview") && (
              <NavLink
                to={APP_ROUTES.OVERVIEW}
                title="Owner Pulse & Access"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "overview" ? " selected" : ""}`
                }
              >
                <span>◫</span>
                <em className="nav-item-text">Owner Pulse & Access</em>
                {!sidebarCollapsed && pendingUsers.length > 0 && <b>{pendingUsers.length}</b>}
              </NavLink>
            )}

            {/* DEDICATED INVENTORY MENU (Section 3 of requirement.txt - react-router-dom NavLinks) */}
            {(permittedMenus.includes("inventory") || invPerms.viewInventory) && (
              <div className="sidebar-inventory-group">
                <button
                  type="button"
                  title="Inventory Management Module"
                  className={`nav-tab-btn${activeTab === "inventory" ? " selected" : ""}`}
                  onClick={() => {
                    if (sidebarCollapsed) {
                      setSidebarCollapsed(false);
                      setInventoryMenuOpen(true);
                      navigate(APP_ROUTES.INVENTORY_DASHBOARD);
                      return;
                    }
                    if (activeTab === "inventory") {
                      setInventoryMenuOpen((prev) => !prev);
                    } else {
                      setInventoryMenuOpen(true);
                      navigate(APP_ROUTES.INVENTORY_DASHBOARD);
                    }
                  }}
                >
                  <span>📦</span>
                  <em className="nav-item-text">Inventory</em>
                  {!sidebarCollapsed && <b>{inventoryMenuOpen ? "▾" : "▸"}</b>}
                </button>

                {!sidebarCollapsed && inventoryMenuOpen && (
                  <div className="sidebar-submenu" role="group" aria-label="Inventory submenu">
                    <NavLink
                      to={APP_ROUTES.INVENTORY_DASHBOARD}
                      className={({ isActive }) =>
                        `sidebar-sub-btn${
                          isActive ||
                          (activeTab === "inventory" && inventorySubRoute === "dashboard")
                            ? " active"
                            : ""
                        }`
                      }
                    >
                      📊 Inventory Dashboard
                    </NavLink>

                    {invPerms.addInventory && (
                      <NavLink
                        to={APP_ROUTES.INVENTORY_ADD}
                        className={({ isActive }) =>
                          `sidebar-sub-btn${
                            isActive ||
                            (activeTab === "inventory" && inventorySubRoute === "add-inventory")
                              ? " active"
                              : ""
                          }`
                        }
                      >
                        ＋ Add Inventory
                      </NavLink>
                    )}

                    {invPerms.viewInventory && (
                      <div className="sidebar-nested-group">
                        <button
                          type="button"
                          className={`sidebar-sub-btn${
                            activeTab === "inventory" &&
                            (inventorySubRoute === "list-kirana" ||
                              inventorySubRoute === "list-pharmacy" ||
                              inventorySubRoute === "list-mall")
                              ? " active"
                              : ""
                          }`}
                          onClick={() => setInventoryListSubOpen((prev) => !prev)}
                        >
                          📋 Inventory List{" "}
                          <small style={{ marginLeft: "auto" }}>
                            {inventoryListSubOpen ? "▾" : "▸"}
                          </small>
                        </button>

                        {inventoryListSubOpen && (
                          <div className="sidebar-leaf-list">
                            {permittedVerticals.includes("Grocery") && (
                              <NavLink
                                to={APP_ROUTES.INVENTORY_LIST_KIRANA}
                                className={({ isActive }) =>
                                  `sidebar-leaf-btn${
                                    isActive ||
                                    (activeTab === "inventory" &&
                                      inventorySubRoute === "list-kirana")
                                      ? " active"
                                      : ""
                                  }`
                                }
                              >
                                🛒 Kirana
                              </NavLink>
                            )}
                            {permittedVerticals.includes("Pharmacy") && (
                              <NavLink
                                to={APP_ROUTES.INVENTORY_LIST_PHARMACY}
                                className={({ isActive }) =>
                                  `sidebar-leaf-btn${
                                    isActive ||
                                    (activeTab === "inventory" &&
                                      inventorySubRoute === "list-pharmacy")
                                      ? " active"
                                      : ""
                                  }`
                                }
                              >
                                💊 Pharmacy
                              </NavLink>
                            )}
                            {permittedVerticals.includes("Mall") && (
                              <NavLink
                                to={APP_ROUTES.INVENTORY_LIST_MALL}
                                className={({ isActive }) =>
                                  `sidebar-leaf-btn${
                                    isActive ||
                                    (activeTab === "inventory" &&
                                      inventorySubRoute === "list-mall")
                                      ? " active"
                                      : ""
                                  }`
                                }
                              >
                                🏬 Mall
                              </NavLink>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {invPerms.viewStockHistory && (
                      <NavLink
                        to={APP_ROUTES.INVENTORY_STOCK_HISTORY}
                        className={({ isActive }) =>
                          `sidebar-sub-btn${
                            isActive ||
                            (activeTab === "inventory" && inventorySubRoute === "stock-history")
                              ? " active"
                              : ""
                          }`
                        }
                      >
                        📜 Stock History
                      </NavLink>
                    )}

                    {invPerms.adjustStock && (
                      <NavLink
                        to={APP_ROUTES.INVENTORY_STOCK_ADJUSTMENT}
                        className={({ isActive }) =>
                          `sidebar-sub-btn${
                            isActive ||
                            (activeTab === "inventory" &&
                              inventorySubRoute === "stock-adjustment")
                              ? " active"
                              : ""
                          }`
                        }
                      >
                        ⚖ Stock Adjustment
                      </NavLink>
                    )}

                    {invPerms.viewReports && (
                      <NavLink
                        to={APP_ROUTES.INVENTORY_REPORTS}
                        className={({ isActive }) =>
                          `sidebar-sub-btn${
                            isActive ||
                            (activeTab === "inventory" && inventorySubRoute === "reports")
                              ? " active"
                              : ""
                          }`
                        }
                      >
                        📈 Inventory Reports
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}

            {permittedMenus.includes("inventory-hub") && (
              <NavLink
                to={APP_ROUTES.INVENTORY_HUB}
                title="Dormancy Alerts (>1W/1M)"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "inventory-hub" ? " selected" : ""}`
                }
              >
                <span>🔔</span>
                <em className="nav-item-text">Dormancy Alerts (&gt;1W/1M)</em>
                {!sidebarCollapsed && <b>{totalDormantCount}</b>}
              </NavLink>
            )}
            {permittedMenus.includes("store-floor") && (
              <NavLink
                to={APP_ROUTES.STORE_FLOOR}
                title="Store-Floor POS & OCR"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "store-floor" ? " selected" : ""}`
                }
              >
                <span>⚖</span>
                <em className="nav-item-text">Store-Floor POS & OCR</em>
                {!sidebarCollapsed && <b>{lowStockCount}</b>}
              </NavLink>
            )}
            {permittedMenus.includes("profit-guard") && (
              <NavLink
                to={APP_ROUTES.PROFIT_GUARD}
                title="Profit & Anti-Theft"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "profit-guard" ? " selected" : ""}`
                }
              >
                <span>🛡</span>
                <em className="nav-item-text">Profit & Anti-Theft</em>
                {!sidebarCollapsed && <b>{driftedCount}</b>}
              </NavLink>
            )}
            {permittedMenus.includes("suppliers-khata") && (
              <NavLink
                to={APP_ROUTES.SUPPLIERS_KHATA}
                title="Suppliers & Khata"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "suppliers-khata" ? " selected" : ""}`
                }
              >
                <span>⇄</span>
                <em className="nav-item-text">Suppliers & Khata</em>
                {!sidebarCollapsed && <b>{rtvItems.length}</b>}
              </NavLink>
            )}
            {permittedMenus.includes("retention") && (
              <NavLink
                to={APP_ROUTES.RETENTION}
                title="WhatsApp AI & Loyalty"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "retention" ? " selected" : ""}`
                }
              >
                <span>💬</span>
                <em className="nav-item-text">WhatsApp AI & Loyalty</em>
                {!sidebarCollapsed && <b>{waOrders.length}</b>}
              </NavLink>
            )}
            {permittedMenus.includes("gst-pulse") && (
              <NavLink
                to={APP_ROUTES.GST_PULSE}
                title="GST & Tax Filing"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "gst-pulse" ? " selected" : ""}`
                }
              >
                <span>₹</span>
                <em className="nav-item-text">GST & Tax Filing</em>
              </NavLink>
            )}

            <p className="sidebar-label sidebar-sub-divider">ADMINISTRATION</p>
            {permittedMenus.includes("user-permissions") && (
              <NavLink
                to={APP_ROUTES.USER_PERMISSIONS}
                title="User & Permissions"
                className={({ isActive }) =>
                  `nav-tab-btn${isActive || activeTab === "user-permissions" ? " selected" : ""}`
                }
              >
                <span>🔐</span>
                <em className="nav-item-text">User & Permissions</em>
                {!sidebarCollapsed && <b>{allUsers.length}</b>}
              </NavLink>
            )}
          </nav>

          {!sidebarCollapsed && (
            <div className="sidebar-note">
              <span className="status-dot" />
              <div>
                <strong>Permitted Store Scope</strong>
                <small>
                  {permittedVerticals.map((v) => (v === "Mall" ? "Supermarket" : v)).join(" · ")}
                </small>
              </div>
            </div>
          )}

          <div className="sidebar-user">
            <span className="avatar" title={`${user.name} (${user.email})`}>
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            {!sidebarCollapsed && (
              <div>
                <strong>{user.name}</strong>
                <small>{user.role || "Operations Admin"} · {user.email}</small>
              </div>
            )}
            <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out">
              ↗
            </button>
          </div>
        </aside>

        <section
          className={`dashboard-main scroll-dir-${scrollDirection}${
            isScrolled ? " is-scrolled" : ""
          }`}
          onScroll={handleMainScroll}
        >
          <Outlet />

          {/* UNIFIED STICKY GLASS TOP NAVBAR (Houses Vertical Switcher, Permissions, Theme, Add SKU & Sign Out) */}
          <nav
            className={`dashboard-top-navbar${isScrolled ? " navbar-elevated" : ""} navbar-scroll-${scrollDirection}`}
            aria-label="Top workspace navigation bar"
          >
            <div className="top-navbar-left">
              <button
                type="button"
                className="navbar-icon-btn"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                ☰
              </button>

              <div className="top-navbar-title-block">
                <p className="dashboard-breadcrumb">
                  {activeVerticalLabel} Workspace
                </p>
                <strong className="top-navbar-greeting">
                  Namaste, {user.name.split(" ")[0]} ·{" "}
                  <span>
                    {activeTab === "overview" && "Owner Pulse & Access"}
                    {activeTab === "inventory" && (
                      <>
                        {inventorySubRoute === "dashboard" && "Inventory Dashboard"}
                        {inventorySubRoute === "add-inventory" && "Add Inventory"}
                        {inventorySubRoute === "list-kirana" && "Kirana Inventory List"}
                        {inventorySubRoute === "list-pharmacy" && "Pharmacy Inventory List"}
                        {inventorySubRoute === "list-mall" && "Mall Inventory List"}
                        {inventorySubRoute === "stock-history" && "Stock History"}
                        {inventorySubRoute === "stock-adjustment" && "Stock Adjustment"}
                        {inventorySubRoute === "reports" && "Inventory Reports & Audit"}
                      </>
                    )}
                    {activeTab === "inventory-hub" && "Dormancy Alerts (>7d / >30d)"}
                    {activeTab === "store-floor" && "Store-Floor POS & OCR"}
                    {activeTab === "profit-guard" && "Profit & Anti-Theft"}
                    {activeTab === "suppliers-khata" && "Suppliers & Digital Khata"}
                    {activeTab === "retention" && "WhatsApp AI & Loyalty"}
                    {activeTab === "gst-pulse" && "GST & Tax Filing"}
                    {activeTab === "user-permissions" && "User & Permission Module"}
                  </span>
                </strong>
              </div>
            </div>

            {/* Center: Permitted Store Verticals Quick Switcher in Navbar */}


            {/* Right: User Name Trigger + Dropdown Menu (Add Inventory, Permissions, Dark Mode, Sign Out) */}
            <div className="top-navbar-actions">
              <div className="navbar-user-menu-wrap">
                <button
                  type="button"
                  className={`navbar-user-chip navbar-user-trigger${
                    userMenuOpen ? " open" : ""
                  }`}
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                >
                  <span className="avatar navbar-avatar">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="navbar-user-name">{user.name}</span>
                  <span className="navbar-caret" aria-hidden="true">
                    {userMenuOpen ? "▴" : "▾"}
                  </span>
                </button>

                {userMenuOpen && (
                  <div
                    className="navbar-user-dropdown"
                    role="menu"
                    aria-label="User actions menu"
                  >
                    <div className="navbar-dropdown-header">
                      <strong>{user.name}</strong>
                      <small>
                        {user.role || "Operations Admin"} · {user.email}
                      </small>
                    </div>

                    {invPerms.addInventory && (
                      <button
                        type="button"
                        role="menuitem"
                        className="navbar-dropdown-item primary"
                        onClick={() => {
                          setUserMenuOpen(false);
                          openInventoryRoute("add-inventory");
                        }}
                      >
                        <span>＋</span> Add Inventory
                      </button>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      className="navbar-dropdown-item"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setActiveTab("user-permissions");
                      }}
                    >
                      <span>🔐</span> Permissions ({permittedVerticals.length} Verticals)
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="navbar-dropdown-item"
                      onClick={() => {
                        setThemeMode((prev) => (prev === "light" ? "dark" : "light"));
                        setUserMenuOpen(false);
                      }}
                    >
                      <span>{themeMode === "light" ? "🌙" : "☀"}</span>{" "}
                      {themeMode === "light" ? "Dark Mode" : "Light Mode"}
                    </button>

                    <div className="navbar-dropdown-divider" aria-hidden="true" />

                    <button
                      type="button"
                      role="menuitem"
                      className="navbar-dropdown-item danger"
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                    >
                      <span>↗</span> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </nav>

          {toastMessage && (
            <div className="kirana-toast" role="status" aria-live="polite">
              <span>✓ {toastMessage}</span>
              <button type="button" onClick={() => setToastMessage("")} aria-label="Dismiss notification">
                ✕
              </button>
            </div>
          )}

          {loadError && (
            <p className="dashboard-alert" role="alert">
              {loadError}
            </p>
          )}

          {/* Top KPI Strip scoped to permitted verticals */}


          {/* Permission-Based & Page-Scoped Stock <= Threshold Collapse Bar for Store Operations Tabs */}
          {activeTab !== "inventory" &&
            activeTab !== "user-permissions" &&
            invPerms.viewInventory &&
            invPerms.viewStock &&
            permittedInventory.some((i) => i.stockKg <= i.reorderLevelKg) && (
              <article
                className={`dashboard-card threshold-alert-card${
                  dashThreshCollapseOpen ? " is-expanded" : " is-collapsed"
                }`}
                role="region"
                aria-label="Stock at or below threshold alert table"
              >
                <button
                  type="button"
                  className="threshold-collapse-trigger"
                  aria-expanded={dashThreshCollapseOpen}
                  onClick={() => setDashThreshCollapseOpen((prev) => !prev)}
                >
                  <div className="threshold-collapse-left">
                    <p className="card-eyebrow">
                      ⚠ PERMISSION-SCOPED STOCK THRESHOLD ALERT ({activeVerticalLabel.toUpperCase()})
                    </p>
                    <h2>
                      Products in {activeVerticalLabel} with Stock &le; Reorder Threshold
                    </h2>
                  </div>

                  <div className="threshold-collapse-right">
                    <span className="pill alert-month">
                      {permittedInventory.filter((i) => i.stockKg <= i.reorderLevelKg).length} SKU(s) &le; Threshold
                    </span>
                    <span className="threshold-collapse-toggle-pill">
                      <span>{dashThreshCollapseOpen ? "Hide List" : "Show List"}</span>
                      <span
                        className={`threshold-collapse-chevron${
                          dashThreshCollapseOpen ? " open" : ""
                        }`}
                      >
                        ▾
                      </span>
                    </span>
                  </div>
                </button>

                {dashThreshCollapseOpen && (
                  <div className="threshold-collapse-body">
                    <div className="kirana-table-wrap">
                      <table className="kirana-table">
                        <thead>
                          <tr>
                            <th>Vertical & SKU</th>
                            <th>Product & Category</th>
                            <th>Location & Attribute</th>
                            <th>Supplier</th>
                            <th>Current Stock</th>
                            <th>Threshold Level</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginateSlice(
                            permittedInventory.filter((item) => item.stockKg <= item.reorderLevelKg),
                            dashThreshPage,
                            dashThreshPageSize,
                          ).map((item) => {
                            const shortfall = Number(
                              Math.max(0, item.reorderLevelKg - item.stockKg).toFixed(2),
                            );
                            return (
                              <tr key={`dash-thresh-${item.id}`}>
                                <td>
                                  <span
                                    className={`vertical-tag vertical-${item.vendorType.toLowerCase()}`}
                                  >
                                    {item.vendorType === "Mall" ? "Supermarket" : item.vendorType}
                                  </span>
                                  <code className="perm-code-chip">{item.sku}</code>
                                </td>
                                <td>
                                  <strong>{item.name}</strong>
                                  <small>{item.category}</small>
                                </td>
                                <td>
                                  <strong>{item.storageLocation}</strong>
                                  <small>{item.attributeNote}</small>
                                </td>
                                <td>
                                  <strong>{item.supplierName}</strong>
                                  <small>{item.supplierPhone}</small>
                                </td>
                                <td>
                                  <strong className="text-danger">
                                    {item.stockKg} {item.unitType}
                                  </strong>
                                </td>
                                <td>
                                  <strong>
                                    {item.reorderLevelKg} {item.unitType}
                                  </strong>
                                </td>
                                <td>
                                  <div className="status-cell-stack">
                                    {item.stockKg <= 0 ? (
                                      <span className="pill alert-month">Out of Stock (0)</span>
                                    ) : item.stockKg === item.reorderLevelKg ? (
                                      <span className="pill waiting">
                                        Equal to Threshold ({item.stockKg})
                                      </span>
                                    ) : (
                                      <span className="pill waiting">
                                        Below Threshold (-{shortfall} {item.unitType})
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  {invPerms.adjustStock ? (
                                    <button
                                      type="button"
                                      className="approve-button"
                                      onClick={() => openInventoryRoute("stock-adjustment")}
                                    >
                                      + Adjust / Replenish
                                    </button>
                                  ) : (
                                    <span className="pill waiting">View Only</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      totalItems={
                        permittedInventory.filter((item) => item.stockKg <= item.reorderLevelKg)
                          .length
                      }
                      page={dashThreshPage}
                      pageSize={dashThreshPageSize}
                      onPageChange={setDashThreshPage}
                      onPageSizeChange={setDashThreshPageSize}
                      itemLabel="threshold SKUs"
                    />
                  </div>
                )}
              </article>
            )}

          {/* MODULE: DEDICATED INVENTORY MANAGEMENT MODULE (Kirana, Pharmacy, Mall) */}
          {activeTab === "inventory" && (
            <InventoryModule
              currentUser={user}
              subRoute={inventorySubRoute}
              onNavigateSubRoute={openInventoryRoute}
              onNotify={notify}
            />
          )}

          {/* MODULE: SEPARATED USER & PERMISSION MODULE */}
          {activeTab === "user-permissions" && (
            <UserPermissionModule
              currentUser={user}
              allUsers={allUsers}
              onUpdateUser={handleUpdateUserPermissions}
              onApproveUser={approve}
              onNotify={notify}
            />
          )}

          {/* MODULE 0: OWNER PULSE OVERVIEW & ADMIN APPROVALS */}
          {activeTab === "overview" && (
            <div className="kirana-section-stack">
              <div className="kirana-module-pills" aria-label="Quick module jump">
                <button type="button" onClick={() => openInventoryRoute("dashboard")}>
                  📦 Open Inventory Management Module
                </button>
                <button type="button" onClick={() => setActiveTab("user-permissions")}>
                  🔐 Open User, Menu & Module Permissions
                </button>
                {permittedMenus.includes("inventory-hub") && (
                  <button type="button" onClick={() => setActiveTab("inventory-hub")}>
                    ＋ Add Inventory ({activeVerticalLabel})
                  </button>
                )}
                {permittedMenus.includes("inventory-hub") && (
                  <button type="button" onClick={() => setActiveTab("inventory-hub")}>
                    🔔 {totalDormantCount} Unused Stock Alerts (&gt;1 Wk / &gt;1 Mo)
                  </button>
                )}
                {permittedMenus.includes("store-floor") && (
                  <button type="button" onClick={() => setActiveTab("store-floor")}>
                    ⚖ Open {activeVerticalLabel} Counter POS
                  </button>
                )}
              </div>

              <section className="dashboard-content-grid">
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">PERMITTED WORKSPACE PULSE ({activeVerticalLabel})</p>
                      <h2>Live store health & unused-stock vendor alerts</h2>
                    </div>
                    <span className="pill ready">Synced 12s ago</span>
                  </div>

                  <div className="pipeline-list">
                    <div className="pipeline-row">
                      <span className="pipeline-icon orange">🔔</span>
                      <div>
                        <strong>
                          {unusedMonthCount} Products Unused &gt; 1 Month · {unusedWeekCount} Unused &gt; 1 Week
                        </strong>
                        <small>
                          In your permitted verticals ({activeVerticalLabel}) · ₹
                          {dormantCapitalValue.toLocaleString()} capital idle
                        </small>
                      </div>
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={() => setActiveTab("inventory-hub")}
                      >
                        Notify Vendors →
                      </button>
                    </div>

                    {permittedVerticals.includes("Pharmacy") && (
                      <div className="pipeline-row">
                        <span className="pipeline-icon blue">💊</span>
                        <div>
                          <strong>Pharmacy Module Enabled (Rx, Strip Split & Cold-Chain)</strong>
                          <small>
                            Dispense loose tablets from strips, track Schedule H salts & monitor drug batch expiry
                          </small>
                        </div>
                        <button
                          type="button"
                          className="subtle-button"
                          onClick={() => {
                            setActiveVerticalScope("Pharmacy");
                            setActiveTab("store-floor");
                          }}
                        >
                          Pharmacy POS →
                        </button>
                      </div>
                    )}

                    {permittedVerticals.includes("Mall") && (
                      <div className="pipeline-row">
                        <span className="pipeline-icon purple">🏬</span>
                        <div>
                          <strong>Supermarket & Mall Module Enabled (Aisle, Variant & RFID)</strong>
                          <small>
                            Manage apparel/appliance SKUs, floor bay locations, and multi-unit barcode tags
                          </small>
                        </div>
                        <button
                          type="button"
                          className="subtle-button"
                          onClick={() => {
                            setActiveVerticalScope("Mall");
                            setActiveTab("store-floor");
                          }}
                        >
                          Supermarket POS →
                        </button>
                      </div>
                    )}

                    {permittedVerticals.includes("Grocery") && (
                      <div className="pipeline-row">
                        <span className="pipeline-icon orange">🛒</span>
                        <div>
                          <strong>Grocery / Kirana Module Enabled (Bulk Sacks & ₹ Split)</strong>
                          <small>
                            Convert 50 kg sacks into grams/kg and sell loose staples by rupee value
                          </small>
                        </div>
                        <button
                          type="button"
                          className="subtle-button"
                          onClick={() => {
                            setActiveVerticalScope("Grocery");
                            setActiveTab("store-floor");
                          }}
                        >
                          Grocery POS →
                        </button>
                      </div>
                    )}
                  </div>
                </article>

                <article className="dashboard-card" id="approvals">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">ACCESS MANAGEMENT</p>
                      <h2>Admin requests</h2>
                    </div>
                    <span className="count-badge">{pendingUsers.length}</span>
                  </div>
                  {pendingUsers.length === 0 ? (
                    <div className="empty-state">
                      <span>✓</span>
                      <strong>You’re all caught up</strong>
                      <p>New staff or manager signup requests will appear here for approval.</p>
                    </div>
                  ) : (
                    <div className="request-list">
                      {pendingUsers.map((pending) => (
                        <div className="request-row" key={pending.id}>
                          <span className="avatar request-avatar">
                            {pending.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="request-details">
                            <strong>{pending.name}</strong>
                            <small>
                              {pending.company}
                              {pending.role ? ` · ${pending.role}` : ""} · {pending.email}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="approve-button"
                            onClick={() => approve(pending.email)}
                          >
                            Approve
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </section>

              {/* Permitted Vertical Inventory Table */}
              <article className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <p className="card-eyebrow">
                      PERMITTED INVENTORY & DORMANCY MONITOR ({activeVerticalLabel})
                    </p>
                    <h2>
                      Showing SKUs for your permitted store verticals with &gt;1 Week & &gt;1 Month alerts
                    </h2>
                  </div>
                  <div className="header-actions">
                    <button
                      type="button"
                      className="approve-button"
                      onClick={() => setActiveTab("inventory-hub")}
                    >
                      + Add {activeVerticalLabel} SKU
                    </button>
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={notifyAllDormantVendors}
                    >
                      📲 Notify Dormant Vendors ({totalDormantCount})
                    </button>
                  </div>
                </div>

                <div className="kirana-table-wrap">
                  <table className="kirana-table">
                    <thead>
                      <tr>
                        <th>Permitted Vertical & SKU</th>
                        <th>Location & Attribute</th>
                        <th>Live Stock</th>
                        <th>Cost → Selling (MRP)</th>
                        <th>Unused Duration</th>
                        <th>Dormancy Alert Status</th>
                        <th>Vendor Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateSlice(marginAlerts, ovInvPage, ovInvPageSize).map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className={`vertical-tag vertical-${item.vendorType.toLowerCase()}`}>
                              {item.vendorType === "Mall" ? "Supermarket" : item.vendorType}
                            </span>
                            <strong>{item.name}</strong>
                            <small>
                              {item.sku} · {item.category} · {item.supplierName}
                            </small>
                          </td>
                          <td>
                            <strong>{item.storageLocation}</strong>
                            <small>{item.attributeNote}</small>
                          </td>
                          <td>
                            <strong>
                              {item.stockKg} {item.unitType}
                            </strong>
                            <small>{item.bulkUnitLabel}</small>
                          </td>
                          <td>
                            <strong>
                              ₹{item.costPerKg} → ₹{item.retailPricePerKg}
                            </strong>
                            <small>MRP ₹{item.mrpPerKg} · GST {item.gstSlab}%</small>
                          </td>
                          <td>
                            <strong>{item.daysUnused} days unused</strong>
                            <small>Last used: {item.lastUsedDate}</small>
                          </td>
                          <td>
                            <div className="status-cell-stack">
                              {item.daysUnused >= 30 ? (
                                <span className="pill alert-month">
                                  🚨 Unused &gt; 1 Month ({item.daysUnused}d)
                                </span>
                              ) : item.daysUnused >= 7 ? (
                                <span className="pill waiting">
                                  ⚠ Unused &gt; 1 Week ({item.daysUnused}d)
                                </span>
                              ) : (
                                <span className="pill ready">Active ({item.daysUnused}d)</span>
                              )}
                              {item.vendorNotifiedAt && (
                                <small className="text-success">✓ {item.vendorNotifiedAt}</small>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="table-action-stack">
                              {item.daysUnused >= 7 ? (
                                <button
                                  type="button"
                                  className="approve-button"
                                  onClick={() => notifyVendorForDormantItem(item)}
                                >
                                  Notify Vendor
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="subtle-button"
                                  onClick={() => simulateIdleDays(item.id, 8)}
                                >
                                  Test +8d Idle
                                </button>
                              )}
                              <button
                                type="button"
                                className="subtle-button"
                                onClick={() => recordItemUsage(item.id)}
                              >
                                Record Sale
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalItems={marginAlerts.length}
                  page={ovInvPage}
                  pageSize={ovInvPageSize}
                  onPageChange={setOvInvPage}
                  onPageSizeChange={setOvInvPageSize}
                  itemLabel="permitted SKUs"
                />
              </article>
            </div>
          )}

          {/* MODULE: UNIVERSAL ADD-INVENTORY & DORMANCY ALERT HUB */}
          {activeTab === "inventory-hub" && (
            <div className="kirana-section-stack">
              {/* Dormancy Notification Banner */}
              <article className="dashboard-card dormancy-banner-card">
                <div className="card-heading">
                  <div>
                    <p className="card-eyebrow">
                      AUTOMATED UNUSED INVENTORY MONITOR ({activeVerticalLabel})
                    </p>
                    <h2>
                      {unusedMonthCount} products unused &gt; 1 month · {unusedWeekCount} products unused &gt; 1 week
                    </h2>
                  </div>
                  <div className="header-actions">
                    <button
                      type="button"
                      className="approve-button"
                      onClick={notifyAllDormantVendors}
                    >
                      📲 Notify All {totalDormantCount} Vendors Now
                    </button>
                  </div>
                </div>

                <div className="dormancy-summary-grid">
                  <div className="dormancy-tier-card tier-active">
                    <span>ACTIVE INVENTORY (&lt; 7 DAYS UNUSED)</span>
                    <strong>{permittedInventory.length - totalDormantCount} SKUs Moving</strong>
                    <small>Healthy shelf velocity in {activeVerticalLabel}</small>
                  </div>
                  <div className="dormancy-tier-card tier-week">
                    <span>IDLE &gt; 1 WEEK (7–29 DAYS UNUSED)</span>
                    <strong>{unusedWeekCount} SKUs Flagged</strong>
                    <small>Trigger vendor price-support or front-shelf promo</small>
                  </div>
                  <div className="dormancy-tier-card tier-month">
                    <span>STAGNANT &gt; 1 MONTH (30+ DAYS UNUSED)</span>
                    <strong>{unusedMonthCount} SKUs Critical</strong>
                    <small>
                      ₹{dormantCapitalValue.toLocaleString()} locked capital — Notify vendor for return/exchange
                    </small>
                  </div>
                </div>
              </article>

              {/* Permission-Scoped Add Inventory Form */}
              <article className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <p className="card-eyebrow">
                      PERMISSION-SCOPED MULTI-VENDOR INVENTORY BUILDER
                    </p>
                    <h2>
                      Add product for your permitted store verticals (
                      {permittedVerticals
                        .map((v) => (v === "Mall" ? "Supermarket / Mall" : v))
                        .join(", ")}
                      )
                    </h2>
                  </div>
                  <span className={`vertical-tag vertical-${effectiveAddVertical.toLowerCase()}`}>
                    {currentVerticalConfig.badge}
                  </span>
                </div>

                <form className="universal-inventory-form" onSubmit={handleAddInventorySubmit}>
                  {/* Only show Vertical Switcher buttons that the logged-in user has permission for */}
                  <div className="vertical-switcher" role="group" aria-label="Select permitted store vertical">
                    {permittedVerticals.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={effectiveAddVertical === v ? "active" : ""}
                        onClick={() => handleVerticalChange(v)}
                      >
                        <strong>
                          {v === "Grocery" && "🛒 Grocery / Kirana"}
                          {v === "Pharmacy" && "💊 Pharmacy / Medical"}
                          {v === "Mall" && "🏬 Supermarket / Mall"}
                        </strong>
                        <small>{VENDOR_VERTICAL_CONFIG[v].badge}</small>
                      </button>
                    ))}
                  </div>

                  <div className="universal-form-grid">
                    <label className="kirana-label">
                      Product / Item Name *
                      <input
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={
                          effectiveAddVertical === "Grocery"
                            ? "e.g. Basmati Dubar Rice (Loose)"
                            : effectiveAddVertical === "Pharmacy"
                              ? "e.g. Azithral 500mg Tablet Strip"
                              : "e.g. Cotton Chino Trousers (34)"
                        }
                      />
                    </label>

                    <label className="kirana-label">
                      SKU / Barcode Code
                      <input
                        value={newSku}
                        onChange={(e) => setNewSku(e.target.value)}
                        placeholder="e.g. PHM-5012"
                      />
                    </label>

                    <label className="kirana-label">
                      Store Category
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                      >
                        {currentVerticalConfig.categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="kirana-label">
                      Retail Selling Unit
                      <select
                        value={newUnitType}
                        onChange={(e) => setNewUnitType(e.target.value)}
                      >
                        {currentVerticalConfig.unitTypes.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="kirana-label">
                      Bulk Purchase Pack / Case Label
                      <input
                        value={newBulkLabel}
                        onChange={(e) => setNewBulkLabel(e.target.value)}
                        placeholder={currentVerticalConfig.bulkPlaceholder}
                      />
                    </label>

                    <label className="kirana-label">
                      Rack / Aisle / Drawer / Bin Location
                      <input
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder={currentVerticalConfig.locationPlaceholder}
                      />
                    </label>

                    <label className="kirana-label">
                      {currentVerticalConfig.attributeLabel}
                      <input
                        value={newAttributeNote}
                        onChange={(e) => setNewAttributeNote(e.target.value)}
                        placeholder={currentVerticalConfig.attributePlaceholder}
                      />
                    </label>

                    <label className="kirana-label">
                      Selling Mode
                      <select
                        value={newIsLoose ? "loose" : "packed"}
                        onChange={(e) => setNewIsLoose(e.target.value === "loose")}
                      >
                        <option value="loose">Loose / Split Enabled (Weight or Tablet Split)</option>
                        <option value="packed">Full Pack / Unit Barcode SKU</option>
                      </select>
                    </label>

                    <label className="kirana-label">
                      Opening Stock Qty ({newUnitType})
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        required
                        value={newStockQty}
                        onChange={(e) => setNewStockQty(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Low-Stock Reorder Level
                      <input
                        type="number"
                        min="1"
                        required
                        value={newReorderLevel}
                        onChange={(e) => setNewReorderLevel(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Landing Cost / Unit (₹)
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        required
                        value={newCostPrice}
                        onChange={(e) => setNewCostPrice(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Store Selling Price (₹)
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        required
                        value={newRetailPrice}
                        onChange={(e) => setNewRetailPrice(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Printed MRP (₹)
                      <input
                        type="number"
                        min="1"
                        step="0.5"
                        required
                        value={newMrpPrice}
                        onChange={(e) => setNewMrpPrice(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      GST Slab (%)
                      <select
                        value={newGstSlab}
                        onChange={(e) => setNewGstSlab(Number(e.target.value) as 0 | 5 | 12 | 18)}
                      >
                        <option value={0}>0% Nil Rated</option>
                        <option value={5}>5% Essential / Life-Saving Slab</option>
                        <option value={12}>12% Standard / Pharma Rx Slab</option>
                        <option value={18}>18% FMCG / Retail Slab</option>
                      </select>
                    </label>

                    <label className="kirana-label">
                      Batch / Lot / Serial No.
                      <input
                        value={newBatchNo}
                        onChange={(e) => setNewBatchNo(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Expiry / Best-Before Date
                      <input
                        type="date"
                        value={newExpiryDate}
                        onChange={(e) => setNewExpiryDate(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Vendor / Distributor Name
                      <input
                        value={newSupplierName}
                        onChange={(e) => setNewSupplierName(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Vendor WhatsApp / Phone
                      <input
                        value={newSupplierPhone}
                        onChange={(e) => setNewSupplierPhone(e.target.value)}
                      />
                    </label>

                    <label className="kirana-label">
                      Initial Unused Days (Test Dormancy Alert)
                      <select
                        value={newDaysUnused}
                        onChange={(e) => setNewDaysUnused(e.target.value)}
                      >
                        <option value="0">0 days (Fresh / Active Today)</option>
                        <option value="9">9 days (Trigger &gt;1 Week Alert)</option>
                        <option value="16">16 days (Trigger &gt;2 Weeks Alert)</option>
                        <option value="35">35 days (Trigger &gt;1 Month Critical Alert)</option>
                      </select>
                    </label>
                  </div>

                  <div className="action-row-split">
                    <small className="form-helper-note">
                      Active vertical: <b>{effectiveAddVertical === "Mall" ? "Supermarket / Mall" : effectiveAddVertical}</b>. Automatically tracks unused days for &gt;1 week and &gt;1 month vendor alerts.
                    </small>
                    <button type="submit" className="approve-button">
                      ＋ Add Product to {effectiveAddVertical === "Mall" ? "Supermarket" : effectiveAddVertical} Inventory
                    </button>
                  </div>
                </form>
              </article>

              {/* Filterable Permitted Inventory & Unused-Stock Action Table */}
              <article className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <p className="card-eyebrow">PERMITTED STOCK & INACTIVITY TRACKER</p>
                    <h2>Track product movement & notify vendor when unused &gt;1 week or &gt;1 month</h2>
                  </div>

                  <div className="inventory-filter-bar">
                    <select
                      value={dormancyFilter}
                      onChange={(e) => {
                        setDormancyFilter(
                          e.target.value as "ALL" | "WEEK_PLUS" | "MONTH_PLUS" | "ACTIVE",
                        );
                        setHubInvPage(1);
                      }}
                      aria-label="Filter by unused duration"
                    >
                      <option value="ALL">All Movement States ({permittedInventory.length})</option>
                      <option value="WEEK_PLUS">⚠ Unused &gt; 1 Week (7+ days)</option>
                      <option value="MONTH_PLUS">🚨 Unused &gt; 1 Month (30+ days)</option>
                      <option value="ACTIVE">✓ Active (&lt; 7 days)</option>
                    </select>
                  </div>
                </div>

                <div className="kirana-table-wrap">
                  <table className="kirana-table">
                    <thead>
                      <tr>
                        <th>Vertical & Product</th>
                        <th>Location & Spec</th>
                        <th>Stock & Unit</th>
                        <th>Batch & Expiry</th>
                        <th>Unused / Idle Tracker</th>
                        <th>Vendor Alert Status</th>
                        <th>Actions (Notify / Simulate)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateSlice(filteredInventory, hubInvPage, hubInvPageSize).map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className={`vertical-tag vertical-${item.vendorType.toLowerCase()}`}>
                              {item.vendorType === "Mall" ? "Supermarket" : item.vendorType}
                            </span>
                            <strong>{item.name}</strong>
                            <small>
                              {item.sku} · {item.category}
                            </small>
                          </td>
                          <td>
                            <strong>{item.storageLocation}</strong>
                            <small>{item.attributeNote}</small>
                          </td>
                          <td>
                            <strong>
                              {item.stockKg} {item.unitType}
                            </strong>
                            <small>
                              ₹{item.costPerKg} cost · ₹{item.retailPricePerKg} sell
                            </small>
                          </td>
                          <td>
                            <strong>{item.batchNo}</strong>
                            <small>Exp: {item.expiryDate}</small>
                          </td>
                          <td>
                            <strong>{item.daysUnused} days unused</strong>
                            <small>Last activity: {item.lastUsedDate}</small>
                          </td>
                          <td>
                            <div className="status-cell-stack">
                              {item.daysUnused >= 30 ? (
                                <span className="pill alert-month">
                                  🚨 Unused &gt; 1 Month ({item.daysUnused}d)
                                </span>
                              ) : item.daysUnused >= 7 ? (
                                <span className="pill waiting">
                                  ⚠ Unused &gt; 1 Week ({item.daysUnused}d)
                                </span>
                              ) : (
                                <span className="pill ready">Active ({item.daysUnused}d)</span>
                              )}
                              <small>
                                {item.supplierName}{" "}
                                {item.vendorNotifiedAt ? `· ✓ ${item.vendorNotifiedAt}` : ""}
                              </small>
                            </div>
                          </td>
                          <td>
                            <div className="table-action-stack">
                              <button
                                type="button"
                                className="approve-button"
                                onClick={() => notifyVendorForDormantItem(item)}
                              >
                                📲 Notify Vendor
                              </button>
                              <button
                                type="button"
                                className="subtle-button"
                                onClick={() => recordItemUsage(item.id)}
                              >
                                ✓ Use / Sell 1
                              </button>
                              <button
                                type="button"
                                className="subtle-button"
                                onClick={() => simulateIdleDays(item.id, 7)}
                              >
                                +7d Idle
                              </button>
                              <button
                                type="button"
                                className="subtle-button"
                                onClick={() => simulateIdleDays(item.id, 30)}
                              >
                                +30d Idle
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalItems={filteredInventory.length}
                  page={hubInvPage}
                  pageSize={hubInvPageSize}
                  onPageChange={setHubInvPage}
                  onPageSizeChange={setHubInvPageSize}
                  itemLabel="tracked SKUs"
                />
              </article>
            </div>
          )}

          {/* MODULE 1: STORE-FLOOR POS (ADAPTS FOR GROCERY, PHARMACY & SUPERMARKET) */}
          {activeTab === "store-floor" && (
            <div className="kirana-section-stack">
              <section className="dashboard-content-grid">
                {hasModule("posBilling") ? (
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <p className="card-eyebrow">
                          1. MULTI-VERTICAL COUNTER POS ({activeVerticalLabel})
                        </p>
                        <h2>
                          {selectedPosItem.vendorType === "Pharmacy" &&
                            "Pharmacy Strip-to-Tablet Split & Rx Dispensing"}
                          {selectedPosItem.vendorType === "Mall" &&
                            "Supermarket & Mall Unit / Multi-Pack Billing"}
                          {selectedPosItem.vendorType === "Grocery" &&
                            "Grocery Loose-Weight & Rupee-Split Billing"}
                        </h2>
                      </div>
                      <span className={`vertical-tag vertical-${selectedPosItem.vendorType.toLowerCase()}`}>
                        {selectedPosItem.vendorType === "Mall"
                          ? "Supermarket Mode"
                          : `${selectedPosItem.vendorType} Mode`}
                      </span>
                    </div>

                    <div className="kirana-form-box">
                      <label className="kirana-label">
                        Select Permitted Product SKU ({permittedInventory.length} available)
                        <select
                          value={selectedPosItem.id}
                          onChange={(e) => setSelectedPosItemId(e.target.value)}
                        >
                          {permittedInventory.map((item) => (
                            <option key={item.id} value={item.id}>
                              [{item.vendorType === "Mall" ? "Supermarket" : item.vendorType}]{" "}
                              {item.name} — ₹{item.retailPricePerKg}/{item.unitType} (Stock:{" "}
                              {item.stockKg})
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* PHARMACY POS CONTROLS (Shows like Supermarket & Grocery when Pharmacy is permitted!) */}
                      {selectedPosItem.vendorType === "Pharmacy" && (
                        <>
                          <div className="scale-split-grid">
                            <label className="kirana-label">
                              Dispense Qty (Tablets from Strip / Units)
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={pharmacyTabsInput}
                                onChange={(e) => setPharmacyTabsInput(e.target.value)}
                              />
                            </label>
                            <div className="digital-scale-readout">
                              <span>PHARMACY RX & BATCH VERIFICATION</span>
                              <strong>₹{posCalculation.rupees}</strong>
                              <small>
                                {posCalculation.unitSummary} · Exp {selectedPosItem.expiryDate}
                              </small>
                            </div>
                          </div>
                          <div className="quick-preset-chips">
                            <span>Quick Tablet / Pack Splits:</span>
                            {[2, 5, 10, 15, 30].map((tabs) => (
                              <button
                                key={tabs}
                                type="button"
                                onClick={() => setPharmacyTabsInput(String(tabs))}
                              >
                                {tabs} {tabs === 10 ? "Tabs (1 Strip)" : "Tabs"}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {/* SUPERMARKET / MALL POS CONTROLS */}
                      {selectedPosItem.vendorType === "Mall" && (
                        <>
                          <div className="scale-split-grid">
                            <label className="kirana-label">
                              Scan / Enter Unit Quantity ({selectedPosItem.unitType})
                              <input
                                type="number"
                                min="1"
                                max="50"
                                value={mallUnitsInput}
                                onChange={(e) => setMallUnitsInput(e.target.value)}
                              />
                            </label>
                            <div className="digital-scale-readout">
                              <span>SUPERMARKET AISLE & MRP CHECK</span>
                              <strong>₹{posCalculation.rupees}</strong>
                              <small>
                                Saved ₹
                                {Math.max(
                                  0,
                                  (selectedPosItem.mrpPerKg - selectedPosItem.retailPricePerKg) *
                                    (Number(mallUnitsInput) || 1),
                                )}{" "}
                                off MRP · {selectedPosItem.storageLocation}
                              </small>
                            </div>
                          </div>
                          <div className="quick-preset-chips">
                            <span>Quick Multi-Pack Qty:</span>
                            {[1, 2, 3, 5, 12].map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => setMallUnitsInput(String(u))}
                              >
                                {u} {u === 1 ? "Unit" : "Units"}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {/* GROCERY POS CONTROLS */}
                      {selectedPosItem.vendorType === "Grocery" && (
                        <>
                          <div className="mode-toggle-row">
                            <button
                              type="button"
                              className={billingMode === "rupee" ? "active" : ""}
                              onClick={() => setBillingMode("rupee")}
                            >
                              Sell by Rupee Value (e.g. &ldquo;₹50 worth of sugar&rdquo;)
                            </button>
                            <button
                              type="button"
                              className={billingMode === "weight" ? "active" : ""}
                              onClick={() => setBillingMode("weight")}
                            >
                              Sell by Weight (Grams / Kg)
                            </button>
                          </div>

                          {billingMode === "rupee" ? (
                            <div className="scale-split-grid">
                              <label className="kirana-label">
                                Customer Rupee Request (₹)
                                <input
                                  type="number"
                                  min="5"
                                  value={rupeeInput}
                                  onChange={(e) => setRupeeInput(e.target.value)}
                                />
                              </label>
                              <div className="digital-scale-readout">
                                <span>AUTO-CONVERTED TARGET WEIGHT</span>
                                <strong>{posCalculation.unitSummary}</strong>
                                <small>
                                  @ ₹{selectedPosItem.retailPricePerKg}/kg · Scale Tare: 0.000 kg
                                </small>
                              </div>
                            </div>
                          ) : (
                            <div className="scale-split-grid">
                              <label className="kirana-label">
                                Target Weight in Grams (g)
                                <input
                                  type="number"
                                  step="50"
                                  min="50"
                                  value={gramsInput}
                                  onChange={(e) => setGramsInput(e.target.value)}
                                />
                              </label>
                              <div className="digital-scale-readout">
                                <span>AUTO-CALCULATED RETAIL PRICE</span>
                                <strong>₹{posCalculation.rupees}</strong>
                                <small>
                                  For {posCalculation.unitSummary} @ ₹
                                  {selectedPosItem.retailPricePerKg}/kg
                                </small>
                              </div>
                            </div>
                          )}

                          <div className="quick-preset-chips">
                            <span>Quick ₹ Splits:</span>
                            {[20, 50, 100, 200].map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => {
                                  setBillingMode("rupee");
                                  setRupeeInput(String(amt));
                                }}
                              >
                                ₹{amt}
                              </button>
                            ))}
                            <span>Quick Weights:</span>
                            {[250, 500, 1000, 5000].map((g) => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => {
                                  setBillingMode("weight");
                                  setGramsInput(String(g));
                                }}
                              >
                                {g >= 1000 ? `${g / 1000} kg` : `${g}g`}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="action-row-split">
                        <button type="button" className="approve-button" onClick={addPosItemToBill}>
                          + Add to Counter POS Bill (₹{posCalculation.rupees})
                        </button>
                        {hasModule("barcodeGenerator") && (
                          <button
                            type="button"
                            className="subtle-button"
                            onClick={() =>
                              notify(
                                `Printed ${pouchPackCount} thermal barcode labels (${posCalculation.barcode}) for ${selectedPosItem.name}.`,
                              )
                            }
                          >
                            🖨 Print {pouchPackCount} Barcode Labels
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Custom Barcode & Shelf-Label Preview */}
                    {hasModule("barcodeGenerator") && (
                      <div className="barcode-preview-card">
                        <div>
                          <span className="card-eyebrow">
                            {selectedPosItem.vendorType === "Pharmacy"
                              ? "PHARMACY RX DOSAGE & BATCH STICKER"
                              : selectedPosItem.vendorType === "Mall"
                                ? "SUPERMARKET AISLE & HANG-TAG LABEL"
                                : "IN-HOUSE POUCH & SHELF STICKER GENERATOR"}
                          </span>
                          <strong>{selectedPosItem.name}</strong>
                          <small>
                            {posCalculation.unitSummary} · Location:{" "}
                            {selectedPosItem.storageLocation} · Exp: {selectedPosItem.expiryDate}
                          </small>
                          <div className="barcode-price-line">
                            <span>MRP: ₹{selectedPosItem.mrpPerKg}</span>
                            <strong>Store Price: ₹{posCalculation.rupees}</strong>
                          </div>
                        </div>
                        <div className="barcode-bars-box">
                          <div className="barcode-stripes" aria-hidden="true">
                            ||| || |||| | ||| || |||| | ||| |||
                          </div>
                          <code>{posCalculation.barcode}</code>
                          <label className="sticker-qty-inline">
                            Qty:
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={pouchPackCount}
                              onChange={(e) => setPouchPackCount(Number(e.target.value) || 1)}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </article>
                ) : (
                  <article className="dashboard-card">
                    <div className="empty-state">
                      <span>🔒</span>
                      <strong>Counter POS Billing Restricted</strong>
                      <p>Enable &ldquo;posBilling&rdquo; in the User &amp; Permission Module to use Counter POS.</p>
                    </div>
                  </article>
                )}

                {/* Active Counter POS Cart */}
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">QUICK COUNTER BILLING</p>
                      <h2>Live POS checkout & bundle auto-apply</h2>
                    </div>
                    <span className="count-badge">{posCart.length}</span>
                  </div>

                  <div className="request-list">
                    {posCart.map((item) => (
                      <div className="request-row" key={item.id}>
                        <div className="request-details">
                          <strong>{item.label}</strong>
                          <small>
                            {item.weightLabel} · Barcode #{item.barcode}
                          </small>
                        </div>
                        <strong className="pos-line-amount">₹{item.amount}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="pos-summary-box">
                    <div>
                      <span>Bill Total (Incl. GST)</span>
                      <strong>₹{cartTotal}</strong>
                    </div>
                    <div className="pos-checkout-btns">
                      <button
                        type="button"
                        className="approve-button"
                        onClick={() => {
                          setPosCart([]);
                          notify(
                            `Completed Counter Bill of ₹${cartTotal} via UPI QR & printed thermal receipt.`,
                          );
                        }}
                      >
                        Collect UPI / Cash (₹{cartTotal})
                      </button>
                      {hasModule("comboBuilder") && (
                        <button
                          type="button"
                          className="subtle-button"
                          onClick={() => applyComboToPos(combos[0])}
                        >
                          + Auto-Bundle Dead Stock Combo
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              </section>

              {/* OCR Purchase Bill Scanner */}
              {hasModule("ocrScanner") && (
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">2. AI OCR WHOLESALER INVOICE SCANNER</p>
                      <h2>
                        Paper bill photo → Auto-extracted items, batch numbers, expiry & landed cost
                      </h2>
                    </div>
                    <button
                      type="button"
                      className="approve-button"
                      disabled={ocrImported}
                      onClick={importOcrInvoice}
                    >
                      {ocrImported
                        ? "✓ 300 kg Stock & Batches Imported"
                        : "📷 Commit Scanned Bill to Inventory"}
                    </button>
                  </div>

                  <div className="kirana-table-wrap">
                    <table className="kirana-table">
                      <thead>
                        <tr>
                          <th>Extracted Wholesaler Line Item</th>
                          <th>Batch & Expiry</th>
                          <th>Converted Bulk Qty</th>
                          <th>Prev Cost</th>
                          <th>New Billed Cost</th>
                          <th>MRP</th>
                          <th>Margin Drift Check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginateSlice(ocrLines, ocrPage, ocrPageSize).map((line) => {
                          const newMargin =
                            ((line.mrpPerKg - line.billedCostPerKg) / line.mrpPerKg) * 100;
                          const drifted =
                            line.billedCostPerKg > line.prevCostPerKg && newMargin < 10;
                          return (
                            <tr key={line.id}>
                              <td>
                                <strong>{line.itemName}</strong>
                                <small>GST Slab: {line.gstSlab}%</small>
                              </td>
                              <td>
                                <strong>{line.batchNo}</strong>
                                <small>Exp: {line.expiryDate}</small>
                              </td>
                              <td>
                                <strong>{line.qtyKg} units/kg</strong>
                              </td>
                              <td>₹{line.prevCostPerKg.toFixed(2)}</td>
                              <td>
                                <strong>₹{line.billedCostPerKg.toFixed(2)}</strong>
                              </td>
                              <td>₹{line.mrpPerKg.toFixed(2)}</td>
                              <td>
                                <div className="status-cell-stack">
                                  {drifted ? (
                                    <span className="pill waiting">
                                      ⚠ Cost +₹{(line.billedCostPerKg - line.prevCostPerKg).toFixed(1)}{" "}
                                      (Margin {newMargin.toFixed(1)}%)
                                    </span>
                                  ) : (
                                    <span className="pill ready">
                                      Healthy ({newMargin.toFixed(1)}%)
                                    </span>
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
                    totalItems={ocrLines.length}
                    page={ocrPage}
                    pageSize={ocrPageSize}
                    onPageChange={setOcrPage}
                    onPageSizeChange={setOcrPageSize}
                    itemLabel="invoice lines"
                  />
                </article>
              )}
            </div>
          )}

          {/* MODULE 2: PROFIT PROTECTION & ANTI-THEFT CONTROLS */}
          {activeTab === "profit-guard" && (
            <div className="kirana-section-stack">
              {hasModule("marginDrift") && (
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">
                        1. MARGIN & COST-PRICE DRIFT ALERTS ({activeVerticalLabel})
                      </p>
                      <h2>Items where wholesaler raised cost price while MRP stayed unchanged</h2>
                    </div>
                    <label className="threshold-control">
                      Alert Threshold:
                      <select
                        value={marginThreshold}
                        onChange={(e) => {
                          setMarginThreshold(Number(e.target.value));
                          setDriftPage(1);
                        }}
                      >
                        <option value={8}>Below 8% margin</option>
                        <option value={10}>Below 10% margin</option>
                        <option value={12}>Below 12% margin</option>
                        <option value={15}>Below 15% margin</option>
                      </select>
                    </label>
                  </div>

                  <div className="kirana-table-wrap">
                    <table className="kirana-table">
                      <thead>
                        <tr>
                          <th>Item & Supplier</th>
                          <th>Prev Cost → New Cost</th>
                          <th>Selling Price (MRP)</th>
                          <th>Old → Current Margin</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginateSlice(marginAlerts, driftPage, driftPageSize).map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span
                                className={`vertical-tag vertical-${item.vendorType.toLowerCase()}`}
                              >
                                {item.vendorType === "Mall" ? "Supermarket" : item.vendorType}
                              </span>
                              <strong>{item.name}</strong>
                              <small>{item.supplierName}</small>
                            </td>
                            <td>
                              <strong>
                                ₹{item.prevCostPerKg} → ₹{item.costPerKg}
                              </strong>
                              {item.costDrift > 0 && (
                                <small className="text-danger">+₹{item.costDrift} cost hike</small>
                              )}
                            </td>
                            <td>
                              <strong>₹{item.retailPricePerKg}</strong>
                              <small>MRP Cap: ₹{item.mrpPerKg}</small>
                            </td>
                            <td>
                              <div className="status-cell-stack">
                                <span className={`pill ${item.isDrifted ? "waiting" : "ready"}`}>
                                  {item.prevMarginPct}% → {item.marginPct}%
                                </span>
                              </div>
                            </td>
                            <td>
                              {item.isDrifted ? (
                                <button
                                  type="button"
                                  className="approve-button"
                                  onClick={() => fixItemMargin(item.id)}
                                >
                                  Re-price to Restore Margin
                                </button>
                              ) : (
                                <span className="pill ready">Protected</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    totalItems={marginAlerts.length}
                    page={driftPage}
                    pageSize={driftPageSize}
                    onPageChange={setDriftPage}
                    onPageSizeChange={setDriftPageSize}
                    itemLabel="margin-checked SKUs"
                  />
                </article>
              )}

              <section className="dashboard-content-grid">
                {hasModule("auditLogs") && (
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <p className="card-eyebrow">2. CASH DRAWER & VOID / OVERRIDE AUDIT LOG</p>
                        <h2>Staff counter exceptions & EOD variance</h2>
                      </div>
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={() =>
                          notify(
                            "Dispatched EOD Cash + UPI Variance Summary (-₹440 cash shortage on Counter 2) to Owner's WhatsApp.",
                          )
                        }
                      >
                        📲 Send EOD Summary to Phone
                      </button>
                    </div>

                    <div className="variance-banner">
                      <div>
                        <span>Expected Closing (Cash + UPI)</span>
                        <strong>₹68,420</strong>
                      </div>
                      <div>
                        <span>Actual Drawer + UPI Settled</span>
                        <strong>₹67,980</strong>
                      </div>
                      <div>
                        <span>Net EOD Variance</span>
                        <strong className="text-danger">-₹440 (Cash Short)</strong>
                      </div>
                    </div>

                    <div className="pipeline-list">
                      {auditLogs.map((log) => (
                        <div className="pipeline-row" key={log.id}>
                          <span
                            className={`pipeline-icon ${
                              log.riskLevel === "high" ? "orange" : "purple"
                            }`}
                          >
                            !
                          </span>
                          <div>
                            <strong>
                              [{log.eventType.replace(/_/g, " ")}] {log.staffName} ({log.staffId})
                            </strong>
                            <small>
                              {log.timestamp} · {log.details}
                            </small>
                          </div>
                          <span
                            className={`pill ${log.riskLevel === "high" ? "waiting" : "in-review"}`}
                          >
                            {log.amountImpact > 0 ? `₹${log.amountImpact}` : "Drawer Open"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                )}

                {hasModule("comboBuilder") && (
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <p className="card-eyebrow">3. DEAD-STOCK CLEARANCE & COMBO BUILDER</p>
                        <h2>Pair slow stock with high-velocity staples</h2>
                      </div>
                      <span className="pill ready">{combos.length} Active Bundles</span>
                    </div>

                    <div className="request-list">
                      {combos.map((combo) => (
                        <div className="request-row" key={combo.id}>
                          <div className="request-details">
                            <strong>{combo.title}</strong>
                            <small>
                              Slow: <b>{combo.slowItemName}</b> + Fast: <b>{combo.fastStapleName}</b>
                            </small>
                            <small>
                              Regular: ₹{combo.regularPrice} →{" "}
                              <b>Bundle Checkout Price: ₹{combo.comboPrice}</b> (
                              {combo.redemptionsToday} sold today)
                            </small>
                          </div>
                          <button
                            type="button"
                            className="approve-button"
                            onClick={() => applyComboToPos(combo)}
                          >
                            Apply at POS (₹{combo.comboPrice})
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                )}
              </section>
            </div>
          )}

          {/* MODULE 3: SUPPLIER & CREDIT (UDHAAR) MANAGEMENT */}
          {activeTab === "suppliers-khata" && (
            <div className="kirana-section-stack">
              {hasModule("autoPo") && (
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">
                        1. SUPPLIER-GROUPED AUTO-PO & LAST-3-ORDERS PRICE COMPARISON
                      </p>
                      <h2>Distributor reorder groups with automatic RTV damage deductions</h2>
                    </div>
                  </div>

                  <div className="supplier-grid">
                    {suppliers.map((sup) => (
                      <div className="supplier-box" key={sup.supplierId}>
                        <div className="supplier-box-header">
                          <div>
                            <strong>{sup.supplierName}</strong>
                            <small>{sup.phone}</small>
                          </div>
                          <div className="supplier-payout-pill">
                            <span>
                              Net Payable: ₹
                              {(sup.outstandingPayable - sup.rtvDeduction).toLocaleString()}
                            </span>
                            <small>(-₹{sup.rtvDeduction} RTV deducted)</small>
                          </div>
                        </div>

                        <div className="request-list">
                          {sup.items.map((item, idx) => (
                            <div className="request-row" key={idx}>
                              <div className="request-details">
                                <strong>
                                  {item.itemName} · <em>Reorder: {item.reorderQty}</em>
                                </strong>
                                <small>
                                  Last 3 Landing Costs: ₹{item.last3Costs[0]} → ₹{item.last3Costs[1]}{" "}
                                  → <b>₹{item.last3Costs[2]}</b>
                                </small>
                              </div>
                              <span className={`pill ${item.bestRate ? "ready" : "waiting"}`}>
                                {item.bestRate ? "Lowest Vendor" : "Rate +11%"}
                              </span>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="approve-button full-width-btn"
                          onClick={() =>
                            notify(
                              `Sent 1-Tap WhatsApp Purchase Order to ${sup.supplierName} (${sup.phone}) with ₹${sup.rtvDeduction} RTV credit note attached.`,
                            )
                          }
                        >
                          📲 Send Auto-PO via WhatsApp (Deduct ₹{sup.rtvDeduction} RTV)
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              )}

              <section className="dashboard-content-grid">
                {hasModule("digitalKhata") && (
                  <article className="dashboard-card">
                    <div className="card-heading">
                      <div>
                        <p className="card-eyebrow">2. DIGITAL KHATA (UDHAAR) & HOUSEHOLD CREDIT CAPS</p>
                        <h2>Customer credit limits & automated UPI reminders</h2>
                      </div>
                    </div>

                    <div className="request-list">
                      {khataCustomers.map((cust) => {
                        const pct = Math.min(
                          100,
                          Math.round((cust.creditUsed / cust.creditLimit) * 100),
                        );
                        const nearLimit = pct >= 85;
                        return (
                          <div className="request-row" key={cust.id}>
                            <div className="request-details">
                              <strong>
                                {cust.name} ({cust.phone})
                              </strong>
                              <small>
                                Used: <b>₹{cust.creditUsed.toLocaleString()}</b> / Limit: ₹
                                {cust.creditLimit.toLocaleString()} ({pct}%) · Due: {cust.dueDate}
                              </small>
                              <div className="khata-progress-track">
                                <span
                                  className={`khata-progress-fill ${nearLimit ? "danger" : ""}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {cust.lastReminderSent && (
                                <small className="text-success">✓ {cust.lastReminderSent}</small>
                              )}
                            </div>
                            <button
                              type="button"
                              className="approve-button"
                              onClick={() => sendWhatsAppReminder(cust.id)}
                            >
                              Send UPI Link
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                )}

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">3. SUPPLIER RETURN & BREAKAGE (RTV) BUCKET</p>
                      <h2>Log expired, damaged, or pest-bitten stock</h2>
                    </div>
                  </div>

                  <div className="rtv-quick-form">
                    <input
                      placeholder="Damaged/Expired item name & qty"
                      value={newRtvItem}
                      onChange={(e) => setNewRtvItem(e.target.value)}
                    />
                    <div className="rtv-form-row">
                      <select
                        value={newRtvSupplier}
                        onChange={(e) => setNewRtvSupplier(e.target.value)}
                      >
                        <option value="Shree Ganesh Trading Co.">Shree Ganesh Trading Co.</option>
                        <option value="Mahalaxmi Agro Pulses">Mahalaxmi Agro Pulses</option>
                        <option value="Apex Medico Pharma Hub">Apex Medico Pharma Hub</option>
                        <option value="VogueLine Retail Apparels">VogueLine Retail Apparels</option>
                      </select>
                      <select
                        value={newRtvReason}
                        onChange={(e) => setNewRtvReason(e.target.value as RtvEntry["reason"])}
                      >
                        <option value="Rodent/Pest Damage">Rodent/Pest Damage</option>
                        <option value="Expired">Expired Batch</option>
                        <option value="Damaged Pack">Damaged Pack</option>
                      </select>
                      <input
                        type="number"
                        placeholder="₹ Value"
                        value={newRtvAmount}
                        onChange={(e) => setNewRtvAmount(e.target.value)}
                      />
                      <button type="button" className="approve-button" onClick={addRtvEntry}>
                        Log RTV
                      </button>
                    </div>
                  </div>

                  <div className="request-list">
                    {rtvItems.map((rtv) => (
                      <div className="request-row" key={rtv.id}>
                        <div className="request-details">
                          <strong>{rtv.itemName}</strong>
                          <small>
                            {rtv.supplierName} · <b>{rtv.reason}</b> · {rtv.loggedAt}
                          </small>
                        </div>
                        <span className="pill waiting">-₹{rtv.deductionAmount}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </div>
          )}

          {/* MODULE 4: CUSTOMER RETENTION & HYPERLOCAL GROWTH */}
          {activeTab === "retention" && (
            <div className="kirana-section-stack">
              {hasModule("whatsappAi") && (
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">
                        1. WHATSAPP VOICE NOTE & HANDWRITTEN PHOTO ORDER PARSER
                      </p>
                      <h2>AI order-intake inbox matched to live store stock & helper pick-list</h2>
                    </div>
                    <span className="pill ready">WhatsApp Webhook Active</span>
                  </div>

                  <div className="supplier-grid">
                    {waOrders.map((order) => {
                      const orderTotal = order.parsedItems.reduce((s, i) => s + i.price, 0);
                      return (
                        <div className="supplier-box" key={order.id}>
                          <div className="supplier-box-header">
                            <div>
                              <strong>
                                {order.customerName} ({order.phone})
                              </strong>
                              <small>
                                {order.sourceType === "PHOTO_LIST"
                                  ? "📷 Handwritten List Photo"
                                  : "🎙 Hindi Voice Note"}{" "}
                                · {order.receivedAt}
                              </small>
                            </div>
                            <span className="pill in-review">{order.status}</span>
                          </div>

                          <p className="wa-transcript">{order.rawTranscript}</p>

                          <div className="request-list">
                            {order.parsedItems.map((line, i) => (
                              <div className="request-row" key={i}>
                                <div className="request-details">
                                  <strong>{line.name}</strong>
                                  <small>
                                    Qty: {line.requestedQty} · Matched SKU: {line.matchedSku}
                                  </small>
                                </div>
                                <strong>₹{line.price}</strong>
                              </div>
                            ))}
                          </div>

                          <div className="action-row-split">
                            <strong>Order Total: ₹{orderTotal}</strong>
                            <button
                              type="button"
                              className="approve-button"
                              onClick={() => advanceWaOrder(order.id)}
                            >
                              {order.status === "PARSED" && "🖨 Print Helper Pick-List"}
                              {order.status === "PICKING" && `📲 Send ₹${orderTotal} UPI Link`}
                              {order.status === "PAYMENT_SENT" && "✓ Mark Delivered"}
                              {order.status === "COMPLETED" && "✓ Completed"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              )}

              <section className="dashboard-content-grid">
                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">2. REPEAT-ORDER & HOUSEHOLD REFILL REMINDERS</p>
                      <h2>Day-27 automated WhatsApp nudges for monthly staples</h2>
                    </div>
                  </div>

                  <div className="request-list">
                    {khataCustomers.map((cust) => (
                      <div className="request-row" key={cust.id}>
                        <div className="request-details">
                          <strong>{cust.name}</strong>
                          <small>
                            Recurring Staple: <b>{cust.refillCycleItem}</b>
                          </small>
                          <small>
                            Cycle: Every {cust.refillCycleDays} days ·{" "}
                            <b>Day {cust.daysSinceLastBuy} today (Refill Due!)</b>
                          </small>
                        </div>
                        <button
                          type="button"
                          className="approve-button"
                          onClick={() =>
                            notify(
                              `Sent Day-${cust.daysSinceLastBuy} WhatsApp refill nudge to ${cust.name} for "${cust.refillCycleItem}" with 1-tap reorder.`,
                            )
                          }
                        >
                          Send Refill Nudge
                        </button>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="dashboard-card">
                  <div className="card-heading">
                    <div>
                      <p className="card-eyebrow">
                        3. PHONE-NUMBER CASHBACK WALLET (1% STORE CREDIT)
                      </p>
                      <h2>Next-visit redeemable credit to beat quick-commerce apps</h2>
                    </div>
                  </div>

                  <div className="request-list">
                    {khataCustomers.map((cust) => (
                      <div className="request-row" key={cust.id}>
                        <div className="request-details">
                          <strong>{cust.name}</strong>
                          <small>
                            Linked Mobile: {cust.phone} · 1% Auto-Cashback on every counter bill
                          </small>
                        </div>
                        <div className="wallet-action-col">
                          <span className="pill ready">₹{cust.cashbackBalance} Credit</span>
                          <button
                            type="button"
                            className="subtle-button"
                            onClick={() => {
                              setKhataCustomers((prev) =>
                                prev.map((c) =>
                                  c.id === cust.id ? { ...c, cashbackBalance: 0 } : c,
                                ),
                              );
                              notify(
                                `Redeemed ₹${cust.cashbackBalance} store cashback credit on ${cust.name}'s current visit!`,
                              );
                            }}
                          >
                            Redeem
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </div>
          )}

          {/* MODULE 5: COMPLIANCE & OWNER VISIBILITY (GST) */}
          {activeTab === "gst-pulse" && (
            <div className="kirana-section-stack">
              <article className="dashboard-card">
                <div className="card-heading">
                  <div>
                    <p className="card-eyebrow">ONE-CLICK GST & TAX SUMMARY REPORTS</p>
                    <h2>
                      Auto-classified 0%, 5%, 12%, and 18% GST slabs (GSTR-1 & GSTR-3B ready)
                    </h2>
                  </div>
                  {hasModule("gstExport") && (
                    <div className="header-actions">
                      <button
                        type="button"
                        className="approve-button"
                        onClick={() =>
                          notify(
                            "Exported Accountant-Ready GSTR-1 & GSTR-3B JSON/CSV package for November 2026.",
                          )
                        }
                      >
                        ⬇ Export GSTR-1 / GSTR-3B Summary
                      </button>
                    </div>
                  )}
                </div>

                <div className="kirana-table-wrap">
                  <table className="kirana-table">
                    <thead>
                      <tr>
                        <th>GST Slab</th>
                        <th>Store Category Classification</th>
                        <th>Monthly Taxable Turnover</th>
                        <th>CGST</th>
                        <th>SGST</th>
                        <th>Total Tax Liability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateSlice(
                        [
                          {
                            slab: "0% Nil Rated",
                            category: "Unbranded Loose Atta, Fresh Milk, Loose Grains",
                            turnover: "₹4,82,000",
                            cgst: "₹0",
                            sgst: "₹0",
                            total: "₹0",
                          },
                          {
                            slab: "5% Essential Slab",
                            category: "M-30 Sugar, Toor Dal, Ground Spices, Life-Saving Meds",
                            turnover: "₹6,40,000",
                            cgst: "₹16,000 (2.5%)",
                            sgst: "₹16,000 (2.5%)",
                            total: "₹32,000",
                          },
                          {
                            slab: "12% Standard Slab",
                            category: "Edible Oils, Ghee, Rx Formulations, Apparel (>₹1000)",
                            turnover: "₹3,10,000",
                            cgst: "₹18,600 (6%)",
                            sgst: "₹18,600 (6%)",
                            total: "₹37,200",
                          },
                          {
                            slab: "18% FMCG & Retail Slab",
                            category: "Bakery Cookies, Derma Serums, Home Appliances, Personal Care",
                            turnover: "₹2,45,000",
                            cgst: "₹22,050 (9%)",
                            sgst: "₹22,050 (9%)",
                            total: "₹44,100",
                          },
                        ],
                        gstPage,
                        gstPageSize,
                      ).map((row) => (
                        <tr key={row.slab}>
                          <td>
                            <strong>{row.slab}</strong>
                          </td>
                          <td>{row.category}</td>
                          <td>{row.turnover}</td>
                          <td>{row.cgst}</td>
                          <td>{row.sgst}</td>
                          <td>
                            <strong>{row.total}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalItems={4}
                  page={gstPage}
                  pageSize={gstPageSize}
                  pageSizeOptions={[2, 4, 8]}
                  onPageChange={setGstPage}
                  onPageSizeChange={setGstPageSize}
                  itemLabel="GST slabs"
                />
              </article>
            </div>
          )}

          <footer className="dashboard-footer">
            VendorPurchase Multi-Vertical Platform ({activeVerticalLabel}) <span>·</span> Role-Scoped User, Menu & Module Permissions
          </footer>
        </section>
      </div>
    </main>
  );
}
