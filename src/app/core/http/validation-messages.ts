import type { ProblemDetailError } from './problem-details';

/**
 * Spanish copy for one entry of a `Validation.Failed` problem's `errors[]`.
 *
 * Those entries are FluentValidation output (or MVC model binding), so their
 * `message` is English — either a FluentValidation default ("'Title' must not
 * be empty.") or a validator's own `WithMessage`. Neither is shown as is: the
 * known custom messages are matched exactly, the defaults by their template,
 * and the field is named from `property` through `FIELD_LABELS`. Anything that
 * matches nothing still yields a Spanish sentence naming the field.
 */
export function translateFieldError(error: ProblemDetailError): string {
  const message = error.message.trim();
  const custom = CUSTOM_MESSAGES[message];
  if (custom) {
    return custom;
  }
  for (const [pattern, render] of CUSTOM_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      return render(match);
    }
  }

  const field = fieldLabel(error.property);
  for (const [pattern, render] of DEFAULT_TEMPLATES) {
    const match = pattern.exec(message);
    if (match) {
      return render(field, match);
    }
  }
  return `${field}: el valor no es válido.`;
}

/**
 * Spanish name of a request field, by the last segment of the API's property
 * path (`Policy.MinHours` → `MinHours`, case-insensitive). Add a field here
 * when a new validator names one that is missing — the fallback is generic.
 */
const FIELD_LABELS: Record<string, string> = {
  additionalinfo: 'Información adicional',
  additionalservices: 'Servicios adicionales',
  address: 'Dirección',
  administratorname: 'Nombre del administrador',
  amenityid: 'Área social',
  amountpaid: 'Valor pagado',
  apartmentid: 'Apartamento',
  area: 'Área',
  attendees: 'Asistentes',
  audiencefilter: 'Destinatarios',
  audiencetype: 'Tipo de destinatarios',
  autoclosedays: 'Días para cierre automático',
  bedrooms: 'Habitaciones',
  body: 'Contenido',
  branding: 'Marca',
  cancelbeforetotaldays: 'Plazo de cancelación',
  categoryid: 'Categoría',
  city: 'Ciudad',
  code: 'Código',
  comment: 'Comentario',
  contactinfo: 'Información de contacto',
  contactphone: 'Teléfono de contacto',
  contenttype: 'Tipo de archivo',
  country: 'País',
  currentpassword: 'Contraseña actual',
  dayofweek: 'Día de la semana',
  description: 'Descripción',
  email: 'Correo electrónico',
  endsatutc: 'Fin',
  filekey: 'Archivo',
  filename: 'Nombre del archivo',
  firstname: 'Nombre',
  from: 'Desde',
  fromutc: 'Desde',
  lastname: 'Apellido',
  legalid: 'NIT',
  liveshere: 'Vive aquí',
  location: 'Ubicación',
  logokey: 'Logo',
  maxhours: 'Duración máxima',
  maxoccupancy: 'Aforo máximo',
  maxperdayperapartment: 'Reservas diarias por apartamento',
  minhours: 'Duración mínima',
  name: 'Nombre',
  newpassword: 'Nueva contraseña',
  note: 'Nota',
  number: 'Número',
  openinghours: 'Horario de atención',
  overduebalance: 'Saldo en mora',
  page: 'Página',
  pagesize: 'Tamaño de página',
  password: 'Contraseña',
  paymentproofexpiryhours: 'Plazo del comprobante de pago',
  pendingexpiryhours: 'Plazo de las reservas pendientes',
  permissionids: 'Permisos',
  phone: 'Teléfono',
  photokeys: 'Fotos',
  photourl: 'Foto',
  policy: 'Reglas de reserva',
  price: 'Precio',
  priority: 'Prioridad',
  reason: 'Motivo',
  relationtype: 'Relación',
  roleid: 'Rol',
  schedules: 'Horarios',
  slug: 'Identificador',
  status: 'Estado',
  text: 'Texto',
  theme: 'Tema',
  title: 'Título',
  to: 'Hasta',
  tower: 'Torre',
  towers: 'Torres',
  type: 'Tipo',
  usagerules: 'Reglas de uso',
  userid: 'Usuario',
  value: 'Valor',
  vehicleplate: 'Placa del vehículo',
  visibility: 'Visibilidad',
  visitordocument: 'Documento del visitante',
  visitorname: 'Nombre del visitante',
};

function fieldLabel(property: string): string {
  const segment = (property.split('.').pop() ?? property).replace(/\[\d+\]$/, '');
  return FIELD_LABELS[segment.toLowerCase()] ?? 'Un campo';
}

