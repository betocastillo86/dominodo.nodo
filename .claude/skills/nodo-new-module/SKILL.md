---
name: nodo-new-module
description: Scaffold a new CRUD feature module in dominodo.nodo (Angular 20, standalone + signals, top-navbar layout, multi-tenant). Adapts admin's domi-new-module to Nodo's single-tenant reality — list with filters, create/edit form with validation, optional delete, gated by permission + tenant feature. Interactive — gathers the module contract before writing code.
model: sonnet
user-invokable: true
---

# nodo-new-module

You are scaffolding a **new feature module** in `dominodo.nodo` — the Dominodo **per-tenant administration
portal** (Angular 20, standalone + signals, Tabler **top-navbar** layout + ng-bootstrap). Nodo mirrors
`dominodo.admin` but is **single-tenant, resolved from the domain**: every request already carries
`X-Tenant` globally, so **components never filter by tenant or resolve a slug**. Read `CLAUDE.md` and
`docs/architecture.md` first.

Nodo has no feature module of its own yet (this scaffold is the foundation), so the **canonical CRUD
template is `dominodo.admin`'s Roles feature** — read it as the living reference — combined with Nodo's own
scaffold (shared/ui, layout, guards, tenant/authz stores).

**Reference files:**
- Template (admin, read for the CRUD shape): `../dominodo.admin/src/app/features/roles/**` — `data-access/`
  (list via signals, writes via Observable), `role-list/`, `role-form/`, `roles.routes.ts`.
- Nodo scaffold to reuse (this repo):
  - `src/app/shared/ui/data-table/data-table.component.{ts,html}` — generic paged table
  - `src/app/shared/ui/{page-header,spinner,empty-state}/` — presentational pieces
  - `src/app/core/http/problem-details.ts` — `ProblemDetails` + shared `toMessage(err)`
  - `src/app/core/models/paged-result.ts` — `PagedResult<T>`
  - `src/app/core/notifications/notification.service.ts` — toast bus
  - `src/app/core/guards/permission.guard.ts` — `permissionGuard('<code>')` factory
  - `src/app/layout/navbar/navbar.component.ts` — the `navItems` list + filter (worked example in its doc)
  - `src/app/app.routes.ts` — shell children registration
  - `src/app/app.config.ts` — **icon registration** (a recurring gotcha)

---

## Non-negotiable conventions (from CLAUDE.md)

- **No tests.** Never create `.spec.ts` files or a test runner. Verification is manual + `npm run build`.
- Standalone components, `changeDetection: OnPush`, `inject()` (never constructor DI).
- Native `@if` / `@for` (never `*ngIf` / `*ngFor`). Functional guards/interceptors.
- kebab-case filenames; `.component.ts` / `.service.ts` / `.store.ts` / `.guard.ts` suffixes.
- DTOs typed **exactly** as the API returns them (camelCase); do not rename.
- **UI copy in Spanish**; code, identifiers, comments, and docs in English.
- List state lives in the service as **signals**; write operations return **Observables** the component
  subscribes to and manages locally (loading/error). Do not push writes through the list signals.
- Extend shared components (e.g. `DataTable`) only in a **backward-compatible** way (new inputs optional).
- **Every `<tabler-icon name="x">` must have its `IconX` registered in `app.config.ts`** — else it renders blank.
- **`npm start` runs on port 4201** (not 4200).

### Nodo-specific adaptations (vs admin) — apply throughout

