export type VendorVertical = "Grocery" | "Pharmacy" | "Mall";

export const VENDOR_VERTICAL_CONFIG: Record<
  VendorVertical,
  {
    badge: string;
    skuPrefix: string;
    categories: string[];
    unitTypes: string[];
    bulkPlaceholder: string;
    locationPlaceholder: string;
    attributeLabel: string;
    attributePlaceholder: string;
    defaultSupplier: string;
    defaultSupplierPhone: string;
  }
> = {
  Grocery: {
    badge: "Kirana & Super-Grocery",
    skuPrefix: "KRN",
    categories: ["Staples", "Pulses", "Spices", "Packaged FMCG", "Bakery & Dairy"],
    unitTypes: ["kg", "grams", "Pack", "Tin (1L)", "Litre", "Pouch"],
    bulkPlaceholder: "e.g. 50 kg Sack (×2) or 24 Pack Carton",
    locationPlaceholder: "e.g. Aisle 1 · Bin S-02",
    attributeLabel: "Grade / FSSAI / Loose Split Note",
    attributePlaceholder: "e.g. Sortex Cleaned · Loose Split Enabled",
    defaultSupplier: "Shree Ganesh Trading Co.",
    defaultSupplierPhone: "+91 98201 44120",
  },
  Pharmacy: {
    badge: "Pharmacy & Chemist",
    skuPrefix: "PHM",
    categories: [
      "Antibiotics (Sched H)",
      "Chronic Care / Cardiac",
      "Derma & OTC",
      "Syrups & Vials",
      "Surgical & Devices",
    ],
    unitTypes: ["Strip (10 Tabs)", "Strip (15 Tabs)", "Bottle (100ml)", "Vial / Ampoule", "Tube (30g)"],
    bulkPlaceholder: "e.g. 10×10 Blister Box or Cold-Chain Pack",
    locationPlaceholder: "e.g. Med Drawer M-14 or Cold Rack R-2",
    attributeLabel: "Salt Composition & Drug Schedule",
    attributePlaceholder: "e.g. Paracetamol 650mg · Schedule OTC",
    defaultSupplier: "Apex Medico Pharma Hub",
    defaultSupplierPhone: "+91 98100 66234",
  },
  Mall: {
    badge: "Department Store & Mall",
    skuPrefix: "MLL",
    categories: [
      "Apparel & Lifestyle",
      "Home Appliances",
      "Footwear & Accessories",
      "Cosmetics & Fragrance",
      "Electronics",
    ],
    unitTypes: ["Piece (Garment)", "Unit (Boxed)", "Pair", "Set"],
    bulkPlaceholder: "e.g. Assorted Ratio Bale (12 pcs) or 4 Unit Carton",
    locationPlaceholder: "e.g. Floor 2 · Zone B · Rack 09",
    attributeLabel: "Size / Color / Warranty / RFID Tag",
    attributePlaceholder: "e.g. Size XL · Navy Blue · 1-Yr Warranty",
    defaultSupplier: "VogueLine Retail Apparels",
    defaultSupplierPhone: "+91 98711 90812",
  },
};

export type LooseInventoryItem = {
  id: string;
  sku: string;
  name: string;
  vendorType: VendorVertical;
  category: string;
  isLoose: boolean;
  unitType: string; // e.g. "kg", "Strip (15 Tabs)", "Piece / Apparel", "Pack"
  bulkUnitLabel: string; // e.g. "50 kg Sack", "10×15 Blister Box", "Hanger Lot (12 pcs)"
  storageLocation: string; // e.g. "Bin A-01", "Cold Rack R-4", "Floor 2 · Zone C"
  attributeNote: string; // e.g. "Paracetamol 650mg · Sched OTC", "Size L · Cotton", "FSSAI Loose Staple"
  stockKg: number;
  reorderLevelKg: number;
  costPerKg: number;
  prevCostPerKg: number;
  mrpPerKg: number;
  retailPricePerKg: number;
  gstSlab: 0 | 5 | 12 | 18;
  batchNo: string;
  expiryDate: string;
  daysInStock: number;
  daysUnused: number; // Days since last sale/dispense/usage
  lastUsedDate: string;
  vendorNotifiedAt?: string;
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
};

