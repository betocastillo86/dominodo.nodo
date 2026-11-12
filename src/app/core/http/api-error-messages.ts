import type { ProblemDetails } from './problem-details';

/**
 * Spanish copy for a ProblemDetails, chosen by its code. A function receives the
 * whole problem for the few codes whose English `detail` carries a number worth
 * keeping (a limit, a capacity); everything else is a plain sentence.
 */
export type ApiErrorMessage = string | ((problem: ProblemDetails) => string);

/**
 * Every error code `dominodo.api` can return, mapped to the Spanish sentence the
 * portal shows.
 *
 * The API puts the CODE in ProblemDetails' `title` and an English sentence in
 * `detail` (`ErrorResults.ToProblem`), so the code is what we key on and the
 * `detail` is never shown — UI copy is Spanish. `toMessage` reads this table;
 * a code missing from it falls back to a generic sentence by HTTP status (and
 * logs a warning in dev), so a new API code shows something sensible but still
 * belongs here.
 *
 * Kept in sync with the API by `npm run check:error-codes`, which scans
 * `../dominodo.api/src` and lists the codes missing from this table. Feature
 * mappers (`reservation-errors.ts`, `reservation-action-errors.ts`) override a
 * code only when their audience needs different words; this is the default.
 *
 * Grouped by the code's prefix, alphabetically, one key per code.
 */
