# Project history and handoff

Last updated: 2026-11-16

## Project

VendorPurchase is a Next.js App Router admin prototype. The original task requirements are in `requirement.txt`. The requested experience includes admin login and signup, approval for new accounts, login captcha, no OAuth, and a polished responsive interface.

## Work completed

1. Replaced the default Next.js starter screen with a VendorPurchase admin prototype.
2. Added login and signup flows, a math captcha on login, pending signup requests, an approval queue, and a dashboard.
3. Split the app into routes:
   - `/` redirects to `/login`.
   - `/login` and `/signup` render the shared `AuthPage` component in `components/auth-page.tsx`.
   - `/dashboard` renders `DashboardPage` from `components/dashboard-page.tsx`; the client session check redirects unauthenticated or unapproved users to `/login`.
4. Refined the login design using the attached reference:
   - Desktop: compact split panel with the form and product/security message.
   - Tablet and phone: centered form card with the promo panel hidden.
   - Added `public/auth-background.svg` as a local page background.
   - Kept the login viewport free of document scrolling, including small phone sizes.
5. Matched signup to the login card, background, and form styling; hid the promo panel on smaller screens while allowing natural scroll for the longer form when required.
6. Added a login/signup card entrance animation and the local demo credentials `demo@vendor.test` / `VendorDemo26!`. The approved demo account is created on first successful demo login.
7. Clear login form values after successful authentication so credentials are not retained on the cached login route.
8. Enhanced the `/signup` onboarding experience:
   - Added a compact 2-column `Company` + `Role` selector (`Procurement Lead`, `Finance Reviewer`, `Vendor Manager`, `Operations Admin`, `Compliance Officer`) that flows into the dashboard approval queue.
   - Added accessible show/hide password toggles on both `Password` and `Confirm password` fields.
   - Added a live 4-bar password strength meter (`Weak` / `Fair` / `Good` / `Strong`) with real-time requirement indicators (`8+ chars`, `Upper & lower`, `Number`, `Symbol`) and a live password match badge.
   - Added a post-submission **Approval Status confirmation view** with a 3-step onboarding progress timeline, live `"Check status"` lookup against local storage, and a quick reset to submit another request.
   - Tailored the right-hand promo panel on `/signup` with onboarding governance messaging.
9. Expanded `/dashboard` (`components/dashboard-page.tsx` and `lib/kirana-data.ts`) into a full **Local Grocery (Kirana) Store Operations, Inventory, Billing & Profit-Protection Suite**:
   - **Store-Floor & Loose-Item Operations**: Bulk-to-retail loose weight billing (sell by Rupee value e.g. `₹50 worth of sugar` or weight in g/kg with digital scale readout), custom in-house pouch barcode & MRP shelf-label generator, and AI OCR wholesaler invoice scanner.
   - **Profit Protection & Anti-Theft Controls**: Margin & cost-price drift alerts (`<10%` threshold) with 1-click retail re-pricing, cash drawer & void/override staff audit logs with EOD Cash + UPI variance summary, and dead-stock clearance combo builder.
   - **Supplier & Credit (Udhaar) Management**: Supplier-grouped auto-PO with last-3-orders landing cost comparison and 1-tap WhatsApp dispatch, Digital Khata household credit limits with automated UPI reminders, and Supplier Return & Breakage (RTV) tracker auto-deducted from vendor payouts.
   - **Customer Retention & Hyperlocal Growth**: WhatsApp handwritten photo slip & Hindi voice-note order parser, Day-27 household staple refill reminders, and phone-number 1% store cashback wallet.
   - **Compliance & Owner Visibility**: One-click GST slab summary (`0%`, `5%`, `12%`, `18%` GSTR-1 / GSTR-3B export) and Owner's Mobile Pulse overview alongside the Admin Access Approval Queue.
