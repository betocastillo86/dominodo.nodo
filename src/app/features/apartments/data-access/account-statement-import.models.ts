/**
 * DTOs and copy for the bulk account-statement load (API ADR-0025), typed
 * EXACTLY as `dominodo.api` returns them (camelCase). Do not rename fields.
 *
 * Same life cycle as the apartment import (`apartment-import.models.ts`):
 * `Validating → Validated | Rejected → Applying → Applied`, plus `Expired` once a
 * validated load passes its 24h TTL. Both POSTs answer 202 and the work runs in
 * the background, so every state is reached by polling the GET.
 *
 * The rules are the OPPOSITE of the apartment import's, on purpose: this load
 * only UPDATES existing units, never creates them. A unit the conjunto does not
 * have is a ROW error; the same unit stated twice is a FILE error.
 */

/** `AccountStatementImportStatus`. `Expired` is derived server-side, never stored. */
export type AccountStatementImportStatus =
  'Validating' | 'Validated' | 'Rejected' | 'Applying' | 'Applied' | 'Expired';

/** Live counters; `rowsTotal` stays 0 until the last line is parsed (indeterminate). */
export interface AccountStatementImportProgressDto {
  rowsProcessed: number;
  rowsTotal: number;
}

/** A problem with the file as a whole: it kills the entire load. */
export interface AccountStatementImportFileErrorDto {
  code: string;
  description: string;
}

/** A problem with one row (error) or a note about it (warning). */
export interface AccountStatementImportRowIssueDto {
  rowNumber: number;
  code: string;
  description: string;
}

/** The diagnosis: file errors kill the load, row errors kill a row, warnings kill nothing. */
export interface AccountStatementImportReportDto {
  rowsTotal: number;
  rowsValid: number;
  rowsWithError: number;
  apartmentsUpdated: number;
  apartmentsNotFound: number;
  /** Units that already had a statement, which this load overwrites. */
  statementsReplaced: number;
  fileErrors: AccountStatementImportFileErrorDto[];
  rowErrors: AccountStatementImportRowIssueDto[];
  warnings: AccountStatementImportRowIssueDto[];
}

