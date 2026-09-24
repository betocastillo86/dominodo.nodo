/**
 * The Tenants module exposes ONE upload endpoint for every file it owns
 * (`POST /tenants/files/upload-url`, API ADR-0010 §1): the purpose in the body —
 * not the transport — selects the container, the allowed content types, the key
 * prefix and any post-processing. Adding a file kind to the portal therefore
 * costs a purpose here, not a new client.
 */
export type TenantFilePurpose = 'BrandingLogo' | 'ApartmentImport';

/** Body of `POST /tenants/files/upload-url`. Requires `tenant.info`. */
export interface CreateTenantFileUploadUrlRequest {
  purpose: TenantFilePurpose;
  fileName: string;
  contentType: string;
}

/**
 * Response of `POST /tenants/files/upload-url`. `uploadUrl` is the short-lived
 * pre-signed PUT target (the API never sees the bytes), `key` is what the owning
 * command adopts afterwards, and `url` is the servable URL of that key — null
 * for a private purpose such as the apartment import CSV.
 */
export interface TenantFileUploadTicketDto {
  uploadUrl: string;
  key: string;
  url: string | null;
}