export type OcrInvoiceLine = {
  id: string;
  itemName: string;
  batchNo: string;
  expiryDate: string;
  qtyKg: number;
  prevCostPerKg: number;
  billedCostPerKg: number;
  mrpPerKg: number;
  gstSlab: 0 | 5 | 12 | 18;
};

export type StaffAuditEntry = {
  id: string;
  timestamp: string;
  staffId: string;
  staffName: string;
  eventType: "VOID_BILL" | "PRICE_OVERRIDE" | "NO_SALE_DRAWER" | "MANUAL_DISCOUNT";
  details: string;
  amountImpact: number;
  riskLevel: "high" | "medium" | "low";
};

export type DeadStockCombo = {
  id: string;
  title: string;
  slowItemName: string;
  slowItemDays: number;
  fastStapleName: string;
  regularPrice: number;
  comboPrice: number;
  active: boolean;
  redemptionsToday: number;
};

export type SupplierQuote = {
  supplierId: string;
  supplierName: string;
  phone: string;
  outstandingPayable: number;
  rtvDeduction: number;
  items: {
    itemName: string;
    reorderQty: string;
    last3Costs: [number, number, number];
    bestRate: boolean;
  }[];
};

export type RtvEntry = {
  id: string;
  itemName: string;
  supplierName: string;
  reason: "Expired" | "Damaged Pack" | "Rodent/Pest Damage" | "Quality Issue";
  qtyLabel: string;
  deductionAmount: number;
  loggedAt: string;
  settled: boolean;
};

export type KhataCustomer = {
  id: string;
  name: string;
  phone: string;
  creditUsed: number;
  creditLimit: number;
  dueDate: string;
  cashbackBalance: number;
  lastReminderSent?: string;
  refillCycleItem: string;
  refillCycleDays: number;
  daysSinceLastBuy: number;
};

export type WhatsAppOrder = {
  id: string;
  customerName: string;
  phone: string;
  sourceType: "PHOTO_LIST" | "VOICE_NOTE";
  rawTranscript: string;
  receivedAt: string;
  status: "PARSED" | "PICKING" | "PAYMENT_SENT" | "COMPLETED";
  parsedItems: {
    name: string;
    requestedQty: string;
    matchedSku: string;
    price: number;
    inStock: boolean;
  }[];
};

