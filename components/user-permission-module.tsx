"use client";

import { useMemo, useState } from "react";
import {
  ALL_MENU_KEYS,
  ALL_MODULE_KEYS,
  ALL_VERTICALS,
  DEFAULT_INVENTORY_PERMISSIONS,
  type AdminUser,
  type InventoryRBACPermissions,
  type MenuPermissionKey,
  type ModulePermissionKey,
  type UserActionPermissions,
  type VendorVerticalPermission,
} from "@/lib/auth-storage";

type UserPermissionModuleProps = {
  currentUser: AdminUser;
  allUsers: AdminUser[];
  onUpdateUser: (updated: AdminUser) => void;
  onApproveUser: (email: string) => void;
  onNotify: (msg: string) => void;
};

type UnifiedPermissionRow = {
  id: string;
  code: string;
  category: "user" | "menu" | "module";
  categoryLabel: string;
  subGroupLabel: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
};

const VERTICAL_META: Record<
  VendorVerticalPermission,
  { code: string; label: string; icon: string; desc: string }
> = {
  Grocery: {
    code: "VERT_GROCERY",
    label: "Grocery / Kirana Vertical Access",
    icon: "🛒",
    desc: "Enable loose bulk sacks, ₹-to-weight split POS, FSSAI staples & pouch barcodes",
  },
  Pharmacy: {
    code: "VERT_PHARMACY",
    label: "Pharmacy / Medical Vertical Access",
    icon: "💊",
    desc: "Enable strip-to-tablet split POS, Schedule H/Rx tracking, salt search & expiry alerts",
  },
  Mall: {
    code: "VERT_SUPERMARKET",
    label: "Supermarket / Mall Vertical Access",
    icon: "🏬",
    desc: "Enable apparel, electronics & FMCG aisles, variant SKUs & hang-tag shelf labels",
  },
};

const ACTION_META: Record<
  keyof UserActionPermissions,
  { code: string; label: string; desc: string }
> = {
  canAddInventory: {
    code: "USR_ADD_INVENTORY",
    label: "Add & Edit Store Inventory SKUs",
    desc: "Allow user to create and modify products across their permitted store verticals",
  },
  canNotifyVendors: {
    code: "USR_NOTIFY_VENDOR",
    label: "Dispatch >1W / >1M Dormant Vendor Alerts",
    desc: "Allow user to send WhatsApp/SMS return & markdown alerts for unused inventory",
  },
  canOverridePrice: {
    code: "USR_OVERRIDE_PRICE",
    label: "Override Retail Price & Fix Margin Drift",
    desc: "Allow user to re-price items when wholesaler cost hikes reduce margin below threshold",
  },
  canApproveUsers: {
    code: "USR_APPROVE_SIGNUP",
    label: "Approve New Admin Signup Requests",
    desc: "Allow user to approve pending staff and manager accounts in the access queue",
  },
};

const INVENTORY_RBAC_META: Record<
  keyof InventoryRBACPermissions,
  { code: string; label: string; desc: string }
> = {
  viewInventory: {
    code: "INV_VIEW_INVENTORY",
    label: "View Inventory Records & Dashboard",
    desc: "Access Kirana, Pharmacy & Mall inventory listings and product details for permitted verticals",
  },
  addInventory: {
    code: "INV_ADD_INVENTORY",
    label: "Add New Inventory Products & Batches",
    desc: "Create new Kirana, Pharmacy (multi-batch) & Mall products with initial stock transactions",
  },
  editInventory: {
    code: "INV_EDIT_INVENTORY",
    label: "Edit Inventory, Prices & Active/Inactive Status",
    desc: "Modify product details, supplier, pricing, batches, and toggle Active/Inactive status (audited)",
  },
  viewStock: {
    code: "INV_VIEW_STOCK",
    label: "View Live Stock Quantities & Alerts",
    desc: "View stock quantities, minimum/maximum thresholds, low-stock, out-of-stock & expiry alerts",
  },
  adjustStock: {
    code: "INV_ADJUST_STOCK",
    label: "Adjust, Add, Reduce & Transfer Stock",
    desc: "Perform stock additions, reductions, corrections, transfers & adjustments with mandatory reason",
  },
  exportInventory: {
    code: "INV_EXPORT_INVENTORY",
    label: "Export Inventory to Excel & PDF",
    desc: "Generate server-side Excel (.xls) and PDF reports for filtered or all authorized records",
  },
  viewStockHistory: {
    code: "INV_VIEW_STOCK_HISTORY",
    label: "View Stock Transaction History",
    desc: "Inspect full ledger of stock additions, deductions, transfers, references & performing users",
  },
  viewReports: {
    code: "INV_VIEW_REPORTS",
    label: "View Inventory Reports & Audit Logs",
    desc: "Access category valuation reports, expiry summaries, and immutable before/after audit trails",
  },
};