export const API_ERROR_MESSAGES: Record<string, ApiErrorMessage> = {
  // ── Cross-cutting ──────────────────────────────────────────────────────────
  'Validation.Failed': 'Algunos datos no son válidos. Revisa el formulario e inténtalo de nuevo.',
  'RateLimit.Exceeded': 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
  'Handoff.InvalidTicket':
    'Este enlace ya no es válido. Es posible que haya expirado o que ya se haya usado.',
  'Handoff.OutOfScope': 'Este enlace no permite realizar esta acción.',

  // ── Auth / users ───────────────────────────────────────────────────────────
  'Auth.AccountNotActive': 'Tu cuenta no está activa. Comunícate con la administración.',
  // Login and change-password share the code; only the English detail tells them apart.
  'Auth.InvalidCredentials': (p) =>
    /current password/i.test(p.detail ?? '')
      ? 'La contraseña actual es incorrecta.'
      : 'El teléfono o la contraseña son incorrectos.',
  'Auth.InvalidRefreshToken': 'Tu sesión expiró. Inicia sesión nuevamente.',
  'Auth.UserNotFound': 'Tu usuario ya no existe. Inicia sesión nuevamente.',
  'Email.Invalid': 'El correo electrónico no es válido.',
  'Gateway.IdentityNotResolvable': 'No pudimos identificar al usuario.',
  'Gateway.InvalidCredential': 'La credencial de integración no es válida.',
  'Gateway.InvalidRefreshToken': 'Tu sesión expiró. Inicia sesión nuevamente.',
  'Gateway.UserNotFound': 'No pudimos identificar al usuario.',
  'Otp.Expired': 'El código de verificación expiró. Solicita uno nuevo.',
  'Otp.Invalid': 'El código de verificación no es válido.',
  'Otp.NotFound': 'No hay un código de verificación activo para este teléfono. Solicita uno nuevo.',
  'Otp.TooManyAttempts': 'Demasiados intentos con el código de verificación. Solicita uno nuevo.',
  'PasswordReset.Expired': 'El enlace de recuperación expiró. Solicita uno nuevo.',
  'PasswordReset.InvalidToken': 'El enlace de recuperación no es válido o ya se usó.',
  'Phone.Invalid': 'El teléfono no tiene un formato válido (por ejemplo, +573001234567).',
  'Phone.Required': 'El teléfono es obligatorio.',
  'User.AlreadyActive': 'El usuario ya está activo.',
  'User.EmailAlreadyRegistered': 'Ya existe un usuario con este correo electrónico.',
  'User.EmailTaken': 'Este correo electrónico ya pertenece a otro usuario.',
  'User.FirstNameRequired': 'El nombre es obligatorio.',
  'User.FirstNameTooLong': (p) => tooLong('El nombre', p),
  'User.LastNameRequired': 'El apellido es obligatorio.',
  'User.LastNameTooLong': (p) => tooLong('El apellido', p),
  'User.NotFound': 'El usuario no existe.',
  'User.PasswordHashRequired': 'La contraseña es obligatoria.',
  'User.PasswordNotSet': 'La cuenta aún no tiene contraseña. Usa la opción de recuperar contraseña.',
  'User.PhoneAlreadyRegistered': 'Ya existe un usuario con este teléfono.',
  'User.PhoneAlreadyVerified': 'El teléfono ya está verificado.',

  // ── Memberships, roles, invitations ────────────────────────────────────────
  'Invitation.AlreadyAccepted': 'Esta persona ya aceptó una invitación a este conjunto.',
  'Invitation.AlreadyPending': 'Ya existe una invitación activa para esta persona.',
  'Invitation.EmailRequired': 'Para invitar a alguien que no está registrado se necesita su correo.',
  'Invitation.NotPending': 'Solo se puede renovar una invitación pendiente.',
  'Membership.AlreadyExists': 'Este usuario ya pertenece a este conjunto.',
  'Membership.AlreadySuspended': 'La membresía ya está suspendida.',
  'Membership.ApartmentNotFound': 'El apartamento no existe en este conjunto.',
  'Membership.FirstNameRequired': 'Para registrar a un residente por teléfono se necesita su nombre.',
  'Membership.NoEmail': 'La persona no tiene correo registrado; indica uno.',
  'Membership.NotActive': 'Solo se puede suspender una membresía activa.',
  'Membership.NotFound': 'No hay una membresía por aceptar en este conjunto.',
  'Membership.NotInvited': 'Solo se puede aceptar una membresía invitada.',
  'Membership.NotSuspended': 'Solo se puede readmitir una membresía suspendida.',
  'Membership.RelationInvalid': 'La relación debe ser Propietario o Arrendatario.',
  'Membership.RelationRequired': 'La relación con el apartamento es obligatoria.',
  'Membership.RoleNotFound': 'El rol no existe.',
  'Membership.RoleNotTenantScoped': 'Ese rol no se puede asignar dentro de un conjunto.',
  'Membership.TenantRequired': 'Falta el conjunto.',
  'Membership.UserRequired': 'El usuario es obligatorio.',
  'Role.InvalidPermissions': 'Uno o más permisos no existen.',
  'Role.NameAlreadyExists': 'Ya existe un rol con este nombre.',
  'Role.NameRequired': 'El nombre del rol es obligatorio.',
  'Role.NotFound': 'El rol no existe.',
  'Role.SystemImmutable': 'Los roles del sistema no se pueden modificar.',

  // ── Tenant ─────────────────────────────────────────────────────────────────
  'Branding.LogoKeyMismatch': 'El logo no corresponde a los archivos de este conjunto. Súbelo de nuevo.',
  'SeedTenantDefaults.TenantRequired': 'Falta el conjunto.',
  'SystemSetting.AlreadyExists': 'Ya existe una configuración con esta clave.',
  'SystemSetting.KeyRequired': 'La clave de la configuración es obligatoria.',
  'SystemSetting.NotFound': 'La configuración no existe.',
  'SystemSetting.ValueRequired': 'El valor de la configuración es obligatorio.',
  'Tenant.AlreadyActive': 'El conjunto ya está activo.',
  'Tenant.AlreadyOnboarding': 'El conjunto ya está en proceso de alistamiento.',
  'Tenant.AlreadySuspended': 'El conjunto ya está suspendido.',
  'Tenant.Inactive': 'Este conjunto no está activo.',
  'Tenant.InvalidSlug': 'El identificador solo puede tener minúsculas, números y guiones.',
  'Tenant.InvalidStatus': 'El estado del conjunto no es válido.',
  'Tenant.NameRequired': 'El nombre del conjunto es obligatorio.',
  'Tenant.NotFound': 'El conjunto no existe.',
  'Tenant.Required': 'No se pudo identificar el conjunto.',
  'Tenant.SlugAlreadyExists': 'Ya existe un conjunto con este identificador.',
  'Tenant.Unknown': 'El conjunto no existe.',
  'TenantFile.ContentTypeNotAllowed': 'Este tipo de archivo no está permitido aquí.',
  'TenantFile.UnknownPurpose': 'Este tipo de carga de archivo no está soportado.',

  // ── Apartments, residents, account statements ──────────────────────────────
  'AccountStatement.BalanceNegative': 'El saldo en mora no puede ser negativo.',
  'Apartment.AlreadyExists': 'Ya existe un apartamento con esa torre y ese número.',
  'Apartment.NotAMember': 'No eres miembro activo de este conjunto.',
  'Apartment.NotFound': 'El apartamento no existe.',
  'Apartment.NumberRequired': 'El número del apartamento es obligatorio.',
  'Apartment.TenantRequired': 'Falta el conjunto.',
  'Apartment.TowerNotAllowed': (p) => {
    const tower = /'([^']*)'/.exec(p.detail ?? '')?.[1];
    return tower
      ? `La torre «${tower}» no está registrada en el conjunto.`
      : 'La torre no está registrada en el conjunto.';
  },
  'ApartmentResident.AlreadyAssigned': 'Esta persona ya es residente activo de este apartamento.',
  'ApartmentResident.AlreadyEnded': 'Esta residencia ya terminó.',
  'ApartmentResident.NotFound': 'La residencia no existe en este apartamento.',
  'ApartmentResident.UserRequired': 'El residente es obligatorio.',
  'Residency.NotLivingHere': 'No figuras como residente activo de este conjunto.',
  'Residency.NotLivingInApartment': 'No figuras como residente activo de ese apartamento.',

  // ── Bulk imports (apartments + account statements share the wording) ──────
  ...importMessages('ApartmentImport'),
  'ApartmentImport.ApartmentRequired': 'El apartamento es obligatorio.',
  'ApartmentImport.FileEmpty': 'El archivo tiene encabezado pero ninguna fila de datos.',
  'ApartmentImport.HeaderInvalid':
    'La primera fila del archivo debe ser el encabezado con las columnas obligatorias.',
  'ApartmentImport.PhoneRequired': 'Cada fila de residente necesita un teléfono.',
  ...importMessages('AccountStatementImport'),
  'AccountStatementImport.FileEmpty': 'El archivo está vacío.',
  'AccountStatementImport.HeaderInvalid':
    'La primera fila del archivo debe ser el encabezado con las columnas esperadas.',

  // ── Requests (PQRS) ────────────────────────────────────────────────────────
  'Request.ApartmentAmbiguous':
    'El residente vive en más de un apartamento; indica a cuál corresponde la solicitud.',
  'Request.ApartmentNotFound': 'El apartamento indicado no existe.',
  'Request.AssigneeRequired': 'El responsable es obligatorio.',
  'Request.AuthorRequired': 'El autor es obligatorio.',
  'Request.CategoryRequired': 'La categoría es obligatoria.',
  'Request.DescriptionRequired': 'La descripción es obligatoria.',
  'Request.FeatureDisabled': 'Este conjunto no tiene habilitadas las solicitudes (PQRS).',
  'Request.Forbidden': 'No tienes permiso para actualizar esta solicitud.',
  'Request.InvalidTransition':
    'La solicitud no puede pasar a ese estado desde el estado actual. Actualiza la página.',
  'Request.NotAMember': 'No eres miembro activo de este conjunto.',
  'Request.NotFound': 'La solicitud no existe.',
  'Request.NotResolved': 'Solo se puede cerrar automáticamente una solicitud resuelta.',
  'Request.ReporterRequired': 'Quien reporta es obligatorio.',
  'Request.SameStatus': 'La solicitud ya está en ese estado.',
  'Request.TenantRequired': 'Falta el conjunto.',
  'Request.Terminal': 'Una solicitud cerrada no se puede modificar.',
  'Request.TitleRequired': 'El título es obligatorio.',
  ...attachmentMessages('RequestAttachment'),
  'RequestAttachment.KeyMismatch': 'El archivo no corresponde a esta solicitud. Súbelo de nuevo.',
  'RequestAttachment.NotFound': 'El adjunto no existe.',
  'RequestAttachment.UpdateNotFound': 'La actualización indicada no pertenece a esta solicitud.',
  'RequestCategory.AlreadyActive': 'La categoría ya está activa.',
  'RequestCategory.AlreadyInactive': 'La categoría ya está inactiva.',
  'RequestCategory.CodeRequired': 'El código de la categoría es obligatorio.',
  'RequestCategory.CodeTaken': 'Ya existe una categoría con ese código.',
  'RequestCategory.DescriptionRequired': 'La descripción de la categoría es obligatoria.',
  'RequestCategory.Inactive': 'La categoría seleccionada no está activa.',
  'RequestCategory.NameRequired': 'El nombre de la categoría es obligatorio.',
  'RequestCategory.NotFound': 'La categoría no existe.',
  'RequestParticipant.AlreadyParticipant': 'Esta persona ya participa en la solicitud.',
  'RequestParticipant.UserRequired': 'El participante es obligatorio.',

  // ── Announcements ──────────────────────────────────────────────────────────
  'Announcement.AlreadyArchived': 'El comunicado ya está archivado.',
  'Announcement.Archived': 'Un comunicado archivado no se puede editar.',
  'Announcement.BodyRequired': 'El contenido es obligatorio.',
  'Announcement.CategoryRequired': 'La categoría es obligatoria.',
  'Announcement.FeatureDisabled': 'Este conjunto no tiene habilitados los comunicados.',
  'Announcement.Forbidden': 'No tienes permiso para ver los comunicados de este conjunto.',
  'Announcement.NotDraft': 'Solo se puede publicar un comunicado en borrador.',
  'Announcement.NotFound': 'El comunicado no existe.',
  'Announcement.TenantRequired': 'Falta el conjunto.',
  'Announcement.TitleRequired': 'El título es obligatorio.',

  // ── Knowledge resources ────────────────────────────────────────────────────
  'KnowledgeResource.Archived': 'Un recurso archivado no se puede editar.',
  'KnowledgeResource.BodyRequired': 'El contenido es obligatorio.',
  'KnowledgeResource.Forbidden': 'No tienes permiso para ver los recursos de este conjunto.',
  'KnowledgeResource.InvalidTransition':
    'El recurso no puede pasar a ese estado desde el estado actual. Actualiza la página.',
  'KnowledgeResource.NotFound': 'El recurso no existe.',
  'KnowledgeResource.TenantRequired': 'Falta el conjunto.',
  'KnowledgeResource.TitleRequired': 'El título es obligatorio.',

  // ── Amenities (social areas) + their reservation policy ────────────────────
  'Amenity.DuplicatePhotoKey': 'Hay fotos repetidas.',
  'Amenity.FeatureDisabled': 'Este conjunto no tiene habilitadas las áreas sociales.',
  'Amenity.Forbidden': 'No tienes permiso para ver las áreas sociales de este conjunto.',
  'Amenity.MaxOccupancyInvalid': 'El aforo máximo debe ser mayor que cero.',
  'Amenity.NameRequired': 'El nombre es obligatorio.',
  'Amenity.NameTooLong': (p) => tooLong('El nombre', p),
  'Amenity.NotFound': 'El área social no existe.',
  'Amenity.PhotoKeyInvalid': 'Una de las fotos no corresponde a este conjunto. Súbela de nuevo.',
  'Amenity.PhotoKeyRequired': 'Una de las fotos está vacía. Súbela de nuevo.',
  'Amenity.PhotoRequired': 'Agrega al menos una foto.',
  'Amenity.PolicyRequired': 'Las reglas de reserva son obligatorias.',
  'Amenity.TenantRequired': 'Falta el conjunto.',
  'Amenity.TooManyPhotos': (p) => {
    const max = firstNumber(p);
    return max ? `Un área social puede tener máximo ${max} fotos.` : 'El área social tiene demasiadas fotos.';
  },
  'AmenityPhoto.ContentTypeNotAllowed': 'Este tipo de archivo no está permitido para fotos.',
  'AmenityPhoto.Forbidden': 'No tienes permiso para subir fotos de áreas sociales.',
  'ReservationPolicy.AdditionalServicesTooLong': (p) => tooLong('Los servicios adicionales', p),
  'ReservationPolicy.CancelBeforeTotalDaysInvalid': (p) => {
    const max = firstNumber(p);
    return max
      ? `El plazo de cancelación debe estar entre 0 y ${max} días.`
      : 'El plazo de cancelación no es válido.';
  },
  'ReservationPolicy.DayOfWeekInvalid': 'Uno de los horarios tiene un día de la semana no válido.',
  'ReservationPolicy.MaxHoursInvalid': 'La duración máxima no puede ser menor que la mínima.',
  'ReservationPolicy.MaxPerDayPerApartmentInvalid':
    'El límite diario de reservas por apartamento debe ser mayor que cero.',
  'ReservationPolicy.MinHoursInvalid': 'La duración mínima debe ser de al menos una hora.',
  'ReservationPolicy.PaymentProofExpiryHoursInvalid':
    'El plazo para enviar el comprobante de pago debe ser mayor que cero horas.',
  'ReservationPolicy.PendingExpiryHoursInvalid':
    'El plazo de vencimiento de las reservas pendientes debe ser mayor que cero horas.',
  'ReservationPolicy.PriceInvalid': 'El precio debe ser mayor que cero.',
  'ReservationPolicy.PriceRequired': 'Indica el precio, porque el área exige pago.',
  'ReservationPolicy.SlotInvalid': 'Cada horario debe cerrar después de abrir.',
  'ReservationPolicy.SlotsOverlap': 'Hay dos horarios del mismo día que se cruzan.',
  'ReservationPolicy.UsageRulesTooLong': (p) => tooLong('Las reglas de uso', p),

  // ── Reservations ───────────────────────────────────────────────────────────
  'Reservation.ActorRequired': 'Falta quién realiza la acción.',
  'Reservation.AlreadyStarted': 'La reserva ya empezó, así que no se puede modificar.',
  'Reservation.AmenityNotAvailable': 'El área social está temporalmente fuera de servicio.',
  'Reservation.AmenityNotFound': 'El área social no existe.',
  'Reservation.AmenityRequired': 'El área social es obligatoria.',
  'Reservation.AmountInvalid': 'El valor pagado no puede ser negativo.',
  'Reservation.ApartmentAmbiguous':
    'La persona vive en más de un apartamento; indica a nombre de cuál es la reserva.',
  'Reservation.ApartmentDailyLimitReached': (p) => {
    const max = firstNumber(p);
    return max
      ? `El apartamento ya alcanzó el máximo de ${max} reserva(s) diaria(s) para esta área.`
      : 'El apartamento ya alcanzó el máximo de reservas diarias para esta área.';
  },
  'Reservation.ApartmentNotFound': 'El apartamento no existe.',
  'Reservation.ApartmentOverdue':
    'El apartamento tiene saldo en mora y esta área social solo se puede reservar estando al día.',
  'Reservation.ApartmentRequired': 'El apartamento es obligatorio.',
  'Reservation.AttendeesExceedCapacity': (p) => {
    const max = firstNumber(p);
    return max
      ? `El número de asistentes supera el aforo del área (${max} personas).`
      : 'El número de asistentes supera el aforo del área.';
  },
  'Reservation.AttendeesRequired': 'Indica cuántas personas asistirán.',
  'Reservation.CancellationWindowClosed': (p) => {
    const days = firstNumber(p);
    return days
      ? `Una reserva confirmada solo se puede cancelar con al menos ${days} día(s) de anticipación.`
      : 'Ya pasó el plazo de cancelación que exige el área para esta reserva.';
  },
  'Reservation.CodeRequired': 'El código de la reserva es obligatorio.',
  'Reservation.CommentTooLong': (p) => tooLong('El comentario', p),
  'Reservation.CrossesMidnight': 'La reserva no puede pasar de la medianoche.',
  'Reservation.DayAlreadyBooked': 'Esta área ya tiene una reserva ese día.',
  'Reservation.DeadlineNotReached': 'Todavía no ha vencido ningún plazo de esta reserva.',
  'Reservation.DurationNotWholeHours': 'La reserva debe durar un número exacto de horas.',
  'Reservation.DurationTooLong': (p) => {
    const max = firstNumber(p);
    return max ? `La reserva no puede durar más de ${max} hora(s).` : 'La reserva es demasiado larga.';
  },
  'Reservation.DurationTooShort': (p) => {
    const min = firstNumber(p);
    return min ? `La reserva debe durar al menos ${min} hora(s).` : 'La reserva es demasiado corta.';
  },
  'Reservation.FeatureDisabled': 'Este conjunto no tiene habilitadas las reservas de áreas sociales.',
  'Reservation.Forbidden': 'No tienes permiso para realizar esta acción sobre la reserva.',
  'Reservation.NoResidency': 'No figuras como residente activo de este conjunto.',
  'Reservation.NotAMember': 'No eres miembro activo de este conjunto.',
  'Reservation.NotAResident': 'No figuras como residente activo de ese apartamento.',
  'Reservation.NotCancellable': 'Solo se puede cancelar una reserva pendiente o confirmada.',
  'Reservation.NotFound': 'La reserva no existe.',
  'Reservation.NotPending': 'Esta reserva ya no está pendiente. Actualiza la página.',
  'Reservation.NotReschedulable': 'Solo se puede reprogramar una reserva pendiente o confirmada.',
  'Reservation.OutsideOpeningHours': 'El horario elegido está por fuera del horario de atención del área.',
  'Reservation.ProofsNotAllowed':
    'Solo se pueden adjuntar comprobantes a una reserva pendiente o confirmada.',
  'Reservation.ReasonRequired': 'Escribe el motivo.',
  'Reservation.ReasonTooLong': (p) => tooLong('El motivo', p),
  'Reservation.SlotTaken': 'Ese horario ya está reservado. Elige otro.',
  'Reservation.StartInPast': 'Ese horario ya pasó. Elige uno más adelante.',
  'Reservation.StartNotOnTheHour': 'La reserva debe empezar en una hora en punto.',
  'Reservation.TenantRequired': 'Falta el conjunto.',
  'Reservation.TooManyPaymentProofs': (p) => {
    const max = firstNumber(p);
    return max
      ? `Una reserva puede tener máximo ${max} comprobantes de pago.`
      : 'La reserva ya tiene el máximo de comprobantes de pago.';
  },
  'Reservation.UserRequired': 'El titular de la reserva es obligatorio.',
  'Reservation.WindowInvalid': 'La reserva debe terminar después de empezar.',
  ...attachmentMessages('ReservationPaymentProof'),
  'ReservationPaymentProof.KeyMismatch': 'El archivo no corresponde a esta reserva. Súbelo de nuevo.',
  'ReservationPaymentProof.NotFound': 'El comprobante de pago no existe.',

  // ── Deliveries, visits, listings ───────────────────────────────────────────
  'Delivery.ApartmentRequired': 'El apartamento de destino es obligatorio.',
  'Delivery.FeatureDisabled': 'Este conjunto no tiene habilitada la gestión de paquetes.',
  'Delivery.InvalidTransition': 'El paquete no se puede notificar en su estado actual.',
  'Delivery.NotFound': 'El paquete no existe.',
  'Delivery.RegistrarRequired': 'Falta quién registra el paquete.',
  'Delivery.TenantRequired': 'Falta el conjunto.',
  'Delivery.Terminal': 'Un paquete entregado o devuelto no se puede modificar.',
  'Listing.ApartmentNotFound': 'El apartamento indicado no existe.',
  'Listing.ApartmentRequired': 'El apartamento es obligatorio.',
  'Listing.AreaInvalid': 'El área debe ser mayor que cero.',
  'Listing.BedroomsInvalid': 'El número de habitaciones no puede ser negativo.',
  'Listing.ContactRequired': 'El teléfono de contacto es obligatorio.',
  'Listing.CreatorRequired': 'Falta quién crea el anuncio.',
  'Listing.DescriptionRequired': 'La descripción es obligatoria.',
  'Listing.Forbidden': 'No tienes permiso para editar este anuncio.',
  'Listing.NotFound': 'El anuncio no existe.',
  'Listing.PriceInvalid': 'El precio debe ser mayor que cero.',
  'Listing.TenantRequired': 'Falta el conjunto.',
  'Visit.AlreadyFinished': 'La visita ya terminó.',
  'Visit.ApartmentRequired': 'El apartamento de destino es obligatorio.',
  'Visit.FeatureDisabled': 'Este conjunto no tiene habilitado el registro de visitas.',
  'Visit.Finished': 'Una visita terminada no se puede modificar.',
  'Visit.InvalidAmount': 'El valor pagado no puede ser negativo.',
  'Visit.NotFound': 'La visita no existe.',
  'Visit.RegistrarRequired': 'Falta quién registra la visita.',
  'Visit.TenantRequired': 'Falta el conjunto.',
  'Visit.VisitorNameRequired': 'El nombre del visitante es obligatorio.',

  // ── Notifications, devices, Domi chat ──────────────────────────────────────
  'Chat.ConversationNotFound': 'La conversación no existe.',
  'Chat.InvalidPhone': 'El número de teléfono no es válido.',
  'Chat.MediaRejected': 'Domi no aceptó el archivo. Revisa su tipo y tamaño.',
  'Chat.NoConversation': 'No hay una conversación para ese número de teléfono.',
  'Chat.UpstreamUnavailable': 'Domi no está disponible en este momento. Inténtalo de nuevo más tarde.',
  'ChatFeedback.TenantForbidden': 'No tienes permiso para ver las conversaciones de este conjunto.',
  'DeviceRegistration.NotFound': 'El dispositivo no existe.',
  'DeviceRegistration.TokenRequired': 'Falta el identificador del dispositivo.',
  'DeviceRegistration.UserRequired': 'El usuario es obligatorio.',
  'EmailMessage.RecipientRequired': 'El correo del destinatario es obligatorio.',
  'InAppMessage.NotFound': 'La notificación no existe.',
  'InAppMessage.RecipientRequired': 'El destinatario es obligatorio.',
  'InAppMessage.TenantRequired': 'Falta el conjunto.',
  'InAppMessage.TitleRequired': 'El título es obligatorio.',
  'Notification.RecipientNotFound': 'El destinatario no existe.',
  'NotificationTemplate.NotFound': 'La plantilla de notificación no existe.',
  'NotificationTemplate.UnknownWhatsAppVariable':
    'La plantilla usa una variable que no está disponible para este tipo de notificación.',
  'NotificationTemplate.WhatsAppTextReadOnly':
    'El texto de WhatsApp no se puede editar mientras la plantilla esté aprobada.',
  'PushMessage.RecipientRequired': 'El destinatario es obligatorio.',
  'PushMessage.TenantRequired': 'Falta el conjunto.',
  'WhatsAppMessage.BodyRequired': 'El mensaje es obligatorio.',
  'WhatsAppMessage.RecipientRequired': 'El teléfono del destinatario es obligatorio.',
};

