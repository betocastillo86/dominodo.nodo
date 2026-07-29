import { environment } from '../../../environments/environment';

/** Kebab-case slug shape enforced on the resolved candidate. */
const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Resolve the tenant slug once, at bootstrap. Pure function (host injectable for
 * testing). See docs/architecture.md §4.1.
 *
 * 1. Dev override: if `environment.defaultTenantSlug` is set, use it.
 * 2. Prod: first label of the host, minus `baseDomain`, excluding `ignoredHosts`.
 *
 * Returns the normalized slug, or `null` if unresolvable/invalid.
 */
export function resolveTenantSlug(hostname: string = window.location.hostname): string | null {
  const override = environment.defaultTenantSlug;
  if (override) {
    return normalize(override);
  }

  const host = hostname.toLowerCase();

  // Strip the base domain suffix to isolate the tenant labels.
  const base = environment.baseDomain.toLowerCase();
  const withoutBase = host.endsWith(base) ? host.slice(0, -base.length).replace(/\.$/, '') : host;

  const firstLabel = withoutBase.split('.')[0] ?? '';

  if (!firstLabel || environment.ignoredHosts.includes(firstLabel)) {
    return null;
  }

  return normalize(firstLabel);
}

function normalize(candidate: string): string | null {
  const slug = candidate.trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}
