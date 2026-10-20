import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { PermissionStore } from '../../../core/authz/permission.store';
import { TenantStore } from '../../../core/tenant/tenant.store';
import {
  DataTableComponent,
  TableColumn,
} from '../../../shared/ui/data-table/data-table.component';
import { HelpHintComponent } from '../../../shared/ui/help-hint/help-hint.component';
import { TablerIconComponent } from 'angular-tabler-icons';
import { RouterLink } from '@angular/router';
import { apartmentLabel } from '../../apartments/data-access/apartment.models';
import { AmenityListItem } from '../../tenant-info/amenities/data-access/amenity.models';
import { AmenityOptionsService } from '../../reservations-admin/data-access/amenity-options.service';
import {
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  ReservationDto,
} from '../../reservations-admin/data-access/reservation.models';
import { ReservationTodayView } from '../../reservations-admin/data-access/today-views';
import {
  INBOX_DEFAULT_VIEW,
  INBOX_HELP,
  INBOX_RESERVATION_VIEWS,
  InboxQueue,
  InboxQueueDef,
  visibleInboxQueues,
} from '../data-access/attention-inbox';
import { AttentionInboxService, INBOX_PAGE_SIZE } from '../data-access/attention-inbox.service';

/**
 * «Requiere atención»: the dashboard's mini inbox, beside the live status
 * counters. Two tabs — Reservas and PQRS — and inside the first one the two
 * questions that have a deadline attached to today: what area is handed over
 * today, and which pending booking lapses today if nobody answers it.
 *
 * It is NOT a second Reservas screen: no paging, no acting on a row. Every code
 * links to the booking's detail and the footer links to the module, because the
 * point of a shortcut is to hand the work over, not to hold it.
 *
 * The two shortcuts are mutually exclusive on purpose: they ask about two
 * different instants (the booked window vs. `pendingDeadlineUtc`), so combining
 * them would read as "se entrega hoy Y se vence hoy", a question nobody has.
 */
