# Dominodo Nodo — Architecture

> **Nodo** is the **per-tenant administration portal**: an Angular SPA that lets the administrators of a
> single residential complex (*conjunto residencial*) manage their community. It consumes the
> `dominodo.api` REST API **scoped to exactly one tenant**, resolved from the **domain** the user
> connects from.
>
> This is a high-level guide to how the portal is built and how to extend it. It captures the shape and
> the conventions, not every field and method — read the code for specifics. Keep it current as the
> portal grows. It is deliberately modeled on `dominodo.admin`'s architecture doc; the two portals share
> a stack and most conventions, and the **key difference is multi-tenancy** (see §4).

---

## 1. Purpose and scope

`dominodo.nodo` is the **tenant-facing** administration interface. Its users are the **administrators of
one conjunto** (`Administrador`, `AsistenteAdministracion` — `Tenant`-scoped roles). Unlike
`dominodo.admin` (the cross-tenant SuperAdmin panel), Nodo **always operates within a single tenant**:

- The tenant is **never chosen in the UI**. It is derived from the **domain/subdomain** the user opened
  (e.g. `los-almendros.nodo.dominodo.com` → slug `los-almendros`) and sent as the `X-Tenant` header on
  every request. A user who needs another conjunto changes domains; there is no tenant switcher.
- Access and data are **whatever that one tenant allows**. Fine-grained authorization is enforced
  **server-side** by permission (`requests.*`, `announcements.*`, …); the client mirrors those
  permissions to drive navigation and route guards, and treats a `403` as the source of truth.

**Planned initial modules:**

| Module | Purpose | Backend (domain model) |
| --- | --- | --- |
| **Authentication** | Login by phone + password; establishes a tenant-scoped session. | `Users` — `POST /auth/*` |
| **PQRS (Requests)** | See the requests created in this tenant, respond to and manage them simply. | `Operations.Request` (§3.1 of the domain model) |
| **Announcements** | Draft, publish and manage community announcements/boletín. | `Operations.Announcement` (§3.4) |

Future modules (memberships, deliveries, visits, settings) follow the same conventions described here.

---

## 2. Stack

Identical to `dominodo.admin` — keep them aligned so patterns, skills and muscle memory transfer.

- **Angular (v20+), standalone + signals** — no `NgModule`; `provideRouter`/`provideHttpClient`,
  **functional** interceptors and guards, `@if`/`@for`, `inject()`, `changeDetection: OnPush`.
- **Tabler** (`@tabler/core`, SCSS) as the global theme (Bootstrap 5, no jQuery). We use the
  **horizontal top-navbar layout** (not the sidebar layout `admin` uses) — see §5.
- **ng-bootstrap** for interactive components (dropdowns, modals, typeahead) on top of Tabler's CSS —
  Bootstrap's JS is not used.
- **`angular-tabler-icons`** for icons (every icon must be registered in `app.config.ts`).
- **State**: signals + services (`AuthStore`, `TenantStore`, `PermissionStore`, `data-access` services).
  No NgRx.
- **HTTP**: `HttpClient` + functional interceptors (tenant header, Bearer auth, ProblemDetails + refresh
  on 401).
