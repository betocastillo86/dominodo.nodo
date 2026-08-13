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
