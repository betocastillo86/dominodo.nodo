/**
 * DTOs and copy for the bulk apartment/resident import (API ADR-0012), typed
 * EXACTLY as `dominodo.api` returns them (camelCase). Do not rename fields.
 *
 * The import is a RESOURCE with a life cycle, not a fire-and-forget upload:
 * `Validating → Validated | Rejected → Applying → Applied`, plus `Expired` once
 * a validated import passes its 24h TTL. Both POSTs answer 202 and the work runs
 * in the background, so every state here is reached by polling the GET.
 */

/** `ApartmentImportStatus`. `Expired` is derived server-side, never stored. */
export type ApartmentImportStatus =
  'Validating' | 'Validated' | 'Rejected' | 'Applying' | 'Applied' | 'Expired';

/**
 * Live counters while the file is read. `rowsTotal` stays 0 until the last line
 * is parsed — the total is unknowable before then, so a progress bar must treat
 * 0 as "indeterminate", not as "nothing to do".
 */
export interface ApartmentImportProgressDto {
  rowsProcessed: number;
  rowsTotal: number;
}

/** A problem with the file as a whole: it kills the entire load. */
export interface ApartmentImportFileErrorDto {
  code: string;
  description: string;
}

/** A problem with one row (error) or a note about it (warning). */
export interface ApartmentImportRowIssueDto {
  rowNumber: number;
  code: string;
  description: string;
}

/**
 * The diagnosis. Three categories, not two (ADR-0012 §5): a file error kills the
 * load, a row error kills one row, and a warning kills nothing — but "reused"
 * cannot be silence either, or the administrator will believe data was updated
 * that in fact never moved.
 */
export interface ApartmentImportReportDto {
  rowsTotal: number;
  rowsValid: number;
  rowsWithError: number;
  unitsCreated: number;
  unitsReused: number;
  residentsQueued: number;
  usersReused: number;
  /** True when residents are still being written after the import reads Applied. */
  residentsEventuallyConsistent: boolean;
  fileErrors: ApartmentImportFileErrorDto[];
  rowErrors: ApartmentImportRowIssueDto[];
  warnings: ApartmentImportRowIssueDto[];
}

