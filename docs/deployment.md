# Deployment — Dominodo Nodo (FTP to Windows/IIS)

`dominodo.nodo` deploys the same way as `dominodo.admin`: an **Azure DevOps** pipeline builds the
right Angular configuration per branch and uploads the static bundle over **FTP** to Windows/IIS
hosting. There is no GitHub Actions workflow and no build-time URL string injection — the API URL and
tenant config are selected purely by Angular `fileReplacements`.

## Environments

| Environment | Branch    | Build config | Angular env file             | Variable group        |
|-------------|-----------|--------------|------------------------------|-----------------------|
| prod        | `main`    | `production` | `environment.ts`             | `dominodo-nodo-prod`  |
| stage       | `develop` | `stage`      | `environment.stage.ts`       | `dominodo-nodo-stage` |

- **Branch → env mapping:** `main` → prod, `develop` → stage.
- Push to `develop` deploys stage; push to `main` deploys prod. No manual build/upload.

## Build configurations

Selected purely by `--configuration` (no `sed`/token injection):

```bash
npm run build:prod     # ng build --configuration production  → environment.ts
npm run build:stage    # ng build --configuration stage       → environment.stage.ts
```

Both emit to **`dist/dominodo-nodo/browser`** (the FTP upload root).

Each environment file carries **both** the API URL and the multi-tenancy config the app needs to
resolve the tenant from the domain at bootstrap:

- `apiBaseUrl` — per-env API base (`/api/v1`).
- `baseDomain` — the base domain whose first subdomain label is the tenant slug
  (e.g. `los-almendros.<baseDomain>` → `los-almendros`).
- `defaultTenantSlug` — `null` in stage/prod (resolve from the domain); only set on `localhost`/dev.
- `ignoredHosts` — hosts that are not tenant subdomains (`www`, `localhost`).

> ⚠️ Because the tenant is resolved from the subdomain, each environment must set the **correct
> `baseDomain`**. A wrong `baseDomain` breaks tenant resolution even if `apiBaseUrl` is correct.

### Placeholders to fill once the API is deployed

- `src/environments/environment.ts` → prod `apiBaseUrl` + prod `baseDomain`.
- `src/environments/environment.stage.ts` → stage `apiBaseUrl` (`app-dominodo-api-stage.azurewebsites.net`)
  + stage `baseDomain` (`nodo-stage.dominodo.com`).

## IIS SPA fallback — `public/web.config`

`public/web.config` is copied to the deploy root (`dist/dominodo-nodo/browser/web.config`) by the
existing `angular.json` assets rule. It rewrites any non-file, non-`/api/` request to `/index.html`
so deep-link reloads (e.g. `/requests/123`) resolve to the SPA instead of a 404, and maps
`.json` / `.webmanifest` MIME types. The same deployed bundle serves every tenant subdomain.

## Cache strategy — why a deploy is visible immediately

**The problem this solves.** The hosting applies `Cache-Control: max-age=31536000` (one year) to
every static file it serves, `index.html` included — verifiable with
`curl -sSI https://<host>/ | grep -i cache-control`. A browser therefore never revalidates
`index.html`, and a stale `index.html` keeps referencing the **previous** build's hashed bundles,
which are still on disk (`clean: false`). Everything loads fine and the new release is simply never
picked up, for days. This is exactly the symptom users reported: "I have to clear my cache to see
the changes".

`public/web.config` fixes it by carving out one exception:

| Resource | `Cache-Control` | Why |
| --- | --- | --- |
| `index.html` (and every SPA-rewritten route) | `no-cache` + `Expires: -1` | It is the pointer to everything else — always revalidate it (a cheap `304` when unchanged) |
| `*-<hash>.js`, `*-<hash>.css` | `max-age=31536000` | Content-addressed by `outputHashing: "all"`; a new build emits new filenames |
| `favicon.ico` | `max-age=86400` | Copied verbatim from `public/`, so **not** hashed |

Implemented with `<staticContent><clientCache>` for the 1-year default and
`<location path="index.html">` with `cacheControlMode="DisableCache"` for the exception. `<location>`
config is resolved *after* the URL Rewrite module runs, so it covers SPA deep links too, not just a
literal request for `/index.html`.

> WARNING: the 1-year default is only safe because **every** JS/CSS filename is content-hashed. If
> `outputHashing` is ever turned off, or an unhashed file is added to `public/`, it gets cached for a
> year — give it its own `<location>` block. Today the only unhashed files in the deploy root are
> `index.html`, `favicon.ico` and `web.config` (IIS never serves the last one).

