import {
  getProductExpiryStatus,
  getProductStockStatus,
  type InventoryCategory,
  type InventoryProduct,
  type RequestUserContext,
} from "@/lib/inventory-types";

function escapeXml(str: string | number | boolean | undefined | null): string {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getCategorySpecificSummary(p: InventoryProduct): string {
  if (p.inventoryCategory === "Grocery" && p.kiranaFields) {
    return `Subcat: ${p.kiranaFields.grocerySubcategory} | Pack: ${p.kiranaFields.weightVolume} | Exp: ${
      p.kiranaFields.expiryDate || "N/A"
    } | Storage: ${p.kiranaFields.storageInformation}`;
  }
  if (p.inventoryCategory === "Pharmacy" && p.pharmacyFields) {
    const batchText = p.pharmacyFields.batches
      .map((b) => `${b.batchNumber} (Qty:${b.quantity}, Exp:${b.expiryDate})`)
      .join("; ");
    return `Generic: ${p.pharmacyFields.genericName} | Sched: ${p.pharmacyFields.scheduleClassification} | Rx: ${
      p.pharmacyFields.prescriptionRequired ? "Yes" : "No"
    } | Batches: [${batchText}]`;
  }
  if (p.inventoryCategory === "Mall" && p.mallFields) {
    return `Dept: ${p.mallFields.department} | Model: ${p.mallFields.productModel} | Variant: ${p.mallFields.productVariant} | Size: ${p.mallFields.size} | Colour: ${p.mallFields.colour}`;
  }
  return p.description || "-";
}

/**
 * Generates an Excel 2003+ XML Workbook (.xls) on the server with full styling,
 * summary header, and category-specific columns.
 */
export function generateExcelWorkbookXml(
  products: InventoryProduct[],
  user: RequestUserContext,
  meta: {
    categoryLabel: string;
    scopeLabel: string;
    searchQuery?: string;
  },
): string {
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const totalStock = products.reduce((sum, p) => sum + p.stockQuantity, 0);
  const totalPurchaseVal = products.reduce(
    (sum, p) => sum + p.stockQuantity * p.purchasePrice,
    0,
  );
  const totalRetailVal = products.reduce(
    (sum, p) => sum + p.stockQuantity * p.sellingPrice,
    0,
  );

  const rowsXml = products
    .map((p) => {
      const stockStatus = getProductStockStatus(p);
      const expInfo = getProductExpiryStatus(p);
      const stockPurchaseVal = Number((p.stockQuantity * p.purchasePrice).toFixed(2));
      const stockSellingVal = Number((p.stockQuantity * p.sellingPrice).toFixed(2));
      const catLabel =
        p.inventoryCategory === "Grocery"
          ? "Kirana / Grocery"
          : p.inventoryCategory === "Pharmacy"
            ? "Pharmacy"
            : "Mall / Supermarket";

      return `<Row>
        <Cell><Data ss:Type="String">${escapeXml(p.sku)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.barcode)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(catLabel)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.productName)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.brand)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.productCategory)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.supplier)}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.purchasePrice}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.sellingPrice}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.mrp}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.taxInformation)}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.stockQuantity}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.unitOfMeasurement)}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.minimumStockLevel}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.maximumStockLevel}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(stockStatus)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(expInfo.earliestExpiry)} (${escapeXml(expInfo.status)})</Data></Cell>
        <Cell><Data ss:Type="Number">${stockPurchaseVal}</Data></Cell>
        <Cell><Data ss:Type="Number">${stockSellingVal}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.status)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.storeLocation)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(getCategorySpecificSummary(p))}</Data></Cell>
      </Row>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10"/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#18212F"/>
  </Style>
  <Style ss:ID="Meta">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#555E6B"/>
  </Style>
  <Style ss:ID="Header">
   <Interior ss:Color="#18212F" ss:Pattern="Solid"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Inventory Report">
  <Table>
   <Row>
    <Cell ss:StyleID="Title"><Data ss:Type="String">VendorPurchase Inventory Management Report — ${escapeXml(meta.categoryLabel)}</Data></Cell>
   </Row>
   <Row>
    <Cell ss:StyleID="Meta"><Data ss:Type="String">Exported By: ${escapeXml(user.name)} (${escapeXml(user.email)}) | Scope: ${escapeXml(meta.scopeLabel)} | Generated: ${escapeXml(generatedAt)}</Data></Cell>
   </Row>
   <Row>
    <Cell ss:StyleID="Meta"><Data ss:Type="String">Total Records: ${products.length} | Total Stock Units: ${totalStock.toFixed(2)} | Purchase Valuation: INR ${Math.round(totalPurchaseVal).toLocaleString()} | Retail Valuation: INR ${Math.round(totalRetailVal).toLocaleString()}</Data></Cell>
   </Row>
   <Row></Row>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">SKU</Data></Cell>
    <Cell><Data ss:Type="String">Barcode</Data></Cell>
    <Cell><Data ss:Type="String">Inventory Category</Data></Cell>
    <Cell><Data ss:Type="String">Product Name</Data></Cell>
    <Cell><Data ss:Type="String">Brand</Data></Cell>
    <Cell><Data ss:Type="String">Category</Data></Cell>
    <Cell><Data ss:Type="String">Supplier</Data></Cell>
    <Cell><Data ss:Type="String">Purchase Price (INR)</Data></Cell>
    <Cell><Data ss:Type="String">Selling Price (INR)</Data></Cell>
    <Cell><Data ss:Type="String">MRP (INR)</Data></Cell>
    <Cell><Data ss:Type="String">Tax Info</Data></Cell>
    <Cell><Data ss:Type="String">Stock Qty</Data></Cell>
    <Cell><Data ss:Type="String">Unit</Data></Cell>
    <Cell><Data ss:Type="String">Min Stock</Data></Cell>
    <Cell><Data ss:Type="String">Max Stock</Data></Cell>
    <Cell><Data ss:Type="String">Stock Status</Data></Cell>
    <Cell><Data ss:Type="String">Expiry Status</Data></Cell>
    <Cell><Data ss:Type="String">Purchase Value (INR)</Data></Cell>
    <Cell><Data ss:Type="String">Selling Value (INR)</Data></Cell>
    <Cell><Data ss:Type="String">Status</Data></Cell>
    <Cell><Data ss:Type="String">Location</Data></Cell>
    <Cell><Data ss:Type="String">Category-Specific Attributes &amp; Batches</Data></Cell>
   </Row>
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

function escapePdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Pure server-side PDF 1.4 document generator.
 * Produces a valid multi-page binary PDF report with title, metadata, summary metrics,
 * and tabular inventory rows respecting user permissions and filters.
 */
export function generateServerPdfBuffer(
  products: InventoryProduct[],
  user: RequestUserContext,
  meta: {
    categoryLabel: string;
    scopeLabel: string;
    reportTitle?: string;
  },
): Buffer {
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const totalPurchaseVal = Math.round(
    products.reduce((s, p) => s + p.stockQuantity * p.purchasePrice, 0),
  );
  const totalRetailVal = Math.round(
    products.reduce((s, p) => s + p.stockQuantity * p.sellingPrice, 0),
  );

  const linesPerPage = 24;
  const chunks: InventoryProduct[][] = [];
  for (let i = 0; i < products.length; i += linesPerPage) {
    chunks.push(products.slice(i, i + linesPerPage));
  }
  if (chunks.length === 0) {
    chunks.push([]);
  }

  const pageStreams: string[] = chunks.map((pageItems, pageIdx) => {
    const cmds: string[] = [];
    // Header Banner
    cmds.push("0.09 0.13 0.18 rg");
    cmds.push("36 535 770 42 re f");
    cmds.push("1 1 1 RG 1 1 1 rg");
    cmds.push("BT /F2 13 Tf 48 558 Td (" + escapePdfText(meta.reportTitle || `VENDORPURCHASE INVENTORY REPORT - ${meta.categoryLabel.toUpperCase()}`) + ") Tj ET");
    cmds.push(
      "BT /F1 8 Tf 48 544 Td (" +
        escapePdfText(
          `Generated: ${generatedAt} | Authorized User: ${user.name} (${user.email}) | Scope: ${meta.scopeLabel} | Page ${pageIdx + 1} of ${chunks.length}`,
        ) +
        ") Tj ET",
    );

    // Summary Strip
    cmds.push("0.96 0.97 0.98 rg");
    cmds.push("36 504 770 24 re f");
    cmds.push("0.15 0.18 0.22 rg");
    cmds.push(
      "BT /F2 9 Tf 48 513 Td (" +
        escapePdfText(
          `Total Records: ${products.length}   |   Purchase Value: INR ${totalPurchaseVal.toLocaleString()}   |   Retail Value: INR ${totalRetailVal.toLocaleString()}   |   Permitted Verticals: ${user.allowedVerticals.join(", ")}`,
        ) +
        ") Tj ET",
    );

    // Table Header
    cmds.push("0.90 0.18 0.17 rg");
    cmds.push("36 480 770 18 re f");
    cmds.push("1 1 1 rg");
    const headerLine =
      "SKU          CATEGORY    PRODUCT NAME                       BRAND             STOCK          COST(INR)   SELL(INR)   STATUS     SPEC / BATCH / EXPIRY";
    cmds.push(`BT /F2 7.5 Tf 42 486 Td (${escapePdfText(headerLine)}) Tj ET`);

    // Table Rows
    let y = 466;
    if (pageItems.length === 0) {
      cmds.push("0.3 0.3 0.3 rg");
      cmds.push("BT /F1 9 Tf 42 450 Td (No inventory records match the selected filter criteria.) Tj ET");
    } else {
      pageItems.forEach((p, idx) => {
        if (idx % 2 === 1) {
          cmds.push("0.97 0.98 0.99 rg");
          cmds.push(`36 ${y - 4} 770 16 re f`);
        }
        cmds.push("0.12 0.15 0.20 rg");
        const catShort =
          p.inventoryCategory === "Grocery"
            ? "Kirana"
            : p.inventoryCategory === "Pharmacy"
              ? "Pharmacy"
              : "Mall";
        const stockStr = `${p.stockQuantity} ${p.unitOfMeasurement}`.slice(0, 13);
        const specShort = getCategorySpecificSummary(p).slice(0, 38);

        const rowStr = [
          p.sku.padEnd(12, " ").slice(0, 12),
          catShort.padEnd(11, " ").slice(0, 11),
          p.productName.padEnd(34, " ").slice(0, 34),
          p.brand.padEnd(17, " ").slice(0, 17),
          stockStr.padEnd(14, " ").slice(0, 14),
          String(p.purchasePrice.toFixed(1)).padEnd(11, " ").slice(0, 11),
          String(p.sellingPrice.toFixed(1)).padEnd(11, " ").slice(0, 11),
          p.status.padEnd(10, " ").slice(0, 10),
          specShort,
        ].join(" ");

        cmds.push(`BT /F1 7.2 Tf 42 ${y} Td (${escapePdfText(rowStr)}) Tj ET`);
        y -= 17;
      });
    }

    // Footer
    cmds.push("0.55 0.58 0.62 rg");
    cmds.push(
      `BT /F1 7.5 Tf 36 22 Td (${escapePdfText(
        "Confidential Inventory Record - Physical deletion disabled - Audited under VendorPurchase RBAC Governance",
      )}) Tj ET`,
    );

    return cmds.join("\n");
  });

  // Assemble PDF objects
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: Font F1 (Courier), Obj 4: Font F2 (Courier-Bold)
  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");

  const pageObjNums: number[] = [];
  const firstPageObjNum = 5;
  for (let i = 0; i < pageStreams.length; i++) {
    pageObjNums.push(firstPageObjNum + i * 2);
  }

  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${
      pageStreams.length
    } >>\nendobj`,
  );
  objects.push(
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj",
  );
  objects.push(
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj",
  );

  for (let i = 0; i < pageStreams.length; i++) {
    const pageObjNum = firstPageObjNum + i * 2;
    const contentObjNum = pageObjNum + 1;
    const stream = pageStreams[i];
    const streamByteLen = Buffer.byteLength(stream, "utf-8");

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj`,
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamByteLen} >>\nstream\n${stream}\nendstream\nendobj`,
    );
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += obj + "\n";
  }

  const xrefStart = Buffer.byteLength(pdf, "utf-8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf-8");
}

export function getExportFilename(
  category: InventoryCategory | "ALL",
  format: "excel" | "pdf",
  scope: "filtered" | "all",
): string {
  const catSlug =
    category === "Grocery"
      ? "kirana"
      : category === "Pharmacy"
        ? "pharmacy"
        : category === "Mall"
          ? "mall"
          : "all-categories";
  const dateSlug = new Date().toISOString().slice(0, 10);
  const ext = format === "excel" ? "xls" : "pdf";
  return `inventory-${catSlug}-${scope}-${dateSlug}.${ext}`;
}
