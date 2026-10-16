export const environment = {
  production: true,
  // PLACEHOLDER — stage API URL (Azure App Service). Update after the API is deployed to stage.
  apiBaseUrl: 'https://app-dominodo-api-stage.azurewebsites.net/api/v1',
  // PLACEHOLDER — stage base domain used to resolve the tenant from the subdomain.
  baseDomain: 'nodo-stage.dominodo.com',
  defaultTenantSlug: null as string | null, // resolve tenant from the domain in stage, like prod
  ignoredHosts: ['www', 'localhost'],
  // Domi's WhatsApp number, E.164 without the `+` — where the resident surface sends the
  // resident back after booking. The non-production sender, shared with dev
  // (`appsettings.Staging.json` in `dominodo.domi`).
  domiWhatsAppNumber: '573181848969',
};
