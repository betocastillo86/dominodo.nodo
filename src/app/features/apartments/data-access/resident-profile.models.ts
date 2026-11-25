/**
 * DTOs for editing a resident's profile (`dominodo.api` Users module), typed
 * EXACTLY as the API returns them (camelCase). Do not rename fields.
 */

/** `DocumentType` (Users/Users/DocumentType.cs), serialized as its member name. */
export type DocumentType = 'CC' | 'CE' | 'NIT' | 'Passport';

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  Passport: 'Pasaporte',
};

/** `GET /users/{id}` (`UserDto`). No permission needed beyond being authenticated. */
export interface UserDto {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: string;
  phoneVerified: boolean;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  documentType: DocumentType | null;
  documentNumber: string | null;
  /** Contact data only (API ADR-0029 §3) — never a login nor a password-recovery channel. */
  additionalEmails: string[];
  additionalPhones: string[];
}

/**
 * Body of `PUT /users/{id}` (requires users.edit) → 204. A FULL replace: an
 * omitted document or contact list is cleared, so the form always sends what it
 * loaded. With X-Tenant the API only reaches members of this conjunto (anyone
 * else reads as `404 User.NotFound`).
 */
export interface UpdateUserRequest {
  firstName: string;
  lastName: string;
  /** Null clears the address. */
  email: string | null;
  /**
   * `UserDto` does not carry it, so the portal cannot echo it back. Empty means
   * "es" server-side — the only language the platform speaks today, and what
   * `dominodo.admin` sends too.
   */
  preferredLanguage: string;
  /** Type and number go together or not at all. */
  documentType: DocumentType | null;
  documentNumber: string | null;
  additionalEmails: string[];
  /** E.164 each, e.g. `+573001234567`. */
  additionalPhones: string[];
}

/** Limits enforced by the API (`AdditionalContacts`, `User`). */
export const ADDITIONAL_CONTACTS_MAX = 5;
export const DOCUMENT_NUMBER_MAX_LENGTH = 50;