- **Forms**: Reactive Forms. **JWT**: `jwt-decode` (client reads claims; verification is the server's job).
- **Install notes (inherited from `admin`):** a repo-root `.npmrc` with `legacy-peer-deps=true` (stale
  peer range in `angular-tabler-icons`, runtime-compatible); Tabler v1 uses legacy Sass `@import`, so
  build-time `@import` deprecation warnings are expected and originate in Tabler, not our code.

---

## 3. API contract

- **Base URL:** `http://localhost:5083/api/v1/` (configurable via `environment`). **Swagger:**
  `/swagger/index.html`.
- **Paged responses:** `PagedResult<T> = { items, page, pageSize, totalCount, totalPages }`.
- **Errors:** RFC 9457 `ProblemDetails` → `{ type, title, status, detail, errors?: [{ property, message }] }`.
- **Multi-tenancy (the defining trait):** **every** request carries `X-Tenant: <slug>`. The slug is
  resolved from the domain at bootstrap (§4). There is no cross-tenant read in this portal.
- **Auth:** `POST /auth/login` (`{phone,password}` → `{accessToken, refreshToken, expiresAt}`),
  `POST /auth/refresh`, `POST /auth/logout`. The JWT is **tenant-agnostic** and carries **no**
  permissions — the tenant comes from `X-Tenant`, and effective permissions for `(user, tenant)` are
  resolved server-side.

### 3.1 New endpoints this portal needs (proposed contracts)

Two reads do not exist in the API yet. They are documented here as the contract Nodo assumes; the API
team implements them. Until then, the client wires them behind a small adapter and can fall back to
defaults (branding) or a permissive stance (permissions) with a logged `TODO`.

**`GET /tenant/current`** — *the tenant bootstrap read.* **Anonymous** (`[AllowAnonymous]`) but
**scoped by `X-Tenant`** — it must work before login, because the login screen itself needs the tenant's
name, logo and colors. Returns only data that is **safe to be public per tenant**:

```jsonc
// 200 OK — resolved from the X-Tenant header
{
  "slug": "los-almendros",
  "name": "Conjunto Los Almendros",
  "type": "Conjunto",
  "status": "Active",
  "branding": {                    // from Tenant.Branding (json) — see domain model §2.1
    "logoUrl": "https://…",
    "primaryColor": "#206bc4",
    "loginText": "Bienvenido a la administración de Los Almendros"
  },
  "features": ["Requests", "Announcements"]   // enabled TenantFeature keys (§2.2) — gate nav
}
// 400 Tenant.Unknown  — unknown/suspended slug (middleware rejects before reaching the handler)
```

> Rationale for anonymous: the multi-tenancy design (`09-multitenancy.md`) explicitly supports anonymous
> endpoints that are still tenant-scoped by the slug. Branding on the login page is exactly this case.
> The endpoint must expose **nothing** that isn't already public.

**`GET /me/permissions`** — *the post-login authorization read.* Authenticated + `X-Tenant`. Returns the
**effective permissions** for `(current user, resolved tenant)` — the union described by
`IUsersModuleApi.GetEffectivePermissions` (domain model §1.8). Drives which nav items show and which
route guards pass. The server still enforces on every write; this read only shapes the UI.

```jsonc
// 200 OK
{ "permissions": ["requests.view", "requests.manage", "announcements.view", "announcements.create"] }
// 403 — the user has no membership in this tenant → Nodo shows a "no access to this conjunto" screen
```

### 3.2 Existing endpoints the initial modules consume

Tenant-scoped (all with `X-Tenant`), from the `Operations` module:

- **PQRS:** `GET /requests` (paged, filterable by status/type/priority/category/search),
  `GET /requests/{id}`, `PUT /requests/{id}`, `PUT /requests/{id}/status`,
  `POST /requests/{id}/participants`, and the timeline `POST /requests/{id}/updates`
  (`RequestUpdate` — progress/comment/evidence/resolution, `isInternal`).
- **Announcements:** `GET /announcements`, `GET /announcements/{id}`, `POST /announcements`,
  `PUT /announcements/{id}`, plus publish/archive status transitions.

> Verify exact routes and DTOs against live Swagger (`/swagger/v1/swagger.json`) before implementing a
> module. The domain model (`dominodo.api/docs/domain/00-domain-model.md`) is the source of truth for
> shapes; DTOs are typed **exactly** as the API returns them (camelCase), not renamed.

---

## 4. Multi-tenancy — the defining concept

This is the one part of Nodo that has **no analog in `dominodo.admin`**. Read `dominodo.api`'s
`docs/architecture/09-multitenancy.md` for the server side; below is the client contract.

### 4.1 Resolving the slug

The slug is resolved **once, at application bootstrap**, by a `TenantResolver`:

1. **Environment override (dev):** if `environment.defaultTenantSlug` is set, use it. This lets you
   develop on `localhost:4200` against a fixed tenant without DNS games.
2. **Subdomain (prod):** otherwise parse it from `window.location.hostname`. The **first label** of the
   host, minus the app's base domain, is the slug — `los-almendros.nodo.dominodo.com` → `los-almendros`.
   A configurable `baseDomain`/`ignoredHosts` list handles `www`, apex, and staging hosts.

Slugs are kebab-case (`^[a-z0-9-]+$`); the resolver normalizes and validates the candidate before use.

### 4.2 Sending the header

A **functional `tenantInterceptor`** attaches `X-Tenant: <slug>` to **every** request to `apiBaseUrl`
(including `/auth/*` and `/tenant/current`). It reads the slug from the `TenantStore` (a signal set once
at bootstrap). This is the client analog of pollaya's `x-site-domain` interceptor, adapted to Dominodo's
slug-based `X-Tenant` header.

### 4.3 Bootstrapping the tenant

At startup, **before rendering routes**, `provideAppInitializer` runs a `TenantBootstrap` step:

1. Resolve the slug (§4.1) and store it in `TenantStore`.
2. Call `GET /tenant/current` and store the tenant profile (name, branding, features) in `TenantStore`.
3. **Apply branding:** set `document.title`, the favicon, the Tabler primary color (CSS custom property),
   and expose `logoUrl`/`name` to the layout header and the login screen.
4. **Feature gating:** the enabled `features[]` decide which nav groups render (no `Announcements`
   feature → hide that section).

If the slug is unknown/suspended (`400 Tenant.Unknown`), Nodo renders a **standalone "conjunto not
found" page** instead of the app shell — there is nothing to log into.

### 4.4 `TenantStore`

A `providedIn: 'root'` signal store: `slug`, `tenant` (the `/tenant/current` DTO), `loading`, `error`,
and computed `hasFeature(key)`. It is read-only to features; only the bootstrap step writes it. It is
**not** re-resolved on navigation — the tenant is fixed for the lifetime of the tab.

---

## 5. Project structure

**Feature-first**, mirroring `dominodo.admin`'s `core` / `layout` / `shared` / `features` split. Each
feature separates `data-access` (services + models) from its presentation components and is
**lazy-loaded**. The **only structural differences** from `admin` are the added `core/tenant/` and a
`core/authz/` (permission store), and a **top-navbar `layout/`** instead of a sidebar.

```
src/app/
├── core/                # singletons & cross-cutting, no feature UI
│   ├── auth/               # service, store (signals), token storage, jwt util
│   ├── tenant/             # ← Nodo-specific: TenantResolver, TenantStore, TenantBootstrap, tenant.models
│   ├── authz/              # ← PermissionStore (effective permissions) + hasPermission helper
│   ├── http/               # tenant + auth + error interceptors (functional)
│   ├── guards/             # authGuard, tenantMemberGuard, permissionGuard(perm)
│   └── models/             # shared contracts (PagedResult, ProblemDetails)
├── layout/              # portal chrome — HORIZONTAL top-navbar layout
│   ├── shell/              # header + top navbar + <router-outlet>
│   ├── header/             # tenant logo/name (from TenantStore) + user menu (AuthStore)
│   └── navbar/             # horizontal menu; items filtered by PermissionStore + TenantStore.features
├── shared/ui/           # reusable presentational pieces (data-table, page-header, spinner, empty-state)
└── features/            # lazy domains, each with data-access/ + components
    ├── auth/               # blank layout → login (branded from TenantStore)
    ├── requests/           # PQRS: list (filters) + detail/manage page (edit, status, timeline, participants)
    └── announcements/      # list (filters) + create/edit form (draft/publish/archive)
```

- **`core/`**: single instances and cross-cutting concerns; no business UI. The tenant and authz stores
  live here because they are set once and read everywhere.
- **`layout/`**: the top-navbar chrome, kept separate from features. Branding is pulled from `TenantStore`;
  nav items are filtered by `PermissionStore`/features so users only see what they can use.
- **`shared/ui/`**: reusable Tabler-based pieces; the generic paged `DataTable` is the notable one
  (ported 1:1 from `admin` — copy it rather than reinvent).
- **`features/*`**: one isolated, lazy-loaded domain each; `data-access` decouples data from presentation.

---

## 6. Routing

Everything is lazy. Login lives in a **blank** layout (no shell), branded from `TenantStore`. All other
routes hang off the `ShellComponent` (top navbar) and are protected by `authGuard` + `tenantMemberGuard`;
individual modules add a `permissionGuard('requests.view' | 'announcements.view' | …)`. The shell defaults
to the PQRS list (the portal's primary job). The `400 Tenant.Unknown` bootstrap failure short-circuits
routing entirely (§4.3).

---

## 7. Feature patterns

Reference implementations that new features should mirror — the same CRUD template `admin` uses, so the
`domi-new-module` skill (see §11) applies here almost verbatim.

**Authentication.** `LoginComponent` (reactive phone + password) → `AuthService.login()`, which decodes
the JWT and stores the session in `AuthStore` (signals). Immediately after, it loads `GET /me/permissions`
into `PermissionStore` (so the nav renders correctly) and enters the portal. The login screen reads the
tenant name/logo/loginText from `TenantStore` for branding. `tenantInterceptor` adds `X-Tenant` on every
request; `authInterceptor` attaches the Bearer token (except `/auth/login`, `/auth/refresh`);
`errorInterceptor` attempts a single refresh-and-retry on 401 and maps `ProblemDetails` to messages.

**PQRS (Requests)** — the primary module. A **list** with server-side filters (status / type / priority /
category / free-text search) using the shared `DataTable`, and a **detail/manage page** at
`/requests/:id` that bundles the operations an administrator needs in one view:
- edit request fields (`PUT /requests/{id}`),
- advance the lifecycle status with an optional note (`PUT /requests/{id}/status`) — honoring the
  domain's state machine (`New → InReview → InProgress → Resolved → Closed`, plus `Rejected`/`Cancelled`/
  `Reopened`),
- post to the **timeline** (`RequestUpdate`: `Progress`/`Comment`/`Evidence`/`Resolution`, with an
  `isInternal` toggle for staff-only notes) — this is how an admin "responds",
- add a participant (`POST /requests/{id}/participants`) via an ng-bootstrap `NgbTypeahead` that searches
  the tenant's memberships server-side.

Because this portal is single-tenant, there is **no tenant filter and no slug-resolution dance** on the
detail page (contrast `admin`'s cross-tenant requests) — the `X-Tenant` header is already set globally.

**Announcements.** Standard list + single create/edit form. Fields per the domain model (§3.4): `title`,
`body`, free-form `category` (filterable), numeric `priority` (0 = highest), `audienceType`
(`AllTenant`/`ByTower`/`ByApartments`) with an `audienceFilter`, and `expiresAtUtc`. Status transitions
`Draft → Published → Archived` are actions on the form/list, not free-text fields. Publishing is what
triggers resident notifications server-side (via `Admin`), so the publish action deserves a confirm step.

The `DataTable` is generic and presentational: columns declared as data (value + optional badge/link
functions), server-side pagination via `PagedResult`, and it renders loading/error/empty states itself.

---

## 8. Authorization in the client (how permissions shape the UI)

The JWT carries no permissions and no tenant. The client's picture of "what can this admin do here" comes
entirely from `GET /me/permissions` (§3.1), cached in `PermissionStore`:

- **Navbar** items are filtered by `PermissionStore.has('…')` **and** `TenantStore.hasFeature('…')`.
- **Route guards**: `permissionGuard('requests.view')` etc. redirect to a "sin acceso" page when missing.
- **In-page affordances** (buttons like "Publicar", "Cambiar estado") are hidden/disabled by permission.
- **The server is still authoritative.** The UI is a convenience; a `403 ProblemDetails` is handled
  gracefully everywhere (surfaced, not swallowed). Never rely on hiding a button for security.

---

## 9. Conventions

Same as `dominodo.admin` — keep them identical so the skill and reviews transfer:

- **Standalone** components, `OnPush`, `inject()` (not constructor DI).
- Native `@if` / `@for` (no `*ngIf` / `*ngFor`). **Functional** guards/interceptors.
- kebab-case filenames; `.component.ts` / `.service.ts` / `.store.ts` / `.guard.ts` suffixes.
- DTOs typed **exactly** as the API returns them (camelCase); not renamed.
- **UI copy in Spanish**; code, identifiers, comments, and docs in **English**.
- List state lives in the `data-access` service as **signals** (`items`/`paging`/`loading`/`error`);
  write operations return **Observables** the component subscribes to and manages locally.
- Extend shared components (e.g. `DataTable`) only in a **backward-compatible** way (new inputs optional,
  defaults preserved).
- **Every `<tabler-icon name="x">` must have its `IconX` registered in `app.config.ts`** — unregistered
  icons render blank.

---

## 10. Verification

Following `admin`'s stance: **no unit tests, no automated test suite** — this is a deliberate, standing
decision by the owner. Do **not** write `.spec.ts` files, unit tests, integration tests, or add a test
runner (karma/jasmine/vitest/etc.) unless the owner explicitly asks. Verification is **manual** and every
change must `npm run build` with no type errors (Tabler Sass `@import` deprecation warnings are expected). A meaningful manual pass exercises the **tenant dimension**
explicitly, which `admin` cannot:

1. **Bootstrap:** load with `defaultTenantSlug` set → correct name/logo/colors on the login screen;
   unset the override and hit a real subdomain → same; hit an unknown slug → "conjunto not found" page.
2. **Header:** confirm every XHR carries `X-Tenant` (including `/auth/login` and `/tenant/current`).
3. **Auth:** login happy path + rejected credentials; a user with no membership in this tenant → 403 →
   "sin acceso" screen.
4. **Permissions:** a user missing `announcements.*` does not see the Announcements nav item and is
   redirected off its routes.
5. **Feature module** CRUD end-to-end, guard redirects, and `ProblemDetails` error mapping.

---

## 11. Recommended skills (for future feature work)

These are the Claude Code skills worth authoring in `.claude/skills/` once the scaffold exists. They are
described here (per the "docs only" scope) so the guidance is captured; create the files when you start
building modules. The first two are the payoff of keeping Nodo aligned with `admin`.

1. **`nodo-new-module`** — *scaffold a CRUD feature module.* A near-clone of `dominodo.admin`'s
   `domi-new-module` skill, adapted to Nodo's single-tenant reality. Same interactive contract-gathering
   (identity, operations, endpoints/DTOs, list filters, form rules), same Roles-style reference pattern
   (data-access signals + Observable writes, `DataTable` list, one create/edit form, `ProblemDetails`
   mapping, icon registration). **Adaptations:** no tenant filter/slug-resolution in components (the header
   is global); gate the new nav item by `PermissionStore` + `TenantStore.features`; add a
   `permissionGuard` to its routes. Reuse `admin`'s `domi-new-module/SKILL.md` as the base.

2. **`nodo-request-workflow`** — *PQRS-specific helper.* Encodes the `Request` lifecycle state machine and
   the `RequestUpdate` timeline semantics so status-transition UIs and "respond" flows are built
   consistently (valid transitions, internal-vs-public updates, participant management). PQRS is the
   portal's core module and has non-trivial rules worth codifying.

3. **`nodo-verify`** — *the manual verification checklist as a runnable skill.* Boots the API + `npm start`,
   walks the tenant-dimension checks in §10 (bootstrap under override vs subdomain, header presence,
   no-membership 403, permission-gated nav), and reports. Compensates for the no-tests policy.

4. **`nodo-api-contract`** — *sync client DTOs with Swagger.* Fetches `/swagger/v1/swagger.json`, diffs it
   against a feature's `data-access/*.models.ts`, and flags drift (renamed fields, new enums, changed
   nullability). Useful because DTOs are hand-typed to match the API exactly.

> Skills are optional accelerators, not architecture. Author them lazily — write `nodo-new-module` first
> (it pays back on module two), and the rest when the corresponding pain shows up.

---

## 12. Setup (when scaffolding begins)

```bash
ng new dominodo-nodo --style=scss --routing --ssr=false --directory .
npm i @tabler/core @ng-bootstrap/ng-bootstrap @popperjs/core angular-tabler-icons jwt-decode
```

- `app.config.ts` wires the router, `HttpClient` with the **three** interceptors (tenant → auth → error),
  the icons provider, and the **`provideAppInitializer` tenant bootstrap** (§4.3).
- `styles.scss` (Tabler + overrides) registered in `angular.json`; `environment.development.ts` sets
  `apiBaseUrl`, `baseDomain`, and `defaultTenantSlug` (dev override).
- Use the Tabler **top-navbar** layout HTML as the base for `layout/` (not the sidebar layout).
- A repo-root `.npmrc` sets `legacy-peer-deps=true`; Tabler v1 Sass `@import` deprecation warnings are
  expected and originate in Tabler.

---

## 13. Relationship to `dominodo.admin` (at a glance)

| Aspect | `dominodo.admin` (SuperAdmin) | `dominodo.nodo` (tenant admin) |
| --- | --- | --- |
| Tenant scope | **Cross-tenant**; picks tenant per action | **Single tenant**, fixed by domain |
| `X-Tenant` header | Only on tenant-scoped calls | **Every** call |
| Tenant chosen via | `?tenant=` query / dropdowns | **Domain/subdomain**, never in UI |
| Entry gate | `superAdminGuard` (role includes `SuperAdmin`) | `tenantMemberGuard` + per-module `permissionGuard` |
| Branding | Static (platform) | **Per-tenant**, loaded at bootstrap |
| Layout | Sidebar | **Top navbar** |
| Modules | Roles, Users, Tenants, Settings, Notifications, Requests, Announcements (all cross-tenant) | Auth, PQRS, Announcements (this tenant only) |

Everything not in this table is intentionally the same. When in doubt, do what `admin` does.
