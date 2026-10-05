# Everyday admin tools

Implemented on 5 October 2026. This release is a local preview; it has not been pushed, deployed or applied to the production database.

## What the owner can manage

| Tool | How to use it | What customers see |
| --- | --- | --- |
| Business information | Open **Website settings**, edit the phone, business email, address and visiting instructions, then **Save changes**. | Updated WhatsApp, call and email links, homepage location and footer information. Changing this public email does not change an administrator's login. |
| Scheduled announcement | Write an update, enable it and optionally choose a start and end time. Dates are entered in the administrator's device timezone. | A compact message below the homepage video. The server decides when it is visible; hidden, future and expired text is excluded from the public API. The video hero stays unchanged. |
| Customer FAQs | Edit, add, remove or reorder questions inside their category. Save the website when ready. | The FAQ page uses the saved questions and answers, with accessible expandable answers. Between 1 and 20 questions are supported. |
| Draft copies | Use a vehicle's **Copy as a draft** icon, enter a new reference and review all details and photographs. | Nothing new until the administrator deliberately publishes the saved draft from Inventory. The original vehicle is unchanged. Photographs are initially reused, so replace them when the actual car differs. |
| Stock CSV | Open **Inventory → Export CSV**. An automatic download is attempted and a manual download link remains available. | No public change. The spreadsheet contains retail stock, including draft, sold and archived records. It excludes photographs, private notes, bidding stock and accounts. |
| Activity history | Open **Activity history**, filter by inventory, website or bidding, refresh or load older records. | No public change. Administrators see what was saved, its label, time and an account alias. Passwords, tokens, email addresses and customer contact details are not included. |

Website settings have a customer preview, clear save feedback and protection against losing unsaved edits. If two administrators edit the same settings, the second stale save is rejected instead of overwriting the first administrator's work. **Reload latest** loads the current version; note your pending changes before discarding them.

The CSV is a spreadsheet export, not a complete backup or a restore/import format. It supports up to 5,000 stock records and explicitly refuses a larger export rather than silently truncating it. Exports are limited to ten per administrator per hour. Formula-like cells are neutralized for spreadsheet safety.

## Backend and access

The browser uses the existing same-origin server API. It receives no database service credential or provider session token. All management endpoints use the existing confirmed identity, mandatory MFA, enabled administrator slot, session expiry and rate limits. Cross-origin writes are rejected. Public users receive only the intended website information.

The new settings table and helper functions are inaccessible to the database's anonymous and authenticated browser roles. Only the server service role can access them. Website saves and their activity entries happen in one database transaction. Activity is read-only in the dashboard, with cursor pagination; it is an operational history, not a tamper-proof external audit archive.

The migration is `supabase/migrations/202610050002_admin_operations.sql`. The preview loads it automatically. A real release must apply all pending migrations in order and deploy the matching backend and frontend together. Do not expose database credentials or bypass the server guard to make the new screens work.

Bundled contact details and FAQs remain available if the public settings request temporarily fails. Each page reads its settings once; these controls introduce no continuous public polling.

## Verification

The final automated suite passes **31 of 31 tests**. It runs the actual SQL migrations with a local PostgreSQL-compatible database and exercises the real backend handlers. Authentication/provider identities are simulated in these local tests.

New coverage includes anonymous and non-MFA rejection, revoked administrator rejection, CSRF rejection, validation bounds and dates, simultaneous edits, atomic save history, public draft-data exclusion, safe CSV escaping, an export with over 1,000 records, the 5,000-record refusal, history pagination and database-role denials. Existing tests also cover inventory CRUD, protected vehicle URLs, uploads, private bidding, invitation isolation and the three-minute bid extension.

Manual browser checks passed for saving and refreshing settings, showing a homepage announcement and updated appointment information, FAQ editing/addition/reordering/removal and public expansion, unsaved-edit cancellation, draft copying, export preparation and the manual download link, activity filtering, desktop layout and a 390-pixel phone layout in light and dark modes. The in-app browser did not report a completed file-download event; the CSV response contents and download link were verified, but saving a file to disk should also be checked in the customer's normal browser before launch.

## What remains before real customers use this release

- Apply the pending database migrations and publish one coordinated release when authorized. Neither happened during this work.
- Test real Supabase identities, MFA and session revocation against the deployed service. The local preview uses demo identities and a temporary database that resets when its server restarts.
- Confirm real invitation email delivery, activation links and two separate invited customer accounts. Existing private bidding remains in local preview pending its live setup.
- Check file downloads and touch interactions in actual Chrome and iPhone Safari. Browser-width testing does not reproduce every mobile device or Safari toolbar behavior.
- Confirm the business details, FAQ wording and announcement with the owner, and arrange production database/photo backups and restoration procedures.

Passing local tests establishes the tested behavior; it cannot guarantee 100% reliability or eliminate every possible attack. Production configuration and the live acceptance checks above still matter.