**Nothing else is needed.** Cloudflare fronts the site but returns `cf-cache-status: DYNAMIC` for
HTML — it does not cache it — and the hashed bundles change filename every release, so there is
nothing to purge. No pipeline change, no cache-busting query strings, no edge rules.

### Version stamping and the "new version available" banner

The `no-cache` on `index.html` only kicks in when the browser asks for it again — a reload, or
reopening the tab. A tab left open all afternoon never does, because Angular swaps components on
route changes without reloading the document. These pieces close that gap:

| Piece | What it does |
| --- | --- |
| `src/app/core/version/app-version.ts` | `APP_VERSION` placeholder compiled **into the bundle** |
| `public/version.json` | the same placeholder, published as a **separate file** at `/version.json` |
| `Stamp build version` pipeline step | one `sed` replaces `___buildid___` with `$(Build.BuildId)` in **both**, before `ng build` |
| `core/version/version-check.service.ts` | polls `/version.json` every 5 min (and on tab focus) and compares it to `APP_VERSION` |
| `shared/ui/version-banner/` | renders the "Actualizar ahora" prompt when they differ |

Because a single pipeline run stamps both files with the same id, the bundle knows which release it
is and the server publishes which release is current — a mismatch means a deploy happened since the
tab was opened.

Notes:

- `version.json` gets its own `<location>` block with `DisableCache` in `web.config`. Without it the
  poll would read a cached copy and report the old release forever.
- The check uses `fetch`, not `HttpClient`, on purpose: `errorInterceptor` turns failed requests into
  user-facing error toasts, and a background poll must stay silent when the user is offline.
- The banner **prompts**, it does not auto-reload — a forced refresh would discard a half-written form.
- Local dev builds never run the stamp step, so the placeholder survives; `IS_VERSION_STAMPED` detects
  that, skips the polling entirely, and the header shows `vdev`.
- The running version is shown in the header next to the user menu, so a user reporting a bug can say
  which build they are on.

### Verifying after a deploy

```bash
HOST=https://<tenant>.nodo.dominodo.com
curl -sSI "$HOST/"         | grep -i cache-control   # expect: no-cache
curl -sSI "$HOST/requests" | grep -i cache-control   # expect: no-cache (SPA rewrite path)

ASSET=$(curl -sS "$HOST/" | grep -o 'main-[A-Za-z0-9]*\.js' | head -1)
curl -sSI "$HOST/$ASSET"   | grep -i cache-control   # expect: max-age=31536000
```

If `/` still shows `max-age=31536000`, the `web.config` did not take effect — check that it reached
the deploy root and that the site returns 200 and not a `500.19` configuration error.

Cloudflare caches **per hostname**, so run the checks on at least two tenant subdomains (the tenant
dimension from `architecture.md` §10).

## Pipeline — `pipelines/build-ftp-pipeline.yaml`

Azure DevOps YAML:

1. Resolves a **variable group** by branch (`dominodo-nodo-prod` for `main`,
   `dominodo-nodo-stage` for `develop`) and sets `BUILD_CONFIG`.
2. `NodeTool@0` (Node 20) → `npm ci` (respects `.npmrc legacy-peer-deps=true`).
3. `npx ng build --configuration $(BUILD_CONFIG)`.
4. `FtpUpload@2` from `dist/dominodo-nodo/browser` to `$(FTP_REMOTE_DIR)`.

### Variable groups (Pipelines → Library — never in git)

Both `dominodo-nodo-prod` and `dominodo-nodo-stage` must define:

| Key             | Notes                                             |
|-----------------|---------------------------------------------------|
| `FTP_HOST`      | e.g. `ftp://winXXXX.site4now.net/`                |
| `FTP_USERNAME`  |                                                   |
| `FTP_PASSWORD`  | mark **secret**                                   |
| `FTP_REMOTE_DIR`| e.g. `/dominodonodo/` (prod), `/dominodonodo-stage/` (stage) |

Stage and prod may share one FTP account with different folders, or use separate accounts — no YAML
change needed either way.

### One-time Azure DevOps setup (outside the repo)

1. Create the two variable groups above.
2. Create the pipeline from the GitHub repo (`betocastillo86/dominodo.nodo`) pointing at
   `pipelines/build-ftp-pipeline.yaml` via a GitHub service connection.
3. Ensure both `main` and `develop` branches are published (the trigger has no source otherwise).

## Cross-repo prerequisite — CORS

Before login works cross-origin, the API's `cors_allowed_origins` must include the stage/prod nodo
front-end URLs (including tenant subdomains / a wildcard). This is a `dominodo.api` action, out of
scope here, but a hard prerequisite for a green login.
