# PULSE — HANDOFF (v1.2.0)

Read this first. Written for a developer or AI agent picking the project up cold.

- **Date:** 21 Nov 2026 · **App version:** 1.2.0 · **Sheet schema:** v6
- **Owner:** Weave Solutions, Raipur (weavesolution.com)
- **Origin:** grew out of the single-client "Shani Traders Billing" PWA (cache `shani-v7`, schema v4).

## 1. What it is
A billing PWA for **any small shop**. Plain HTML/CSS/vanilla JS, no build step. One GitHub Pages repo serves
**every client**; each client has their **own Google Sheet + Apps Script web app**. A phone is pointed at its
client's sheet once (setup link, or password-locked Settings). Nothing client-specific lives in the repo.

Staff make a bill, pick GST or Non-GST, and share an A4 PDF. Bills are saved on the phone first and reach the
sheet when there is a connection.

## 2. Hard rules
1. **No data loss.** Every write goes to `localStorage` before the network. Queue items leave the queue only
   when the server confirms that item.
2. **Minimise Apps Script executions.** A sync is ONE call (`syncBatch` with `pull:true` pushes the queue and
   returns the fresh picture). Saving a bill online = one call (bill + new party + item changes together).
   Launch with nothing pending = one `bootstrap` GET. Only needed fields are sent (`wireInvoice`).
3. **Mobile first.** 360 px target, 320 px must work, no sideways overflow.
4. **Few files, flat repo.** Images only in `img/`.
5. **Simple UI.** Do not add features to the main screens without being asked. "Sheet/Google" wording only in Settings.
6. Weave logo + credits only in Settings → About. Logo loads from `https://weavesolution.com/assets/logo.png`,
   links to weavesolution.com, darkens on hover.
7. Style follows PACE: navy `#1B365D`, orange `#D67A3A`, background `#F4F2EE`, Roboto, orange-topped KPI cards.
8. **Never build a mode that hides one bill type's past bills.** Feature switches only stop NEW bills of a type.

## 3. Files
| File | Role |
|---|---|
| `index.html` | The whole app (Bill, History, Items, Parties, Settings). `APP_VERSION` constant. |
| `sw.js` | Service worker. `VERSION` constant — **must equal `APP_VERSION`**. |
| `manifest.webmanifest` | PWA manifest. |
| `img/` | 4 icons (navy tile, orange "PULSE" word-mark). |
| `Code.gs` | Apps Script backend — NOT deployed to GitHub; pasted into each client's sheet. |
| `HANDOFF.md` | This file. |

## 4. New client — one-time setup
1. New Google Sheet → Extensions → Apps Script → paste `Code.gs` → set `SHARED_TOKEN` to a word unique to this
   client → Deploy → New deployment → Web app, Execute as **Me**, access **Anyone** → copy the `/exec` URL.
