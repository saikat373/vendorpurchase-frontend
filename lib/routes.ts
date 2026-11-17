import type { MenuPermissionKey } from "@/lib/auth-storage";
import type { InventorySubRoute } from "@/lib/inventory-types";

export const APP_ROUTES = {
  LOGIN: "/login",
  SIGNUP: "/signup",
  DASHBOARD: "/dashboard",
  // Inventory Module Routes (Section 3 of requirement.txt)
  INVENTORY_ROOT: "/dashboard/inventory",
  INVENTORY_DASHBOARD: "/dashboard/inventory/dashboard",
  INVENTORY_ADD: "/dashboard/inventory/add",
  INVENTORY_LIST_KIRANA: "/dashboard/inventory/list/kirana",
  INVENTORY_LIST_PHARMACY: "/dashboard/inventory/list/pharmacy",
  INVENTORY_LIST_MALL: "/dashboard/inventory/list/mall",
  INVENTORY_STOCK_HISTORY: "/dashboard/inventory/stock-history",
  INVENTORY_STOCK_ADJUSTMENT: "/dashboard/inventory/stock-adjustment",
  INVENTORY_REPORTS: "/dashboard/inventory/reports",
  // Store Operations & Governance Routes
  OVERVIEW: "/dashboard/overview",
  INVENTORY_HUB: "/dashboard/inventory-hub",
  STORE_FLOOR: "/dashboard/store-floor",
  PROFIT_GUARD: "/dashboard/profit-guard",
  SUPPLIERS_KHATA: "/dashboard/suppliers-khata",
  RETENTION: "/dashboard/retention",
  GST_PULSE: "/dashboard/gst-pulse",
  USER_PERMISSIONS: "/dashboard/user-permissions",
} as const;

export const INVENTORY_SUBROUTE_TO_PATH: Record<InventorySubRoute, string> = {
  dashboard: APP_ROUTES.INVENTORY_DASHBOARD,
  "add-inventory": APP_ROUTES.INVENTORY_ADD,
  "list-kirana": APP_ROUTES.INVENTORY_LIST_KIRANA,
  "list-pharmacy": APP_ROUTES.INVENTORY_LIST_PHARMACY,
  "list-mall": APP_ROUTES.INVENTORY_LIST_MALL,
  "stock-history": APP_ROUTES.INVENTORY_STOCK_HISTORY,
  "stock-adjustment": APP_ROUTES.INVENTORY_STOCK_ADJUSTMENT,
  reports: APP_ROUTES.INVENTORY_REPORTS,
};

export const MENU_KEY_TO_PATH: Record<MenuPermissionKey, string> = {
  overview: APP_ROUTES.OVERVIEW,
  inventory: APP_ROUTES.INVENTORY_DASHBOARD,
  "inventory-hub": APP_ROUTES.INVENTORY_HUB,
  "store-floor": APP_ROUTES.STORE_FLOOR,
  "profit-guard": APP_ROUTES.PROFIT_GUARD,
  "suppliers-khata": APP_ROUTES.SUPPLIERS_KHATA,
  retention: APP_ROUTES.RETENTION,
  "gst-pulse": APP_ROUTES.GST_PULSE,
  "user-permissions": APP_ROUTES.USER_PERMISSIONS,
};

export function resolveRouteFromPathname(pathname: string): {
  activeTab: MenuPermissionKey;
  inventorySubRoute: InventorySubRoute;
} {
  const clean = pathname.replace(/\/+$/, "") || "/dashboard";

  // Check Inventory sub-routes (supports both /dashboard/inventory/... and /inventory/...)
  if (clean.endsWith("/inventory/add")) {
    return { activeTab: "inventory", inventorySubRoute: "add-inventory" };
  }
  if (clean.endsWith("/inventory/list/kirana")) {
    return { activeTab: "inventory", inventorySubRoute: "list-kirana" };
  }
  if (clean.endsWith("/inventory/list/pharmacy")) {
    return { activeTab: "inventory", inventorySubRoute: "list-pharmacy" };
  }
  if (clean.endsWith("/inventory/list/mall")) {
    return { activeTab: "inventory", inventorySubRoute: "list-mall" };
  }
  if (clean.endsWith("/inventory/stock-history")) {
    return { activeTab: "inventory", inventorySubRoute: "stock-history" };
  }
  if (clean.endsWith("/inventory/stock-adjustment")) {
    return { activeTab: "inventory", inventorySubRoute: "stock-adjustment" };
  }
  if (clean.endsWith("/inventory/reports")) {
    return { activeTab: "inventory", inventorySubRoute: "reports" };
  }
  if (
    clean.endsWith("/inventory/dashboard") ||
    clean.endsWith("/inventory") ||
    clean === "/dashboard"
  ) {
    return { activeTab: "inventory", inventorySubRoute: "dashboard" };
  }

  // Check other dashboard module routes
  if (clean.endsWith("/overview")) {
    return { activeTab: "overview", inventorySubRoute: "dashboard" };
  }
  if (clean.endsWith("/inventory-hub")) {
    return { activeTab: "inventory-hub", inventorySubRoute: "dashboard" };
  }
  if (clean.endsWith("/store-floor")) {
    return { activeTab: "store-floor", inventorySubRoute: "dashboard" };
  }
  if (clean.endsWith("/profit-guard")) {
    return { activeTab: "profit-guard", inventorySubRoute: "dashboard" };
  }
  if (clean.endsWith("/suppliers-khata")) {
    return { activeTab: "suppliers-khata", inventorySubRoute: "dashboard" };
  }
  if (clean.endsWith("/retention")) {
    return { activeTab: "retention", inventorySubRoute: "dashboard" };
  }
  if (clean.endsWith("/gst-pulse")) {
    return { activeTab: "gst-pulse", inventorySubRoute: "dashboard" };
  }
  if (clean.endsWith("/user-permissions")) {
    return { activeTab: "user-permissions", inventorySubRoute: "dashboard" };
  }

  return { activeTab: "inventory", inventorySubRoute: "dashboard" };
}
