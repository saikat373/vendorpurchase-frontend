export type VendorVerticalPermission = "Grocery" | "Pharmacy" | "Mall";

export type MenuPermissionKey =
  | "overview"
  | "inventory"
  | "inventory-hub"
  | "store-floor"
  | "profit-guard"
  | "suppliers-khata"
  | "retention"
  | "gst-pulse"
  | "user-permissions";

export type ModulePermissionKey =
  | "posBilling"
  | "ocrScanner"
  | "barcodeGenerator"
  | "marginDrift"
  | "auditLogs"
  | "comboBuilder"
  | "autoPo"
  | "digitalKhata"
  | "whatsappAi"
  | "gstExport";

export type InventoryRBACPermissions = {
  viewInventory: boolean;
  addInventory: boolean;
  editInventory: boolean;
  viewStock: boolean;
  adjustStock: boolean;
  exportInventory: boolean;
  viewStockHistory: boolean;
  viewReports: boolean;
};

export type UserActionPermissions = {
  canAddInventory: boolean;
  canNotifyVendors: boolean;
  canOverridePrice: boolean;
  canApproveUsers: boolean;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  company: string;
  role?: string;
  passwordHash: string;
  approved: boolean;
  createdAt: string;
  allowedVerticals?: VendorVerticalPermission[];
  allowedLocations?: string[];
  userPermissions?: UserActionPermissions;
  inventoryPermissions?: InventoryRBACPermissions;
  menuPermissions?: MenuPermissionKey[];
  modulePermissions?: ModulePermissionKey[];
};

export const ALL_VERTICALS: VendorVerticalPermission[] = ["Grocery", "Pharmacy", "Mall"];

export const ALL_LOCATIONS: string[] = [
  "ALL",
  "Main Store — Ground Floor",
  "Kirana Bulk Godown — Wing A",
  "Pharmacy Cold-Chain & Med Vault",
  "Mall Floor 1 — Apparel & Lifestyle",
  "Mall Floor 2 — Appliances & Electronics",
];

export const ALL_MENU_KEYS: MenuPermissionKey[] = [
  "overview",
  "inventory",
  "inventory-hub",
  "store-floor",
  "profit-guard",
  "suppliers-khata",
  "retention",
  "gst-pulse",
  "user-permissions",
];

export const ALL_MODULE_KEYS: ModulePermissionKey[] = [
  "posBilling",
  "ocrScanner",
  "barcodeGenerator",
  "marginDrift",
  "auditLogs",
  "comboBuilder",
  "autoPo",
  "digitalKhata",
  "whatsappAi",
  "gstExport",
];

export const DEFAULT_USER_PERMISSIONS: UserActionPermissions = {
  canAddInventory: true,
  canNotifyVendors: true,
  canOverridePrice: true,
  canApproveUsers: true,
};

export const DEFAULT_INVENTORY_PERMISSIONS: InventoryRBACPermissions = {
  viewInventory: true,
  addInventory: true,
  editInventory: true,
  viewStock: true,
  adjustStock: true,
  exportInventory: true,
  viewStockHistory: true,
  viewReports: true,
};

export function normalizeUserPermissions(user: AdminUser): Required<
  Pick<
    AdminUser,
    | "allowedVerticals"
    | "allowedLocations"
    | "userPermissions"
    | "inventoryPermissions"
    | "menuPermissions"
    | "modulePermissions"
  >
> &
  AdminUser {
  const baseMenus =
    user.menuPermissions && user.menuPermissions.length > 0
      ? [...user.menuPermissions]
      : [...ALL_MENU_KEYS];

  // Ensure users who had inventory-hub or overview also get the Inventory menu unless explicitly configured
  if (!baseMenus.includes("inventory") && baseMenus.includes("inventory-hub")) {
    baseMenus.push("inventory");
  }

  const userPerms = user.userPermissions ?? { ...DEFAULT_USER_PERMISSIONS };
  const invPerms: InventoryRBACPermissions = user.inventoryPermissions ?? {
    viewInventory: true,
    addInventory: userPerms.canAddInventory,
    editInventory: userPerms.canAddInventory,
    viewStock: true,
    adjustStock: userPerms.canAddInventory,
    exportInventory: true,
    viewStockHistory: true,
    viewReports: true,
  };

  return {
    ...user,
    allowedVerticals:
      user.allowedVerticals && user.allowedVerticals.length > 0
        ? user.allowedVerticals
        : [...ALL_VERTICALS],
    allowedLocations:
      user.allowedLocations && user.allowedLocations.length > 0
        ? user.allowedLocations
        : ["ALL"],
    userPermissions: userPerms,
    inventoryPermissions: invPerms,
    menuPermissions: baseMenus,
    modulePermissions:
      user.modulePermissions && user.modulePermissions.length > 0
        ? user.modulePermissions
        : [...ALL_MODULE_KEYS],
  };
}

const USERS_KEY = "vendor-purchase-admin-users";
const SESSION_KEY = "vendor-purchase-admin-session";
const PASSWORD_SALT = "vendor-purchase-admin";

export function readUsers(): AdminUser[] {
  const value = localStorage.getItem(USERS_KEY);
  if (!value) return [];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved account data is invalid.");
  }
  return (parsed as AdminUser[]).map((u) => normalizeUserPermissions(u));
}

export function saveUsers(users: AdminUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function readSession(): AdminUser | null {
  const value = localStorage.getItem(SESSION_KEY);
  if (!value) return null;
  return normalizeUserPermissions(JSON.parse(value) as AdminUser);
}

export function saveSession(user: AdminUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(normalizeUserPermissions(user)));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function hashPassword(password: string) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${PASSWORD_SALT}:${password}`),
  );
  return Array.from(new Uint8Array(result))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