const MENU_META: Record<
  MenuPermissionKey,
  { code: string; label: string; icon: string; desc: string }
> = {
  overview: {
    code: "MENU_OVERVIEW",
    label: "Owner Pulse & Overview Menu",
    icon: "◫",
    desc: "Show live counter sales, permitted vertical KPIs & urgent dormancy alerts in sidebar",
  },
  inventory: {
    code: "MENU_INVENTORY_MODULE",
    label: "Inventory Management Module Menu",
    icon: "📦",
    desc: "Show dedicated Inventory menu (Dashboard, Add, Kirana/Pharmacy/Mall Lists, Stock History, Adjustment, Reports)",
  },
  "inventory-hub": {
    code: "MENU_INVENTORY_HUB",
    label: "Add Inventory & Dormancy Menu",
    icon: "＋",
    desc: "Show multi-vendor product onboarding builder & >1W / >1M unused stock tracker",
  },
  "store-floor": {
    code: "MENU_STORE_FLOOR",
    label: "Store-Floor POS & OCR Menu",
    icon: "⚖",
    desc: "Show counter POS billing (Loose / Tablet Split / Unit), OCR scanner & barcode printer",
  },
  "profit-guard": {
    code: "MENU_PROFIT_GUARD",
    label: "Profit & Anti-Theft Menu",
    icon: "🛡",
    desc: "Show margin drift alerts, staff void/drawer audit logs & clearance combo builder",
  },
  "suppliers-khata": {
    code: "MENU_SUPPLIERS_KHATA",
    label: "Suppliers & Khata Menu",
    icon: "⇄",
    desc: "Show distributor Auto-PO comparison, Digital Khata credit & RTV deduction bucket",
  },
  retention: {
    code: "MENU_RETENTION",
    label: "WhatsApp AI & Loyalty Menu",
    icon: "💬",
    desc: "Show WhatsApp voice/photo order parser, refill nudges & 1% cashback wallet",
  },
  "gst-pulse": {
    code: "MENU_GST_PULSE",
    label: "GST & Tax Filing Menu",
    icon: "₹",
    desc: "Show 0%, 5%, 12%, 18% GST slab classification & GSTR-1 / GSTR-3B export",
  },
  "user-permissions": {
    code: "MENU_USER_PERMISSIONS",
    label: "User & Permission Module Menu",
    icon: "🔐",
    desc: "Show separated User Permissions, Menu Permissions & Module Permissions administration",
  },
};

const MODULE_META: Record<
  ModulePermissionKey,
  { code: string; label: string; parentMenu: string; desc: string }
