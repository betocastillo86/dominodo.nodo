# Dominodo Nodo — Foundation Scaffold Plan

**Generated:** 2026-07-28
**Scope:** Foundation only (no business features). Init + tooling → core (tenant bootstrap + auth + authz + http + guards) → top-navbar layout → shared/ui → branded login + home placeholder. The shell boots, resolves its tenant from the domain, authenticates, and lands on a placeholder — ready to hang PQRS/Announcements modules onto later.

---

## Context

`dominodo.nodo` is a **new, empty repo** (only `.git` + the docs authored in the previous session: `CLAUDE.md`, `docs/architecture.md`). It is the **per-tenant administration portal** — administrators of a single *conjunto residencial* managing their community. It is modeled 1:1 on `dominodo.admin` (Angular 20 standalone + signals, Tabler v1, ng-bootstrap), with **one defining difference: multi-tenancy resolved from the domain**. Every API call carries `X-Tenant: <slug>`; the tenant is resolved once at bootstrap and never chosen in the UI.

This plan delivers the **runnable foundation** so that adding a feature module later is a mechanical, `admin`-style CRUD exercise. It reuses `dominodo.admin`'s cross-cutting code almost verbatim, adapting three things: (1) add a tenant-resolution + bootstrap layer, (2) replace the `SuperAdmin` role gate with tenant-membership + permission gates, (3) use Tabler's **top-navbar** layout instead of the sidebar.

**Source of truth:** `docs/architecture.md` (authoritative design), `CLAUDE.md` (conventions), `dominodo.api/docs/architecture/09-multitenancy.md` (server multi-tenancy), and `dominodo.admin/src/**` (the reference implementation to port).

**Key adaptations from `admin` (apply throughout):**
- Interceptor order: **`tenantInterceptor` → `authInterceptor` → `errorInterceptor`**.
- `jwt.util.ts`: drop `SUPER_ADMIN_ROLE`/`isSuperAdmin`; the JWT is tenant-agnostic and carries no permissions. Keep `decodeToken`/`isExpired`/`normalizeRoles` (roles only for display).
- Token storage key: `dominodo.nodo.tokens` (not `admin`).
- `$primary` becomes a **runtime CSS custom property** driven by tenant branding, not a static Sass var.
- **No Quill / ngx-quill** (that was announcements-only in `admin`; no features here) → lighter deps, drop `allowedCommonJsDependencies`.

**Assumptions (see also Open Questions):**
- `GET /tenant/current` and `GET /me/permissions` are **not implemented in the API yet**. Every phase that consumes them ships a **graceful fallback** so the app runs today: tenant → default branding + all-features-on; permissions → permissive (empty gates) with a logged `TODO`. Guards/nav are wired but no-op until modules + the endpoint exist.
- Prod `baseDomain` is a config value; a placeholder (`nodo.dominodo.com`) is used and marked `TODO` until confirmed.
- Node ≥ 20, Angular CLI 20 available locally (same as `admin`).

---

## Phase 1 — Project initialization & tooling

**Objective:** A blank, Tabler-styled Angular 20 app that serves and builds clean, with tenant-aware environment config in place.

**Inputs / prerequisites:** Empty repo; `dominodo.admin/{package.json,.npmrc,angular.json,src/styles,src/environments}` as reference.

