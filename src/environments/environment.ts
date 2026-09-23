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
};