export const INITIAL_INVENTORY: LooseInventoryItem[] = [
  {
    id: "inv-1",
    sku: "KRN-3011",
    name: "M-30 Refined Sugar (Loose)",
    vendorType: "Grocery",
    category: "Staples",
    isLoose: true,
    unitType: "kg",
    bulkUnitLabel: "50 kg Sack (×3)",
    storageLocation: "Aisle 1 · Bin S-01",
    attributeNote: "FSSAI Loose Grade M-30",
    stockKg: 142.5,
    reorderLevelKg: 50,
    costPerKg: 41.5,
    prevCostPerKg: 38.0,
    mrpPerKg: 45.0,
    retailPricePerKg: 44.0,
    gstSlab: 5,
    batchNo: "B-2610-SG",
    expiryDate: "2027-08-15",
    daysInStock: 9,
    daysUnused: 1,
    lastUsedDate: "Today, 03:40 PM",
    supplierId: "sup-1",
    supplierName: "Shree Ganesh Trading Co.",
    supplierPhone: "+91 98201 44120",
  },
  {
    id: "inv-2",
    sku: "KRN-3018",
    name: "MP Sharbati Chakki Atta (Loose)",
    vendorType: "Grocery",
    category: "Staples",
    isLoose: true,
    unitType: "kg",
    bulkUnitLabel: "50 kg Sack (×4)",
    storageLocation: "Aisle 1 · Bin A-04",
    attributeNote: "100% Whole Wheat Loose",
    stockKg: 185.0,
    reorderLevelKg: 60,
    costPerKg: 34.0,
    prevCostPerKg: 33.5,
    mrpPerKg: 42.0,
    retailPricePerKg: 40.0,
    gstSlab: 0,
    batchNo: "B-2611-AT",
    expiryDate: "2027-02-10",
    daysInStock: 6,
    daysUnused: 0,
    lastUsedDate: "Today, 04:55 PM",
    supplierId: "sup-1",
    supplierName: "Shree Ganesh Trading Co.",
    supplierPhone: "+91 98201 44120",
  },
  {
    id: "inv-3",
    sku: "KRN-3042",
    name: "Unpolished Toor Dal (Arhar)",
    vendorType: "Grocery",
    category: "Pulses",
    isLoose: true,
    unitType: "kg",
    bulkUnitLabel: "25 kg Sack (×2)",
    storageLocation: "Aisle 2 · Bin D-02",
    attributeNote: "Sortex Cleaned Unpolished",
    stockKg: 18.4,
    reorderLevelKg: 25,
    costPerKg: 148.0,
    prevCostPerKg: 132.0,
    mrpPerKg: 160.0,
    retailPricePerKg: 158.0,
    gstSlab: 5,
    batchNo: "B-2609-TD",
    expiryDate: "2027-04-30",
    daysInStock: 21,
    daysUnused: 2,
    lastUsedDate: "2 days ago",
    supplierId: "sup-2",
    supplierName: "Mahalaxmi Agro Pulses",
    supplierPhone: "+91 98114 77890",
  },
  {
    id: "inv-4",
    sku: "KRN-3099",
    name: "Guntur Stemless Red Chilli Powder",
    vendorType: "Grocery",
    category: "Spices",
    isLoose: true,
    unitType: "kg",
    bulkUnitLabel: "25 kg Sack (×1)",
    storageLocation: "Spice Rack · SR-03",
    attributeNote: "SHU 35,000 Pure Ground",
    stockKg: 8.2,
    reorderLevelKg: 10,
    costPerKg: 290.0,
    prevCostPerKg: 260.0,
    mrpPerKg: 320.0,
    retailPricePerKg: 315.0,
    gstSlab: 5,
    batchNo: "B-2608-RC",
    expiryDate: "2027-01-20",
    daysInStock: 42,
    daysUnused: 11,
    lastUsedDate: "11 days ago",
    supplierId: "sup-2",
    supplierName: "Mahalaxmi Agro Pulses",
    supplierPhone: "+91 98114 77890",
  },
  {
    id: "inv-5",
    sku: "KRN-4104",
    name: "Butter-Bake Jeera Cookies 400g",
    vendorType: "Grocery",
    category: "Bakery",
    isLoose: false,
    unitType: "Pack",
    bulkUnitLabel: "24 Pack Carton",
    storageLocation: "Gondola B-2",
    attributeNote: "400g Family Box",
    stockKg: 19,
    reorderLevelKg: 8,
    costPerKg: 68.0,
    prevCostPerKg: 68.0,
    mrpPerKg: 95.0,
    retailPricePerKg: 90.0,
    gstSlab: 18,
    batchNo: "B-2605-CK",
    expiryDate: "2026-12-08",
    daysInStock: 78,
    daysUnused: 34,
    lastUsedDate: "34 days ago",
    supplierId: "sup-3",
    supplierName: "Metro FMCG Distributors",
    supplierPhone: "+91 98220 11904",
  },
  {
    id: "inv-6",
    sku: "KRN-4209",
    name: "Premium Olive Pomace Oil 1L Tin",
    vendorType: "Grocery",
    category: "Packaged",
    isLoose: false,
    unitType: "Tin (1L)",
    bulkUnitLabel: "12 Tin Case",
    storageLocation: "Aisle 4 · Shelf T-1",
    attributeNote: "Imported Mediterranean Tin",
    stockKg: 11,
    reorderLevelKg: 4,
    costPerKg: 540.0,
    prevCostPerKg: 495.0,
    mrpPerKg: 590.0,
    retailPricePerKg: 585.0,
    gstSlab: 12,
    batchNo: "B-2604-OL",
    expiryDate: "2026-12-19",
    daysInStock: 94,
    daysUnused: 41,
    lastUsedDate: "41 days ago",
    supplierId: "sup-3",
    supplierName: "Metro FMCG Distributors",
    supplierPhone: "+91 98220 11904",
  },
  {
    id: "inv-7",
    sku: "PHM-7021",
    name: "AmoxiClav 625mg Tablet Strip",
    vendorType: "Pharmacy",
    category: "Antibiotics (Sched H)",
    isLoose: false,
    unitType: "Strip (10 Tabs)",
    bulkUnitLabel: "10×10 Blister Box",
    storageLocation: "Med Drawer M-14",
    attributeNote: "Amoxicillin + Clavulanate · Rx Mandatory",
    stockKg: 42,
    reorderLevelKg: 15,
    costPerKg: 142.0,
    prevCostPerKg: 138.0,
    mrpPerKg: 204.0,
    retailPricePerKg: 192.0,
    gstSlab: 12,
    batchNo: "PH-9921-AC",
    expiryDate: "2027-03-31",
    daysInStock: 49,
    daysUnused: 14,
    lastUsedDate: "14 days ago",
    supplierId: "sup-4",
    supplierName: "Apex Medico Pharma Hub",
    supplierPhone: "+91 98100 66234",
  },
  {
    id: "inv-8",
    sku: "PHM-7088",
    name: "DermaGlow Vitamin-C Serum 30ml",
    vendorType: "Pharmacy",
    category: "Derma & OTC",
    isLoose: false,
    unitType: "Dropper Bottle",
    bulkUnitLabel: "12 Unit Master Pack",
    storageLocation: "Cosmetic Glass Bay C-2",
    attributeNote: "L-Ascorbic 15% · Cold Chain Shelf",
    stockKg: 5,
    reorderLevelKg: 5,
    costPerKg: 390.0,
    prevCostPerKg: 390.0,
    mrpPerKg: 650.0,
    retailPricePerKg: 599.0,
    gstSlab: 18,
    batchNo: "PH-8104-VC",
    expiryDate: "2027-01-15",
    daysInStock: 82,
    daysUnused: 37,
    lastUsedDate: "37 days ago",
    supplierId: "sup-4",
    supplierName: "Apex Medico Pharma Hub",
    supplierPhone: "+91 98100 66234",
  },
  {
    id: "inv-9",
    sku: "MLL-9015",
    name: "UrbanWeave Linen Casual Shirt (L)",
    vendorType: "Mall",
    category: "Apparel & Lifestyle",
    isLoose: false,
    unitType: "Piece (Garment)",
    bulkUnitLabel: "Assorted Ratio Bale (12 pcs)",
    storageLocation: "Floor 1 · Bay B-09",
    attributeNote: "Size L · Olive Green · RFID Tagged",
    stockKg: 14,
    reorderLevelKg: 4,
    costPerKg: 680.0,
    prevCostPerKg: 680.0,
    mrpPerKg: 1499.0,
    retailPricePerKg: 1299.0,
    gstSlab: 12,
    batchNo: "LOT-AW26-09",
    expiryDate: "2028-12-31",
    daysInStock: 65,
    daysUnused: 9,
    lastUsedDate: "9 days ago",
    supplierId: "sup-5",
    supplierName: "VogueLine Retail Apparels",
    supplierPhone: "+91 98711 90812",
  },
  {
    id: "inv-10",
    sku: "MLL-9044",
    name: "AeroChef 1800W Induction Cooktop",
    vendorType: "Mall",
    category: "Home Appliances",
    isLoose: false,
    unitType: "Unit (Boxed)",
    bulkUnitLabel: "4 Unit Master Carton",
    storageLocation: "Floor 2 · Electronics Zone E-3",
    attributeNote: "1-Year Warranty · Serial Tracked",
    stockKg: 2,
    reorderLevelKg: 4,
    costPerKg: 1950.0,
    prevCostPerKg: 1850.0,
    mrpPerKg: 3490.0,
    retailPricePerKg: 2890.0,
    gstSlab: 18,
    batchNo: "SN-IND-2604",
    expiryDate: "2029-06-30",
    daysInStock: 88,
    daysUnused: 46,
    lastUsedDate: "46 days ago",
    supplierId: "sup-5",
    supplierName: "VogueLine Retail Apparels",
    supplierPhone: "+91 98711 90812",
  },
];

