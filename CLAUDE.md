# Dominodo Nodo — CLAUDE.md

Angular SPA: the Dominodo **per-tenant administration portal**. Administrators of a single conjunto
manage their community here (PQRS, announcements). Consumes `dominodo.api` **scoped to one tenant**,
resolved from the **domain**. Full design: `docs/architecture.md`.

> Modeled 1:1 on `dominodo.admin` (same stack + conventions). The **one big difference is multi-tenancy**:
> this portal is bound to a single tenant resolved from the domain, and sends `X-Tenant` on every request.
> When a decision isn't covered here, **do what `dominodo.admin` does.**

## Stack
- **Angular 20+**, **standalone components + signals**. No `NgModule`. Functional guards/interceptors.
- **Tabler** (`@tabler/core` v1, SCSS) for the theme — **horizontal top-navbar layout** (not `admin`'s sidebar).
- **ng-bootstrap** (`^19`) for interactive components (no jQuery, no Bootstrap JS).
- `angular-tabler-icons` for icons; `jwt-decode` for reading JWT claims.
- State: signals + services (no NgRx). Forms: Reactive Forms.
- **Install note:** `.npmrc` sets `legacy-peer-deps=true` (stale peer range in `angular-tabler-icons@3.26`,
  runtime-compatible with Angular 20). Tabler v1 uses Sass `@import` → expect deprecation warnings from Tabler.

## Commands
- `npm start` — dev server at `http://localhost:4201` (4201, not 4200, to avoid clashing with `admin`).
- `npm run build` — production build (must pass with no type errors before any change is done).
- `npm run build:prod` — prod bundle (`main` branch / prod env). `npm run build:stage` — stage bundle (`develop` branch / stage env).
- API base URL + tenant config live in `src/environments/` (`environment.ts` = prod, `environment.stage.ts` = stage, `environment.development.ts` = dev).
- API Swagger: `http://localhost:5083/swagger/index.html`.
- Deployment: Azure DevOps FTP pipeline (`pipelines/build-ftp-pipeline.yaml`) → Windows/IIS. See `docs/deployment.md`.
- **Caching (do not regress):** the hosting caches every static file for a year, so
  `public/web.config` carves out `index.html` as `no-cache` — otherwise deploys stay invisible to
  users for days. Never add an unhashed file to `public/` without its own `<location>` block.

## Testing
- **No unit tests. No automated test suite** (same policy as `admin`). This is a deliberate, standing
  decision — do **not** write `.spec.ts` files, unit tests, integration tests, karma/jasmine, or any test
  runner, and do not add one unless the owner explicitly asks. Verification is **manual** — see
  `docs/architecture.md` §10 (exercise the **tenant dimension**).

## Multi-tenancy (read this before touching HTTP or bootstrap)
- The tenant is resolved **once at bootstrap** from the domain and never chosen in the UI:
  - **dev:** `environment.defaultTenantSlug` forces a fixed tenant on `localhost`.
  - **prod:** first subdomain label minus `baseDomain` (e.g. `los-almendros.nodo.dominodo.com` → `los-almendros`).
- `tenantInterceptor` sends `X-Tenant: <slug>` on **every** API request (including `/auth/*`).
- `provideAppInitializer` runs the tenant bootstrap: resolve slug → `GET /tenant/current` → store profile
  in `TenantStore` → apply branding (title/favicon/primary color/logo) + feature gating.
- Unknown/suspended slug (`400 Tenant.Unknown`) → standalone "conjunto not found" page, no shell.
- See `docs/architecture.md` §4 and `dominodo.api/docs/architecture/09-multitenancy.md`.

## Structure (`src/app/`)
- `core/` — singletons & cross-cutting, no feature UI: `auth/`, **`tenant/`** (resolver, `TenantStore`,
  bootstrap), **`authz/`** (`PermissionStore`), `http/` (tenant + auth + error interceptors), `guards/`,
  `models/`, `notifications/` (signal-based notification bus).
- `layout/` — top-navbar chrome: `shell/`, `header/` (branding + user menu), `navbar/` (permission/feature-filtered).
- `shared/ui/` — reusable presentational pieces: `data-table/` (generic paged table, ported from `admin`),
  `page-header/`, `spinner/`, `empty-state/`, `notifications/` (toast host rendering the bus).
- `features/<name>/` — lazy-loaded domains; each splits `data-access/` (services + models) from components.
  Initial: `auth/`, `requests/` (PQRS, the core module), `announcements/`.
- **Deploy artifacts:** `public/web.config` (IIS SPA fallback, copied to build root) and
  `pipelines/build-ftp-pipeline.yaml` (Azure DevOps FTP pipeline).

## Conventions
- `changeDetection: OnPush`; `inject()`, not constructor DI.
- Native control flow `@if` / `@for` (never `*ngIf` / `*ngFor`).
- kebab-case filenames; suffixes `.component.ts` / `.service.ts` / `.store.ts` / `.guard.ts`.
- DTOs typed exactly as the API returns them (camelCase); do not rename.
- List state = signals in the `data-access` service; writes return Observables the component manages.
- **UI copy in Spanish**; code, identifiers, comments, and docs in English.
- Every `<tabler-icon name="x">` needs its `IconX` registered in `app.config.ts` — else it renders blank.

## API contract (essentials)
- Base URL: `http://localhost:5083/api/v1`. **Every** call sends `X-Tenant: <slug>`.
- Auth: `POST /auth/login {phone,password}` → `{accessToken, refreshToken, expiresAt}`;
  `POST /auth/refresh {token}`; `POST /auth/logout {token}`. JWT is tenant-agnostic, carries no permissions.
- **Bootstrap/authz reads:**
  - `GET /auth/current` (authenticated, X-Tenant-scoped) ✅ **implemented** → `{ user, permissions[],
    memberships[] }`. `PermissionService.load()` consumes it after login and at startup (`authBootstrap`,
    an app initializer run after the tenant bootstrap). Fills `PermissionStore` (permissions), derives
    `noMembership` from the Active membership, and enriches `AuthStore` (name/email/role). No permissive
    fallback — fails closed on error. (Replaced the originally-proposed `GET /me/permissions`.)
  - `GET /tenant/current` (anonymous, X-Tenant-scoped → branding + features) — client still keeps a
    graceful fallback: 404/network → default branding + all features on (logged TODO); genuine
    `400 Tenant.Unknown` → not-found page. Remove the fallback once confirmed stable.
- PQRS/announcements: `GET/PUT /requests*`, `GET/POST/PUT /announcements*` (verify against Swagger).
- Paged: `PagedResult<T> = { items, page, pageSize, totalCount, totalPages }`.
- Errors: RFC 9457 `ProblemDetails` — `{ type, title, status, detail, errors? }`.

## Authorization in the client
- The JWT has no permissions. `GET /auth/current` → `PermissionStore` drives nav, guards, and buttons.
- Guards: `tenantResolvedGuard` (tenant resolved at bootstrap → else `/conjunto-no-encontrado`) +
  `authGuard` (valid session) + `tenantMemberGuard` (has an Active membership → else `/sin-acceso`) +
  per-module `permissionGuard('requests.view' | 'announcements.view' | …)`.
  Announcement write actions (edit/publish/archive) all require `announcements.edit`.
- The **server is authoritative**; hiding a button is UX, not security. Handle `403 ProblemDetails` gracefully.

## Docs
- `docs/architecture.md` — authoritative architecture, structure, multi-tenancy, API contract, and the
  list of recommended future skills (§11).
- `docs/deployment.md` — FTP deployment model: environments, branch→env mapping, build configs,
  `web.config`, the **cache strategy**, the Azure DevOps pipeline, and the two variable groups.
