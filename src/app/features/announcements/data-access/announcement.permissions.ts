/**
 * Permission codes for the Announcements module, matching the API's
 * `Permissions` catalog exactly (verified against `dominodo.api`
 * `Shared.Kernel/Authorization/Permissions.cs`). Drive nav visibility, route
 * guards and in-page affordances; the server remains authoritative.
 *
 * Note: the API gates edit **and** publish/archive with the single
 * `announcements.edit` permission (there is no separate publish/archive code).
 */
export const ANNOUNCEMENTS_VIEW = 'announcements.view';
export const ANNOUNCEMENTS_EDIT = 'announcements.edit';
export const ANNOUNCEMENTS_CREATE = 'announcements.create';