export const INITIAL_OCR_INVOICE: OcrInvoiceLine[] = [
  {
    id: "ocr-1",
    itemName: "M-30 Refined Sugar (50 kg Sack × 2)",
    batchNo: "B-2611-S9",
    expiryDate: "2027-10-01",
    qtyKg: 100,
    prevCostPerKg: 38.0,
    billedCostPerKg: 41.5,
    mrpPerKg: 45.0,
    gstSlab: 5,
  },
  {
    id: "ocr-2",
    itemName: "Unpolished Toor Dal (25 kg Sack × 2)",
    batchNo: "B-2611-T4",
    expiryDate: "2027-06-15",
    qtyKg: 50,
    prevCostPerKg: 132.0,
    billedCostPerKg: 148.0,
    mrpPerKg: 160.0,
    gstSlab: 5,
  },
  {
    id: "ocr-3",
    itemName: "Kolam Steam Rice (50 kg Sack × 3)",
    batchNo: "B-2611-KR",
    expiryDate: "2027-11-20",
    qtyKg: 150,
    prevCostPerKg: 52.0,
    billedCostPerKg: 52.5,
    mrpPerKg: 64.0,
    gstSlab: 5,
  },
];

export const INITIAL_AUDIT_LOGS: StaffAuditEntry[] = [
  {
    id: "aud-1",
    timestamp: "Today, 04:12 PM",
    staffId: "STF-02",
    staffName: "Ramesh K. (Counter 1)",
    eventType: "NO_SALE_DRAWER",
    details: "Cash drawer opened without active bill print (Change request)",
    amountImpact: 0,
    riskLevel: "medium",
  },
  {
    id: "aud-2",
    timestamp: "Today, 02:48 PM",
    staffId: "STF-03",
    staffName: "Suresh P. (Counter 2)",
    eventType: "VOID_BILL",
    details: "Cancelled Bill #INV-8841 after cash tender (3 items: Edible Oil, Dal)",
    amountImpact: 645,
    riskLevel: "high",
  },
  {
    id: "aud-3",
    timestamp: "Today, 11:30 AM",
    staffId: "STF-02",
    staffName: "Ramesh K. (Counter 1)",
    eventType: "PRICE_OVERRIDE",
    details: "Manual rate override on Loose Cashew W320 (₹820/kg → ₹740/kg)",
    amountImpact: 80,
    riskLevel: "high",
  },
];