- **No tenant filter / no slug resolution** in any component or service. `X-Tenant` is set globally by
  `tenantInterceptor`; the list/detail endpoints are already tenant-scoped. (Contrast admin's cross-tenant views.)
- **Gate the nav item by permission AND tenant feature** — add to `navItems` in `layout/navbar/` with both
  `permission: '<module>.view'` and `feature: '<FeatureKey>'`; the navbar already filters by
  `PermissionStore.has` + `TenantStore.hasFeature`.
- **Guard routes with `permissionGuard('<module>.view')`** (the factory in `core/guards/permission.guard.ts`),
  in addition to the shell's `authGuard` + `tenantMemberGuard`.

---

## Step 0 — Gather the module contract (INTERACTIVE — do this first)

Do not write code until you have this. Verify endpoints against live Swagger
(`http://localhost:5083/swagger/v1/swagger.json`) when reachable; otherwise ask. Use `AskUserQuestion` to
collect, in order:

1. **Module identity** — English identifier singular + plural (drives filenames/folder/service/component
   names); Spanish UI labels singular + plural (drives on-screen copy).
2. **Authorization** — the **permission code** that gates it (e.g. `requests.view`) and the **tenant feature
   key** that enables it (e.g. `Requests`). Both feed the nav filter + route guard.
3. **Operations that apply** — which of **list**, **create**, **edit**, **delete**. Delete only if the API
   supports it and the user wants it.
4. **API contract** — per operation: endpoint, request body, response. Capture exact DTOs (list item DTO,
   detail DTO if different, create/update requests, any catalog/lookup for selects). Note error codes
   (`400`/`404`/`409` → `ProblemDetails`).
5. **List filters** — enumerate the list endpoint's query params; **present them and ask which to expose**.
   Default to debounced text for free-text and `select` for enums.
6. **Create/edit rules** — per field: required?, max length / pattern / min-max, enum options,
   **immutable-on-edit?**, any **"at least one" collection rule**, and any **read-only condition** on an
   entity (whole form disabled + info banner + hidden save).

Summarize the gathered contract back and get confirmation before scaffolding.

---

## Step 1 — Data-access (`features/<plural>/data-access/`)

- `<singular>.models.ts` — DTOs + request interfaces, typed exactly as the API returns them. List DTO;
  detail DTO if the API differs; `Create<Singular>Request`, `Update<Singular>Request`. Comment immutable fields.
- `<plural>.service.ts` (`providedIn: 'root'`) — mirror admin's `RolesService`:
  - `list(page, pageSize, ...filters)` pushing into private signals exposed read-only:
    `items`/`paging`/`loading`/`error`. Include a private `toError()` reusing `toMessage` from
    `core/http/problem-details.ts`. **No tenant param** — `X-Tenant` is global.
  - `getById(id)`, `create(body)`, `update(id, body)`, and `remove(id)` **only if delete applies** — all
    returning Observables.
- Any lookup/catalog for a select → a small read-only service.

## Step 2 — List component (`<singular>-list/`)

- `app-page-header` with the Spanish plural title and a **"+ Nuevo <singular>"** action → `/<plural>/new`.
- The chosen **filters** as reactive controls (debounced text via `debounceTime(300)` + `distinctUntilChanged`;
  `select` for enums), reloading page 1 on change. Wire only the filters picked in Step 0.
- `app-data-table` with typed `columns`, server pagination bound to `paging()`, `[rowKey]`, and
  `[actionLink]="editLink"`. Use `app-empty-state` / `app-spinner` where the DataTable doesn't already cover it.
- **If delete applies:** per-row delete via an ng-bootstrap confirm modal (never silent); on confirm call
  `service.remove(id)` then reload. Extend `DataTable` backward-compatibly if a second row action is needed.

## Step 3 — Create/edit form (`<singular>-form/`)

Mirror admin's `RoleFormComponent` — **one component for both modes**:
- Resolve mode from the route (`id = route.snapshot.paramMap.get('id')`; `mode = id ? 'edit' : 'create'`).
- Typed `nonNullable` reactive form with the Step 0 validators. **Immutable-on-edit** → `control.disable()`
  in edit + a `form-hint`; send update **without** immutable fields.
- **"At least one" collection** → `signal<Set<...>>` + `toggle`/`isChecked` + computed `hasX` + `submitted`
  flag gating the message; block submit if empty.
- **Read-only condition** → `readOnly` signal: `form.disable()`, `alert alert-info` banner, hide Save.
- Signals: `loadingDetail`, catalog `loading`, `saving`, `error`, `submitted`.
- Success → `NotificationService.success('<Entidad> creado' | 'actualizado')` + navigate to `/<plural>`.
- Error → map `ProblemDetails` via `toMessage` / `errors[]`: `409` → conflicting control; `errors[]` →
  per-control `setErrors({ server })` (PascalCase property → camelCase control); fallback global alert.
  `saving.set(false)` in `finalize`.
- Template: Tabler markup with `is-invalid`/`invalid-feedback`, `required` labels, spinner while loading,
  inline spinner on Save while `saving()`, Cancel link back to the list.

## Step 4 — Routing, navigation & icons

- `<plural>.routes.ts`: lazy `loadComponent` for `''` (list), `'new'` and `':id/edit'` (**both → the same
  form component**).
- Register the module as a **child of the shell** in `src/app/app.routes.ts`, adding
  `canActivate: [permissionGuard('<module>.view')]` (on top of the shell's `authGuard` + `tenantMemberGuard`).
- Add the nav entry to `navItems` in `src/app/layout/navbar/navbar.component.ts` with `permission` +
  `feature` set (see the worked example in that file's class doc). **Not a sidebar** — Nodo is top-navbar.
- **Register every new icon** used by the templates in `app.config.ts`'s `provideTablerIcons({...})`.

## Step 5 — Documentation

Update `docs/architecture.md` lightly: note the new module under §5's structure tree; if PQRS, repoint the
shell default route from `home` to the request list (§6). Do **not** dump full DTOs — the doc is a guide;
code + Swagger are the source of truth.

---

## Closing

- `npm run build` must pass with no type errors (Tabler Sass `@import` deprecation warnings are expected).
- Give the user a short **manual verification** checklist (create happy path, a required-field validation,
  edit prefills + immutable disabled, delete confirm if applicable, any read-only/at-least-one rule, **and
  that the nav item hides when the permission/feature is absent**), since the project has no automated tests.
