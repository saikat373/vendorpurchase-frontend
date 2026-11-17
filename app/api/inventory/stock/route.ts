import type { NextRequest } from "next/server";
import {
  AuthorizationError,
  ValidationError,
  executeStockOperation,
  parseUserContextFromRequest,
  queryStockTransactions,
  type StockOperationPayload,
} from "@/lib/inventory-service";
import type { InventoryCategory, StockTransactionType } from "@/lib/inventory-types";

export async function GET(request: NextRequest) {
  try {
    const user = parseUserContextFromRequest(request);
    const sp = request.nextUrl.searchParams;

    const result = queryStockTransactions(user, {
      category: (sp.get("category") as InventoryCategory | "ALL") || "ALL",
      productId: sp.get("productId") || undefined,
      transactionType:
        (sp.get("transactionType") as StockTransactionType | "ALL") || "ALL",
      search: sp.get("search") || "",
      dateFrom: sp.get("dateFrom") || "",
      dateTo: sp.get("dateTo") || "",
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 10,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    return Response.json(
      { error: "Failed to fetch stock transaction history." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = parseUserContextFromRequest(request);
    const payload = (await request.json()) as StockOperationPayload;
    const result = await executeStockOperation(user, payload);
    return Response.json(result, { status: 201 });
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
      { error: "Failed to execute stock modification." },
      { status: 500 },
    );
  }
}