export const INITIAL_COMBOS: DeadStockCombo[] = [
  {
    id: "cmb-1",
    title: "Chai-Time Family Saver Bundle",
    slowItemName: "Butter-Bake Jeera Cookies 400g (78d old)",
    slowItemDays: 78,
    fastStapleName: "MP Sharbati Chakki Atta 5 kg Pouch",
    regularPrice: 290,
    comboPrice: 259,
    active: true,
    redemptionsToday: 7,
  },
  {
    id: "cmb-2",
    title: "Festive Kitchen Upgrade Pack",
    slowItemName: "Premium Olive Pomace Oil 1L Tin (94d old)",
    slowItemDays: 94,
    fastStapleName: "Unpolished Toor Dal 2 kg Pouch",
    regularPrice: 901,
    comboPrice: 825,
    active: true,
    redemptionsToday: 4,
  },
];

export const INITIAL_SUPPLIERS: SupplierQuote[] = [
  {
    supplierId: "sup-1",
    supplierName: "Shree Ganesh Trading Co.",
    phone: "+91 98201 44120",
    outstandingPayable: 42800,
    rtvDeduction: 1420,
    items: [
      {
        itemName: "M-30 Refined Sugar (50 kg Sack)",
        reorderQty: "3 Sacks (150 kg)",
        last3Costs: [1920, 1980, 2075],
        bestRate: true,
      },
      {
        itemName: "MP Sharbati Atta (50 kg Sack)",
        reorderQty: "4 Sacks (200 kg)",
        last3Costs: [1675, 1690, 1700],
        bestRate: true,
      },
    ],
  },
  {
    supplierId: "sup-2",
    supplierName: "Mahalaxmi Agro Pulses",
    phone: "+91 98114 77890",
    outstandingPayable: 28500,
    rtvDeduction: 890,
    items: [
      {
        itemName: "Unpolished Toor Dal (25 kg Sack)",
        reorderQty: "3 Sacks (75 kg)",
        last3Costs: [3300, 3450, 3700],
        bestRate: true,
      },
      {
        itemName: "Guntur Red Chilli Powder (25 kg Sack)",
        reorderQty: "1 Sack (25 kg)",
        last3Costs: [6400, 6500, 7250],
        bestRate: false,
      },
    ],
  },
];

