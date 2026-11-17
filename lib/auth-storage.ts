import dummyCredentials from "@/data/dummy-credentials.json";

export type UserAccountType = "Admin" | "Vendor";

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
  accountType?: UserAccountType;
  name: string;
  email: string;
  company: string;
  role?: string;
  passwordHash: string;
  approved: boolean;
  isActive?: boolean;
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

export const VENDOR_DEFAULT_USER_PERMISSIONS: UserActionPermissions = {
  canAddInventory: false,
  canNotifyVendors: false,
  canOverridePrice: false,
  canApproveUsers: false,
};

export const VENDOR_DEFAULT_INVENTORY_PERMISSIONS: InventoryRBACPermissions = {
  viewInventory: true,
  addInventory: false,
  editInventory: false,
  viewStock: true,
  adjustStock: false,
  exportInventory: false,
  viewStockHistory: false,
  viewReports: false,
};

export const VENDOR_DEFAULT_MENU_KEYS: MenuPermissionKey[] = ["overview", "inventory"];

export const VENDOR_DEFAULT_MODULE_KEYS: ModulePermissionKey[] = [];

export type DummyCredentialSeed = {
  id: string;
  accountType: UserAccountType;
  name: string;
  email: string;
  password: string;
  company: string;
  role: string;
  approved: boolean;
  allowedVerticals: VendorVerticalPermission[];
  allowedLocations: string[];
  userPermissions: UserActionPermissions;
  inventoryPermissions: InventoryRBACPermissions;
  menuPermissions: MenuPermissionKey[];
  modulePermissions: ModulePermissionKey[];
};

export const DUMMY_ADMIN_CREDENTIALS = dummyCredentials.admin as DummyCredentialSeed[];
export const DUMMY_VENDOR_CREDENTIALS = dummyCredentials.vendors as DummyCredentialSeed[];

export function normalizeUserPermissions(user: AdminUser): Required<
  Pick<
    AdminUser,
    | "accountType"
    | "allowedVerticals"
    | "allowedLocations"
    | "userPermissions"
    | "inventoryPermissions"
    | "menuPermissions"
    | "modulePermissions"
  >
> &
  AdminUser {
  const accountType: UserAccountType =
    user.accountType ??
    (user.role?.toLowerCase().includes("vendor") ||
    user.id.startsWith("vendor-") ||
    user.id.startsWith("staff-")
      ? "Vendor"
      : "Admin");

  const isAdmin = accountType === "Admin";

  const baseMenus = user.menuPermissions
    ? [...user.menuPermissions]
    : isAdmin
      ? [...ALL_MENU_KEYS]
      : [...VENDOR_DEFAULT_MENU_KEYS];

  // Ensure users who had inventory-hub also get the Inventory menu unless explicitly configured
  if (!baseMenus.includes("inventory") && baseMenus.includes("inventory-hub")) {
    baseMenus.push("inventory");
  }

  const userPerms: UserActionPermissions = user.userPermissions
    ? { ...user.userPermissions }
    : isAdmin
      ? { ...DEFAULT_USER_PERMISSIONS }
      : { ...VENDOR_DEFAULT_USER_PERMISSIONS };

  const invPerms: InventoryRBACPermissions = user.inventoryPermissions
    ? { ...user.inventoryPermissions }
    : isAdmin
      ? { ...DEFAULT_INVENTORY_PERMISSIONS }
      : {
          ...VENDOR_DEFAULT_INVENTORY_PERMISSIONS,
          addInventory: userPerms.canAddInventory,
        };

  return {
    ...user,
    accountType,
    isActive: user.isActive ?? true,
    allowedVerticals:
      user.allowedVerticals && user.allowedVerticals.length > 0
        ? user.allowedVerticals
        : isAdmin
          ? [...ALL_VERTICALS]
          : ["Grocery"],
    allowedLocations:
      user.allowedLocations && user.allowedLocations.length > 0
        ? user.allowedLocations
        : isAdmin
          ? ["ALL"]
          : ["Main Store — Ground Floor"],
    userPermissions: userPerms,
    inventoryPermissions: invPerms,
    menuPermissions: baseMenus,
    modulePermissions: user.modulePermissions
      ? [...user.modulePermissions]
      : isAdmin
        ? [...ALL_MODULE_KEYS]
        : [...VENDOR_DEFAULT_MODULE_KEYS],
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

export async function ensureSeededCredentialUsers(): Promise<AdminUser[]> {
  const existingUsers = readUsers();
  const existingByEmail = new Map(
    existingUsers.map((u) => [u.email.toLowerCase(), u]),
  );

  const allSeeds = [...DUMMY_ADMIN_CREDENTIALS, ...DUMMY_VENDOR_CREDENTIALS];
  let changed = false;
  const nextUsers = [...existingUsers];

  for (const seed of allSeeds) {
    const emailKey = seed.email.toLowerCase();
    if (!existingByEmail.has(emailKey)) {
      const passwordHash = await hashPassword(seed.password);
      nextUsers.push(
        normalizeUserPermissions({
          id: seed.id,
          accountType: seed.accountType,
          name: seed.name,
          email: seed.email,
          company: seed.company,
          role: seed.role,
          passwordHash,
          approved: seed.approved,
          createdAt: "2026-11-17T09:00:00.000Z",
          allowedVerticals: seed.allowedVerticals,
          allowedLocations: seed.allowedLocations,
          userPermissions: seed.userPermissions,
          inventoryPermissions: seed.inventoryPermissions,
          menuPermissions: seed.menuPermissions,
          modulePermissions: seed.modulePermissions,
        }),
      );
      changed = true;
    }
  }

  if (changed) {
    saveUsers(nextUsers);
  }
  return nextUsers.map((u) => normalizeUserPermissions(u));
}