**Actions:**
1. `ng new dominodo-nodo --style=scss --routing --ssr=false --directory .` (run in the repo root; keep existing `.git`, `CLAUDE.md`, `docs/`).
2. Install runtime deps (mirror `admin`, minus Quill): `npm i @tabler/core@^1.4 @ng-bootstrap/ng-bootstrap@^19 @popperjs/core angular-tabler-icons@^3.26 jwt-decode@^4`.
3. Add repo-root **`.npmrc`** with `legacy-peer-deps=true`.
4. `angular.json`: rename project to `dominodo-nodo`, `outputPath: dist/dominodo-nodo`; `styles: ["src/styles/styles.scss"]`; assets from `public/**`; keep the `environment.ts` → `environment.development.ts` file replacement in the `development` config. Drop the Quill style entry and `allowedCommonJsDependencies`.
5. Create `src/styles/{styles.scss,_variables.scss,_tabler.scss}` porting `admin`'s: `styles.scss` `@import 'variables'; @import 'tabler';`; `_tabler.scss` → `@import '@tabler/core/scss/tabler';` with a comment noting the expected legacy `@import` deprecation warnings; `_variables.scss` holds the fallback `$primary`.
6. `src/environments/environment.ts` (prod) and `environment.development.ts` (dev) with keys: `production`, `apiBaseUrl` (`http://localhost:5083/api/v1` in dev), **`baseDomain`** (`nodo.dominodo.com`, TODO-confirm), **`defaultTenantSlug`** (a real dev slug in dev, `null` in prod), and **`ignoredHosts`** (`['www','localhost']`).
7. Strip the default `AppComponent` template down to a single `<router-outlet />`; set `changeDetection: OnPush`.
8. Add root `README.md` pointing to `CLAUDE.md` + `docs/architecture.md`.

**Expected outcome:** `npm start` serves a blank Tabler-styled page at `:4200`; `npm run build` succeeds (Tabler Sass `@import` warnings expected).

**Exit criteria:** Both `npm start` and `npm run build` complete with **no type errors**; environment files expose all four tenant/API config keys.

---

## Phase 2 — Shared kernel (models, HTTP primitives, notifications)

**Objective:** Zero-dependency building blocks every later layer imports.

**Inputs / prerequisites:** Phase 1.