export const INITIAL_RTV_ITEMS: RtvEntry[] = [
  {
    id: "rtv-1",
    itemName: "Classic Marie Family Pack (×14 units)",
    supplierName: "Shree Ganesh Trading Co.",
    reason: "Rodent/Pest Damage",
    qtyLabel: "14 Packs",
    deductionAmount: 560,
    loggedAt: "Yesterday",
    settled: false,
  },
  {
    id: "rtv-2",
    itemName: "Full Cream Paneer 200g (Batch #P92)",
    supplierName: "Shree Ganesh Trading Co.",
    reason: "Expired",
    qtyLabel: "10 Packs",
    deductionAmount: 860,
    loggedAt: "2 days ago",
    settled: false,
  },
  {
    id: "rtv-3",
    itemName: "Moong Mogra Dal 5 kg Pouch",
    supplierName: "Mahalaxmi Agro Pulses",
    reason: "Damaged Pack",
    qtyLabel: "1.5 pouches (7.5 kg)",
    deductionAmount: 890,
    loggedAt: "Today, 09:15 AM",
    settled: false,
  },
];

export const INITIAL_KHATA_CUSTOMERS: KhataCustomer[] = [
  {
    id: "kh-1",
    name: "Mrs. Sunita Sharma (B-402 Green Park)",
    phone: "+91 98765 12001",
    creditUsed: 4650,
    creditLimit: 5000,
    dueDate: "18 Nov 2026",
    cashbackBalance: 142,
    refillCycleItem: "Kolam Steam Rice 10 kg + A2 Ghee 1L",
    refillCycleDays: 30,
    daysSinceLastBuy: 27,
  },
  {
    id: "kh-2",
    name: "Rajesh Verma (Flat 12, Shanti Niketan)",
    phone: "+91 98230 55410",
    creditUsed: 2180,
    creditLimit: 6000,
    dueDate: "25 Nov 2026",
    cashbackBalance: 88,
    refillCycleItem: "Baby Diapers L-Size (64 pcs) + Atta 10 kg",
    refillCycleDays: 30,
    daysSinceLastBuy: 28,
  },
  {
    id: "kh-3",
    name: "Anand Tiffin & Catering Services",
    phone: "+91 99102 33491",
    creditUsed: 11800,
    creditLimit: 12000,
    dueDate: "17 Nov 2026",
    cashbackBalance: 410,
    refillCycleItem: "Refined Sunflower Oil 15L Tin + Toor Dal 25 kg",
    refillCycleDays: 15,
    daysSinceLastBuy: 14,
  },
];

export const INITIAL_WHATSAPP_ORDERS: WhatsAppOrder[] = [
  {
    id: "wa-101",
    customerName: "Mrs. Kavita Joshi (A-104)",
    phone: "+91 98119 20934",
    sourceType: "PHOTO_LIST",
    rawTranscript:
      "Handwritten slip photo: '1) Chakki Atta 5kg, 2) Sugar ₹50 ka, 3) Toor Dal 1.5 kg, 4) Jeera Cookies 1 pkt'",
    receivedAt: "6 mins ago",
    status: "PARSED",
    parsedItems: [
      { name: "MP Sharbati Chakki Atta", requestedQty: "5.000 kg", matchedSku: "KRN-3018", price: 200, inStock: true },
      { name: "M-30 Refined Sugar (₹50 worth)", requestedQty: "1.136 kg", matchedSku: "KRN-3011", price: 50, inStock: true },
      { name: "Unpolished Toor Dal", requestedQty: "1.500 kg", matchedSku: "KRN-3042", price: 237, inStock: true },
      { name: "Butter-Bake Jeera Cookies 400g", requestedQty: "1 Pack", matchedSku: "KRN-4104", price: 59, inStock: true },
    ],
  },
  {
    id: "wa-102",
    customerName: "Vikram Malhotra (C-801)",
    phone: "+91 98991 00412",
    sourceType: "VOICE_NOTE",
    rawTranscript:
      "Hindi Voice Note (0:18s): 'Bhaiya do kilo arhar dal, sau rupaye ki laal mirch powder, aur paanch kilo aata bhej dena'",
    receivedAt: "19 mins ago",
    status: "PICKING",
    parsedItems: [
      { name: "Unpolished Toor Dal (Arhar)", requestedQty: "2.000 kg", matchedSku: "KRN-3042", price: 316, inStock: true },
      { name: "Guntur Red Chilli Powder (₹100 worth)", requestedQty: "0.317 kg", matchedSku: "KRN-3099", price: 100, inStock: true },
      { name: "MP Sharbati Chakki Atta", requestedQty: "5.000 kg", matchedSku: "KRN-3018", price: 200, inStock: true },
    ],
  },
];
