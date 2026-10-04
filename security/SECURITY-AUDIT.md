# JHT Korea security review — 4 October 2026

## Current release decision

The original admin was a local design prototype, not a secured production admin. Its fake sign-in accepted any filled credentials, and its edits lived in browser storage. It could not change the shared public inventory. The production bundle now closes that prototype rather than implying that it protects real data.

A real server foundation and private Supabase database have been prepared, and the protected customer site is deployed on Netlify. The Netlify sign-in supports private invitations and MFA; inventory management remains closed until MFA is enrolled and independently activated and the inventory integration passes the release checks below. GitHub Pages retains the closed management page because it cannot run this server.

No system can guarantee zero attacks or zero risk. This review is a code/configuration review with targeted automated tests, not an independent penetration test or certification.

## Evidence and scope

| Check | Result |
| --- | --- |
| Original backend | No server, authentication provider or database existed in the site bundle. |
| Public credential collection | Removed the prototype credential form from the public release; the localhost design preview also no longer asks for real credentials. |
| Pattern scan | 47 deployed text files checked for common private key, GitHub token, Supabase secret, AWS key and JWT patterns; zero matches. This does not prove that every possible secret format is absent. |
| Image location metadata | 88 raster images checked with PIL; zero GPS EXIF records found. |
| Browser location | No geolocation calls found. The public business map is intentional customer information, not an administrator's device location. |
| Existing HTTPS | GitHub Pages enforces HTTPS and returns HSTS. |
| Original response protections | CSP, frame protection, MIME sniff protection, referrer restrictions and permissions restrictions were missing as HTTP headers. GitHub Pages cannot supply the full custom header configuration. |
| Repository | Public repository; GitHub secret scanning and push protection were enabled. |
| Database | New free project in Frankfurt; automatic table exposure OFF, automatic RLS ON. Live schema installed and checked: all six application tables have RLS; anonymous and ordinary authenticated roles have no table read/write grants. |
| Hosted access | Netlify production is public; previews are private. The sole invited account occupies slot 1 with management disabled. Public registration and anonymous sign-in are OFF; email confirmation is ON. |
| Server secrets | Hidden secrets saved for production only; preview, branch, runner and local-development values are unset. The free plan also makes production secrets readable by build/runtime code; this limitation was disclosed and approved. |
| Live negative checks | Anonymous and random-session admin calls returned 401; cross-origin mutation returned 403; one nonexistent-account login returned a generic 401 without a cookie. Backend source, migration, package manifest, environment file and audit-report URLs returned 404. |
| Dependency audit | Production dependency audit reported zero known vulnerabilities at review time. This is a point-in-time database check. |
| Automated verification | Token/role/MFA bypass, invitation abuse, CSRF, cookies, tamper detection, malformed data, build isolation and real PostgreSQL grant/session/rate-limit checks are covered by the repository tests. |

The old PHP site at jhtcar.com, provider employees, devices, recovery email security, hosting-account MFA, DNS registrar and third-party iframe internals were not audited. Current sample vehicle pages remain public static content; changing a prototype status does not revoke an existing static URL or previously downloaded photograph.

## Implemented controls

- No registration or role-change endpoint in the application. Two fixed database slots enforce at most two application administrators. No slot is provisioned by default.
- Provider-confirmed identity, current server-side session and current allowlist slot checked on every management request. Browser flags, hidden links and local storage confer no permission.
- Mandatory provider-verified AAL2 for inventory/homepage actions. A password-only session can only perform the restricted MFA bootstrap flow. Bootstrap slots remain disabled until an owner enables them out of band.
- Cryptographically random opaque session cookie; Secure, HttpOnly, SameSite=Strict and __Host- prefix. Provider tokens remain AES-GCM encrypted on the server, never in frontend storage.
- Fifteen-minute idle expiry and at most one-hour absolute expiry. Slot removal/disablement denies subsequent management requests; the private revocation function can invalidate all sessions for an account. Password reset alone must also trigger explicit session revocation.
- Exact production-origin checks for every mutation, JSON content requirements, bounded request bodies, no wildcard CORS and no trust in client-supplied administrator/IP headers.
- Durable login and MFA rate limits, generic sign-in errors, conservative failure when the provider/database/configuration is unavailable.
- Strict data allowlists, numeric ranges, safe asset paths and optimistic record versions. Unknown writable fields are rejected. Internal notes, private source data and location fields are discarded by public data normalization.
- RLS enabled, no browser-role policies/grants, RPC execution reserved to the server role and private schema inaccessible to browser roles. The provider service credential is privileged and must remain in the hosting function scope only.
- Management responses prevent caching and framing. Public HTML has a CSP with exact hashes for its boot scripts. Netlify supplies the HTTP protections static GitHub Pages cannot.
- Audit events omit passwords, tokens, device positions and raw IPs. Current audit events record attempts; successful/failed outcomes and alerting are still a release task.
- Static publishing is isolated to public-site; backend files, configuration, tests, dependency files and private values must never enter the public artifact.
- The optional host promotional script/badge is disabled. The real sign-in page loads only its own application script, with no analytics or advertising integrations.

