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
export const MEMBERSHIPS_MANAGE = 'memberships.manage';

/** The pair the bulk import requires. */
export const APARTMENT_IMPORT_PERMISSIONS = [APARTMENTS_CREATE, MEMBERSHIPS_MANAGE];