**Actions (port from `admin` verbatim unless noted):**
1. `src/app/core/models/paged-result.ts` — `PagedResult<T>` interface.
2. `src/app/core/http/problem-details.ts` — `ProblemDetails` + `ProblemDetailError` interfaces, plus a reusable `toMessage(err)` helper (extracted from `admin`'s error interceptor so features can reuse it for field-error mapping).
3. `src/app/core/notifications/notification.service.ts` — signal-based notification bus (`items` signal; `error/success/info/dismiss`).
4. `src/app/shared/ui/notifications/` — a small toast component rendering `NotificationService.items()`, mounted once in `AppComponent`.

**Expected outcome:** Injectable `NotificationService`, typed error contracts, and a visible toast host.

**Exit criteria:** Build passes; a manual `notifications.error('x')` call renders a toast.

---

## Phase 3 — Tenant resolution & bootstrap (the Nodo-defining layer)

**Objective:** Resolve the tenant from the domain at startup, send `X-Tenant` on every call, load the tenant profile, and apply branding — with a fallback so the app runs before the API endpoint exists.

**Inputs / prerequisites:** Phases 1–2. Reference: `pollaya.front`'s `token.interceptor.service.ts` (header-from-host pattern); `docs/architecture.md` §4; `09-multitenancy.md`.

**Actions:**
1. `src/app/core/tenant/tenant.models.ts` — `TenantProfile` DTO exactly as `GET /tenant/current` will return: `slug`, `name`, `type`, `status`, `branding { logoUrl, primaryColor, loginText }`, `features: string[]`.
2. `src/app/core/tenant/tenant-resolver.ts` — pure function: if `environment.defaultTenantSlug` set → use it; else parse first host label from `window.location.hostname` minus `baseDomain`, excluding `ignoredHosts`; normalize/validate against `^[a-z0-9-]+$`; return `null` if unresolvable.
3. `src/app/core/tenant/tenant.store.ts` — `providedIn:'root'` signal store: `slug`, `tenant`, `loading`, `error`; computed `hasFeature(key)`; write API used only by the bootstrap step.
4. `src/app/core/tenant/tenant.service.ts` — `getCurrent(): Observable<TenantProfile>` → `GET /tenant/current`. On 404/network error (endpoint absent) return a **fallback profile** (name from slug, default `primaryColor`, all features enabled) and `console.warn` a `TODO`.
5. `src/app/core/http/tenant.interceptor.ts` — functional interceptor; attaches `X-Tenant: <TenantStore.slug()>` to every request whose URL starts with `apiBaseUrl` (including `/auth/*` and `/tenant/current`).
6. `src/app/core/tenant/tenant.bootstrap.ts` — the `provideAppInitializer` step: resolve slug → set store → `getCurrent()` → store profile → **apply branding** (`document.title`, favicon link, `--tb-primary` CSS custom property on `:root`, expose logo/name). If slug is `null` or profile status invalid → set an `error` flag consumed by routing (Phase 5).
7. `src/app/features/tenant-error/tenant-not-found.component.ts` — standalone "conjunto no encontrado" page (blank layout, no shell).

**Expected outcome:** On boot the app resolves a slug, sends `X-Tenant` everywhere, and paints tenant branding; missing endpoint degrades to fallback rather than crashing.

**Exit criteria:** DevTools shows `X-Tenant` on every XHR; changing `defaultTenantSlug` changes the header and `document.title`; an unresolvable slug routes to the not-found page (verified in Phase 5 once routing exists).

---

## Phase 4 — Auth + authz + HTTP interceptors + guards

**Objective:** Tenant-scoped login/session, effective-permission store, and the guard set — the security spine modules will lean on.

**Inputs / prerequisites:** Phase 3 (interceptor order depends on `tenantInterceptor`).

**Actions:**
1. **Auth (port from `admin/src/app/core/auth/*`):**
   - `auth.models.ts` — `LoginRequest`, `AuthTokens`, `JwtClaims`, `AuthUser`.
   - `jwt.util.ts` — port `decodeToken`/`normalizeRoles`/`extractRoles`/`isExpired`; **remove** `SUPER_ADMIN_ROLE`/`isSuperAdmin`.
   - `token-storage.service.ts` — `localStorage` key `dominodo.nodo.tokens`.
   - `auth.store.ts` — signals `accessToken`/`refreshToken`/`user`; computed `isAuthenticated`; rehydrate-on-construct dropping expired tokens. **Drop** `isSuperAdmin`.
   - `auth.service.ts` — `login()` posts `/auth/login`, decodes JWT, `store.setSession(...)`, then triggers `PermissionService.load()` (below); **no role gate**. `refresh()` + `logout()` as in `admin`.
2. **Authz (new):**
   - `src/app/core/authz/permission.store.ts` — `providedIn:'root'` signals: `permissions: string[]`, `loading`, `loaded`; computed/method `has(code)`.
   - `src/app/core/authz/permission.service.ts` — `load()` → `GET /me/permissions` → fill store. On `403` set a `noMembership` flag (→ tenantMemberGuard fails). On 404/network (endpoint absent) → **fallback**: mark `loaded` with empty permissions and `console.warn` TODO (guards permissive until wired).
3. **Interceptors:**
   - `auth.interceptor.ts` — Bearer attach, skip `/auth/login`+`/auth/refresh` (port).
   - `error.interceptor.ts` — 401 single refresh-and-retry then logout→`/auth`; map `ProblemDetails` via shared `toMessage` (port).
   - Register in `app.config.ts`: `withInterceptors([tenantInterceptor, authInterceptor, errorInterceptor])` (order matters).
4. **Guards (`src/app/core/guards/`):**
   - `auth.guard.ts` — `isAuthenticated()` else `→ /auth` (port).
   - `tenant-member.guard.ts` — passes unless `PermissionStore.noMembership` → `→ /sin-acceso`.
   - `permission.guard.ts` — **factory** `permissionGuard(code)` returning a `CanActivateFn` checking `PermissionStore.has(code)` (permissive when not `loaded`/fallback). Modules use it later.
   - `src/app/features/no-access/no-access.component.ts` — "sin acceso a este conjunto" page.

**Expected outcome:** Real login against the API establishes a persisted, rehydratable session; `PermissionStore` is populated (or safely empty); guard infrastructure exists for modules.

**Exit criteria:** Login happy path stores tokens and enters the app; rejected credentials surface a `ProblemDetails` message; a forced 401 triggers exactly one refresh-and-retry; reload rehydrates the session; `permissionGuard('x')` compiles and is unit-exercisable by wiring a throwaway route.

---

## Phase 5 — Top-navbar layout, shared/ui, login & home placeholder (integration)

**Objective:** Assemble a runnable end-to-end app: tenant bootstrap → branded login → top-navbar shell → placeholder home → logout.

**Inputs / prerequisites:** Phases 1–4.

**Actions:**
1. **shared/ui (port from `admin`):** `data-table/` (generic paged table — `columns`/`rows`/`paging`/`loading`/`error`/`rowKey`/`actionLink`/`badge` inputs, `pageChange` output), `page-header/` (title + `[actions]` slot), `spinner/`, and a new `empty-state/`. No behavior changes; these are copied for module reuse.
2. **layout (adapt `admin` shell to top-navbar):**
   - `shell/shell.component.ts` — `<app-header /> <app-navbar /> <div class="page-wrapper"><div class="page-body"><div class="container-xl"><router-outlet/></div></div></div>` inside Tabler's `.page` (drop the sidebar).
   - `header/header.component.ts` — Tabler horizontal header: tenant **logo + name from `TenantStore`** on the left, user menu (from `AuthStore.user()`) with logout on the right.
   - `navbar/navbar.component.ts` — Tabler `.navbar-expand-md` horizontal menu driven by a `NavItem[]` filtered by `PermissionStore.has(...)` **and** `TenantStore.hasFeature(...)`. **Ships empty** (no modules yet) with a code comment showing how to add the first item; renders nothing gracefully.
3. **features/auth/login:** branded `LoginComponent` (reactive phone + password) reading `TenantStore` name/logo/`loginText`; blank layout; `auth.routes.ts`.
4. **features/home:** minimal placeholder landing (welcome card showing tenant name) as the shell's default route, so routing has a target until modules arrive.
5. **Routing (`app.routes.ts`):**
   - If `TenantStore.error` (unresolved/invalid tenant) → route everything to `tenant-not-found`.
   - `auth` (blank) → login; `sin-acceso` → no-access page.
   - `''` → `ShellComponent`, `canActivate: [authGuard, tenantMemberGuard]`, children: `home` (default) + a wildcard redirect. New modules will register here with their own `permissionGuard`.
6. **`app.config.ts`:** finalize providers — `provideRouter`, `provideHttpClient(withInterceptors([...]))`, `provideTablerIcons({...})` (register every icon the layout/login use), `provideAppInitializer(tenantBootstrap)`, zone coalescing.

**Expected outcome:** A complete runnable portal skeleton: open app → tenant resolves + branding applied → login → branded top-navbar shell → home placeholder → logout returns to login.

**Exit criteria:** Manual end-to-end pass green (see Verification); `npm run build` clean; no unregistered/blank icons.

---

## Phase 6 — Documentation reconciliation & handoff

**Objective:** Make the docs match the shipped scaffold and leave a clear on-ramp for the first feature module.

**Inputs / prerequisites:** Phases 1–5 merged.

**Actions:**
1. Update `docs/architecture.md`: mark which pieces now **exist** vs remain **proposed** (the two endpoints), and note the fallback behavior actually implemented. Add a short "adding your first module" pointer to §7/§11.
2. Update `CLAUDE.md` if any path/name drifted during implementation (storage key, env keys, layout selectors).
3. (Optional, recommended) Author the **`nodo-new-module`** skill under `.claude/skills/` by adapting `dominodo.admin/.claude/skills/domi-new-module/SKILL.md`: same interactive contract-gathering + Roles-style reference, with Nodo adaptations (no tenant filter in components; gate nav by `PermissionStore`+`features`; add `permissionGuard` to routes). Defer the other skills (§11) until a module exists.
4. Record any confirmed values (real `baseDomain`, a dev tenant slug) and remove their `TODO`s.

**Expected outcome:** Docs are trustworthy; a developer can scaffold module #1 by reading `CLAUDE.md` + `architecture.md` (and optionally running the skill).

**Exit criteria:** No stale `TODO`/"proposed" claims that contradict the code; `architecture.md` §5 structure tree matches `src/app/`.

---

## Critical files (by area)

- **Config/tooling:** `angular.json`, `.npmrc`, `package.json`, `src/styles/*`, `src/environments/*`, `src/app/app.config.ts`, `src/app/app.routes.ts`, `src/app/app.component.ts`.
- **Tenant (new, Nodo-specific):** `src/app/core/tenant/{tenant.models.ts,tenant-resolver.ts,tenant.store.ts,tenant.service.ts,tenant.bootstrap.ts}`, `src/app/core/http/tenant.interceptor.ts`, `src/app/features/tenant-error/tenant-not-found.component.ts`.
- **Auth/authz (port + adapt):** `src/app/core/auth/*`, `src/app/core/authz/{permission.store.ts,permission.service.ts}`, `src/app/core/http/{auth.interceptor.ts,error.interceptor.ts}`, `src/app/core/guards/{auth.guard.ts,tenant-member.guard.ts,permission.guard.ts}`, `src/app/features/no-access/`.
- **Shared kernel/UI (port):** `src/app/core/models/paged-result.ts`, `src/app/core/http/problem-details.ts`, `src/app/core/notifications/notification.service.ts`, `src/app/shared/ui/{data-table,page-header,spinner,empty-state,notifications}/`.
- **Layout/entry:** `src/app/layout/{shell,header,navbar}/`, `src/app/features/auth/login/`, `src/app/features/home/`.

**Reference (read-only) — port from these:** `dominodo.admin/src/app/{app.config.ts,app.routes.ts,core/**,shared/ui/**,layout/shell/**}`, `dominodo.admin/{angular.json,.npmrc,src/styles/**,src/environments/**}`.

---

## Verification (manual — no automated tests, per standing policy)

Run the API (`http://localhost:5083`, a seeded tenant + a member user) and `npm start`, then:
1. **Build gate:** `npm run build` clean (Tabler `@import` warnings OK), no blank icons.
2. **Tenant bootstrap:** with `defaultTenantSlug` set → login screen shows tenant name/logo/color; unset it and hit a real subdomain → same; set an unknown slug → "conjunto no encontrado" page, no shell.
3. **Header presence:** every XHR (incl. `/auth/login`, `/tenant/current`) carries `X-Tenant`.
4. **Auth:** login happy path enters the shell; bad credentials → `ProblemDetails` toast; reload rehydrates session; logout returns to `/auth`.
5. **401 flow:** expire/tamper the access token → one silent refresh-and-retry; failed refresh → logout + redirect.
6. **Membership/permissions:** simulate `GET /me/permissions` → `403` → `/sin-acceso`; with the endpoint absent, confirm the permissive fallback lets the shell load and logs the TODO.
7. **Endpoint-absent resilience:** with neither proposed endpoint implemented, the app still boots, brands from fallback, logs in, and reaches home.

---

## Assumptions & Open Questions

**Assumptions:** listed in Context (endpoints not yet built → fallbacks; `baseDomain` placeholder; Quill dropped; storage key/interceptor-order/role-gate adaptations).

**Open questions (non-blocking; safe defaults chosen, revisit in Phase 6):**
- Confirm the prod `baseDomain` and subdomain scheme (`<slug>.nodo.dominodo.com`?).
- Confirm a real dev tenant slug + a member user for verification.
- Confirm final contracts/routes for `GET /tenant/current` and `GET /me/permissions` with the API team (client already wired to the proposed shapes in `architecture.md` §3.1).

**No blocking questions identified.**