> = {
  posBilling: {
    code: "MOD_POS_BILLING",
    label: "Counter POS & Split Billing Engine",
    parentMenu: "Store-Floor POS",
    desc: "Sell loose weight (Grocery), split tablet strips (Pharmacy), or scan units (Supermarket)",
  },
  ocrScanner: {
    code: "MOD_OCR_SCANNER",
    label: "AI OCR Purchase Bill Scanner",
    parentMenu: "Store-Floor POS",
    desc: "Auto-extract batch, expiry & landed cost from wholesaler paper invoices",
  },
  barcodeGenerator: {
    code: "MOD_BARCODE_PRINT",
    label: "Thermal Barcode & Label Printer",
    parentMenu: "Store-Floor POS",
    desc: "Print pouch stickers, Pharmacy Rx dosage labels, and Supermarket MRP shelf tags",
  },
  marginDrift: {
    code: "MOD_MARGIN_DRIFT",
    label: "Margin & Cost-Price Drift Guard",
    parentMenu: "Profit & Anti-Theft",
    desc: "Flag items below target profit margin & 1-click re-price within MRP cap",
  },
  auditLogs: {
    code: "MOD_AUDIT_LOGS",
    label: "Cash Drawer & Staff Void Audit Log",
    parentMenu: "Profit & Anti-Theft",
    desc: "Monitor bill cancellations, price overrides & EOD Cash + UPI variance",
  },
  comboBuilder: {
    code: "MOD_COMBO_BUILDER",
    label: "Dead-Stock Clearance Combo Builder",
    parentMenu: "Profit & Anti-Theft",
    desc: "Bundle slow-moving stock with high-velocity staples at POS checkout",
  },
  autoPo: {
    code: "MOD_SUPPLIER_AUTOPO",
    label: "Supplier Auto-PO & RTV Deduction",
    parentMenu: "Suppliers & Khata",
    desc: "Compare last 3 vendor landing rates & auto-deduct damaged/expired RTV value",
  },
  digitalKhata: {
    code: "MOD_DIGITAL_KHATA",
    label: "Digital Khata & Household Credit Caps",
    parentMenu: "Suppliers & Khata",
    desc: "Track customer credit limits & dispatch automated WhatsApp UPI payment links",
  },
  whatsappAi: {
    code: "MOD_WHATSAPP_AI",
    label: "WhatsApp Voice / Photo Order Parser",
    parentMenu: "WhatsApp AI & Loyalty",
    desc: "Convert handwritten grocery slips & voice notes into store pick-lists",
  },
  gstExport: {
    code: "MOD_GST_EXPORT",
    label: "One-Click GSTR-1 / GSTR-3B Export",
    parentMenu: "GST & Tax Filing",
    desc: "Export accountant-ready tax summaries across 0%, 5%, 12%, 18% GST slabs",
  },
};

