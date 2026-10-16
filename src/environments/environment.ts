export const environment = {
  production: true,
  // The prod API runs on a Free (F1) App Service plan, which supports no custom domain — hence the
  // azurewebsites.net host rather than api.dominodo.com.
  apiBaseUrl: 'https://app-dominodo-api-prod.azurewebsites.net/api/v1',
  baseDomain: 'dominodo.com',
  defaultTenantSlug: null as string | null,
  // `admin` and `api` are siblings of the tenant subdomains under this base domain, so they must be
  // ignored here or the resolver would read them as tenant slugs.
  ignoredHosts: ['www', 'localhost', 'admin', 'api'],
  // Domi's WhatsApp number, E.164 without the `+` — where the resident surface sends the
  // resident back after booking. The PRODUCTION sender, which differs from the one dev and
  // stage share (`appsettings.Production.json` in `dominodo.domi`).
  domiWhatsAppNumber: '573148841885',
};
