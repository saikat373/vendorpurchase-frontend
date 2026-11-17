import type { NextRequest } from "next/server";
import {
  AuthorizationError,
  buildInventoryDashboardAndReports,
  parseUserContextFromRequest,
  queryAuditLogs,
} from "@/lib/inventory-service";
import type { AuditOperationType, InventoryCategory } from "@/lib/inventory-types";

export async function GET(request: NextRequest) {
  try {
    const user = parseUserContextFromRequest(request);
    const sp = request.nextUrl.searchParams;
    const mode = sp.get("mode") || "dashboard";
    const category = (sp.get("category") as InventoryCategory | "ALL") || "ALL";

    if (mode === "audit") {
      const auditResult = queryAuditLogs(user, {
        category,
        operation: (sp.get("operation") as AuditOperationType | "ALL") || "ALL",
        recordId: sp.get("recordId") || undefined,
        search: sp.get("search") || "",
        page: Number(sp.get("page")) || 1,
        pageSize: Number(sp.get("pageSize")) || 12,
      });
      return Response.json(auditResult);
    }

    const reportData = buildInventoryDashboardAndReports(user, category);
    return Response.json(reportData);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    return Response.json(
      { error: "Failed to generate inventory dashboard or report." },
      { status: 500 },
    );
  }
}
