/**
 * The «Requiere atención» inbox: what the two operational modules have waiting
 * TODAY, next to the live status counters on the dashboard.
 *
 * It is a shortcut, never a second workbench — every row leads to the module
 * that owns it. Today only the Reservas queue carries rows; the PQRS one is
 * declared with its gates already in place so filling it is a template change.
 */
import { RESERVATIONS_HELP } from '../../reservations-admin/data-access/help-text';
import { AMENITIES_FEATURE } from '../../tenant-info/amenities/data-access/amenity.permissions';
import {
  RESERVATION_TODAY_VIEWS,
  ReservationTodayView,
  ReservationTodayViewDef,
} from '../../reservations-admin/data-access/today-views';

/** The queues the inbox can show, one tab each. */
export type InboxQueue = 'reservations' | 'requests';

export interface InboxQueueDef {
  key: InboxQueue;
  label: string;
  icon: string;
  /** The module this queue is a preview of — where its footer link goes. */
  route: string;
  /** Permission the tab needs — same code the module's own route demands. */
  permission: string;
  /** Tenant feature the tab needs; a conjunto without it has no such queue. */
  feature: string;
}

export const INBOX_QUEUES: readonly InboxQueueDef[] = [
  {
    key: 'reservations',
    label: 'Reservas',
    icon: 'calendar-event',
    route: '/reservations',
    permission: 'reservations.view',
    feature: AMENITIES_FEATURE,
  },
  {
    key: 'requests',
    label: 'PQRS',
    icon: 'list-details',
    route: '/requests',
    permission: 'requests.view',
    feature: 'Requests',
  },
];

/**
 * The tabs this (user, tenant) pair may see — empty when the inbox must not
 * appear at all. Shared with the dashboard itself, which uses it to decide
 * whether the inbox earns its half of the row.
 *
 * The inbox exists FOR the Reservas queue: PQRS is a declared placeholder with
 * no rows of its own yet. So a conjunto whose tenant does not have Áreas
 * sociales enabled — or an administrator who cannot see bookings — gets no
 * card, rather than a card whose only tab has nothing in it. Drop this anchor
 * the day the PQRS queue grows rows.
 */
export function visibleInboxQueues(
  hasPermission: (code: string) => boolean,
  hasFeature: (key: string) => boolean,
): readonly InboxQueueDef[] {
  const visible = INBOX_QUEUES.filter((q) => hasPermission(q.permission) && hasFeature(q.feature));
  return visible.some((queue) => queue.key === 'reservations') ? visible : [];
}

/**
 * The two reservation shortcuts the inbox offers, in the order they are shown:
 * what gets used today, and what lapses today if nobody answers. «Creadas hoy»
 * is deliberately left out — today's intake is a reading of the workload, not
 * something that stops being possible if it is not looked at today.
 */
export const INBOX_RESERVATION_VIEWS: readonly ReservationTodayViewDef[] =
  RESERVATION_TODAY_VIEWS.filter((view) => view.key !== 'createdToday');

/** The one the inbox opens on: today's handovers are the day's own agenda. */
export const INBOX_DEFAULT_VIEW: ReservationTodayView = 'startsToday';

/** Plain-language help for the inbox itself, in the dashboard's own register. */
export const INBOX_HELP = {
  inbox:
    'Lo que pide atención hoy, sin tener que entrar a cada módulo: las reservas ' +
    'que se usan hoy y las que se vencen si nadie las responde. Cada código abre ' +
    'el detalle completo.',
  status: 'En qué va la reserva. Para cambiarla, abre el detalle o la pantalla de Reservas',
  /** The empty state of each shortcut — different news, different sentence. */
  emptyStartsToday: 'Hoy no se entrega ningún área social',
  emptyExpiresToday: 'Ninguna reserva pendiente se vence hoy',
  emptyRequests: 'Pronto verás aquí las PQRS que necesitan respuesta',
  apartmentColumn: RESERVATIONS_HELP.apartmentColumn,
  areaColumn: RESERVATIONS_HELP.areaColumn,
  code: RESERVATIONS_HELP.code,
} as const;
