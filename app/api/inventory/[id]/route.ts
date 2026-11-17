import type { NextRequest } from "next/server";
import {
  AuthorizationError,
  ValidationError,
  loadDatabase,
  parseUserContextFromRequest,
  requirePermission,
  updateInventoryProduct,
} from "@/lib/inventory-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = parseUserContextFromRequest(request);
    const { id } = await params;

    const db = loadDatabase();
    const product = db.products.find((p) => p.id === id);
    if (!product) {
      return Response.json({ error: "Inventory record not found." }, { status: 404 });
    }

    requirePermission(user, "viewInventory", product.inventoryCategory, product.storeLocation);

    const transactions = db.transactions.filter((t) => t.productId === id);
    const auditLogs = db.auditLogs.filter((a) => a.recordId === id);

    return Response.json({
      product,
      transactions,
      auditLogs,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    return Response.json(
      { error: "Failed to load inventory details." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = parseUserContextFromRequest(request);
    const { id } = await params;
    const updates = await request.json();

    const updated = await updateInventoryProduct(user, id, updates);
    return Response.json(updated);
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
      { error: "Failed to update inventory record." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  // Business Rule 4: Inventory records must never be physically deleted.
  return Response.json(
    {
      error:
        "Physical deletion of inventory records is strictly prohibited by governance rules. Use Active/Inactive status instead.",
    },
    { status: 405 },
  );
}
