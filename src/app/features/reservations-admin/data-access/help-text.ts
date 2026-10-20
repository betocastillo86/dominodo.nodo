/**
 * The tooltips of the admin Reservas screens — what the browser shows when the
 * mouse rests on a control, written for whoever sits at the administration desk
 * on their first day.
 *
 * TOOLTIP length, not help-page length: one line, said in the words of the
 * person reading it, and for anything clickable, what the click will do
 * ("Dar clic para ver el soporte"). No field names and no endpoint names.
 *
 * It lives in `data-access/` beside the models for the same reason
 * `dashboard/data-access/help-text.ts` does: the copy is shared by the list,
 * its filter bar and the cells the table renders, and a single file keeps the
 * three from drifting into three vocabularies.
 */
export const RESERVATIONS_HELP = {
  // ── The quick views ──────────────────────────────────────────────────────
  startsToday: 'Las reservas que se usan hoy, sin importar cuándo se pidieron',
  createdToday: 'Las solicitudes que entraron hoy, sean para la fecha que sean',
  expiresToday: 'Pendientes cuyo plazo de respuesta vence hoy: si nadie contesta, expiran',

  // ── The filter bar ───────────────────────────────────────────────────────
  from: 'Desde qué día de uso ver. Es el día en que se usa el área, no cuándo se pidió',
  to: 'Hasta qué día de uso ver. Déjalo vacío para ver todo lo que viene',
  statusFilter: 'Mostrar solo las reservas que están en un estado',
  amenityFilter: 'Mostrar solo las reservas de un área social',
  apartmentFilter: 'Escribe la torre o el número y elige de la lista para filtrar por apartamento',

  // ── The columns ──────────────────────────────────────────────────────────
  code: 'Número que identifica la reserva, el mismo que ve el residente',
  window: 'Día y franja en que el residente usa el área, no cuándo la pidió',
  payment: 'Si el residente ya subió el soporte de su pago',
  apartmentColumn: 'Torre y número del apartamento que hizo la reserva',
  statusColumn: 'En qué va la reserva; se cambia desde la misma celda',

  // ── What each control in a row does ──────────────────────────────────────
  paymentYes: 'Dar clic para ver el soporte',
  paymentNo: 'El residente todavía no ha subido el soporte',
  statusSelect: 'Elegir un estado para cambiar la reserva',
  statusLocked: 'Esta reserva ya está cerrada: no admite cambios de estado',
  detail: 'Ver detalle',

  // ── The detail ───────────────────────────────────────────────────────────
  editAmenity: 'Ir a editar esta área social',
  apartmentDetail: 'Ir al apartamento: quiénes viven ahí y sus datos',
  residentDetail: 'Ver al residente en la ficha de su apartamento',
} as const;