export function UserPermissionModule({
  currentUser,
  allUsers,
  onUpdateUser,
  onApproveUser,
  onNotify,
}: UserPermissionModuleProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);

  // User List Search, Filter & Pagination State
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<
    "ALL" | "APPROVED" | "PENDING" | "Grocery" | "Pharmacy" | "Mall"
  >("ALL");
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(4);

  // Permission List Search, Filter & Pagination State
  const [permSearch, setPermSearch] = useState("");
  const [permCategoryFilter, setPermCategoryFilter] = useState<
    "ALL" | "user" | "menu" | "module"
  >("ALL");
  const [permStatusFilter, setPermStatusFilter] = useState<"ALL" | "GRANTED" | "RESTRICTED">(
    "ALL",
  );
  const [permPage, setPermPage] = useState(1);
  const [permPageSize, setPermPageSize] = useState(8);

  const targetUser = allUsers.find((u) => u.id === selectedUserId) || currentUser;

  const allowedVerticals = targetUser.allowedVerticals ?? ALL_VERTICALS;
  const userPerms: UserActionPermissions = targetUser.userPermissions ?? {
    canAddInventory: true,
    canNotifyVendors: true,
    canOverridePrice: true,
    canApproveUsers: true,
  };
  const invPerms: InventoryRBACPermissions = targetUser.inventoryPermissions ?? {
    ...DEFAULT_INVENTORY_PERMISSIONS,
  };
  const menuPerms = targetUser.menuPermissions ?? ALL_MENU_KEYS;
  const modulePerms = targetUser.modulePermissions ?? ALL_MODULE_KEYS;

  // Handlers for toggling permissions
  function toggleVertical(vertical: VendorVerticalPermission) {
    const exists = allowedVerticals.includes(vertical);
    if (exists && allowedVerticals.length === 1) {
      onNotify("A user must have permission for at least one store vertical.");
      return;
    }
    const nextVerticals = exists
      ? allowedVerticals.filter((v) => v !== vertical)
      : [...allowedVerticals, vertical];

    onUpdateUser({
      ...targetUser,
      allowedVerticals: nextVerticals,
    });
    onNotify(
      `Updated Store Vertical permission for ${targetUser.name}: [${nextVerticals
        .map((v) => (v === "Mall" ? "Supermarket / Mall" : v))
        .join(", ")}]`,
    );
  }

  function applyVerticalPresetToCurrentUser(
    verticals: VendorVerticalPermission[],
    label: string,
  ) {
    onUpdateUser({
      ...currentUser,
      allowedVerticals: verticals,
    });
    setSelectedUserId(currentUser.id);
    onNotify(
      `Applied "${label}" to your active session (${currentUser.name}). Dashboard now displays only permitted store verticals.`,
    );
  }

  function toggleActionPermission(key: keyof UserActionPermissions) {
    const next: UserActionPermissions = {
      ...userPerms,
      [key]: !userPerms[key],
    };
    onUpdateUser({
      ...targetUser,
      userPermissions: next,
    });
    onNotify(`Updated user permission "${ACTION_META[key].label}" for ${targetUser.name}.`);
  }

  function toggleInventoryPermission(key: keyof InventoryRBACPermissions) {
    const next: InventoryRBACPermissions = {
      ...invPerms,
      [key]: !invPerms[key],
    };
    onUpdateUser({
      ...targetUser,
      inventoryPermissions: next,
    });
    onNotify(
      `Updated Inventory RBAC permission "${INVENTORY_RBAC_META[key].label}" for ${targetUser.name}.`,
    );
  }

  function toggleMenuPermission(key: MenuPermissionKey) {
    if (key === "user-permissions" && targetUser.id === currentUser.id) {
      onNotify(
        "User & Permission Module cannot be disabled for your own active admin session.",
      );
      return;
    }
    const exists = menuPerms.includes(key);
    if (exists && menuPerms.length === 1) {
      onNotify("At least one menu must remain enabled.");
      return;
    }
    const nextMenus = exists
      ? menuPerms.filter((m) => m !== key)
      : [...menuPerms, key];

    onUpdateUser({
      ...targetUser,
      menuPermissions: nextMenus,
    });
    onNotify(`Updated Menu Permission "${MENU_META[key].label}" for ${targetUser.name}.`);
  }

  function toggleModulePermission(key: ModulePermissionKey) {
    const exists = modulePerms.includes(key);
    const nextModules = exists
      ? modulePerms.filter((m) => m !== key)
      : [...modulePerms, key];

    onUpdateUser({
      ...targetUser,
      modulePermissions: nextModules,
    });
    onNotify(`Updated Module Permission "${MODULE_META[key].label}" for ${targetUser.name}.`);
  }

  function grantAllPermissions() {
    onUpdateUser({
      ...targetUser,
      allowedVerticals: [...ALL_VERTICALS],
      userPermissions: {
        canAddInventory: true,
        canNotifyVendors: true,
        canOverridePrice: true,
        canApproveUsers: true,
      },
      inventoryPermissions: { ...DEFAULT_INVENTORY_PERMISSIONS },
      menuPermissions: [...ALL_MENU_KEYS],
      modulePermissions: [...ALL_MODULE_KEYS],
    });
    onNotify(`Granted all User, Inventory RBAC, Menu, and Module permissions to ${targetUser.name}.`);
  }

  // 1. Filtered & Paginated User List
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return allUsers.filter((candidate) => {
      const verts = candidate.allowedVerticals ?? ALL_VERTICALS;
      if (userFilter === "APPROVED" && !candidate.approved) return false;
      if (userFilter === "PENDING" && candidate.approved) return false;
      if (
        (userFilter === "Grocery" || userFilter === "Pharmacy" || userFilter === "Mall") &&
        !verts.includes(userFilter)
      ) {
        return false;
      }
      if (!q) return true;
      const verticalText = verts
        .map((v) => (v === "Mall" ? "supermarket mall" : v.toLowerCase()))
        .join(" ");
      return (
        candidate.name.toLowerCase().includes(q) ||
        candidate.email.toLowerCase().includes(q) ||
        candidate.company.toLowerCase().includes(q) ||
        (candidate.role || "").toLowerCase().includes(q) ||
        verticalText.includes(q)
      );
    });
  }, [allUsers, userSearch, userFilter]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = useMemo(() => {
    const start = (safeUserPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, safeUserPage, userPageSize]);

  // 2. Build Unified Permission List (User Permissions + Inventory RBAC + Menu Permissions + Module Permissions = 34 rows)
  const allPermissionRows: UnifiedPermissionRow[] = (() => {
    const rows: UnifiedPermissionRow[] = [];

    // A) User Permissions: Store Verticals (3)
    ALL_VERTICALS.forEach((vertical) => {
      const meta = VERTICAL_META[vertical];
      rows.push({
        id: `vert-${vertical}`,
        code: meta.code,
        category: "user",
        categoryLabel: "User Permission",
        subGroupLabel: "Store Vertical Scope",
        title: `${meta.icon} ${meta.label}`,
        description: meta.desc,
        enabled: allowedVerticals.includes(vertical),
        onToggle: () => toggleVertical(vertical),
      });
    });

    // B) User Permissions: Role Actions (4)
    (Object.keys(ACTION_META) as (keyof UserActionPermissions)[]).forEach((actionKey) => {
      const meta = ACTION_META[actionKey];
      rows.push({
        id: `act-${actionKey}`,
        code: meta.code,
        category: "user",
        categoryLabel: "User Permission",
        subGroupLabel: "Operational Action",
        title: meta.label,
        description: meta.desc,
        enabled: userPerms[actionKey],
        onToggle: () => toggleActionPermission(actionKey),
      });
    });

    // B2) Inventory Module RBAC Permissions (8)
    (Object.keys(INVENTORY_RBAC_META) as (keyof InventoryRBACPermissions)[]).forEach((invKey) => {
      const meta = INVENTORY_RBAC_META[invKey];
      rows.push({
        id: `inv-rbac-${invKey}`,
        code: meta.code,
        category: "user",
        categoryLabel: "Inventory RBAC",
        subGroupLabel: "Inventory Module Governance",
        title: `📦 ${meta.label}`,
        description: meta.desc,
        enabled: invPerms[invKey],
        onToggle: () => toggleInventoryPermission(invKey),
      });
    });

    // C) Menu Permissions (9)
    ALL_MENU_KEYS.forEach((menuKey) => {
      const meta = MENU_META[menuKey];
      rows.push({
        id: `menu-${menuKey}`,
        code: meta.code,
        category: "menu",
        categoryLabel: "Menu Permission",
        subGroupLabel: "Sidebar Navigation",
        title: `${meta.icon} ${meta.label}`,
        description: meta.desc,
        enabled: menuPerms.includes(menuKey),
        onToggle: () => toggleMenuPermission(menuKey),
      });
    });

    // D) Module Permissions (10)
    ALL_MODULE_KEYS.forEach((modKey) => {
      const meta = MODULE_META[modKey];
      rows.push({
        id: `mod-${modKey}`,
        code: meta.code,
        category: "module",
        categoryLabel: "Module Permission",
        subGroupLabel: meta.parentMenu,
        title: meta.label,
        description: meta.desc,
        enabled: modulePerms.includes(modKey),
        onToggle: () => toggleModulePermission(modKey),
      });
    });

    return rows;
  })();

  const filteredPermissions = (() => {
    const q = permSearch.trim().toLowerCase();
    return allPermissionRows.filter((row) => {
      if (permCategoryFilter !== "ALL" && row.category !== permCategoryFilter) return false;
      if (permStatusFilter === "GRANTED" && !row.enabled) return false;
      if (permStatusFilter === "RESTRICTED" && row.enabled) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        row.categoryLabel.toLowerCase().includes(q) ||
        row.subGroupLabel.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q)
      );
    });
  })();

  const totalPermPages = Math.max(1, Math.ceil(filteredPermissions.length / permPageSize));
  const safePermPage = Math.min(permPage, totalPermPages);
  const paginatedPermissions = useMemo(() => {
    const start = (safePermPage - 1) * permPageSize;
    return filteredPermissions.slice(start, start + permPageSize);
  }, [filteredPermissions, safePermPage, permPageSize]);

  return (
    <div className="kirana-section-stack">
      {/* Quick Live Permission Simulator Banner */}
      <article className="dashboard-card permission-preset-banner">
        <div className="card-heading">
          <div>
            <p className="card-eyebrow">LIVE VERTICAL & PERMISSION SWITCHER (ACTIVE SESSION)</p>
            <h2>
              Test how Pharmacy, Supermarket & Grocery adapt based on logged-in user permission
            </h2>
          </div>
          <span className="pill ready">
            Active Verticals:{" "}
            {(currentUser.allowedVerticals ?? ALL_VERTICALS)
              .map((v) => (v === "Mall" ? "Supermarket" : v))
              .join(" + ")}
          </span>
        </div>

        <div className="preset-btn-row">
          <button
            type="button"
            className="preset-chip-btn pharmacy"
            onClick={() =>
              applyVerticalPresetToCurrentUser(["Pharmacy"], "Pharmacy-Only Permission")
            }
          >
            💊 Set My Permission: Pharmacy Only
          </button>
          <button
            type="button"
            className="preset-chip-btn mall"
            onClick={() =>
              applyVerticalPresetToCurrentUser(["Mall"], "Supermarket / Mall Only Permission")
            }
          >
            🏬 Set My Permission: Supermarket Only
          </button>
          <button
            type="button"
            className="preset-chip-btn grocery"
            onClick={() =>
              applyVerticalPresetToCurrentUser(["Grocery"], "Grocery / Kirana Only Permission")
            }
          >
            🛒 Set My Permission: Grocery Only
          </button>
          <button
            type="button"
            className="preset-chip-btn all"
            onClick={() =>
              applyVerticalPresetToCurrentUser(
                ["Grocery", "Pharmacy", "Mall"],
                "All Verticals (Grocery + Pharmacy + Supermarket)",
              )
            }
          >
            👑 Set My Permission: All 3 Verticals
          </button>
        </div>
      </article>

      {/* SECTION 1: SEARCHABLE & PAGINATED USER DETAILS LIST */}
      <article className="dashboard-card">
        <div className="card-heading">
          <div>
            <p className="card-eyebrow">1. USER DIRECTORY & STORE VERTICAL ASSIGNMENTS (LIST VIEW)</p>
            <h2>Select a user from the list to inspect or update their permissions</h2>
          </div>
          <span className="count-badge">{filteredUsers.length}</span>
        </div>

        {/* User List Search & Filter Bar */}
        <div className="list-toolbar">
          <div className="list-search-box">
            <input
              type="search"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserPage(1);
              }}
              placeholder="Search users by name, email, company, role, or vertical..."
              aria-label="Search users"
            />
          </div>
          <div className="list-filter-controls">
            <select
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value as typeof userFilter);
                setUserPage(1);
              }}
              aria-label="Filter users"
            >
              <option value="ALL">All Users ({allUsers.length})</option>
              <option value="APPROVED">Approved Users</option>
              <option value="PENDING">Pending Approval</option>
              <option value="Pharmacy">💊 Pharmacy Permitted</option>
              <option value="Mall">🏬 Supermarket Permitted</option>
              <option value="Grocery">🛒 Grocery Permitted</option>
            </select>

            <label className="page-size-label">
              Rows:
              <select
                value={userPageSize}
                onChange={(e) => {
                  setUserPageSize(Number(e.target.value));
                  setUserPage(1);
                }}
                aria-label="Users per page"
              >
                <option value={4}>4 / page</option>
                <option value={6}>6 / page</option>
                <option value={10}>10 / page</option>
              </select>
            </label>
          </div>
        </div>

        {/* User Details Table List */}
        <div className="kirana-table-wrap">
          <table className="kirana-table user-list-table">
            <thead>
              <tr>
                <th>User Name & Email</th>
                <th>Company & Role</th>
                <th>Permitted Store Verticals</th>
                <th>Granted Summary</th>
                <th>Account Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-table-cell">
                    No users match &ldquo;{userSearch}&rdquo;. Try clearing your search filter.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((candidate) => {
                  const isSelected = candidate.id === targetUser.id;
                  const isCurrent = candidate.id === currentUser.id;
                  const verts = candidate.allowedVerticals ?? ALL_VERTICALS;
                  const uAct = candidate.userPermissions ?? {
                    canAddInventory: true,
                    canNotifyVendors: true,
                    canOverridePrice: true,
                    canApproveUsers: true,
                  };
                  const actCount = Object.values(uAct).filter(Boolean).length;
                  const mCount = (candidate.menuPermissions ?? ALL_MENU_KEYS).length;
                  const modCount = (candidate.modulePermissions ?? ALL_MODULE_KEYS).length;

                  return (
                    <tr
                      key={candidate.id}
                      className={isSelected ? "selected-list-row" : ""}
                      onClick={() => setSelectedUserId(candidate.id)}
                    >
                      <td>
                        <div className="user-cell-inline">
                          <span className="avatar">{candidate.name.slice(0, 1).toUpperCase()}</span>
                          <div>
                            <strong>
                              {candidate.name}{" "}
                              {isCurrent && <em className="you-tag">(Logged In)</em>}
                            </strong>
                            <small>{candidate.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{candidate.role || "Operations Admin"}</strong>
                        <small>{candidate.company}</small>
                      </td>
                      <td>
                        <div className="user-roster-badges">
                          {verts.map((v) => (
                            <span
                              key={v}
                              className={`vertical-tag vertical-${v.toLowerCase()}`}
                            >
                              {v === "Mall" ? "Supermarket" : v}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <strong>
                          {verts.length} Verticals · {actCount}/4 Actions
                        </strong>
                        <small>
                          {mCount}/{ALL_MENU_KEYS.length} Menus · {modCount}/
                          {ALL_MODULE_KEYS.length} Modules
                        </small>
                      </td>
                      <td>
                        {candidate.approved ? (
                          <span className="pill ready">Approved</span>
                        ) : (
                          <span className="pill waiting">Pending</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="table-action-stack">
                          <button
                            type="button"
                            className={isSelected ? "approve-button" : "subtle-button"}
                            onClick={() => setSelectedUserId(candidate.id)}
                          >
                            {isSelected ? "✓ Editing Below" : "Edit Permissions"}
                          </button>
                          {!candidate.approved && (
                            <button
                              type="button"
                              className="approve-button"
                              onClick={() => onApproveUser(candidate.email)}
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* User List Pagination Footer */}
        <div className="list-pagination-bar">
          <span>
            Showing{" "}
            <b>
              {filteredUsers.length === 0 ? 0 : (safeUserPage - 1) * userPageSize + 1}–
              {Math.min(safeUserPage * userPageSize, filteredUsers.length)}
            </b>{" "}
            of <b>{filteredUsers.length}</b> users
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              disabled={safeUserPage <= 1}
              onClick={() => setUserPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            {Array.from({ length: totalUserPages }, (_, idx) => idx + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={pageNum === safeUserPage ? "active" : ""}
                onClick={() => setUserPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              disabled={safeUserPage >= totalUserPages}
              onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      </article>

      {/* SECTION 2: SEARCHABLE & PAGINATED PERMISSION LIST (USER, MENU & MODULE PERMISSIONS) */}
      <article className="dashboard-card">
        <div className="card-heading">
          <div>
            <p className="card-eyebrow">
              2. PERMISSION MATRIX LIST FOR: {targetUser.name.toUpperCase()} ({targetUser.email})
            </p>
            <h2>
              Searchable & paginated list of User Permissions, Menu Permissions & Module Permissions
            </h2>
          </div>
          <div className="header-actions">
            <button type="button" className="subtle-button" onClick={grantAllPermissions}>
              ✓ Grant All 25 Permissions to {targetUser.name.split(" ")[0]}
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="permission-subtabs four-tabs" role="tablist" aria-label="Permission categories">
          <button
            type="button"
            role="tab"
            aria-selected={permCategoryFilter === "ALL"}
            className={permCategoryFilter === "ALL" ? "active" : ""}
            onClick={() => {
              setPermCategoryFilter("ALL");
              setPermPage(1);
            }}
          >
            All Permissions ({allPermissionRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={permCategoryFilter === "user"}
            className={permCategoryFilter === "user" ? "active" : ""}
            onClick={() => {
              setPermCategoryFilter("user");
              setPermPage(1);
            }}
          >
            1. User Permissions (7)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={permCategoryFilter === "menu"}
            className={permCategoryFilter === "menu" ? "active" : ""}
            onClick={() => {
              setPermCategoryFilter("menu");
              setPermPage(1);
            }}
          >
            2. Menu Permissions ({ALL_MENU_KEYS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={permCategoryFilter === "module"}
            className={permCategoryFilter === "module" ? "active" : ""}
            onClick={() => {
              setPermCategoryFilter("module");
              setPermPage(1);
            }}
          >
            3. Module Permissions ({ALL_MODULE_KEYS.length})
          </button>
        </div>

        {/* Permission Search & Pagination Size Toolbar */}
        <div className="list-toolbar">
          <div className="list-search-box">
            <input
              type="search"
              value={permSearch}
              onChange={(e) => {
                setPermSearch(e.target.value);
                setPermPage(1);
              }}
              placeholder="Search permissions by name, code (e.g. VERT_PHARMACY, MENU_STORE_FLOOR), or description..."
              aria-label="Search permissions"
            />
          </div>
          <div className="list-filter-controls">
            <select
              value={permStatusFilter}
              onChange={(e) => {
                setPermStatusFilter(e.target.value as typeof permStatusFilter);
                setPermPage(1);
              }}
              aria-label="Filter by access status"
            >
              <option value="ALL">All Statuses</option>
              <option value="GRANTED">✓ Granted Only</option>
              <option value="RESTRICTED">✕ Restricted Only</option>
            </select>

            <label className="page-size-label">
              Rows:
              <select
                value={permPageSize}
                onChange={(e) => {
                  setPermPageSize(Number(e.target.value));
                  setPermPage(1);
                }}
                aria-label="Permissions per page"
              >
                <option value={6}>6 / page</option>
                <option value={8}>8 / page</option>
                <option value={12}>12 / page</option>
                <option value={25}>25 / page (All)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Permissions List Table */}
        <div className="kirana-table-wrap">
          <table className="kirana-table permission-list-table">
            <thead>
              <tr>
                <th>Permission Code & Title</th>
                <th>Permission Type</th>
                <th>Scope / Parent Menu</th>
                <th>Description</th>
                <th>Status</th>
                <th>Access Toggle</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPermissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-table-cell">
                    No permissions match &ldquo;{permSearch}&rdquo;. Try clearing your search or status filter.
                  </td>
                </tr>
              ) : (
                paginatedPermissions.map((row) => (
                  <tr key={row.id} className={row.enabled ? "perm-row-enabled" : "perm-row-disabled"}>
                    <td>
                      <code className="perm-code-chip">{row.code}</code>
                      <strong>{row.title}</strong>
                    </td>
                    <td>
                      <span className={`perm-type-badge type-${row.category}`}>
                        {row.categoryLabel}
                      </span>
                    </td>
                    <td>
                      <strong>{row.subGroupLabel}</strong>
                    </td>
                    <td>
                      <span className="perm-desc-text">{row.description}</span>
                    </td>
                    <td>
                      {row.enabled ? (
                        <span className="pill ready">✓ Granted</span>
                      ) : (
                        <span className="pill waiting">Restricted</span>
                      )}
                    </td>
                    <td>
                      <label className="list-switch-label">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={row.onToggle}
                        />
                        <span>{row.enabled ? "Enabled" : "Disabled"}</span>
                      </label>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Permission List Pagination Footer */}
        <div className="list-pagination-bar">
          <span>
            Showing{" "}
            <b>
              {filteredPermissions.length === 0
                ? 0
                : (safePermPage - 1) * permPageSize + 1}
              –{Math.min(safePermPage * permPageSize, filteredPermissions.length)}
            </b>{" "}
            of <b>{filteredPermissions.length}</b> permissions for <b>{targetUser.name}</b>
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              disabled={safePermPage <= 1}
              onClick={() => setPermPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            {Array.from({ length: totalPermPages }, (_, idx) => idx + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={pageNum === safePermPage ? "active" : ""}
                onClick={() => setPermPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              disabled={safePermPage >= totalPermPages}
              onClick={() => setPermPage((p) => Math.min(totalPermPages, p + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
