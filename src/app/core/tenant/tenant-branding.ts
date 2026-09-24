/**
 * Document-level branding: the tab title and the favicon.
 *
 * Both have a Dominodo default baked into `index.html`, so a tenant that never
 * uploaded a logo (or a page rendered before the tenant resolves, like the
 * "conjunto no encontrado" screen) still shows the product icon instead of
 * Angular's. The tenant's own logo takes over when there is one.
 */

/** Ships in `public/`; the same file `index.html` points at. */
const DEFAULT_FAVICON = 'favicon.ico';

/** Product name — the tab always leads with it, the conjunto qualifies it. */
const APP_NAME = 'Dominodo';

/** `Dominodo - <conjunto>`, or just `Dominodo` while there is no tenant. */
export function applyDocumentTitle(tenantName: string | null | undefined): void {
  document.title = tenantName ? `${APP_NAME} - ${tenantName}` : APP_NAME;
}

/** Paints the conjunto's logo as the favicon, falling back to Dominodo's icon. */
export function applyFavicon(logoUrl: string | null | undefined): void {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  // No `type`: the tenant logo is a PNG/JPG/WEBP while the default is an .ico,
  // and a declared type that contradicts the file confuses some browsers.
  link.removeAttribute('type');
  link.href = logoUrl || DEFAULT_FAVICON;
}
