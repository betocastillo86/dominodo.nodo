/**
 * Permission codes for the Apartments module, matching the API's `Permissions`
 * catalog exactly (`Shared.Kernel/Authorization/Permissions.cs`).
 *
 * Apartments are read-only in this portal, so the only write path is the bulk
 * import — and the API gates it with BOTH codes at once (two stacked
 * `[HasPermission]` attributes are an AND): the file creates units AND registers
 * people, and the report carries residents' names and emails, so neither
 * permission alone is enough (ADR-0012 §1).
 */
export const APARTMENTS_VIEW = 'apartments.view';
export const APARTMENTS_CREATE = 'apartments.create';
export const APARTMENTS_EDIT = 'apartments.edit';
export const MEMBERSHIPS_MANAGE = 'memberships.manage';
export const TENANT_INFO = 'tenant.info';

/** The pair the bulk import requires. */
export const APARTMENT_IMPORT_PERMISSIONS = [APARTMENTS_CREATE, MEMBERSHIPS_MANAGE];

/**
 * The account-statement bulk load (ADR-0025 §4) is gated by `apartments.edit`
 * alone on its own three endpoints — but the file goes up through the generic
 * tenant-file ticket, which the API gates with `tenant.info`. Without it the
 * upload would 403 after the administrator already picked a file, so the portal
 * asks for both up front.
 */
export const ACCOUNT_STATEMENT_IMPORT_PERMISSIONS = [APARTMENTS_EDIT, TENANT_INFO];
