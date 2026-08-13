export const environment = {
  production: true,
  // PLACEHOLDER — stage API URL (Azure App Service). Update after the API is deployed to stage.
  apiBaseUrl: 'https://app-dominodo-api-stage.azurewebsites.net/api/v1',
  // PLACEHOLDER — stage base domain used to resolve the tenant from the subdomain.
  baseDomain: 'nodo-stage.dominodo.com',
  defaultTenantSlug: null as string | null, // resolve tenant from the domain in stage, like prod
  ignoredHosts: ['www', 'localhost'],
};
