export const environment = {
  production: true,
  // azurewebsites.net, not api.dominodo.com: F1 supports no custom domain.
  apiBaseUrl: 'https://app-dominodo-api-prod.azurewebsites.net/api/v1',
  baseDomain: 'dominodo.com',
  defaultTenantSlug: null as string | null,
  // `admin` and `api` sit at the tenant subdomain level — without them the resolver reads them as slugs.
  ignoredHosts: ['www', 'localhost', 'admin', 'api'],
};