/** The import lifecycle codes both bulk imports share, under their own prefix. */
function importMessages(prefix: string): Record<string, ApiErrorMessage> {
  return {
    [`${prefix}.Expired`]: 'La validación de esta carga expiró. Sube el archivo de nuevo.',
    [`${prefix}.FileKeyRequired`]: 'Falta el archivo. Súbelo de nuevo.',
    [`${prefix}.FileTooLarge`]: (p) => {
      const bytes = firstNumber(p);
      return bytes
        ? `El archivo supera el límite de ${formatMegabytes(bytes)}.`
        : 'El archivo es demasiado grande.';
    },
    [`${prefix}.FileUnreadable`]:
      'No pudimos leer el archivo como CSV. Verifica que esté guardado en formato CSV.',
    [`${prefix}.InvalidFileKey`]: 'El archivo no corresponde a esta carga. Súbelo de nuevo.',
    [`${prefix}.InvalidProgress`]: 'El progreso reportado de la carga no es válido.',
    [`${prefix}.NotApplying`]: 'Esta carga no se está aplicando. Actualiza la página.',
    [`${prefix}.NotFound`]: 'La carga no existe.',
    [`${prefix}.NotValidated`]: 'Solo se puede confirmar una carga ya validada. Actualiza la página.',
    [`${prefix}.NotValidating`]: 'Esta carga ya no se puede rechazar. Actualiza la página.',
    [`${prefix}.TenantRequired`]: 'Falta el conjunto.',
  };
}

/** The upload-metadata codes request attachments and payment proofs share. */
function attachmentMessages(prefix: string): Record<string, ApiErrorMessage> {
  return {
    [`${prefix}.ContentTypeNotAllowed`]:
      'Este tipo de archivo no está permitido. Solo se aceptan imágenes y documentos.',
    [`${prefix}.ContentTypeRequired`]: 'Falta el tipo de archivo.',
    [`${prefix}.FileNameRequired`]: 'Falta el nombre del archivo.',
    [`${prefix}.StorageKeyRequired`]: 'Falta el archivo. Súbelo de nuevo.',
    [`${prefix}.UploaderRequired`]: 'Falta quién sube el archivo.',
  };
}

/** The first integer in the English `detail` — the limit the API interpolated. */
function firstNumber(problem: ProblemDetails): number | null {
  const match = /\d+/.exec(problem.detail ?? '');
  return match ? Number(match[0]) : null;
}

function tooLong(subject: string, problem: ProblemDetails): string {
  const max = firstNumber(problem);
  return max ? `${subject}: máximo ${max} caracteres.` : `${subject}: el texto es demasiado largo.`;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
