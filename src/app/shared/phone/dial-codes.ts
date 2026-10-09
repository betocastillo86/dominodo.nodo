/** A country prefix a phone field can be prefixed with. */
export interface DialCodeOption {
  readonly code: string;
  readonly label: string;
}

/** Supported country prefixes. The first entry is the default. */
export const DIAL_CODES: readonly DialCodeOption[] = [
  { code: '+57', label: '🇨🇴 +57' },
  { code: '+1', label: '🇺🇸 +1' },
];

/** Colombia — what every phone field starts on. */
export const DEFAULT_DIAL_CODE = DIAL_CODES[0].code;

/**
 * Join a selected prefix with the national number the user typed, producing the
 * E.164 string the API expects. A number already written in full international
 * form (leading `+`, e.g. pasted or autofilled) carries its own prefix, so it is
 * kept as-is instead of being prefixed twice.
 */
export function toE164(dialCode: string, phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : `${dialCode}${digits}`;
}
