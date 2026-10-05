# Live bidding controls — local preview

Implemented on 6 October 2026. This release is local only. No production database changes, invitation emails, GitHub push or Netlify deployment were performed.

## What the administrator can do

- Open **Live bidding** to monitor active and upcoming cars across sessions. See the leading member, highest amount, bid count, closing time and recent accepted bids from all invited members. Filter by session, live cars or results awaiting confirmation.
- Open **Bidding sessions → Start options** for a prepared draft or upcoming session. Open immediately, or give 5, 15, 30, 60 or 1,440 minutes of advance notice. The original bidding duration is retained. At least one assigned member must have activated their account; selected cars must be available and cannot overlap another active or unresolved session.
- Advance notice is a message inside the assigned members' private bidding room. It does not send email, SMS or push notifications. Existing scheduled starts continue to work without an extra notice.
- Click **Close bidding** on a car with an accepted bid. Confirm the displayed highest amount. That car closes immediately, retains its highest bidder and full bid history, and awaits a separate winner confirmation. Other cars remain open. There is no automatic high-price threshold.
- If another bid arrives after the close confirmation was opened, the server refuses that closure with a request to review the new amount. No newer bid is silently overwritten. Bidding and closure share the same transactional lock.
- Click **Confirm winner** after the car closes. The bidding car becomes reserved. Payment, export arrangements and final sale remain with JHT Korea. A session containing a confirmed winner can no longer be cancelled wholesale; close remaining cars separately after they receive bids.

Cars with confirmed results leave the active desk and remain in their session history. The desk initially loads the latest 50 events and retains up to 200 recent events while open. Full bid records remain in the database. The 'Bids on monitored cars' count concerns the cars currently in the desk, so it decreases when a confirmed car leaves that view.

## What members see

Members sign in through `/bidding/` and only see assigned sessions. A shared private link still requires that assignment. Rooms show photos, opening price or highest bid, minimum increment, recent anonymous member bids, opening/closing countdowns and their own leading/outbid state. Admin notices appear above the opening countdown. Early closure and winner confirmation update without refreshing. Other customers' names and emails are not included in the member projection.

The existing rules remain: whole USD bids, simultaneous car timers, a three-minute extension after a qualifying late bid, duplicate-request protection, and JHT confirmation with no online payment. The server decides opening and closure; browser countdowns are explanatory.

## Updates and security

The browser opens a same-origin server-sent event stream using its existing opaque, HTTP-only session cookie. No Supabase keys or direct database subscriptions are shipped to the browser. Admin routes require the enabled admin slot and verified MFA. Bidder routes verify the account and room assignment. Writes require the expected origin and validate their fields and bounds.

The server subscribes to INSERT events on private `jht_private.auction_events` using its server-only service role. Events contain identifiers, not credentials; the server supplies a separate authorized projection to each browser. The migration enables RLS, denies raw browser roles and adds the event table to the existing `supabase_realtime` publication when available. Local preview instead uses PostgreSQL NOTIFY from the same committed event rows.

Streams renew after 45 seconds, below Netlify's documented 60-second streaming execution limit. Every ten seconds, and on changes, the server checks access again and refreshes the projection. Admin reconnects replay events from a durable sequence cursor, including bursts larger than one page. Hidden tabs disconnect; visible tabs reconnect. A missed provider notification is caught by the ten-second reconciliation. Disconnected or stale bidder controls are disabled until fresh data is verified. Normal timed renewal does not show an error or reset the page.

The live desk keeps unchanged cards and activity markup stable between updates; countdowns update as text. The existing font-loading gate, page entrances, dialogs, photo transitions, operation loading states and reduced-motion handling remain in use. Reconnects restore control availability, and new controls unlock after an operation completes.

## Validation completed

- **35 automated tests passed**, covering existing authentication, MFA, inventory, uploads, database role restrictions and build isolation, plus start notices, immediate opening, stale versions, overlapping stock, closure races, retained winners, other cars remaining open, confirmation/cancellation rules, stream authorization, actual committed-bid delivery, revocation, replay pagination and timed renewal cleanup.
- Browser walkthrough: Member 0 placed a $1,200 sample bid, which appeared in the admin feed without a refresh. Admin closed that car; its member form became disabled with the retained winning bid while the other car remained open. Admin posted a five-minute opening notice, then opened the next session immediately; its already-open member screen switched to live bidding. Winner confirmation succeeded and removed the reviewed car from the active desk.
- Responsive DOM check at 390 × 844: single-column cards and activity layout, 390-pixel document width with no horizontal overflow. Desktop filters, empty states, loading feedback and dialogs were exercised.
- JavaScript syntax checks and Git whitespace checks passed. Production output was rebuilt from the protected build script.

These checks do not establish that an untested cloud deployment works under every real-client condition.

## Before production release

1. Review and apply the pending private-bidding migration and this new `202610060001_live_auction_controls.sql` migration in the real Supabase project, in migration order. Apply any other pending migrations as shown by the project's migration history; do not reapply migrations already installed.
2. Verify the Supabase Realtime publication contains the private event table and that the server service role receives committed notifications. Browser-role access must stay denied. Test two genuinely separate invited accounts and the owner's real MFA session.
3. Configure the transactional email sender and invitation redirect URLs for customer activation. In-app start notices require no email sender, but customer invitation emails do.
4. Deploy one deliberate Netlify release only after authorization. Test deployed SSE delivery, reconnects, session expiry, a start notice, immediate opening, bid submission and early closure. Local preview uses real SQL rules but simulated identity-provider responses and disposable accounts.
5. Load-test the expected number of concurrent bidders and agree on a usage budget. Each open visible bidding screen holds a function stream and a server Realtime subscription; renewals, authenticated reconciliation, database reads and private media also consume service resources. Measure Netlify compute/requests and Supabase Realtime connections/messages before committing to a plan. There is no promise this is free at a particular bidder count. A shared stream gateway may be preferable at larger concurrency.
6. Agree on backup, bid-history retention, support and incident handling before accepting real bidding. The system does not erase historical bids or rewrite a winner to accept a lower price.

## Research informing the flow

[Bring a Trailer's auction guide](https://bringatrailer.com/how-bat-works/) and [Cars & Bids' FAQ](https://carsandbids.com/faq/) informed the clear bid amount, increment, closing-timer and post-auction confirmation flow. JHT's private invitations, three-minute extension and manual close controls follow this project's agreed rules.

Implementation limits were checked against the primary documentation for [Netlify function streaming](https://docs.netlify.com/build/functions/api/) and [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes). The ten-second reconciliation is our implementation choice; cloud latency and cost remain to be measured.
