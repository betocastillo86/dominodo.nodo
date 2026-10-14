/**
 * Permission codes for the Amenities module ("Áreas sociales"), matching the
 * API's catalog exactly (verified against `dominodo.api` ADR-0016 and Swagger).
 *
 * There is no `amenities.delete`: `activate` / `out-of-service` (soft removal)
 * are both covered by `amenities.edit`, same as the two upload-url callers.
 */
export const AMENITIES_VIEW = 'amenities.view';
export const AMENITIES_CREATE = 'amenities.create';
export const AMENITIES_EDIT = 'amenities.edit';

/** Tenant feature key gating the module, same shape as `Requests`/`Announcements`. */
export const AMENITIES_FEATURE = 'Amenities';
