import type { NextRequest } from "next/server";
import {
  generateExcelWorkbookXml,
  generateServerPdfBuffer,
  getExportFilename,
} from "@/lib/inventory-export";
import {
  AuthorizationError,
  parseUserContextFromRequest,
  queryInventoryProducts,
  requirePermission,
  type InventoryQueryOptions,
} from "@/lib/inventory-service";
import type {
  InventoryCategory,
  PharmacyExpiryFilter,
  StockStatusFilter,
} from "@/lib/inventory-types";

export async function GET(request: NextRequest) {
  try {
    const user = parseUserContextFromRequest(request);
    const sp = request.nextUrl.searchParams;

    const category = (sp.get("category") as InventoryCategory | "ALL") || "ALL";
    const format = (sp.get("format") as "excel" | "pdf") || "excel";
    const scope = (sp.get("scope") as "filtered" | "all") || "filtered";

    requirePermission(
      user,
      "exportInventory",
      category !== "ALL" ? category : undefined,
    );

    const options: InventoryQueryOptions = {
      category,
      search: sp.get("search") || "",
      productCategory: sp.get("productCategory") || "ALL",
      brand: sp.get("brand") || "ALL",
      supplier: sp.get("supplier") || "ALL",
      status: (sp.get("status") as "ALL" | "Active" | "Inactive") || "ALL",
      stockStatus: (sp.get("stockStatus") as StockStatusFilter) || "ALL",
      expiryStatus: (sp.get("expiryStatus") as PharmacyExpiryFilter) || "ALL",
      dateFrom: sp.get("dateFrom") || "",
      dateTo: sp.get("dateTo") || "",
      sortBy:
        (sp.get("sortBy") as InventoryQueryOptions["sortBy"]) || "updatedAt",
      sortOrder: (sp.get("sortOrder") as "asc" | "desc") || "desc",
      page: 1,
      pageSize: 10000,
    };

    const queryResult = queryInventoryProducts(user, options);
    const recordsToExport =
      scope === "all"
        ? queryResult.allAuthorizedCategoryItems
        : queryResult.allFilteredItems;

    const categoryLabel =
      category === "Grocery"
        ? "Kirana / Grocery"
        : category === "Pharmacy"
          ? "Pharmacy"
          : category === "Mall"
            ? "Mall / Supermarket"
            : `All Permitted Categories (${user.allowedVerticals.join(", ")})`;

    const scopeLabel =
      scope === "all"
        ? `All Authorized Records (${recordsToExport.length} items)`
        : `Currently Filtered Records (${recordsToExport.length} items)`;

    const filename = getExportFilename(category, format, scope);

    if (format === "pdf") {
      const pdfBuffer = generateServerPdfBuffer(recordsToExport, user, {
        categoryLabel,
        scopeLabel,
      });
      return new Response(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const excelXml = generateExcelWorkbookXml(recordsToExport, user, {
      categoryLabel,
      scopeLabel,
      searchQuery: options.search,
    });

    return new Response(excelXml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    return Response.json(
      { error: "Failed to generate inventory export." },
      { status: 500 },
    );
  }
}