/** `GET /apartments/account-statement-imports/{id}`. `report` is null until the diagnosis ends. */
export interface AccountStatementImportDto {
  id: string;
  tenantId: string;
  status: AccountStatementImportStatus;
  fileKey: string;
  progress: AccountStatementImportProgressDto;
  report: AccountStatementImportReportDto | null;
  validatedAtUtc: string | null;
  expiresAtUtc: string | null;
  confirmedAtUtc: string | null;
  appliedAtUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

/** `POST /apartments/account-statement-imports` → 202. The work was accepted, not done. */
export interface AccountStatementImportAcceptedDto {
  importId: string;
}

// ── File policy (mirrors TenantFilePurposePolicy on the server) ──────────────

/** The server allowlist for this purpose is `text/csv` only; see the apartment import. */
export const ACCOUNT_STATEMENT_CONTENT_TYPE = 'text/csv';
export const ACCOUNT_STATEMENT_MAX_BYTES = 5 * 1024 * 1024;

// ── The template ────────────────────────────────────────────────────────────

/**
 * Header read by the server (`AccountStatementImportVocabulary`). Spanish, like
 * the apartment file: the person filling it in is an administrator in Excel.
 * The unit goes in ONE `apartamento` column ("A-101"). The server still reads
 * `torre` + `numero` as an alternative, but the portal teaches only the single
 * column — one way to write a unit, the way the conjunto already writes it.
 * Matching ignores case, accents and a space or hyphen typed for an underscore.
 */
export const ACCOUNT_STATEMENT_CSV_HEADER = 'apartamento,saldo_en_mora,en_mora';

/**
 * Three rows covering the cases the format exists for — and the one people trip
 * on: a unit that owes and is flagged, a unit that owes but is deliberately NOT
 * flagged (payment agreement), and a settled unit.
 */
export const ACCOUNT_STATEMENT_CSV_SAMPLE_ROWS = [
  'A-101,450000,si',
  'A-102,1.250.000,no',
  '305,0,no',
];

/** Prefixed with a UTF-8 BOM so Excel opens the file correctly; the server skips it. */
export function buildAccountStatementTemplate(): string {
  return `﻿${[ACCOUNT_STATEMENT_CSV_HEADER, ...ACCOUNT_STATEMENT_CSV_SAMPLE_ROWS].join('\r\n')}\r\n`;
}

/** One row of the "how to fill the file" table shown on step 1. */
export interface AccountStatementColumnHelp {
  name: string;
  required: string;
  rule: string;
}

export const ACCOUNT_STATEMENT_COLUMNS: readonly AccountStatementColumnHelp[] = [
  {
    name: 'apartamento',
    required: 'Sí',
    rule: 'La unidad completa con la torre, así: A-101. Sin torre basta el número: 101. Debe existir en el conjunto.',
  },
  {
    name: 'saldo_en_mora',
    required: 'Sí',
    rule: 'Saldo adeudado, cero o mayor. Se leen los formatos de Excel en Colombia: 450.000,50 o 450000.',
  },
  {
    name: 'en_mora',
    required: 'Sí',
    rule: 'si o no. Es independiente del saldo: una unidad con saldo puede quedar sin marcar, y no se asume nada si la celda está vacía.',
  },
];

// ── Report copy ─────────────────────────────────────────────────────────────

/** Spanish text for every code the load reports; the English description is not for administrators. */
const ISSUE_TEXT: Record<string, string> = {
  // File-level — the whole load stops.
  'AccountStatementImport.FileEmpty': 'El archivo está vacío o solo tiene el encabezado.',
  'AccountStatementImport.FileUnreadable': 'No se pudo leer el archivo. Vuelve a subirlo.',
  'AccountStatementImport.FileTooLarge': 'El archivo supera el máximo de 5 MB.',
  'AccountStatementImport.HeaderInvalid':
    'Falta el encabezado. La primera fila debe traer las columnas "apartamento", "saldo_en_mora" y "en_mora".',
  'AccountStatementImport.DuplicateApartment':
    'Una misma unidad aparece más de una vez. Deja una sola fila por unidad.',
  'AccountStatementImport.NoValidRows': 'Ninguna fila del archivo pasó la validación.',

  // Row-level.
  'AccountStatementImport.ApartmentRequired':
    'Falta la unidad. Indica la columna "apartamento", por ejemplo A-101.',
  'AccountStatementImport.NumberTooLong': 'El número de la unidad supera los 50 caracteres.',
  'AccountStatementImport.TowerTooLong': 'La torre supera los 50 caracteres.',
  'AccountStatementImport.ApartmentNotFound':
    'La unidad no existe en el conjunto. Esta carga solo actualiza unidades existentes; revisa cómo está escrita o créala con la carga masiva de apartamentos.',
  'AccountStatementImport.BalanceRequired': 'Falta el saldo en mora.',
  'AccountStatementImport.BalanceInvalid':
    'El saldo no se puede leer como un importe. Usa números, por ejemplo 450000 o 450.000,50.',
  'AccountStatementImport.BalanceNegative': 'El saldo en mora no puede ser negativo.',
  'AccountStatementImport.OverdueRequired':
    'Falta indicar si está en mora. Usa si o no; no se asume a partir del saldo.',
  'AccountStatementImport.OverdueInvalid': 'El valor de en_mora no es válido. Usa si o no.',

  // Warnings — the row loads, but not silently.
  'AccountStatementImport.StatementReplaced':
    'La unidad ya tenía un estado de cuenta: se reemplaza por el del archivo.',
};

/**
 * Codes whose server description names the offending unit and rows — data the
 * Spanish text cannot carry. File-level issues have no `rowNumber` to fall back
 * on, which is exactly where losing that detail would hurt.
 */
const DETAILED_CODES = new Set(['AccountStatementImport.DuplicateApartment']);

/** Spanish text for a reported code; the server description backs an unknown one. */
export function accountStatementIssueText(code: string, description: string): string {
  return ISSUE_TEXT[code] ?? description;
}

/** The server's own wording, shown only where it adds the missing specifics. */
export function accountStatementIssueDetail(code: string, description: string): string | null {
  return DETAILED_CODES.has(code) ? description : null;
}

export const ACCOUNT_STATEMENT_STATUS_LABEL: Record<AccountStatementImportStatus, string> = {
  Validating: 'Validando',
  Validated: 'Validado',
  Rejected: 'Rechazado',
  Applying: 'Aplicando',
  Applied: 'Aplicado',
  Expired: 'Expirado',
};

export const ACCOUNT_STATEMENT_STATUS_BADGE: Record<AccountStatementImportStatus, string> = {
  Validating: 'badge bg-azure-lt',
  Validated: 'badge bg-green-lt',
  Rejected: 'badge bg-red-lt',
  Applying: 'badge bg-azure-lt',
  Applied: 'badge bg-green-lt',
  Expired: 'badge bg-orange-lt',
};