@Component({
  selector: 'app-attention-inbox',
  standalone: true,
  imports: [DataTableComponent, HelpHintComponent, TablerIconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './attention-inbox.component.html',
  host: {
    // Bound rather than written into the CSS so the reserved height cannot
    // drift from the number of rows actually asked for.
    '[style.--inbox-rows]': 'reservedRows',
  },
  styles: `
    :host {
      /*
        What the pane is built out of, measured against Tabler's own metrics so
        the reserved height matches what INBOX_PAGE_SIZE rows actually occupy:
          - a \`dense\` row: 0.25rem padding top and bottom around a 1.43 line,
            plus its border — 29px, rounded up to leave a hair of slack;
          - the table head, which keeps its 0.5rem padding even in a dense
            table (\`.table thead th\` outranks \`.table-sm\`) — 33px;
          - the filter strip: 0.5rem around a \`btn-sm\` — 43px.
        This is the only place the preview's height is decided.
      */
      --inbox-row: 1.875rem;
      --inbox-head: 2.0625rem;
      --inbox-filters: 2.75rem;
    }

    /* The two tabs split the header in half. Still a comfortable target on a
       phone, but this is a preview: every row of chrome is a row of data the
       card does not show. */
    .inbox-tab {
      padding: 0.3125rem 0.75rem;
      font-size: 0.8125rem;
      font-weight: 500;
    }

    /* Title strip and footer, squeezed for the same reason. */
    .inbox-head,
    .inbox-footer {
      padding: 0.25rem 0.75rem;
    }

    .inbox-footer {
      font-size: 0.8125rem;
    }

    /* The footer is a destination, not a toolbar: as short as its own line. */
    .inbox-footer .btn {
      --tblr-btn-padding-y: 0.125rem;
    }

    /*
      FIXED height, whatever the open tab shows. Without it an empty shortcut
      collapses the card and a full one pushes the page down, so every tab
      switch moves what is under the cursor.
    */
    .inbox-pane {
      display: flex;
      flex-direction: column;
      /* \`min-height\` rather than \`height\`, with the card a flex column: the
         floor never moves between tabs, and on a row the counters make taller
         the pane takes the slack instead of leaving it stranded under the
         footer. */
      flex: 1;
      min-height: calc(
        var(--inbox-rows, 5) * var(--inbox-row) + var(--inbox-head) + var(--inbox-filters)
      );
    }

    .inbox-filters {
      padding: 0.5rem 0.75rem;
    }

    /* Takes the rest of the pane; a short page simply leaves white below.
       \`min-height: 0\` is what lets a flex child actually scroll. */
    .inbox-rows {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    /* "Nada que mostrar", centred in exactly the room the rows would have had. */
    .inbox-placeholder {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin: 0;
      padding: 0 1rem;
      text-align: center;
    }
  `,
})
export class AttentionInboxComponent {
  private readonly permissions = inject(PermissionStore);
  private readonly tenant = inject(TenantStore);
  private readonly service = inject(AttentionInboxService);
  private readonly amenityOptions = inject(AmenityOptionsService);

  readonly help = INBOX_HELP;
  readonly views = INBOX_RESERVATION_VIEWS;
  readonly pageSize = INBOX_PAGE_SIZE;

  /** Data rows the pane reserves room for; the head and filters are added in CSS. */
  readonly reservedRows = INBOX_PAGE_SIZE;

  readonly items = this.service.items;
  readonly total = this.service.total;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  /** The tabs this administrator can see, in the order they are declared. */
  readonly queues = computed(() =>
    visibleInboxQueues(
      (code) => this.permissions.has(code),
      (key) => this.tenant.hasFeature(key),
    ),
  );

  /** What the administrator picked; null until then. */
  private readonly picked = signal<InboxQueue | null>(null);

  /** The open tab: the chosen one, else the first the gates left standing. */
  readonly activeQueue = computed<InboxQueue | null>(
    () => this.picked() ?? this.queues()[0]?.key ?? null,
  );

  /** The open tab's own definition — its label and the module it previews. */
  readonly activeQueueDef = computed<InboxQueueDef | null>(
    () => this.queues().find((queue) => queue.key === this.activeQueue()) ?? null,
  );

  /** Which shortcut is applied. «Entrega hoy» is the day's own agenda. */
  readonly view = signal<ReservationTodayView>(INBOX_DEFAULT_VIEW);

  private readonly areas = signal<AmenityListItem[]>([]);

  /** `amenityId` → name; a booking row carries only the id. */
  private readonly areaNames = computed(
    () => new Map(this.areas().map((area) => [area.id, area.name])),
  );

  /**
   * Four columns, no more: this card lives on half a row, and anything a wider
   * question needs is one click away in the detail.
   */
  readonly columns = computed<readonly TableColumn<ReservationDto>[]>(() => {
    const areaNames = this.areaNames();

    return [
      {
        header: 'Código',
        value: (r) => r.code,
        class: 'w-1 text-nowrap fw-medium',
        link: (r) => this.detailLink(r),
        hint: INBOX_HELP.code,
      },
      {
        header: 'Área',
        value: (r) => areaNames.get(r.amenityId) ?? '—',
        hint: INBOX_HELP.areaColumn,
      },
      {
        header: 'Apartamento',
        value: (r) => apartmentLabel(r.apartment),
        hint: INBOX_HELP.apartmentColumn,
      },
      // A value here, not the control the Reservas list puts in this column:
      // answering a booking asks for a reason, and that belongs on a screen
      // with room for it.
      {
        header: 'Estado',
        value: (r) => RESERVATION_STATUS_LABEL[r.status],
        badgeClass: (r) => RESERVATION_STATUS_BADGE[r.status],
        hint: INBOX_HELP.status,
      },
    ];
  });

  readonly rowKey = (r: ReservationDto): string => r.id;
  readonly detailLink = (r: ReservationDto): unknown[] => ['/reservations', r.id];

  /** Nothing matched — said in the words of the shortcut that asked. */
  readonly emptyMessage = computed(() =>
    this.view() === 'startsToday' ? INBOX_HELP.emptyStartsToday : INBOX_HELP.emptyExpiresToday,
  );

  /** Whether the pane shows the table at all, rather than a one-line message. */
  readonly hasRows = computed(() => this.loading() || !!this.error() || this.items().length > 0);

  /** True when the filter matched more bookings than the card can hold. */
  readonly hasMore = computed(() => this.total() > this.items().length);

  constructor() {
    // Only to name the areas. A failure costs the column a name, never the card.
    this.amenityOptions.list().subscribe({
      next: (areas) => this.areas.set(areas),
      error: () => this.areas.set([]),
    });

    // Re-reads on either axis: the open tab and the chosen shortcut.
    effect(() => {
      if (this.activeQueue() !== 'reservations') return;
      this.service.loadReservations(this.view());
    });
  }

  /**
   * Re-ask the current question. The dashboard's «Actualizar» button owns the
   * whole screen, and a card that kept yesterday's rows after it would be lying.
   */
  reload(): void {
    if (this.activeQueue() === 'reservations') {
      this.service.loadReservations(this.view());
    }
  }

  select(queue: InboxQueue): void {
    this.picked.set(queue);
  }

  /** The shortcuts are a single choice — one is always applied. */
  selectView(view: ReservationTodayView): void {
    this.view.set(view);
  }
}
