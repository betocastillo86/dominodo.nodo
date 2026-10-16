export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5083/api/v1',
  baseDomain: 'nodo.dominodo.com', // TODO: confirm prod baseDomain
  defaultTenantSlug: 'conjunto-1', // TODO: replace with a real dev tenant slug
  ignoredHosts: ['www', 'localhost'],
  // Domi's WhatsApp number, E.164 without the `+` — where the resident surface sends the
  // resident back after booking. Mirrors `Twilio:FromNumber` in `dominodo.domi`, which is a
  // DIFFERENT number per environment: this is the non-production sender.
  domiWhatsAppNumber: '573181848969',
};
