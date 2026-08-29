# Milestone 10 — Double-entry accounting, GST compliance & CA handover

## Why this exists

Before this milestone the platform could tell you what it had sold. It could not tell you whether
the business made money.

Three specific gaps made the old finance screen untrustworthy:

1. **Counter cash was invisible.** `OrderPaymentReceipt` rows — every rupee a walk-in customer
   handed over — never reached `FinancialEvent`. The order screen showed the payment; finance did
   not. For a print shop where a large share of revenue is walk-in, this is not a rounding error.
2. **There were no books.** `expenses`, `purchases` and `reports` were empty scaffolds. Without
   spending there is no profit figure, and without a chart of accounts there is no balance sheet —
   only aggregates over the sales tables, which a CA cannot audit and the GST department will not
   accept.
3. **GST was a single blended rate.** One `gstRate` per invoice, no CGST/SGST/IGST split, no place
   of supply, no HSN. Enough to print an invoice; not enough to file a return.

## The core design decision

**The journal is a derived, idempotent projection of source documents.**

Orders, dispatch, wallets and payments keep writing exactly what they wrote before. A projection
layer reads those rows and posts the double entry. Nothing in the operational modules changed.

That choice buys three properties, in order of importance:

- **Nothing existing breaks.** Revenue-critical paths — order placement, wallet debit, dispatch
  billing — were not touched. Their behaviour under load and under failure is unchanged.
- **Later modules cost an adapter, not a refactor.** A new money flow added next year needs one
  file in `services/accounting/projection/`. It does not need the accounting team's permission,
  and accounting does not need to know it exists until the adapter is written.
- **History works.** The same code that posts today's invoice posts the four thousand invoices
  raised before this system existed. Backfill and steady state are one code path, so the backfill
  cannot be the thing that is subtly different.

The property that makes all of this safe is idempotency: every `JournalEntry` carries
`(sourceType, sourceKey)` with a unique constraint. Re-running the projection can never
double-post. That is why it can run inline after a write, on a five-minute schedule, from an admin
button, and as a historical backfill, all at once, without coordination.

## What was added

### Schema (`prisma/schema.prisma`)

| Area | Models |
| --- | --- |
| Ledger | `ChartOfAccount`, `JournalEntry`, `JournalLine`, `VoucherNumberSequence` |
| Calendar | `FiscalYear`, `FiscalPeriod` |
| Cash | `CashBankAccount`, `BankTransaction`, `BankReconciliation` |
| Spending | `ExpenseCategory`, `Expense` |
| Payables | `Supplier`, `PurchaseBill`, `PurchaseBillItem`, `SupplierPayment`, `SupplierPaymentAllocation` |
| Sales tax | `InvoiceTaxLine`, `CreditNote`, `GstRateMaster` |
| Config | `FinanceSettings`, `AccountingProjectionRun` |

Additive changes to existing models — all nullable or defaulted, so every existing writer compiles
and behaves identically:

- `Invoice` gained `placeOfSupply`, `supplyType`, `documentCategory`, `cgstAmount`, `sgstAmount`,
  `igstAmount`, `cessAmount`, `roundOff`, `reverseCharge`, `taxDetailReady`.
- `ProductOffering` gained `hsnCode` and `gstRatePercent`.
- `FinancialEventType` gained `REFUND_CREDIT`; `FinancialReferenceType` gained `CREDIT_NOTE`.

### Services (`src/services/accounting/`)

```
account-codes.ts            canonical account codes — the posting contract
chart-of-accounts.seed.ts   the default Indian small-business chart
account-resolver.service.ts code → id, cached process-wide
finance-settings.service.ts single-row config (home state, default rate, kill switch)
fiscal.service.ts           April–March calendar + the period lock
fiscal-calendar.ts          pure calendar maths (unit-tested)
voucher-number.service.ts   gapless per-series, per-year counters
posting.service.ts          THE only way a journal entry is created
gst.service.ts              place of supply, splits, GSTR-1 classification
gst-math.ts                 pure tax arithmetic (unit-tested)
invoice-tax.service.ts      derives GST detail for invoices that never captured it
cash-account.resolver.ts    which ledger account a payment mode lands in
india-states.ts             GST state codes
projection/                 one adapter per source document + the orchestrator
reporting/                  trial balance, P&L, balance sheet, cash flow, day book,
                            ageing, party statement, GST returns, reconciliation
export/                     Excel workbook builder + the CA handover packs
```

### The posting rules

The mapping worth understanding is the one for an order payment. **Taking a customer's money when
they place an order is not revenue** — the job has not been delivered and no invoice has been
raised. So the money moves from one liability to another, and only the invoice at dispatch turns it
into income. Getting this wrong is the most common way a printing business overstates its profit.

