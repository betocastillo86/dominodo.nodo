import { RequestStatus } from '../../requests/data-access/request.models';

/**
 * Plain-language help for every figure on the dashboard.
 *
 * Written for the administrator of a conjunto, not for whoever built the API:
 * what the number means, what population it counts and what it says about the
 * community when it moves. No field names, no statistics vocabulary ("muestra",
 * "percentil", "mediana" unexplained) and no mention of how the report is
 * computed — a person who has never seen Swagger has to be able to act on it.
 */
export const DASHBOARD_HELP = {
  // ── The period ───────────────────────────────────────────────────────────
  created:
    'Cuántas PQRS radicaron los residentes dentro de las fechas elegidas. Es el ' +
    'trabajo que entró en ese tiempo, sin importar si ya se atendió o no.',
  managed:
    'Cuántas PQRS quedaron resueltas o cerradas dentro de las fechas elegidas. ' +
    'Cuentan por el día en que se les dio salida, así que aquí también aparecen ' +
    'PQRS que se habían radicado antes.',
  balance:
    'La diferencia entre lo que entró y lo que salió. En positivo llegaron más ' +
    'PQRS de las que se alcanzaron a atender y la cola creció; en negativo la ' +
    'administración se puso al día con trabajo atrasado.',
  resolutionSummary:
    'El tiempo que suele tomar atender una PQRS de principio a fin: la mitad se ' +
    'resolvió más rápido que esto y la otra mitad se demoró más. Si sube, las ' +
    'PQRS se están quedando más tiempo sin salida.',

  // ── Time to resolve ──────────────────────────────────────────────────────
  resolutionMedian:
    'El tiempo normal de una PQRS, desde que el residente la radica hasta que ' +
    'queda resuelta o cerrada: la mitad se atendió más rápido que esto y la otra ' +
    'mitad se demoró más.',
  resolutionP90:
    'Los casos más demorados: 9 de cada 10 PQRS quedaron resueltas antes de este ' +
    'tiempo. Comparado con el tiempo normal muestra qué tan lejos se van los ' +
    'casos que se complican.',
  resolutionSample:
    'Sobre cuántas PQRS están calculados estos dos tiempos. Con muy pocas, un ' +
    'caso raro mueve las cifras y conviene no sacar conclusiones.',

  // ── Time to first response ───────────────────────────────────────────────
  firstResponseMedian:
    'Lo que suele tardar la administración en ponerle la mano a una PQRS nueva: ' +
    'la mitad empezó a atenderse antes de este tiempo y la otra mitad después. Es ' +
    'la espera que el residente siente apenas radica.',
  firstResponseP90:
    'Los arranques más lentos: 9 de cada 10 PQRS empezaron a atenderse antes de ' +
    'este tiempo. Las que superan esta marca son las que suelen terminar en reclamo.',
  firstResponseSample:
    'Sobre cuántas PQRS están calculados estos dos tiempos. Con muy pocas, un ' +
    'caso raro mueve las cifras y conviene no sacar conclusiones.',

  // ── Breakdowns ───────────────────────────────────────────────────────────
  byType:
    'Qué clase de PQRS está radicando la comunidad: peticiones, quejas, reclamos, ' +
    'sugerencias o mantenimiento. Un conjunto sano recibe sobre todo peticiones y ' +
    'mantenimiento; mucha queja y reclamo es señal de inconformidad.',
  byCategory:
    'Los temas sobre los que más escriben los residentes en estas fechas. Las ' +
    'categorías de arriba son donde se concentra el trabajo y, normalmente, donde ' +
    'más rinde arreglar la causa de fondo.',
  byTower:
    'De qué parte del conjunto vienen las PQRS. «Zonas comunes» agrupa las que no ' +
    'son de un apartamento en particular y «Sin torre» las de apartamentos a los ' +
    'que todavía no se les asignó torre.',

  // ── Series ───────────────────────────────────────────────────────────────
  monthlyFlow:
    'Mes a mes, cuántas PQRS entraron y cuántas se les dio salida. Cuando las ' +
    'barras de entrada le ganan seguido a las de salida, el trabajo pendiente se ' +
    'va acumulando mes tras mes.',
  backlog:
    'Cómo se acumulan las PQRS día a día: la curva de arriba es todo lo que ha ' +
    'recibido el conjunto y la de abajo lo que ya quedó atendido. La franja entre ' +
    'las dos es lo que sigue pendiente; si se ensancha, la administración se está ' +
    'quedando atrás.',
} as const;

/**
 * The four live tiles. «Cerrado» names the conjunto's own grace window, so the
 * copy depends on what the administrator configured in "Mi Conjunto":
 * `null` while the setting has not loaded, `0` when the automatic close is off.
 */
export function statusHelp(autoCloseDays: number | null): Record<RequestStatus, string> {
  return {
    New:
      'PQRS que llegaron y todavía nadie ha tomado. Son las que están esperando un ' +
      'primer movimiento de la administración, y las que más rápido generan ' +
      'molestia si se quedan quietas.',
    InProgress:
      'PQRS que la administración ya está atendiendo y todavía no tienen respuesta ' +
      'final. Es el trabajo que está abierto sobre la mesa en este momento.',
    Resolved:
      'La administración ya dio respuesta, pero la PQRS sigue abierta a reclamo: ' +
      'quien la radicó todavía puede pedir que se retome si no quedó conforme.',
    Closed: closedHelp(autoCloseDays),
  };
}

function closedHelp(autoCloseDays: number | null): string {
  const base = 'La PQRS ya terminó su ciclo y no se espera más trabajo sobre ella. ';

  if (autoCloseDays === null) {
    return (
      base +
      'Se cierra cuando la administración la da por terminada o cuando pasa el ' +
      'plazo que el conjunto configuró en «Mi Conjunto» sin que nadie la reabra.'
    );
  }

  if (autoCloseDays === 0) {
    return (
      base +
      'Solo se cierra cuando la administración la da por terminada: este conjunto ' +
      'tiene apagado el cierre automático de las PQRS resueltas.'
    );
  }

  const days = `${autoCloseDays} día${autoCloseDays === 1 ? '' : 's'}`;
  return (
    base +
    'Se cierra cuando la administración la da por terminada o cuando pasan ' +
    `${days} desde que se resolvió sin que nadie la reabra.`
  );
}