10. Updated application metadata, global styling, and `Workflow.md`.
11. Implemented the **Inventory Management Module** (`components/inventory-module.tsx`, `lib/inventory-types.ts`, `lib/inventory-seed.ts`, `lib/inventory-service.ts`, `lib/inventory-export.ts`, and `/api/inventory/*` route handlers) per `requirement.txt`:
    - **Separate Sidebar Navigation**: Expandable `Inventory` menu with role-based sub-items (`Inventory Dashboard`, `Add Inventory`, `Inventory List -> Kirana / Pharmacy / Mall`, `Stock History`, `Stock Adjustment`, `Inventory Reports`).
    - **Add Inventory**: Category-scoped form with Common Product Fields + Kirana-Specific, Pharmacy-Specific (including a multi-batch builder tracking quantity, expiry date, and purchase price per batch), and Mall-Specific fields, with full SKU/barcode uniqueness and monetary validations.
    - **Three Independent Listing Pages**: `Kirana Inventory List`, `Pharmacy Inventory List`, and `Mall Inventory List` featuring debounced search, dynamic filters, column sorting, server-side pagination, Excel (`.xls`) and PDF (`.pdf`) exports, and `View` / `Edit` / `Stock History` actions (no physical delete; uses `Active`/`Inactive` status).
    - **Atomic Stock Management & Audit History**: Row-locked stock service (`INITIAL_ENTRY`, `STOCK_ADDITION`, `STOCK_REDUCTION`, `STOCK_CORRECTION`, `STOCK_TRANSFER`, `STOCK_ADJUSTMENT`) with mandatory reasons and immutable `before`/`after` Audit Logs.

## Current implementation map

- `app/page.tsx` — root redirect.
- `app/login/page.tsx` — login route.
- `app/signup/page.tsx` — signup route.
- `app/dashboard/page.tsx` — dashboard route.
- `app/api/inventory/route.ts` — server-side paginated inventory listing & creation endpoint.
- `app/api/inventory/[id]/route.ts` — single product details, audited update, and physical-delete guard (`405`).
- `app/api/inventory/stock/route.ts` — stock history query & atomic stock modification service.
- `app/api/inventory/reports/route.ts` — dashboard KPIs, category summaries, expiry alerts & audit trail endpoint.
- `app/api/inventory/export/route.ts` — server-side Excel (`.xls`) and PDF (`.pdf`) report generator.
- `components/auth-page.tsx` — shared auth layout and login/signup form behavior.
- `components/dashboard-page.tsx` — dashboard shell, sidebar navigation, approval queue, and sign-out.
- `components/inventory-module.tsx` — modular Inventory Management UI (Dashboard, Add, Kirana/Pharmacy/Mall Lists, Stock History, Stock Adjustment, Reports & Audit Logs).
- `components/user-permission-module.tsx` — separated User, Inventory RBAC, Menu & Module permission administration.
- `lib/auth-storage.ts` — browser-side user/session persistence, RBAC normalization, and password hashing.
- `lib/inventory-types.ts` — TypeScript types, category metadata, and stock/expiry status helpers.
- `lib/inventory-seed.ts` — seed products (Kirana, multi-batch Pharmacy, Mall), stock transactions, and audit logs.
- `lib/inventory-service.ts` — server-side persistence (`.data/inventory-db-v1.json`), row-level locking, RBAC enforcement, stock transactions, and audit diffing.
- `lib/inventory-export.ts` — server-side Excel SpreadsheetML and binary PDF 1.4 report builders.
- `app/globals.css` — shared visual styles, responsive layouts, and Light/Dark mode tokens.
- `public/auth-background.svg` — local abstract background illustration.
- `Workflow.md` — step-by-step project workflow log.

## Validation performed

- `npm run lint` passed.
- `npx next build` passed with `/`, `/login`, `/signup`, and `/dashboard` generated.
- Browser-tested route navigation, signup pending-approval feedback, dashboard redirect/sign-out, and responsive login sizing.
- Confirmed no document overflow at login viewport sizes from 320×568 through 1280×800.

## Important limitations before production

- Auth and approvals are a client-side prototype backed by `localStorage` (`vendor-purchase-admin-users` and `vendor-purchase-admin-session`), not a security boundary.
- Passwords use browser-side SHA-256 with a fixed salt. Replace with server-side password hashing (for example Argon2id or bcrypt), server-validated captcha, and secure server-managed sessions before production.
- The demo credentials are public and only for the local prototype. A production first administrator must be provisioned through a trusted server-side process.
- No OAuth login is implemented.

## Resume guidance

Use this file and `Workflow.md` as the current handoff. Preserve the existing routes and shared auth component when making UI changes. Before production, prioritize server-backed authentication, role-based approval authorization, initial admin provisioning, and persistent server-side storage.
