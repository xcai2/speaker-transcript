# Deploying Timbrio

The app is static files — no build step, no server. Any static host works.

## Option A — free subdomain (no purchase)

```bash
npx netlify-cli deploy --prod
```

Opens a browser to authorise, then asks for a site name. Enter `timbrio` and the site
is live at `https://timbrio.netlify.app`. Vercel works the same way (`npx vercel --prod`).

## Option B — your own domain (like example.app)

1. **Buy the domain.** [Porkbun](https://porkbun.com) and [Namecheap](https://www.namecheap.com)
   are the usual choices. Rough yearly prices: `.com` ~$11, `.app` ~$14, `.io` ~$35,
   `.ai` ~$70. `.app` is on the HSTS preload list, so it is https-only by default —
   good for a tool that handles microphone input.

2. **Point it at the host.** In Netlify: *Site settings → Domain management → Add domain*.
   Netlify shows the DNS records to create; add them at the registrar. Two options:
   - **Nameservers** (simplest): change the registrar's nameservers to Netlify's.
   - **Records**: add `A @ 75.2.60.5` and `CNAME www <site>.netlify.app`.

3. **Wait for DNS**, usually minutes, occasionally up to a day. Netlify issues a
   Let's Encrypt certificate automatically once the domain resolves.

4. **Update the links** in `README.md` to the new address.

## Notes

- `netlify.toml` sets `Cache-Control: no-cache` on `index.html`. The modules are versioned
  by content but the HTML is not, and a stale `index.html` paired with fresh JS has broken
  the page before — a element the new code expects simply is not there.
- GitHub Pages can also take a custom domain (*Settings → Pages → Custom domain*), but it
  requires a `CNAME` file in the repo and still serves from the same repository.
