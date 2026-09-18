/**
 * Tenant theme palette — the 13 values the API's `TenantTheme` enum accepts on
 * `GET/PUT /tenants/branding` (the API travels the enum by NAME, so these strings
 * are the wire format; do not translate them).
 *
 * Hex values are the ones Tabler v1 ships for each color. `Inverted` is not a
 * Tabler color: it stands for the dark neutral, so it maps to `--tblr-dark`.
 */
export type TenantThemeValue =
  | 'Blue'
  | 'Azure'
  | 'Indigo'
  | 'Purple'
  | 'Pink'
  | 'Red'
  | 'Orange'
  | 'Yellow'
  | 'Lime'
  | 'Green'
  | 'Teal'
  | 'Cyan'
  | 'Inverted';

export interface TenantThemeOption {
  /** Wire value sent to / received from the API. */
  value: TenantThemeValue;
  /** UI copy (Spanish). */
  label: string;
  /** Hex the theme paints `--tblr-primary` with. */
  color: string;
}

export const TENANT_THEMES: readonly TenantThemeOption[] = [
  { value: 'Blue', label: 'Azul', color: '#066fd1' },
  { value: 'Azure', label: 'Celeste', color: '#4299e1' },
  { value: 'Indigo', label: 'Índigo', color: '#4263eb' },
  { value: 'Purple', label: 'Morado', color: '#ae3ec9' },
  { value: 'Pink', label: 'Rosa', color: '#d6336c' },
  { value: 'Red', label: 'Rojo', color: '#d63939' },
  { value: 'Orange', label: 'Naranja', color: '#f76707' },
  { value: 'Yellow', label: 'Amarillo', color: '#f59f00' },
  { value: 'Lime', label: 'Lima', color: '#74b816' },
  { value: 'Green', label: 'Verde', color: '#2fb344' },
  { value: 'Teal', label: 'Turquesa', color: '#0ca678' },
  { value: 'Cyan', label: 'Cian', color: '#17a2b8' },
  { value: 'Inverted', label: 'Invertido', color: '#1f2937' },
];

export const DEFAULT_TENANT_THEME: TenantThemeValue = 'Blue';

/** Resolve a wire value (any casing) to its option; falls back to the default. */
export function resolveTheme(theme: string | null | undefined): TenantThemeOption {
  const match = TENANT_THEMES.find((t) => t.value.toLowerCase() === theme?.toLowerCase());
  return match ?? TENANT_THEMES[0];
}

/**
 * Repaint the app with the tenant's theme. Only `--tblr-primary` and its direct
 * derivatives need writing: Tabler v1 derives `--tblr-primary-darken` and
 * `--tblr-primary-lt` from it via `color-mix`, so buttons, links, badges, the
 * active nav underline and the branded top bar follow automatically.
 */
export function applyTenantTheme(theme: string | null | undefined): void {
  applyPrimaryColor(resolveTheme(theme).color);
}

/**
 * Lower-level entry point: paint an arbitrary hex as the primary color. Used by
 * the legacy branding path, where the API returns a raw color and no theme.
 */
export function applyPrimaryColor(color: string): void {
  const [r, g, b] = toRgb(color);
  const root = document.documentElement.style;

  root.setProperty('--tblr-primary', color);
  root.setProperty('--tblr-primary-rgb', `${r}, ${g}, ${b}`);
  // Text painted ON the primary color — white is unreadable over yellow/lime.
  root.setProperty('--tblr-primary-fg', bestForeground(color));
  // The 10%-over-white tint Tabler uses for soft badges/backgrounds.
  root.setProperty('--tblr-primary-lt-rgb', tint([r, g, b], 0.1).join(', '));
}

function toRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** 10% of the color over white — Tabler's `-lt` recipe, precomputed. */
function tint([r, g, b]: [number, number, number], ratio: number): number[] {
  return [r, g, b].map((channel) => Math.round(channel * ratio + 255 * (1 - ratio)));
}

/** Pick white or near-black for text over `hex`, whichever contrasts more (WCAG). */
function bestForeground(hex: string): string {
  const dark = '#1a2234';
  const background = luminance(toRgb(hex));
  const withWhite = (1.05) / (background + 0.05);
  const withDark = (background + 0.05) / (luminance(toRgb(dark)) + 0.05);
  return withWhite >= withDark ? '#ffffff' : dark;
}

function luminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}