/** Validators' own `WithMessage` sentences, verbatim. */
const CUSTOM_MESSAGES: Record<string, string> = {
  'A logo cannot be set while creating a tenant. Save the branding afterwards.':
    'El logo no se puede definir al crear el conjunto. Guárdalo después en la marca.',
  'A RecipientUserId or a RecipientEmail is required.': 'Indica un usuario o un correo destinatario.',
  'An audience filter is required for ByTower / ByApartments announcements.':
    'Selecciona las torres o apartamentos destinatarios.',
  'Apartment assignment is only allowed when the role is Residente.':
    'Solo se puede asignar un apartamento cuando el rol es Residente.',
  'createdToUtc cannot be earlier than createdFromUtc.':
    'La fecha final no puede ser anterior a la inicial.',
  'expiresToUtc cannot be earlier than expiresFromUtc.':
    'La fecha final de vencimiento no puede ser anterior a la inicial.',
  'from is required.': 'La fecha inicial es obligatoria.',
  'to is required.': 'La fecha final es obligatoria.',
  'fromUtc must be earlier than toUtc.': 'La fecha inicial debe ser anterior a la final.',
  'to cannot be earlier than from.': 'La fecha final no puede ser anterior a la inicial.',
  'Password must contain a digit.': 'La contraseña debe tener al menos un número.',
  'Password must contain a lowercase letter.': 'La contraseña debe tener al menos una minúscula.',
  'Password must contain an uppercase letter.': 'La contraseña debe tener al menos una mayúscula.',
  'Phone must be in E.164 format (e.g. +573001234567).':
    'El teléfono no tiene un formato válido (por ejemplo, +573001234567).',
  'Purpose is not a known handoff purpose.': 'El propósito del enlace no es válido.',
  'Slug must be lowercase kebab-case (letters, digits and hyphens only).':
    'El identificador solo puede tener minúsculas, números y guiones.',
  'The tower list cannot repeat a tower.': 'Hay torres repetidas.',
  'Theme must be one of the supported tenant themes.': 'El tema seleccionado no es válido.',
  'EmailSubject is required when EmailEnabled is true.': 'El asunto del correo es obligatorio.',
  'EmailBodyHtml is required when EmailEnabled is true.': 'El contenido del correo es obligatorio.',
  'PushText is required when PushEnabled is true.': 'El texto de la notificación push es obligatorio.',
  'InAppText is required when InAppEnabled is true.': 'El texto de la notificación es obligatorio.',
  'WhatsAppText is required when WhatsAppEnabled is true.': 'El texto de WhatsApp es obligatorio.',
  'The value is invalid.': 'Uno de los valores no es válido.',
};

/** Validators' own interpolated `WithMessage` sentences. */
const CUSTOM_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^A conjunto cannot declare more than (\d+) towers\.$/, (m) => `El conjunto puede tener máximo ${m[1]} torres.`],
  [/^Each tower must be at most (\d+) characters\.$/, (m) => `Cada torre puede tener máximo ${m[1]} caracteres.`],
  [/^Between (\d+) and (\d+) photo keys are required\.$/, (m) => `Agrega entre ${m[1]} y ${m[2]} fotos.`],
  [/^The range cannot span more than (\d+) days\.$/, (m) => `El rango no puede superar ${m[1]} días.`],
];

/** FluentValidation's default English templates (and System.Text.Json's binding error). */
const DEFAULT_TEMPLATES: [RegExp, (field: string, m: RegExpExecArray) => string][] = [
  [/must not be empty\.$/, (f) => `${f}: es obligatorio.`],
  [/must be (\d+) characters or fewer/, (f, m) => `${f}: máximo ${m[1]} caracteres.`],
  [/must be at least (\d+) characters/, (f, m) => `${f}: mínimo ${m[1]} caracteres.`],
  [/must be between (\d+) and (\d+) characters/, (f, m) => `${f}: entre ${m[1]} y ${m[2]} caracteres.`],
  [/is not a valid email address\.$/, (f) => `${f}: no es un correo electrónico válido.`],
  [/must be greater than or equal to '([^']*)'/, (f, m) => `${f}: debe ser mayor o igual que ${m[1]}.`],
  [/must be greater than '([^']*)'/, (f, m) => `${f}: debe ser mayor que ${m[1]}.`],
  [/must be less than or equal to '([^']*)'/, (f, m) => `${f}: debe ser menor o igual que ${m[1]}.`],
  [/must be less than '([^']*)'/, (f, m) => `${f}: debe ser menor que ${m[1]}.`],
  [/must be between (\S+) and (\S+)\./, (f, m) => `${f}: debe estar entre ${m[1]} y ${m[2]}.`],
  [/has a range of values which does not include/, (f) => `${f}: el valor no es válido.`],
  [/is not in the correct format\.$/, (f) => `${f}: el formato no es válido.`],
  [/must not be equal to/, (f) => `${f}: el valor no está permitido.`],
  [/The JSON value could not be converted/, (f) => `${f}: el valor no es válido.`],
];
