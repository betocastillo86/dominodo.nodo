/**
 * Apartment lookup DTO — typed EXACTLY as `dominodo.api` returns it (camelCase),
 * verified against Swagger (`TenantsApartmentDto`). Only the shape the PQRS
 * apartment filter needs. Do not rename fields.
 */
export interface ApartmentDto {
  id: string;
  tenantId: string;
  tower: string | null;
  number: string;
  type: string;
  status: string;
}
