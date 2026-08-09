# Deploying Timbrio

The app is static files — no build step, no server. It is served by **GitHub Pages** from
the `main` branch at <https://xcai2.github.io/timbrio/>.

## Publishing a change

```bash
git add -A
git commit -m "…"
git push
```

Pages rebuilds automatically, usually within a minute. Check the build:

```bash
gh api repos/xcai2/timbrio/pages/builds/latest --jq '.status'
```

## After deploying

Hard-refresh once (**Cmd+Shift+R** / **Ctrl+F5**). The JavaScript modules and `index.html`
are cached independently, and a stale `index.html` paired with fresh modules has broken the
page before — the new code looked for an element the cached HTML did not have. The code now
guards those lookups, but a hard refresh is still the quickest way to be sure.

## What is published

Everything tracked in git. Recordings, transcripts, `.env` and `PLAN.md` are gitignored and
stay local — confirm with `git status --porcelain` before pushing.

## Using a custom domain later

Buy a domain (~$11–15/year for `.com` or `.app`), then *Settings → Pages → Custom domain*.
GitHub writes a `CNAME` file into the repo and issues an HTTPS certificate once DNS resolves.
At the registrar, point the apex record at GitHub's IPs (`185.199.108–111.153`) and `www` at
`xcai2.github.io`. `.app` is HTTPS-only by default, which suits a page that needs microphone
access.
