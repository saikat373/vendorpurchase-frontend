import type { NextRequest } from "next/server";
import {
  AuthorizationError,
  ValidationError,
  createInventoryProduct,
  parseUserContextFromRequest,
  queryInventoryProducts,
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

    const options: InventoryQueryOptions = {
      category: (sp.get("category") as InventoryCategory | "ALL") || "ALL",
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
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 10,
    };

    const result = queryInventoryProducts(user, options);
    return Response.json({
      items: result.items,
      pagination: result.pagination,
      facets: result.facets,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof ValidationError) {
      return Response.json(
        { error: error.message, errors: error.errors },
        { status: error.statusCode },
      );
    }
    return Response.json(
      { error: "Failed to query inventory records." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = parseUserContextFromRequest(request);
    const payload = await request.json();
    const created = await createInventoryProduct(user, payload);
    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof ValidationError) {
      return Response.json(
        { error: error.message, errors: error.errors },
        { status: error.statusCode },
      );
    }
    return Response.json(
      { error: "Failed to create inventory record." },
      { status: 500 },
    );
  }
}