2. Open Pulse → gear → password → Connection: URL + access word → **Connect & test**.
3. Fill Shop details, bill prefix, feature switches → **Save**. (Stored in the sheet's `Settings` tab.)
4. Bill numbering → set next numbers if the shop already issued bills elsewhere.
5. **Copy setup link** → send to each of the client's phones → open once → Install.
   iPhone: the installed app has separate storage from Safari, so paste the link into the "not connected" box inside the installed app.

Repo name: `pulse` (GitHub Pages address `…github.io/pulse/`). Pulse is a fresh product: nothing is carried over
from the old Shani Traders app, and v1.1 removed the carry-over code and that client's URL from the source.
`repairTextColumns` in `Code.gs` is only for a sheet that was used by that older app.

## 5. Releasing a new version
1. Bump `APP_VERSION` in `index.html` **and** `VERSION` in `sw.js` to the same value.
2. Upload. Installed apps fetch `sw.js` (uncached) on launch; if the version differs they show **Update now**,
   which unregisters the worker, clears the caches (never the data) and reloads.
3. If `Code.gs` changed: paste into every client sheet and deploy as **New version**.

## 6. Data
### localStorage (`pulse.*`)
`cfg` (shop + features + scriptUrl + token) · `catalog` · `customers` · `invoices` (≤500, with items) ·
`payments` (≤800) · `queue` `{invoices, customers, payments, cancels, catalogDirty, catalogRev, configDirty, configRev}` ·
`next`, `nextCash` · `lastSync` · `draft` · `pendingSetup`.
Bill field names are canonical everywhere: `buyerName, buyerMobile, buyerAddress, buyerGSTIN, placeOfSupply, taxableValue` (`normInv`).

### Sheet tabs
- **Invoices** — 23 columns. 1–13 original, never reorder; append only. v5 added `Cancel Reason`.
  Text columns (Invoice No, Date, Time, Mobile, GSTIN, Client ID) are formatted as plain text **per row at write time** (`writeRow_`).
- **Items** (Name, HSN, Unit, Rate, GST%) · **Customers** (Name, Mobile, Address, GSTIN, Added On)
- **Payments** (Date, Time, Bill No, Bill Type, Party, Amount, Mode, Balance After, Note, Payment ID, Bill Client ID)
- **Settings** (Key, Value) — shop details, `gstPrefix`, `charge1/2` names, `f_*` feature switches.
- Sheet columns `Transport`/`Labour` hold extra charge 1/2; their printed names come from Settings.

### Numbering
Counters in Script Properties (`invoiceSeq`, `cashSeq`). GST number = prefix + 5 digits; prefix = Settings tab →
else letters of the newest GST bill in the sheet → else `INV`. Non-GST = 4 digits. The server honours the phone's
predicted number only if it is exactly the next free one; otherwise it assigns the next and the app shows a
"Bill number changed" warning (once) and a banner on that bill.

## 7. API (`Code.gs`)
GET `?action=bootstrap|invoices` (+`token`, `limit`).
POST (text/plain JSON — **keep text/plain**, avoids CORS preflight): `syncBatch` {invoices, customers, payments,
cancels, items, config, pull, limit} · `saveInvoice` · `addPayment` (idempotent on `pid`, matched by bill client ID)
· `cancelInvoice` · `saveItems` · `addCustomer` · `saveConfig` · `setStartNumber` · `updateCredit` (legacy).
Editor-only: `resetInvoiceCounter`, `repairTextColumns`.

## 8. Behaviour notes
- **Money:** rates include GST; tax is backed out. CGST = round(tax/2), SGST = remainder. Extra charges carry no GST.
  Total rounded to the rupee. Credit ≤ total.
- **GSTIN:** first two digits set Place of supply; checksum checked (warning, not a block, on bills; block on shop/party forms).
- **Bill date** follows today unless the user picks another date (`dateTouched`).
- **Cancel:** number kept, Status = CANCELLED, due cleared, reason stored, PDF stamped, excluded from summary.
- **Payments:** each receipt is a row in Payments and lowers the bill's Credit. Queue holds a *copy* of an unsent
  bill, so a payment on it is not counted twice.
- **Feature switches** (`f_gst, f_cash, f_charges, f_credit, f_history, f_summary`): at least one bill type stays on.
- **Settings password** is stored as a SHA-256 hash in `index.html` (`PW_HASH`). It keeps staff out; it is not strong
  security (client-side). The real gate on data is `SHARED_TOKEN`.
- **Sync conflicts:** catalog/config edits use a revision counter so an edit made during a sync is not marked as sent.
  A payment/cancel whose bill no longer exists in the sheet is dropped with a message.
- **History → Refresh** is authoritative (clears bills deleted in the sheet), as before.
- **Do not sort the Invoices tab** (History assumes newest at the bottom). Use filter views. Duplicate check now scans the whole column.

## 8a. Added in 1.1.0
- **Cancel PIN (per client):** switch `f_cancelPin` + `cancelPinHash` (SHA-256 of `pulse-pin:<pin>`) in the Settings tab,
  so all phones of a client share it and it works offline. Set in Settings; the owner can also change it from the
  Cancel screen with the current PIN (`openChangePin`). It is checked on the phone only — the server does not enforce it.
- **Party-wise dues** on the Parties tab (`duesList`, grouped by mobile, else by name) with a **WhatsApp reminder**
  (`wa.me` link, +91 added to 10-digit numbers). Tap a bill there to record a payment.
- **Complete dues:** `bootstrap`/`invoices` replies now carry `dues` = unpaid bills older than the returned window
  (`readOlderDues_`). A bill the phone shows as unpaid that the sheet no longer lists has its due cleared (`applyRemoteBills`).
  Unpaid bills are never trimmed by the 500-bill local cap.

## 8b. Added in 1.2.0
- **Sale / Purchase switch** on the Bill screen (`MODE`). Purchases go to their own **Purchases** tab (same 23 columns,
  Type = `PURCHASE`, col 1 = supplier's bill no., no numbering). Rates on a purchase can be before GST (default) or
  incl. GST (`rateIncl`); lines carry `exGst:true` when entered before GST. Saving a purchase updates the item's
  purchase rate (`prate`, always stored before GST).
- **Debtors / Creditors tabs** replace Parties (one view `v-parties`, side from the tab). A party = one row in the
  Customers tab, matched by mobile (last 10 digits) else by name; column 6 `Type` = Customer / Supplier / Both.
  Party sheet: unpaid bills, **receive / pay** one amount spread oldest-first (`commitPartyPay`), **statement PDF**
  (`action=statement`, whole sheet when online; phone data offline, marked so), WhatsApp reminder (debtors), edit.
- **Party search while typing** in the name box (`partyMatches`): customers first on a sale, suppliers first on a
  purchase, shows the party's due. Replaces the "Saved" button.
- **Stock** (`f_stock`): Items tab columns 6–9 = Item ID, Purchase Rate, Opening Stock, Stock. Stock is changed ONLY
  by the server: opening edits (delta), sale −qty, purchase +qty, cancel reverses (once). Phone shows
  `liveStock` = sheet stock adjusted for entries still queued. Items made before 1.2 get ID `n:<name>` until edited.
- **Item edits are per item** (`QUEUE.itemOps`, `action=itemOps` / `syncBatch.itemOps`), never the whole list.
  Opening stock is sent only when it was edited. Old phones sending a whole list are applied as upserts (no deletes).
- **Units per client** (Settings → Units chips, `CFG.units` comma list). **Extra charge as % of sale**
  (`charge1Pct`/`charge2Pct`): fills itself on sales until typed over; not used on purchases.
- **Monthly report** (History → Monthly report, `action=report&month=yyyy-mm`): sales GST/non-GST, B2B/B2C, GST by
  rate, purchases + input GST, receipts/payments, day-wise, top items; PDF. Offline it is built from the phone.
- **Feature switches added:** `f_purchase`, `f_stock`.

## 8c. Data-safety rules (1.2) — keep these when changing sync
1. Phone first: a bill/payment/party/item change is written to localStorage before any network call; if that write
   fails (storage full) everything is rolled back and the entry stays on screen (`generateBill`, `storePayments`).
2. Each queued thing leaves the queue only when the server confirms that thing (`settle`).
3. Every server write is idempotent: bill by client ID, payment by payment ID, item by item ID, party by
   mobile/name, cancel by status (stock reversed once), setting by key. Retrying is always safe.
4. Server never clears and rewrites a tab (Settings and Items used to be — removed in 1.2).
5. Long queues go up in slices of 40 bills (`SLICE`); payments/cancels/parties go with the last slice.
6. Pulled data never overwrites what this phone still has waiting (`applyBoot` lays queued edits on top).

## 9. Testing done for 1.2.0 (and how to repeat)
- `Code.gs` run for real in Node against a fake spreadsheet that mimics Sheets' auto-conversion and row limit (26 checks).
- Headless Chrome at 320/360/412 px against that backend (67 + 48 checks, incl. lost replies, full storage,
  two phones editing items, 95 offline bills in slices, v1.1 queue upgrade); backend alone 25 + 23 checks: setup, password, one-call syncs, double tap,
  offline queue + reload, renumbering, payment on a renumbered bill, cancel, switches, setup link, client switch, update banner, Back button.
- PDF layout checked for 1–35 items with a recording stub of jsPDF.
- **Not tested here:** the real jsPDF file and a live Apps Script deployment (no internet in the build sandbox).
  After deploying, make one GST and one Non-GST bill and open both PDFs.

## 10. Known limitations / ideas not yet taken
No discounts, opening balances for parties, e-way bill, thermal printing, GSTR-1 export, purchase returns,
staff logins, or item-list edit locks. Local history capped at 500 bills. One client per phone/browser at a time.
