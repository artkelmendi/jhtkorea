"""Idempotent hardening for the two generated static bundles; no secrets emitted."""
import base64
import hashlib
import re
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
for name in ('dist', 'jhtkorea'):
    bundle = ROOT / name
    shutil.copyfile(ROOT / 'security/security-data.js', bundle / 'security-data.js')
    catalogue = bundle / 'catalogue.js'
    script = catalogue.read_text(encoding='utf-8')
    script = script.replace('cars=await r.json();', 'cars=window.JHTSecurity.vehicles(await r.json());')
    # The optional browser automation tool isn't required by this catalogue.
    script = re.sub(r'^if\(document\.modelContext\?\.registerTool\).*$', '', script, flags=re.M)
    catalogue.write_text(script, encoding='utf-8')
    for page in bundle.rglob('*.html'):
        html = page.read_text(encoding='utf-8')
        if name == 'dist' and page == bundle / 'admin/login/index.html' and '      <form' in html:
            html = html[:html.index('      <form')] + '''      <div class="login-heading"><span>JHT Korea Admin</span><h2>Design preview.</h2><p>This is a local prototype. No passwords or personal information are collected.</p></div>
      <a class="sign-in" href="../">Open local preview</a>
      <div class="preview-note"><p><strong>Production access is closed</strong><span>Verified administrator membership and MFA must be active before management opens.</span></p></div>
    </section>
  </main>
</body></html>
'''
        if 'catalogue.js' in html and 'security-data.js' not in html:
            prefix = '/jhtkorea/' if name == 'jhtkorea' else '/'
            html = re.sub(r'(<script\b[^>]*src=[\"\'][^\"\']*catalogue\.js)', f'<script defer src="{prefix}security-data.js?v=1"></script>\\1', html, count=1)
        html = re.sub(r'<meta\b(?=[^>]*(?:http-equiv=[\"\']Content-Security-Policy|name=[\"\']referrer))[^>]*>', '', html, flags=re.I)
        inline = re.findall(r'<script\b(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, flags=re.S|re.I)
        hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() + "'" for s in inline)
        admin = 'admin' in page.relative_to(bundle).parts
        if admin:
            policy = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'"
            referrer = 'no-referrer'
        else:
            policy = f"default-src 'none'; script-src 'self' {hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; media-src 'self'; connect-src 'self'; frame-src https://www.google.com https://www.youtube-nocookie.com; base-uri 'none'; form-action 'self'; object-src 'none'"
            referrer = 'strict-origin-when-cross-origin'
        meta = f'<meta http-equiv="Content-Security-Policy" content="{policy.strip()}"><meta name="referrer" content="{referrer}">'
        # Place CSP after charset and before any script is parsed.
        html = re.sub(r'<meta\b[^>]*charset[^>]*>', '', html, flags=re.I)
        html = re.sub(r'(<head\b[^>]*>)', '\\1<meta charset="utf-8">' + meta, html, count=1, flags=re.I)
        page.write_text(html, encoding='utf-8')
print('Hardened both bundles. Local admin remains a sample-only prototype; public admin is closed.')
