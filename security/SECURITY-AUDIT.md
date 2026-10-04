# JHT Korea security and release review — 4 October 2026

## Live release

The Netlify customer site and database-backed management workspace are deployed at https://jht-korea.netlify.app/. Supabase contains 14 imported sample cars, their five-photo galleries and one historical shipping notice. The sole selected administrator occupies slot 1, is enabled, has a provider-verified TOTP factor, and has completed MFA setup; further enrollment is disabled. The user confirmed seeing the real dashboard after sign-in. No second administrator is enabled and public signup remains disabled.

GitHub Pages remains a separate static demonstration with management closed. It cannot execute this backend or automatically reflect database edits. The older localhost admin is a design prototype. The Netlify release uses protected APIs rather than browser inventory storage.

This is a targeted code/configuration review with automated and live checks, not an independent penetration test or a guarantee of zero vulnerabilities.

## Delivered management

Brand/model selectors reuse existing inventory values and support new versions and custom brands. Public model options belong only to the selected brand’s visible inventory. An enabled MFA-verified session reveals a Dashboard shortcut. The featured vehicle has its own section immediately before Our Story; selecting it never changes the video hero.

- Create and update vehicles, specifications, USD prices and galleries; reorder photos and select a cover.
- Available/reserved listings are public; sold, draft, archived and deleted detail URLs return HTTP 404. Existing downloaded images or older static demo copies cannot be recalled.
- Archive or permanently delete a record with confirmation and version checks. Concurrent stale changes are rejected rather than silently overwritten.
- Set an available featured vehicle, its price/label presentation, and automatic or manually ordered latest arrivals on the homepage. The video hero remains unchanged. These changes require no redeploy and appear when customers load or refresh the page.
- Create, edit, publish, unpublish and delete plain-text notices, with live list/detail routes.
- A short welcome animation after authorised sign-in; reduced-motion preferences respected.

## Authentication and authorization

Provider-confirmed identity, current opaque server session, enabled database slot and MFA AAL2 are checked for every management request. Client flags and hidden links grant no access. Two fixed database slots cap access at two administrators; only one is configured. No public registration or role-change application endpoint exists. Pre-MFA access is restricted to approved authentication bootstrap operations.

Session cookies are random, host-only, Secure, HttpOnly, SameSite=Strict and use the __Host- prefix. Provider tokens are AES-GCM encrypted server-side and never stored in browser local storage. Sessions expire after 15 minutes of inactivity or one hour total. Disabling a slot blocks future requests; owner-side revocation can invalidate its sessions. Password recovery must also revoke existing sessions.

Mutations enforce the exact production origin, request MIME and bounded body size. There is no wildcard CORS. Durable login, MFA, management and upload throttling is implemented; the function also declares hosting IP limits. Application limits do not replace Supabase's direct authentication endpoint limits. Host-enforced rate limits were not stress-tested on production.

## Database, uploads and public output

Live SQL inspection confirmed all eight application tables have RLS enabled and no SELECT/INSERT/UPDATE/DELETE grants for anonymous or ordinary authenticated browser roles. Private-schema access and privileged RPCs are server-only. Automatic table exposure is off. The service credential remains privileged and must stay in trusted server/build infrastructure.

The live photo bucket is private, accepts only image/webp and caps processed objects at 2 MB. Authenticated uploads accept up to twelve photos per listing, each input under 4 MB. The server checks JPEG/PNG/WebP signatures, decodes with pixel/dimension limits, rejects executable formats, strips original metadata and re-encodes WebP at up to 1800 pixels. New files use random immutable names. Browser checks supplement server validation.

A photo becomes publicly retrievable only when referenced by an available/reserved vehicle. Otherwise preview requires full administrator authorization. Unreferenced objects are retained privately; scheduled cleanup and storage retention remain operations work. Existing sample photos are bundled public assets and do not become private by hiding a record.

Public catalogue output is an explicit field projection: internal source data, arbitrary payload fields, owners and tokens are omitted. Text and notice HTML are escaped; arbitrary rich HTML/scripts are not supported. Sensitive API/media/detail responses prevent caching. Server-rendered car pages include every saved gallery image and consult current status. The static public build excludes obsolete detail directories and catalogue JSON, preventing a stale static route from bypassing status checks.

## Hosting and secret handling

Netlify supplies CSP, HSTS, no-sniff, framing/referrer/permissions protections; admin responses are non-cacheable. The public artifact excludes backend code, migration files, tests, dependency manifests and credentials. The real login page loads its own scripts, without advertising or analytics. No device geolocation is collected; the public business map is intentional.

Secrets are hidden and set only for production. The free Netlify plan also makes them readable by production build/runtime code; they are not Functions-only. Preview, branch, runner and local-development contexts receive none. A compromised hosting/repository owner or unreviewed production build can replace the security code or read secrets, so owner account protection is essential.

## Verification evidence

- 24 automated tests pass, including real PostgreSQL role grants, session/rate limits, CRUD, stale versions, homepage references, notice escaping, hidden-status routes and media access.
- Image pipeline tests reject spoofed/executable input and excessive pixels and confirm original metadata removal. Production dependency audit reported zero known vulnerabilities at review time.
- Isolated browser tests verified gallery ordering/price saves, featured/manual-arrival saves and rendering, and notice saves. These used a local fixture, not a real provider identity.
- Netlify published the live integration and template-bundling fix. Live catalogue returns 14 cars; every one of the 14 detail URLs returns HTTP 200 and all five expected photos. Browser gallery navigation and image loading passed. Notices list/detail return 200; unknown car returns 404.
- Live anonymous vehicle/homepage/notice management calls return 401; cross-origin mutation returns 403; stale cars.json and backend source URLs return 404. Private bucket and eight-table grants were independently checked in the cloud dashboard.
- The owner confirmed the authenticated dashboard. A real authenticated production photo upload and complete browser mutation journey have not been independently exercised by the assistant; the server and UI paths were covered in automated/local checks. No authentication bypass was used for testing.
- Attempt and successful write events are audited without passwords, tokens, exact device positions or raw IPs. Comprehensive failure reporting and alerting remain incomplete.

## Remaining work and limits

Story, services, FAQ, purchase guide, business contact details, video and general layout are source-controlled, not editable through this inventory admin. This is not a visual page builder, checkout/payment platform or customer-account system.

Before relying on it for valuable live inventory: review imported sample prices/availability and historical notices; attach the final domain and update allowed origin/invitation URLs together; establish tested database/media backup restoration, retention/cleanup, monitoring, account recovery and an incident procedure. Independently verify MFA/recovery and team membership on GitHub, Netlify, Supabase and the registrar; protect production changes and review dependencies. Resource quotas and free-plan terms require ongoing review. No paid upgrade was purchased.

The previous PHP site, provider infrastructure, account-owner devices, email security, registrar and third-party iframe internals were not audited. An independent security review is still appropriate; automated tests cannot prove absence of vulnerabilities.

## Architecture

Customer browser → Netlify public website → safe published database projection.

Administrator browser → same-origin protected Netlify functions → Supabase Auth, private database and private photo storage.

A publicly reachable login screen and public API URLs are normal. Security comes from server authorization, MFA and database grants, not secret URLs.

## Primary references

- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Netlify headers](https://docs.netlify.com/manage/routing/headers/)

## Prepared, not enabled

Optional eight-hour trusted-device sessions are implemented and tested in the local source but are not deployed or enabled. The separate live permission confirmation remains pending. Production retains its 15-minute idle and one-hour maximum sessions.