| Event | Debit | Credit |
| --- | --- | --- |
| Wallet top-up | Payment Gateway Receivable | Customer Wallet Liability |
| Order paid from wallet | Customer Wallet Liability | Customer Advances |
| Order paid on Udhar | Udhar Receivable | Customer Advances |
| Counter cash / UPI receipt | Cash in Hand / Bank | Customer Advances |
| **Invoice at dispatch** | Accounts Receivable | Printing Sales + Delivery Income + Output CGST/SGST/IGST |
| Advance applied to invoice | Customer Advances | Accounts Receivable |
| Udhar repayment | Cash / Bank | Udhar Receivable |
| Expense (paid) | Expense head + Input GST | Cash / Bank |
| Expense (unpaid) | Expense head + Input GST | Expenses Payable |
| Purchase bill | Materials/COGS + Input GST | Accounts Payable |
| Supplier payment | Accounts Payable | Cash / Bank |
| Credit note | Sales Returns + Output GST reversal | Accounts Receivable |
| Refund settlement | Accounts Receivable | Cash / Bank / Wallet / Udhar |
| Promotional wallet credit | Customer Incentives (expense) | Customer Wallet Liability |

Two deliberate refinements:

- **Sales returns are contra-revenue, not an expense.** A refunded job never was income; booking it
  as a cost would flatter both revenue and expenses.
- **Non-claimable input tax is folded into cost.** Staff welfare, food and motor-vehicle GST are
  blocked credits under s.17(5). Parking them in Input GST would leave a balance that is never
  recovered, and the GST reconciliation would never tie.

### API surface

```
GET  /admin/finance/dashboard | trial-balance | profit-loss | balance-sheet
GET  /admin/finance/cash-flow | ageing | party-statement | reconciliation
GET  /admin/finance/gst/gstr1 | gstr3b | purchase-register
GET  /admin/finance/export?pack=ca-handover|gst-returns|financial-statements|day-book|ageing|tally
GET/POST/PATCH /admin/accounting/accounts | day-book | entries | periods | settings | sync
GET/POST/PATCH /expenses (+ /categories)
GET/POST /purchases/suppliers | bills | payments
GET/POST /admin/cash-bank/accounts | transactions | reconcile
GET/POST /admin/credit-notes
GET  /reports/sales-register | collections | expense-summary
```

The four pre-existing `/admin/finance` endpoints are untouched, so the older screens keep working.

### Admin UI

`/admin/finance` — overview (profitability, cash, receivables, payables, GST, and a books-health
block that says out loud when documents are still unposted) · `day-book` · `expenses` ·
`purchases` · `cash-bank` · `credit-notes` · `profit-loss` · `balance-sheet` · `trial-balance` ·
`ageing` · `gst` · `accounts` · `exports` · `settings`.

## Installing it

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name accounting_double_entry
npm run accounting:setup     # chart of accounts, calendar, categories, cash accounts, backfill
npm run accounting:verify    # read-only health check; non-zero exit if the books do not balance
```

`accounting:setup` is idempotent and safe to re-run. The backfill loops until a whole pass posts
nothing new, so an interrupted run is resumed simply by running it again.

The scheduled projection runs in the worker process (`npm run start:worker`) every five minutes
with a one-hour look-back. Without Redis it does not run and the books rely on inline syncs plus
the admin "Sync ledger" button — the startup log says so explicitly.

## Guarantees, and how they are enforced

| Guarantee | Mechanism |
| --- | --- |
| Entries always balance | `PostingService` refuses unbalanced input; no other code writes `JournalLine` |
| Re-running never double-posts | `@@unique([sourceType, sourceKey])` |
| Nothing is edited or deleted | Corrections are reversals linked via `reversalOfId` |
| Filed periods cannot change | `FiscalPeriod.status = LOCKED` refuses every posting, for everyone |
| Reports cannot drift from the ledger | Every report reads `JournalLine`; balances are never cached |
| Drift is detectable | `/admin/finance/reconciliation` checks the books against the source tables |

## Known limits, stated rather than hidden

- **GSTR-3B set-off is like-against-like.** Cross-utilisation of IGST credit changes the cash
  outflow and is a judgement call; the workbook says so on the sheet and leaves it to the CA.
- **Inventory is not valued.** Purchases are expensed, not capitalised into stock. Closing stock is
  a manual journal at year end.
- **Depreciation is manual.** The accounts and the entry type exist; no schedule runs it.
- **HSN detail is only as good as the product data.** Products without an `hsnCode` fall back to
  the company default, which makes the HSN summary coarser than it needs to be.

## Extending it

To bring a new money flow into the books, add an adapter under `projection/`:

1. Scan your source table for rows within the window.
2. Ask `findPostedKeys` which already have entries.
3. Build a `PostEntryInput` per remaining row, keyed on the source row's id.
4. Register it in `PROJECTION_ADAPTERS`.

Do not post from the operational module directly, and do not write `JournalEntry` by hand. Both
break the idempotency the whole design rests on.
