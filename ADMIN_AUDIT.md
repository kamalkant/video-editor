# Admin Panel Audit — Findings, Fixes & Test Matrix

Audit date: 2026-10-10 · Scope: `app/admin/**`, `app/api/admin/**` and the `lib/**` code they call (billing, referrals/payouts, notifications, users, settings).

## Summary

| | Before | After Phase 1 |
|---|---|---|
| Static SQL statements that fail at runtime | 5 of 251 | 0 (guarded by `tests/unit/sql-static-check.test.ts`) |
| Admin API route tests | 0 | 112 new tests (permission matrix over 48 endpoints × 4 roles, money, users, campaigns, bulk jobs, dashboard) |
| Unit + integration suite | 834 pass, 2 fail | 946 pass, 2 fail (the same 2 pre-existing website/voice UI tests, unrelated) |
| `tsc --noEmit` errors (whole repo) | 61 | 40 (none left in admin code) |
| Tests writing to the real `data/VDO.db` | yes | no (each run uses a temp DB, which also exercises first-run seeding) |

Critical and High findings are fixed (Phase 1). Medium/Low findings and new features are listed in the [Phase 2 backlog](#phase-2-backlog).

### Behaviour changes to know about

- **Super Admin only now:** refunds; payout *Mark Paid* and *Gateway* dispatch; creating, repricing and archiving plans; sending to the *All users* audience (campaigns and the broadcast API); deleting users; changing roles; changing system and referral settings. Plain admins still approve or reject payouts, manage regular users, coupons, bulk jobs and targeted campaigns.
- **Plain admins can no longer edit other admins** (status, password, tools, devices). Resetting a peer admin's password was an account-takeover path.
- **Payouts must be approved before they are paid.** Flow: `requested → approved → (processing →) paid`; rejection is possible from requested/approved only.
- **Deleting a user is a soft delete.** The account is anonymised and can never sign in; payments, refunds, subscriptions and audit history are kept. The email address becomes free to register again. Filter *Deleted* on the Users page lists them.
- **Admin-set passwords need 8+ characters** (same rule as signup and reset; it was 6).
- **Fixed-amount coupons are entered in ₹** on the Coupons page and stored in paise, like plan prices.
- **Bulk job Retry** creates a new job for only the failed users; the original job stays as the record.
- **Subscriptions → "+ Renew" is now "+ Extend (free)"**, only for active, grace-period or past-due rows, with a confirmation.
- **Settings:** *Grace period days* and *Expiry reminder schedule* now take effect; *Default currency* and *Default tax* are used when a new plan leaves them empty; *Failed payment retries* is labelled "not yet used".

## How to verify

```bash
npm test                                          # full suite (admin tests: tests/unit/admin-*.test.ts)
npx vitest run tests/unit/admin-authz.test.ts     # who can call what
npx vitest run tests/unit/admin-money.test.ts     # refunds, payouts, coupons
npm run typecheck                                 # next.config.ts sets ignoreBuildErrors, so run this explicitly
```

Smoke-checked against a brand-new database on a separate dev server: the seeded super admin can sign in, all 12 admin pages return 200, a plain user gets 403 on settings, and a plain admin gets 403 on refunds and plan changes.

## Findings

Severity: **C** critical (money loss, data loss, outage, secret leak) · **H** high · **M** medium · **L** low. Status: ✅ fixed in Phase 1 · ⏭ Phase 2.

### Broken SQL (string values without quotes)

SQLite reads an unquoted word as a column name, so these statements threw `no such column` every time they ran.

| ID | Sev | Where | Impact | Status | Test |
|---|---|---|---|---|---|
| C1 | C | `lib/db/payments.ts` `recordRefund` (`processed`, `refunded`) | Every refund reached Razorpay **then** failed to record: money returned, payment still "captured", Refund button still shown, so a retry refunded twice | ✅ | admin-money: refunds |
| C2 | C | `lib/db/seed.ts` super admin insert (`super_admin`, `active`) | `getDb()` re-throws seed errors: every fresh install / new `VDO_DB_PATH` crashed on boot | ✅ | db.test: fresh boot |
| C3 | C | `lib/db/subscriptions.ts` cancel (`cancelled`) | Admin "Cancel subscription" always returned 500 (the page ignored it silently) | ✅ | admin-authz, manual |
| C4 | C | `lib/notifications/campaign-engine.ts` direct send (`completed`) | Message delivered, then 500 "Dispatch failed", so admins re-sent duplicates | ✅ | admin-campaigns |

### Money: refunds, payouts, coupons

| ID | Sev | Issue | Impact | Status | Test |
|---|---|---|---|---|---|
| C5 | C | Payout reject only blocked `paid` | Rejecting an already-rejected request (e.g. Bulk Reject on the *All* filter) credited the wallet again each time | ✅ atomic state machine | admin-money: payouts |
| C6 | C | Mark Paid / Gateway allowed from `rejected` and `requested` | User could get the bank transfer *and* the wallet refund; approval could be skipped | ✅ | admin-money |
| C7 | C | Gateway dispatch had no claim on status | Two clicks / two admins sent two RazorpayX payouts; no idempotency key | ✅ conditional UPDATE + `X-Payout-Idempotency` | admin-money: concurrent dispatch |
| C8 | C | RazorpayX unconfigured → adapter returned **success with a fake UTR** | Payout marked paid, nothing sent | ✅ fails unless sandbox mode is on | admin-money |
| C9 | C | Fixed coupon: page says ₹, server stored the raw number, checkout subtracts paise | ₹100 coupon gave ₹1 off | ✅ ₹→paise in the page, paise everywhere else | admin-money: coupons |
| H1 | H | Refund amount `0` meant full refund; negative/NaN not rejected; no check against already-refunded total; no idempotency | Over-refunds, double refunds | ✅ reserve-then-gateway transaction, partial refunds tracked | admin-money |
| H2 | H | Partial refund marked the whole payment `refunded` | Wrong status, wrong revenue | ✅ new `partially_refunded` status | admin-money, dashboard |
| H3 | H | Admin refund never reversed the referrer's reward (only the webhook did) | Referrer kept commission on refunded sales | ✅ reversed on full refund | admin-money |
| H4 | H | Gateway queued/pending status treated as paid | Marked paid before money settled | ✅ stays *processing* until settled | — |
| H5 | H | Failed gateway call reset an approved payout to `requested` | Approval lost | ✅ goes back to `approved` with the reason shown | admin-money |
| H6 | H | Coupon currency never compared with plan currency | INR coupon applied to USD plans | ✅ | admin-money |
| H7 | H | Coupon validation: % > 100, 0/negative values, `max_redemptions: 0` = unlimited, past expiry, unknown scope, duplicate code → raw 500, date-only expiry ended 05:30 IST | Broken or unlimited coupons | ✅ zod schema, 409 on duplicates, end-of-day IST | admin-money |
| H8 | H | `payoutMode` (manual-only / gateway-only) never enforced | Setting had no effect | ✅ | — |

### Secrets and settings

| ID | Sev | Issue | Impact | Status | Test |
|---|---|---|---|---|---|
| C10 | C | `GET /api/admin/settings` checked login only | **Any signed-in user** could read every setting, including the RazorpayX key secret | ✅ admin-only, secrets masked (`••••last4`) | admin-authz |
| C11 | C | `GET /api/admin/referrals/settings` returned the secret in plain text; both settings routes wrote the raw body (secret included) into `audit_logs` | Secret visible to every admin and in the audit page | ✅ secret never returned (hint only), blank = keep, audit logs redacted | admin-authz |
| H9 | H | Settings POST accepted any key and value; page saved placeholder values when loading failed | Corrupt settings | ✅ allow-list + validation, only changed keys sent, load errors block saving | admin-authz |
| H10 | H | Grace days, expiry reminder days, default currency/tax were never read (grace hardcoded to 5) | Settings page did nothing | ✅ wired (retry schedule labelled "not yet used") | admin-authz |
| L1 | L | Holding period 0 was read back as 14 (`|| 14`) | Could not disable the holding period | ✅ | — |

### Users and access control

| ID | Sev | Issue | Impact | Status | Test |
|---|---|---|---|---|---|
| H11 | H | Plain admin could demote, suspend or reset the password of another admin | Account takeover between admins | ✅ `lib/auth/admin-policy.ts` | admin-users |
| H12 | H | Role/status not validated (any string stored; bad status locked the user out); super admin could demote themselves | Lock-out, zero super admins | ✅ enums, no self role change, last-super-admin guard | admin-users |
| H13 | H | Hard delete cascaded payments/subscriptions (revenue dropped) and **failed** for users with coupons/refunds after already logging them out | Lost financial history, half-done deletes | ✅ soft delete in one transaction | admin-users |
| H14 | H | Short password silently ignored; partial updates applied before a later check failed | Admin thought the password changed | ✅ validate-all-then-apply | admin-users |
| H15 | H | Pages read `err.message` but `apiError` routes return `{error:{message}}` | Admins always saw generic errors | ✅ one helper (`apiMessage`) + both shapes returned | — |
| H16 | H | UI showed super-admin-only actions to plain admins (delete, super-admin role option, settings save) | Confusing 403s | ✅ hidden/disabled by role | manual |
| M1 | M | Users list `limit`/`offset` unbounded or NaN | Huge responses / 500s | ✅ clamped | admin-users |
| M2 | M | Login (password, Google, phone) only blocked `suspended` | — | ✅ blocks anything not `active` | — |

### Subscriptions

| ID | Sev | Issue | Impact | Status |
|---|---|---|---|---|
| H17 | H | "+ Renew" on any status (incl. cancelled/expired), no confirm, granted credits, could create two live subscriptions | Free renewals | ✅ "Extend (free)" with rules + confirm |
| H18 | H | Cancel targeted "whatever is active for the user", not the clicked row | Wrong row cancelled | ✅ by subscription id |
| H19 | H | Admin actions audited with the *customer* as actor | Untraceable admin actions | ✅ admin recorded |

### Notifications and campaigns

| ID | Sev | Issue | Impact | Status | Test |
|---|---|---|---|---|---|
| H20 | H | A completed campaign could be dispatched again | Everyone emailed twice | ✅ atomic draft→sending claim | admin-campaigns |
| H21 | H | "Create & Dispatch Now" defaulted to *All users*, no confirmation, any admin | Accidental mass email | ✅ recipient-count confirm, default single user, *All* = super admin | admin-campaigns |
| H22 | H | CTA read `ctaLabel/ctaUrl` (columns are `cta_label/cta_url`) | Button never included | ✅ | admin-campaigns |
| H23 | H | Admin text and CTA URL inserted into email HTML unescaped; `javascript:` links allowed | HTML injection | ✅ escaped, http(s) only | admin-campaigns |
| H24 | H | Retry used `r.userId` (undefined) and marked rows delivered without sending | Fake "delivered" | ✅ re-sends missing channels | admin-campaigns |
| H25 | H | Email send result ignored (SMTP failure even reported success) | Failures counted as delivered | ✅ | admin-campaigns |
| H26 | H | Plan audience offered `annual-pro` / `studio-tier` (don't exist) and skipped grace-period users | Campaigns reached 0 people | ✅ plans loaded from the API | — |
| H27 | H | Draft campaigns had no Dispatch button | Drafts unusable | ✅ | — |

### Bulk jobs

| ID | Sev | Issue | Impact | Status | Test |
|---|---|---|---|---|---|
| H28 | H | Page sent `?pageSize=1000` but the API reads `limit` (default 25) | "All users" = first 25 users | ✅ server resolves the audience | admin-bulk-jobs |
| H29 | H | Concurrent *Run Batch* (two tabs / auto-loop) processed the same chunk | Double credits, double notifications | ✅ atomic batch claim | admin-bulk-jobs |
| H30 | H | Retry was a no-op; unknown job types counted as success; no payload validation | Silent failures | ✅ | admin-bulk-jobs |
| H31 | H | Suspend / force-logout jobs included admins, super admins and the requester | Lock-out | ✅ regular users only | admin-bulk-jobs |
| M3 | M | CSV export: missing job returned 200 "Job not found"; formula injection | Spreadsheet injection | ✅ 404, cells neutralised | admin-bulk-jobs |

### Dashboard, audit, plans, misc

| ID | Sev | Issue | Status | Test |
|---|---|---|---|---|
| H32 | H | Revenue summed all currencies as ₹ and ignored refunds | ✅ per currency, net of refunds | admin-dashboard-stats |
| H33 | H | Plan percentages could exceed 100% (different "active" definitions) | ✅ one definition (active + trialing + grace) | admin-dashboard-stats |
| H34 | H | Dashboard showed ₹0 / zeros on error | ✅ error state | — |
| H35 | H | Audit page: first 50 rows only, search over those 50 only | ✅ server-side search + pagination | — |
| H36 | H | Plans: no validation (negative price, tax > 100, bad interval), duplicate slug → raw 500, any admin could reprice | ✅ zod, 409, super admin | admin-authz |
| M4 | M | Credits API: NaN/decimal/huge amounts, unknown user → 500 | ✅ integer ±1,000,000, 404 | admin-authz |
| M5 | M | Device-limit APIs: NaN/decimal/negative limits, unknown user → 500 | ✅ integer 1–100, 404 | admin-authz |
| M6 | M | Feature flags: `allowed_roles` not validated | ✅ | — |
| M7 | M | Missing audit entries: coupon toggle, bulk execute/retry, grace check, campaign create/test/retry/rules/lifecycle | ✅ | — |
| L2 | L | Payouts/referrals returned 401 for a signed-in non-admin (others 403) | ✅ 403 | admin-authz |

## Flows & test-case matrix

**Automated** means covered by a test in `tests/unit/`. **Manual** steps are for a browser check against a fresh database (`VDO_DB_PATH=/tmp/x.db npm run dev`).

### Access & shell

| # | Flow | Expected | Covered by |
|---|---|---|---|
| A1 | Visit `/admin` signed out | Redirect to `/login?next=/admin` | Manual |
| A2 | Visit `/admin` as a regular user | "Access Denied" page | Manual |
| A3 | Every admin API as anonymous / user / admin / super admin | 401·403 / 403 / per-route minimum role | admin-authz (48 endpoints) |
| A4 | Fresh install boots and seeds a super admin | Login works with `INITIAL_ADMIN_*` (or the defaults) | db.test, smoke |
| A5 | Sidebar highlights the current page; mobile drawer opens/closes; logout | — | admin-nav.test (AdminLayoutShell), Manual |

### Users (`/admin/users`)

| # | Flow | Expected | Covered by |
|---|---|---|---|
| U1 | Search, role/status filters, paging, rows per page | Server-side, page resets to 1 | admin-users (paging), Manual |
| U2 | Add user: valid / duplicate email / short password / staff role as plain admin | 201 / 409 / 400 / 403 | admin-users |
| U3 | Change role (super admin): promote, demote, own role | 200 / 200 / 400 | admin-users |
| U4 | Plain admin edits another admin (status, password) | 403 | admin-users |
| U5 | Suspend user (confirm) → their sessions end | Status suspended, signed out | admin-users, Manual |
| U6 | Reset password (8+ chars) → sessions revoked | 200; short → 400 | admin-users |
| U7 | Delete user with payments / coupon redemptions | Soft delete; revenue unchanged; email reusable | admin-users |
| U8 | Delete self / delete as plain admin / delete twice | 400 / 403 / 404 | admin-users |
| U9 | Tools modal: grant / revoke / default per tool | Override saved; plain admin on admin target → 403 | admin-authz, Manual |
| U10 | Sessions modal: set limit 1–100, reset, revoke one, revoke all (confirm) | Applied; invalid limit → 400 | admin-authz, Manual |
| U11 | AI credits: grant, deduct, deduct more than balance, NaN | Ledger updates; 400 for bad input | admin-authz, Manual |

### Plans (`/admin/plans`)

| # | Flow | Expected | Covered by |
|---|---|---|---|
| P1 | Create plan (super admin) with/without tax & currency | Defaults from Settings when omitted | Manual |
| P2 | Duplicate slug / negative price / tax > 100 | 409 / 400 / 400 | admin-authz (400 path), Manual |
| P3 | Edit with *Bump version* | Version +1, audit lists only changed fields | Manual |
| P4 | Archive (confirm) | Hidden from checkout; existing subscribers unaffected | Manual |
| P5 | Plain admin | Sees plans read-only; API 403 | admin-authz |

### Coupons (`/admin/coupons`)

| # | Flow | Expected | Covered by |
|---|---|---|---|
| K1 | Fixed ₹100 coupon → checkout of ₹999 plan | Discount ₹100, pay ₹899 | admin-money |
| K2 | Percentage coupon, first N cycles | Applies to first N payments | admin-billing.test |
| K3 | Invalid: % > 100, 0, negative, max 0, past expiry, unknown scope | 400 | admin-money |
| K4 | Duplicate code (any case) | 409 | admin-money |
| K5 | INR fixed coupon on a USD plan | Rejected | admin-money |
| K6 | Bulk generate N codes | N created (or "x of N" if codes collided) | Manual |
| K7 | Disable / enable | Audit entry written | Manual |

### Subscriptions & payments (`/admin/subscriptions`)

| # | Flow | Expected | Covered by |
|---|---|---|---|
| S1 | Filter subscriptions and payments by status (incl. *Partially refunded*) | Lists filter | Manual |
| S2 | Cancel a live subscription (confirm) | That row cancelled; audit shows the admin | Manual |
| S3 | Extend (free) on active / grace / past due; not on cancelled/expired; not when another live sub exists | 200 / button hidden / 409 | Manual |
| S4 | Full refund (super admin) | Payment *refunded*, user notified, referral reward reversed | admin-money |
| S5 | Partial refund, then the remainder, then a third refund | partially_refunded → refunded → 409 | admin-money |
| S6 | Refund 0 / negative / decimal paise / text / over the remaining amount | 400, nothing recorded | admin-money |
| S7 | Double-click refund | Exactly one gateway call | admin-money |
| S8 | Gateway rejects the refund, then retry | 502, nothing reserved; retry succeeds | admin-money |
| S9 | Plain admin | No Refund button; API 403 | admin-money, admin-authz |

### Payouts (`/admin/payouts`) and referrals (`/admin/referrals`)

| # | Flow | Expected | Covered by |
|---|---|---|---|
| W1 | Approve a requested payout | approved | admin-money |
| W2 | Reject (reason required) → wallet refunded once; reject again | 409, wallet unchanged | admin-money |
| W3 | Bulk reject over a mixed selection incl. duplicates | Each eligible request refunded once | admin-money |
| W4 | Mark paid before approval / after rejection | Refused | admin-money |
| W5 | Approve → Mark paid with UTR (super admin) | paid, `total_withdrawn` updated, email sent | admin-money |
| W6 | Gateway dispatch twice at once | One payout, one 409 | admin-money |
| W7 | Gateway with RazorpayX unconfigured in live mode | Fails, stays approved, reason shown | admin-money |
| W8 | Plain admin: approve allowed, Mark Paid/Gateway hidden + 403 | — | admin-money |
| R1 | Referral config: edit as super admin, reload | Values persist (holding period 0 stays 0) | Manual |
| R2 | Referral config as plain admin | Read-only; PATCH 403 | admin-authz |
| R3 | Save config without retyping the secret | Saved secret kept; never shown or logged | admin-authz |

### Notifications (`/admin/notifications`)

| # | Flow | Expected | Covered by |
|---|---|---|---|
| N1 | Direct send to a user / registered email / external email | Delivered; campaign *completed* | admin-campaigns |
| N2 | Create & Dispatch: confirm shows recipient count | Cancel sends nothing | Manual |
| N3 | *All users* as plain admin | Option disabled; API 403; draft allowed, dispatch 403 | admin-campaigns |
| N4 | Dispatch a draft; dispatch it again | 200, then 409 | admin-campaigns |
| N5 | Email bounces → *Retry Failed* | Only the missing channel is re-sent | admin-campaigns |
| N6 | CTA label + https link | Button in email, text escaped | admin-campaigns |
| N7 | Bad input: no channel, unknown channel, `javascript:` link, past schedule | 400 | admin-campaigns |
| N8 | Test send to a custom address | Email only (no in-app copy to the admin) | Manual |
| N9 | Lifecycle rule toggle; lifecycle scan (confirm) | Respects *Expiry reminder schedule* | Manual |

### Bulk jobs (`/admin/bulk-jobs`)

| # | Flow | Expected | Covered by |
|---|---|---|---|
| B1 | Grant credits to *All users* (> 25 users) | Target count = all non-deleted users | admin-bulk-jobs |
| B2 | Suspend / force logout *All users* | Staff and requester excluded | admin-bulk-jobs |
| B3 | Run in two tabs | No user processed twice | admin-bulk-jobs |
| B4 | Job with failures → *Retry N failed* | New job over failed users only | admin-bulk-jobs |
| B5 | Invalid type / no target / huge amount / fractional limit | 400 | admin-bulk-jobs |
| B6 | Export CSV; export unknown job | Safe CSV; 404 | admin-bulk-jobs |

### Dashboard, audit, features, settings

| # | Flow | Expected | Covered by |
|---|---|---|---|
| D1 | KPIs with INR + USD payments and a partial refund | Per-currency revenue, net of refunds | admin-dashboard-stats |
| D2 | Plan breakdown | Shares add up to the live total (≤ 100%) | admin-dashboard-stats |
| D3 | Stats API fails | Error with Retry, not zeros | Manual |
| D4 | Run grace check (confirm) | Uses *Grace period days*; audited | Manual |
| L1 | Audit search across all entries; paging | Server-side | Manual |
| F1 | Tool kill-switch off → hidden in the editor for that role | — | db.test (feature flags), Manual |
| T1 | Settings load fails | Error + Retry, Save impossible | Manual |
| T2 | Save as super admin | Only changed keys sent and audited | admin-authz |
| T3 | Invalid values (negative tax, grace 45, "7, three") | 400 | admin-authz |
| T4 | Turn sandbox off | Extra confirmation | Manual |

## Phase 2 backlog

Medium/Low findings not fixed yet, roughly in priority order:

1. ✅ **Default super admin password** (done 2026-10-11). Admins on the seeded password must change it before the admin panel or any admin API works (`must_change_password`, `/api/auth/change-password`); production installs without `INITIAL_ADMIN_PASSWORD` get a random one-time password. Still open: TOTP 2FA for super admins.
2. **CSRF / origin check** for admin mutations (only `SameSite=Lax` today; no `proxy.ts`), plus rate limiting on admin routes. `getClientIp` trusts `X-Forwarded-For`.
3. **Webhooks:** `refund.processed` from the Razorpay dashboard only reverses the reward (no refund row, no status change); `subscription.charged` / `subscription.cancelled` handlers are empty.
4. **Plan price snapshot on subscriptions**, so editing a price does not change existing subscribers' renewals. Plans page: tax/active inputs, un-archive.
5. **Coupons:** per-user redemption limit (`validateCoupon` ignores `userId`), atomic `max_redemptions` (validate-then-record race), edit/delete, bulk scope/expiry inputs.
6. **Payout requests:** a user can open a second request while one is `approved` (the duplicate guard checks requested/under_review/processing only). Payout amounts are always shown in ₹ regardless of the configured currency.
7. ✅ **Pagination** on subscriptions, payments, payouts and referrals pages (done 2026-10-11). Still open: debounced user search.
8. **Scheduled campaigns** are stored but nothing sends them; Push is offered but not implemented (remove it or implement web push).
9. **Confirmations** still missing: revoke a single session. Light-theme colours on the notifications page (hardcoded `slate-*`/`text-white`).
10. **Cleanup:** `AdminSidebar.tsx` and `AdminNav.tsx` are dead code. `/api/admin/stats`, `/api/admin/devices`, `/api/admin/ai-assignments` and `/api/admin/notifications/broadcast` have no page. `ai-assignments` input validation; `checkDeviceLimit` off-by-one check.
11. **Build safety:** `next.config.ts` sets `typescript.ignoreBuildErrors: true`. The typecheck had already flagged the campaign CTA and retry bugs above; run `npm run typecheck` in CI.
12. **Dev data:** before this audit the test suite wrote into `data/VDO.db` (for example 678 `TEST…` coupons). Consider resetting the dev database.

## Suggested additions

- ✅ Per-user activity timeline: the user 360 panel in Users, and `/admin/audit?user=<id>` (done 2026-10-11).
- ✅ CSV export of payments, refunds, payouts and users, plus admin GST invoice download (done 2026-10-11).
- ✅ System health page `/admin/health` (done 2026-10-11). Not yet: last webhook received.
- 2FA requirement for super admins.
- Read-only "view as user" for support.
- A Playwright smoke flow in `e2e/` that signs in as admin and walks the pages in the matrix above.