/** `GET /apartments/imports/{id}`. `report` is null until the diagnosis ends. */
export interface ApartmentImportDto {
  id: string;
  tenantId: string;
  status: ApartmentImportStatus;
  fileKey: string;
  progress: ApartmentImportProgressDto;
  report: ApartmentImportReportDto | null;
  validatedAtUtc: string | null;
  expiresAtUtc: string | null;
  confirmedAtUtc: string | null;
  appliedAtUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

/** `POST /apartments/imports` → 202. The work was accepted, not done. */
export interface ApartmentImportAcceptedDto {
  importId: string;
}

/** Body of `POST /apartments/imports`: the key minted by the upload ticket. */
export interface CreateApartmentImportRequest {
  fileKey: string;
}

// ── File policy (mirrors TenantFilePurposePolicy on the server) ──────────────

/**
 * The server allowlist for this purpose is `text/csv` and nothing else, so we
 * send that content type on both the ticket and the PUT regardless of what the
 * browser reports — Windows hands `application/vnd.ms-excel` for a .csv often
 * enough that trusting `file.type` would reject perfectly good files.
 */
export const IMPORT_CONTENT_TYPE = 'text/csv';
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

// ── The template ────────────────────────────────────────────────────────────

/**
 * Header expected by the server's CSV reader (`ApartmentImportVocabulary`). The
 * file is the ONE place where the platform speaks Spanish: the person filling it
 * in is an administrator working in Excel, so the columns and the
 * tipo/relacion values are Spanish and the API translates them on the way in.
 *
 * Matching ignores case, accents, and the space or hyphen typed instead of an
 * underscore ("Número", "VIVE AQUÍ"), and every English name from the first
 * draft of the contract still loads as an alias — but these are the canonical
 * ones, and the only ones worth teaching.
 *
 * The last seven columns (API ADR-0030) are optional. The first three are
 * unit-level — the annexes, lists of values separated by `/` — the rest belong
 * to the person of the row. The administration fee is NOT here: it moved to the
 * account-statement load (ADR-0030, 2026-11-27 amendment), and a file that
 * still carries `valor_administracion` is rejected whole with
 * `HeaderAdministrationFeeMoved`.
 */
export const IMPORT_CSV_HEADER =
  'torre,numero,tipo,telefono,nombre,apellido,correo,relacion,vive_aqui,' +
  'placas,parqueaderos,depositos,correos_adicionales,' +
  'telefonos_adicionales,tipo_documento,numero_documento';

/**
 * Three rows that cover the cases the format exists for: a unit with its owner,
 * a second resident on that same unit (the repeated unit IS the mechanism), and
 * a unit with no resident at all (an empty `phone` is the switch between the two
 * use cases). Rows of the same unit that carry annexes must carry the same ones
 * (`ApartmentImport.ConflictingAnnexes`), so A-101 repeats them verbatim.
 */
export const IMPORT_CSV_SAMPLE_ROWS = [
  'A,101,Apartamento,+573001112233,María,Gómez,maria@correo.com,Propietario,si,' +
    'ABC123 (Mazda 3)/XYZ789,P12/P13,D3,maria.trabajo@correo.com,+573109998877,CC,1020304050',
  'A,101,Apartamento,+573004445566,Juan,Gómez,,Arrendatario,si,' +
    'ABC123 (Mazda 3)/XYZ789,P12/P13,D3,,,,',
  'A,102,Apartamento,,,,,,,,P20,,,,,',
];

/**
 * The downloadable template. Prefixed with a UTF-8 BOM so Excel opens the
 * accented sample names correctly; the server's reader detects and skips it.
 */
export function buildImportTemplate(): string {
  return `\uFEFF${[IMPORT_CSV_HEADER, ...IMPORT_CSV_SAMPLE_ROWS].join('\r\n')}\r\n`;
}

/** One row of the "how to fill the file" table shown on step 1. */
export interface ImportColumnHelp {
  name: string;
  required: string;
  rule: string;
}

export const IMPORT_COLUMNS: readonly ImportColumnHelp[] = [
  {
    name: 'torre',
    required: 'No',
    rule: 'Torre o bloque, máximo 50 caracteres. Vacío = sin torre. Hace parte de la identidad de la unidad.',
  },
  {
    name: 'numero',
    required: 'Sí',
    rule: 'Número de la unidad, máximo 50 caracteres. Es la única columna obligatoria.',
  },
  {
    name: 'tipo',
    required: 'No',
    rule: 'Apartamento, Casa o Local. Vacío = Apartamento. Parqueaderos y depósitos no son unidades: van en las columnas parqueaderos y depositos.',
  },
  {
    name: 'telefono',
    required: 'Condicional',
    rule: 'Formato internacional E.164 (+573001112233). Si lo dejas vacío, la fila carga solo la unidad, sin residente.',
  },
  {
    name: 'nombre',
    required: 'Si hay teléfono',
    rule: 'Nombre del residente, máximo 100 caracteres.',
  },
  { name: 'apellido', required: 'No', rule: 'Apellido del residente, máximo 100 caracteres.' },
  {
    name: 'correo',
    required: 'No',
    rule: 'Opcional incluso con teléfono: el teléfono es la llave de la persona.',
  },
  {
    name: 'relacion',
    required: 'Si hay teléfono',
    rule: 'Propietario o Arrendatario.',
  },
  {
    name: 'vive_aqui',
    required: 'No',
    rule: 'si o no. Vacío = si (el residente vive en la unidad).',
  },
  {
    name: 'placas',
    required: 'No',
    rule: 'Vehículos de la unidad separados por /, cada uno PLACA o PLACA (Modelo): ABC123 (Mazda 3)/XYZ789. Máximo 10; placa hasta 20 caracteres y modelo hasta 100.',
  },
  {
    name: 'parqueaderos',
    required: 'No',
    rule: 'Parqueaderos de la unidad separados por /: P12/P13. Máximo 10, de hasta 20 caracteres cada uno.',
  },
  {
    name: 'depositos',
    required: 'No',
    rule: 'Depósitos de la unidad separados por /: D3. Máximo 10, de hasta 20 caracteres cada uno.',
  },
  {
    name: 'correos_adicionales',
    required: 'No',
    rule: 'Otros correos de contacto del residente separados por /. Máximo 5. Si la persona ya existe, se suman a los que tiene.',
  },
  {
    name: 'telefonos_adicionales',
    required: 'No',
    rule: 'Otros teléfonos de contacto en formato E.164, separados por /. Máximo 5. Si la persona ya existe, se suman a los que tiene.',
  },
  {
    name: 'tipo_documento',
    required: 'Con número de documento',
    rule: 'CC, CE, NIT o Pasaporte. Va junto con numero_documento: ambos o ninguno.',
  },
  {
    name: 'numero_documento',
    required: 'Con tipo de documento',
    rule: 'Máximo 50 caracteres. Si la persona ya existe y no tiene documento, se completa; si tiene otro, no se reemplaza.',
  },
];

// ── Report copy ─────────────────────────────────────────────────────────────

/**
 * Spanish text for every error and warning code the import can produce, keyed by
 * the code the API reports. Codes come from three places — the Tenants unit
 * rules, the Users people rules, and the CSV reader — and they are the stable
 * part of the contract; the English `description` that travels with them is not
 * meant for an administrator's eyes.
 */
const ISSUE_TEXT: Record<string, string> = {
  // File-level — the whole load stops.
  'ApartmentImport.FileEmpty': 'El archivo está vacío o solo tiene el encabezado.',
  'ApartmentImport.FileUnreadable': 'No se pudo leer el archivo. Vuelve a subirlo.',
  'ApartmentImport.FileTooLarge': 'El archivo supera el máximo de 5 MB.',
  'ApartmentImport.HeaderInvalid':
    'Falta el encabezado. La primera fila debe traer al menos la columna "numero".',
  'ApartmentImport.HeaderAdministrationFeeMoved':
    'El archivo trae la columna "valor_administracion", que ya no hace parte de esta carga. Quítala y carga el valor de administración con la carga de estados de cuenta.',
  'ApartmentImport.ConflictingUnitType':
    'La misma unidad aparece con dos tipos distintos. Deja un solo tipo por unidad.',
  'ApartmentImport.DuplicateEmail':
    'Un mismo correo está asignado a teléfonos distintos. Cada correo pertenece a una sola persona.',
  'ApartmentImport.NoValidRows': 'Ninguna fila del archivo pasó la validación.',
  'ApartmentImport.ConflictingAnnexes':
    'Las filas de una misma unidad traen anexos distintos. Repite los mismos anexos en cada fila o déjalos vacíos.',
  'ApartmentImport.ConflictingDocument':
    'Un mismo teléfono aparece con dos documentos distintos. Cada persona tiene un solo documento.',
  'ApartmentImport.TooManyAdditionalContacts':
    'Sumando todas sus filas, un mismo teléfono supera los 5 correos o los 5 teléfonos adicionales.',

  // Row-level, unit side (Tenants).
  'ApartmentImport.NumberRequired': 'Falta el número de la unidad.',
  'ApartmentImport.NumberTooLong': 'El número de la unidad supera los 50 caracteres.',
  'ApartmentImport.TowerTooLong': 'La torre supera los 50 caracteres.',
  'ApartmentImport.TowerNotAllowed':
    'La torre no está entre las que declara el conjunto. Revisa la lista en Mi Conjunto → Configuración.',
  'ApartmentImport.TypeInvalid':
    'Tipo de unidad no reconocido. Usa Apartamento, Casa o Local.',
  'ApartmentImport.TypeRetired':
    'Parqueadero y Depósito ya no son tipos de unidad. Regístralos en las columnas parqueaderos y depositos de la unidad.',
  'ApartmentImport.LivesHereInvalid': 'El valor de vive_aqui no es válido. Usa si o no.',
  'ApartmentImport.RowNotValidated': 'No se pudo validar la fila.',
  'ApartmentImport.RelationInvalid': 'La relación debe ser Propietario o Arrendatario.',
  'ApartmentImport.VehicleInvalid':
    'Un vehículo no tiene el formato esperado. Usa PLACA o PLACA (Modelo), separados por /.',
  'ApartmentImport.DocumentTypeInvalid':
    'Tipo de documento no reconocido. Usa CC, CE, NIT o Pasaporte.',
  'Apartment.TooManyVehicles': 'La unidad supera los 10 vehículos.',
  'Apartment.TooManyParkingSpots': 'La unidad supera los 10 parqueaderos.',
  'Apartment.TooManyStorageUnits': 'La unidad supera los 10 depósitos.',
  'Apartment.VehiclePlateRequired': 'Hay un vehículo sin placa.',
  'Apartment.VehiclePlateTooLong': 'Una placa supera los 20 caracteres.',
  'Apartment.VehicleModelTooLong': 'El modelo de un vehículo supera los 100 caracteres.',
  'Apartment.ParkingSpotRequired': 'Hay un parqueadero sin número.',
  'Apartment.ParkingSpotTooLong': 'Un parqueadero supera los 20 caracteres.',
  'Apartment.StorageUnitRequired': 'Hay un depósito sin número.',
  'Apartment.StorageUnitTooLong': 'Un depósito supera los 20 caracteres.',
  'Apartment.AnnexSeparatorNotAllowed': 'Los anexos no pueden contener el carácter «|».',

  // Row-level, people side (Users).
  'Phone.Required': 'Falta el teléfono del residente.',
  'Phone.Invalid': 'El teléfono no está en formato E.164 (ejemplo: +573001112233).',
  'User.FirstNameRequired': 'Falta el nombre del residente.',
  'User.FirstNameTooLong': 'El nombre supera los 100 caracteres.',
  'User.LastNameTooLong': 'El apellido supera los 100 caracteres.',
  'Email.Invalid': 'El correo no es una dirección válida.',
  'User.EmailTaken': 'El correo ya pertenece a otra persona de la plataforma.',
  'Membership.RelationRequired': 'Falta la relación (Propietario o Arrendatario).',
  'Membership.RelationInvalid': 'La relación debe ser Propietario o Arrendatario.',
  'User.TooManyAdditionalEmails': 'El residente supera los 5 correos adicionales.',
  'User.TooManyAdditionalPhones': 'El residente supera los 5 teléfonos adicionales.',
  'User.DocumentTypeInvalid': 'Tipo de documento no reconocido. Usa CC, CE, NIT o Pasaporte.',
  'User.DocumentIncomplete':
    'El tipo y el número de documento van juntos: completa ambos o deja ambos vacíos.',
  'User.DocumentNumberTooLong': 'El número de documento supera los 50 caracteres.',

  // Warnings — nothing is rejected, but nothing is silently changed either.
  'ApartmentImport.UnitReused':
    'La unidad ya existe en el conjunto: se reutiliza y se le suman los residentes.',
  'ApartmentImport.UnitTypeIgnored':
    'La unidad ya existe con otro tipo. Se conserva el tipo actual y se ignora el del archivo.',
  'ApartmentImport.UserReusedNameIgnored':
    'El teléfono ya pertenece a un usuario de la plataforma: se reutiliza su cuenta y se ignora el nombre del archivo.',
  'ApartmentImport.UserEmailWillBeFilled':
    'El usuario existente no tenía correo: se completará con el del archivo.',
  'ApartmentImport.UserEmailNotOverwritten':
    'El usuario existente ya tiene otro correo: no se reemplaza.',
  'ApartmentImport.AnnexesReplaced':
    'La unidad ya existe con otros anexos: sus placas, parqueaderos y depósitos se reemplazan por los del archivo.',
  'ApartmentImport.PersonFieldsIgnored':
    'La fila no tiene teléfono: se carga solo la unidad y se ignoran los datos de la persona.',
  'ApartmentImport.UserDocumentNotOverwritten':
    'El usuario existente ya tiene otro documento: no se reemplaza.',
  'ApartmentImport.UserAdditionalContactsTruncated':
    'El usuario existente quedaría con más de 5 correos o teléfonos adicionales: los que sobran no se guardan.',
};

/**
 * Codes whose server description names the offending unit or rows — data the
 * Spanish text cannot carry on its own. File-level issues have no `rowNumber` to
 * fall back on, which is exactly where losing that detail would hurt.
 */
const DETAILED_CODES = new Set([
  'ApartmentImport.ConflictingUnitType',
  'ApartmentImport.DuplicateEmail',
  'ApartmentImport.ConflictingAnnexes',
  'ApartmentImport.ConflictingDocument',
  'ApartmentImport.TooManyAdditionalContacts',
]);

/** Spanish text for a reported code; the server description backs an unknown one. */
export function issueText(code: string, description: string): string {
  return ISSUE_TEXT[code] ?? description;
}

/** The server's own wording, shown only where it adds the missing specifics. */
export function issueDetail(code: string, description: string): string | null {
  return DETAILED_CODES.has(code) ? description : null;
}

/** Status badge copy for the header of the tracking card. */
export const IMPORT_STATUS_LABEL: Record<ApartmentImportStatus, string> = {
  Validating: 'Validando',
  Validated: 'Validado',
  Rejected: 'Rechazado',
  Applying: 'Aplicando',
  Applied: 'Aplicado',
  Expired: 'Expirado',
};

export const IMPORT_STATUS_BADGE: Record<ApartmentImportStatus, string> = {
  Validating: 'badge bg-azure-lt',
  Validated: 'badge bg-green-lt',
  Rejected: 'badge bg-red-lt',
  Applying: 'badge bg-azure-lt',
  Applied: 'badge bg-green-lt',
  Expired: 'badge bg-orange-lt',
};
