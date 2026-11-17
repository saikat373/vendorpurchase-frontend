"use client";

import { useSyncExternalStore } from "react";
import {
  BrowserRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { AuthPage } from "@/components/auth-page";
import { DashboardPage } from "@/components/dashboard-page";
import { APP_ROUTES } from "@/lib/routes";

type AppRouterShellProps = {
  initialPath?: string;
};

const emptySubscribe = () => () => {};

function AppRouteTable() {
  return (
    <Routes>
      {/* Root & Auth Routes */}
      <Route path="/" element={<Navigate to={APP_ROUTES.LOGIN} replace />} />
      <Route path={APP_ROUTES.LOGIN} element={<AuthPage mode="login" />} />
      <Route path={APP_ROUTES.SIGNUP} element={<Navigate to={APP_ROUTES.LOGIN} replace />} />

      {/* Direct /inventory/* convenience routes redirecting to /dashboard/inventory/* */}
      <Route
        path="/inventory"
        element={<Navigate to={APP_ROUTES.INVENTORY_DASHBOARD} replace />}
      />
      <Route
        path="/inventory/dashboard"
        element={<Navigate to={APP_ROUTES.INVENTORY_DASHBOARD} replace />}
      />
      <Route
        path="/inventory/add"
        element={<Navigate to={APP_ROUTES.INVENTORY_ADD} replace />}
      />
      <Route
        path="/inventory/list/kirana"
        element={<Navigate to={APP_ROUTES.INVENTORY_LIST_KIRANA} replace />}
      />
      <Route
        path="/inventory/list/pharmacy"
        element={<Navigate to={APP_ROUTES.INVENTORY_LIST_PHARMACY} replace />}
      />
      <Route
        path="/inventory/list/mall"
        element={<Navigate to={APP_ROUTES.INVENTORY_LIST_MALL} replace />}
      />
      <Route
        path="/inventory/stock-history"
        element={<Navigate to={APP_ROUTES.INVENTORY_STOCK_HISTORY} replace />}
      />
      <Route
        path="/inventory/stock-adjustment"
        element={<Navigate to={APP_ROUTES.INVENTORY_STOCK_ADJUSTMENT} replace />}
      />
      <Route
        path="/inventory/reports"
        element={<Navigate to={APP_ROUTES.INVENTORY_REPORTS} replace />}
      />

      {/* Dashboard & Inventory Module Routes */}
      <Route path="/dashboard" element={<DashboardPage />}>
        <Route
          index
          element={<Navigate to={APP_ROUTES.INVENTORY_DASHBOARD} replace />}
        />
        <Route path="overview" element={null} />

        {/* Dedicated Inventory Management Module Routes */}
        <Route
          path="inventory"
          element={<Navigate to={APP_ROUTES.INVENTORY_DASHBOARD} replace />}
        />
        <Route path="inventory/dashboard" element={null} />
        <Route path="inventory/add" element={null} />
        <Route
          path="inventory/list"
          element={<Navigate to={APP_ROUTES.INVENTORY_LIST_KIRANA} replace />}
        />
        <Route path="inventory/list/kirana" element={null} />
        <Route path="inventory/list/pharmacy" element={null} />
        <Route path="inventory/list/mall" element={null} />
        <Route path="inventory/stock-history" element={null} />
        <Route path="inventory/stock-adjustment" element={null} />
        <Route path="inventory/reports" element={null} />

        {/* Store Operations & Administration Routes */}
        <Route path="inventory-hub" element={null} />
        <Route path="store-floor" element={null} />
        <Route path="profit-guard" element={null} />
        <Route path="suppliers-khata" element={null} />
        <Route path="retention" element={null} />
        <Route path="gst-pulse" element={null} />
        <Route path="user-permissions" element={null} />
      </Route>

      {/* Catch-all fallback */}
      <Route
        path="*"
        element={<Navigate to={APP_ROUTES.INVENTORY_DASHBOARD} replace />}
      />
    </Routes>
  );
}

export function AppRouterShell({ initialPath = "/dashboard/inventory/dashboard" }: AppRouterShellProps) {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!isClient) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRouteTable />
      </MemoryRouter>
    );
  }

  return (
    <BrowserRouter>
      <AppRouteTable />
    </BrowserRouter>
  );
}
