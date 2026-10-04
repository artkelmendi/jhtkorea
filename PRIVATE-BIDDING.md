# JHT Korea — private bidding release

Status: complete local implementation. No production deployment, customer invitation or live database change was made for this release.

## Try the preview

Admin: http://127.0.0.1:4190/admin/
Buyer: http://127.0.0.1:4190/bidding/?session=collection

The local preview uses a disposable PostgreSQL database and sample accounts. No login is needed, no email is sent, and no live account or car is modified. It deliberately mocks the identity provider so both interfaces can be reviewed. Real authentication is covered by the automated tests, not by this preview. It listens only on the local computer.

To run later, install the package dependencies with `npm ci`, build with `npm run build` from a fresh checkout/empty `netlify-public`, then run `node preview/serve.mjs`. Stop it with Ctrl+C; sample data disappears. Never deploy the preview server.

## Implemented

- Admin-only member invitations, safe retries of failed/unattached invitations, access disable/enable. Disabled accounts immediately lose their bidding sessions.
- Separate bidder login and opaque, encrypted server-side sessions. A bidder account cannot enter the admin workspace. Admin MFA and the existing one/two-slot allowlist remain enforced.
- Draft or scheduled events with 1–30 inventory cars, selected members, future start/end in the admin's local time, per-car opening amount and minimum increment. Buyers see dates in their own local time.
- Private session URLs and assigned-member-only lobby, pre-start countdown, car photos/gallery, simultaneous per-car bidding, bid review/confirmation and pending/success/error feedback.
- Whole USD amounts. A bid accepted within the final two minutes sets that car's closing time to at least three minutes after the bid. Other cars keep their own timers.
- Server time and PostgreSQL locks decide bid acceptance. Minimum price, membership, availability and expiry are checked again for every bid. Repeated requests count once. Leading buyers cannot bid against themselves.
- Admin monitor, recent bid history and winner confirmation. Confirming a winning bid reserves the car; it does not collect payment or mark a completed sale. Cancelling an event preserves its records.
- Cars with upcoming/live bidding cannot be sold or hidden before cancellation. Cars with bidding history cannot be permanently deleted; archive them instead. A pending unconfirmed winner also prevents scheduling that car in a second event.
- Frozen, explicit public car descriptions for each lot. No internal notes, precise location, provider tokens, or other buyers' identities are sent to bidders.
- Auth status loading screen on `/admin/` before any login form. Preloaded fonts, short opacity/transform entrances, reduced-motion support, stable countdown numerals and visible saving/submission states. Bid updates preserve photo selection and entered amounts.
- Protected routes, same-origin mutations, input validation, rate limits, HTTP-only secure cookies, private no-store responses, RLS with no browser-role access and server-only database functions.

## Validation

27 automated tests pass, including real PostgreSQL migrations and bid transactions, equal-price simultaneous requests, idempotency, the three-minute extension, expiry, unauthorized membership, CSRF, session separation, revocation, activation token identity checks, private media permissions and static-build isolation. Local desktop/mobile UI checks covered a two-car draft, bid confirmation, pending state, accepted/leading state, gallery loading and overflow at 390px. These are not a penetration test or a guarantee against every attack.

## Before live activation

1. Apply `supabase/migrations/202610050001_auctions.sql` after the existing security/inventory migrations. This creates private bidding tables and guarded server functions. No new public signup or administrator slot is required.
2. Configure an authentication email sender (SMTP). Supabase's default sender is restricted to project team members, so it cannot invite ordinary customers. Official guide: https://supabase.com/docs/guides/auth/auth-smtp . Use a verified sending domain, disable email link tracking and verify invitation delivery to a non-team address.
3. Add the exact production `/bidding/` URL to Supabase's permitted authentication redirect URLs. Keep public signup disabled and provider email verification enabled.
4. Publish one reviewed Netlify release and verify a real private invitation, buyer activation, separate buyer/admin access, and a disposable end-to-end event before inviting customers.

GitHub Pages supports a static design preview but cannot run this bidding backend. Nothing is pushed or deployed from this local release. The complete source is kept separately so earlier pending work, including the prepared trusted-device session change, is not overwritten or silently activated. This release keeps the existing 15-minute idle / one-hour maximum server sessions.

## Operating notes

Prices update every five seconds while a live room is visible (less often before start); this is polling, not push realtime. Acceptance is always checked against the current database price. Each buyer may need to sign in again for a long event. There is no payment processing, automatic shipping calculation, bidder MFA, password-recovery interface, automatic winner email or auction-house settlement workflow in this version. Session lists show the most recent 100 events, and the monitor shows the latest 10 bids per car; the complete bid ledger stays in the database. Final purchase terms should be agreed with JHT before conducting a real event.
