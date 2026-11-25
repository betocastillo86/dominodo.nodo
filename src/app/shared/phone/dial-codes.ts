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

/**
 * The reverse of `toE164`, to prefill a prefix select + national input from a
 * stored number. A prefix outside `DIAL_CODES` stays inside the national part,
 * `+` included — `toE164` keeps such a number as-is, so the round trip holds.
 */
export function splitE164(phone: string): { dialCode: string; phone: string } {
  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((option) => phone.startsWith(option.code));
  return match
    ? { dialCode: match.code, phone: phone.slice(match.code.length) }
    : { dialCode: DEFAULT_DIAL_CODE, phone };
}
