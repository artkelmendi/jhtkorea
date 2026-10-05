# Frontend review — 5 October 2026

This revision is local only. No Netlify deployment, GitHub push, production database change or customer email was made.

## Implemented

- Public design: compact brand grid, readable car cards, refined story/services layout, shorter copy, smaller support-page headings and a compact contact/footer composition. Graphite, white and light blue remain the core palette.
- Motion: one shared entrance system replaces overlapping scroll reveals; buttons respond to presses; menus, dashboard views and dialogs have short transitions. Editing fields, live countdowns and periodic data polling do not trigger decorative entrances. Keyboard navigation and reduced-motion preferences bypass optional movement.
- Admin: neutral session-check screen, font readiness before the dashboard, a stable welcome layout, saved navigation section, visible save/upload progress, consistent confirmations and corrected editor focus. Mobile navigation contains focus and hides background controls.
- Photos: images decode before replacing the current photo; fast changes keep the latest requested photo; gallery controls no longer scroll the document unexpectedly.
- Local preview: the homepage and database-backed vehicle/notice routes load correctly. Demo data includes a homepage feature and a notice; private bidding stock remains separate from retail inventory.

## Verified

- Desktop and phone-size layouts, public light/dark modes, brand links, inventory-derived model choices, empty brands, filters, sorting, mobile filtering, vehicle photos, FAQ expansion, purchase guide, notices and video playback.
- All seven admin navigation sections, refresh into a selected section, vehicle editors, private member/session dialogs, native confirmation cancellation, homepage saving and notice publishing with disposable local data.
- Invited bidder lobby, scheduled countdown, disabled bidding before the start, photo navigation, bid review, submission loading state and accepted demo bid.
- Editor opening focuses its close control; Escape returns focus to the original action. Mobile menus and filters return focus to their triggers.
- 27 automated checks passed, including existing authentication, authorization, inventory, upload, bid ordering, late extension and production-build isolation checks. Changed JavaScript passes syntax checks.

## Boundaries

Responsive testing used the in-app Chromium browser. Actual iPhone Safari toolbar expansion/collapse still needs a device test. Stable small-viewport sizing was preserved for the mobile hero.

The local preview uses disposable in-memory data, simulated identities and a localhost-only server. It does not verify real email delivery, real customer sign-in or production cloud configuration. Existing MFA/access controls were not weakened.

Preview: http://127.0.0.1:4190/
Admin: http://127.0.0.1:4190/admin/
Bidding: http://127.0.0.1:4190/bidding/?session=collection

## Heading and Notices polish

- Font preloads now cover server-rendered notices and vehicle details. Public hero content waits for its actual fonts before its first reveal; font failure and missing JavaScript retain readable fallback content. Only the homepage requests the wide logo display font.
- Public heroes reveal individual letters with a short masked sweep and a subtle lift. Supporting copy and buttons follow in sequence. Complete text is reserved from the start, and each heading keeps a coherent accessible name.
- Admin view headings and private bidding rooms use a faster reveal. Dashboard entrances begin after the welcome overlay clears; repeated tab changes cancel previous heading animations. Notice editor/list titles share the already loaded admin display font.
- Verified the live local Notices tab, rapid admin navigation, homepage, catalogue, vehicle detail, FAQ, purchase guide, notice list/detail and private bidding rooms. A browser sample over 80 animation frames showed 28 successive letter states (0–27), one constant heading height/position and loaded fonts throughout.
- Reduced-motion preview showed complete static headings and zero active animations. Phone-width headings fit without horizontal overflow.