## Required before opening the real admin

1. The sole account was explicitly selected and invited; no second slot is occupied, public signups are disabled and other sign-in providers remain disabled. Complete its password/MFA setup and independently verify the factor before any activation. Prefer passkeys/security keys for provider accounts; TOTP is supported by this application foundation.
2. Prefer credentials in Netlify **Functions only**, marked secret, for the production context. The current free plan locks specific scopes behind an upgrade. The alternative requires explicit approval for hidden production-only secrets, also readable by production build code. Preview deploys must receive no production secrets. Pin APP_ORIGIN to the production HTTPS domain; rotation must invalidate affected app sessions.
3. Connect the inventory workspace to the guarded API and complete production integration. The real sign-in/MFA interface is implemented; the local demo must not be enabled as a shortcut. Keep MFA enrollment/reset owner-controlled; provide a documented, independently verified recovery process with session revocation.
4. Connect public inventory to a safe published projection. Serve only appropriate vehicle fields/statuses. Sold, draft and archived vehicle URLs must return the selected unavailable/404 behavior at the server, with cache invalidation. Public photos are not secret, and already downloaded copies cannot be withdrawn.
5. Implement uploads through an authenticated server pipeline: JPEG/PNG/WebP only, inspect actual file type, size/pixel/count limits, decode and re-encode, strip metadata, reject SVG/HTML, use random immutable filenames, prohibit executable storage and authorize deletion. Frontend upload checks alone are insufficient. Upload endpoints remain closed in this foundation.
6. Test the deployed system: anonymous calls, forged/expired token, password without MFA, third account, disabled slot, MFA replay, cross-site requests, malformed/oversized bodies, stale versions, provider outage, cookie flags, headers, upload abuses and hidden-status URLs. Verify that no token or password appears in network responses, logs or artifacts.
7. Turn on MFA for GitHub, Netlify, Supabase and the registrar; review recovery access and team membership. Protect the production branch, require review/checks and prevent untrusted pull-request builds from receiving secrets. Restrict deploy access because deploy access can replace the authentication code.
8. Configure alerts, resource limits and abuse protection, plus an incident procedure and tested database/media backup restoration. Free tier provision is not a backup/SLA guarantee; account limits and pricing can change. Use independent encrypted exports if the chosen plan lacks suitable backups.
9. Arrange an independent security review before managing valuable inventory or customer information. Keep dependencies updated and rerun security tests for authorization and upload changes.

## Remaining limitations

- Twenty automated tests pass. The deployed negative tests above pass. The live provider confirms that the invited account's TOTP factor is verified. A bootstrap bug that excluded unverified factors was fixed and given a regression test. The status screen now distinguishes completed authentication from inventory management that is still closed. No password or authenticator secret has been requested through chat.
- Vehicle uploads, published database inventory, new dynamic vehicle detail URLs, live sold/archive removal, recovery and complete audit outcomes are not delivered by this security foundation. The customer site still uses static sample content. Their implementation and deployment tests are required before opening management.
- The provider's direct authentication endpoints also exist. Application rate limits do not replace provider abuse controls; Supabase has its own endpoint limits. Review/tighten those controls and add bot protection as appropriate before release.
- Hosting-account MFA, branch protection, backups/restoration and alerting have not been fully verified. The app's MFA does not protect a compromised hosting or repository owner account.
- Free Netlify scope restrictions are broader than Functions only. Production code and the account owner can access server secrets. Preview environments receive none; do not add unreviewed production build integrations.

## Architecture

Customer browser → public website → safe published inventory only.

Administrator browser → same-origin Netlify server → Supabase Auth + private database.

The admin UI may be publicly reachable as a sign-in page; that is normal. Actual security is in server authorization, MFA and database permissions. Public API URLs are also normal; privileged responses and operations must be inaccessible without authorization. Hiding a URL or API key is not an access-control design.

## Primary references

- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Netlify response headers](https://docs.netlify.com/manage/routing/headers/)
- [Supabase provider rate limits](https://supabase.com/docs/guides/auth/rate-limits)
