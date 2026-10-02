import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TablerIconComponent } from 'angular-tabler-icons';
import { map } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  DataTableComponent,
  TableColumn,
  TableSort,
} from '../../../shared/ui/data-table/data-table.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
  SearchSelectResolveFn,
} from '../../../shared/ui/search-select/search-select.component';
import { PermissionStore } from '../../../core/authz/permission.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { toMessage } from '../../../core/http/problem-details';
import { RequestsService } from '../data-access/requests.service';
import { ApartmentsLookupService } from '../data-access/apartments-lookup.service';
import { MembershipsLookupService } from '../data-access/memberships-lookup.service';
import {
  BOARD_STATUSES,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  RequestDto,
  RequestPriority,
  RequestSort,
  RequestSortBy,
  RequestStatus,
  STATUS_BADGE,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_LABEL,
} from '../data-access/request.models';

type ViewMode = 'list' | 'board';

/** The API's own ordering. Kept out of the URL so an unfiltered list has a clean one. */
const DEFAULT_SORT_BY: RequestSortBy = 'Date';
const DEFAULT_SORT_DIR: 'asc' | 'desc' = 'desc';

/** Sort keys the table actually offers; anything else in the URL falls back to the default. */
const SORT_KEYS: readonly RequestSortBy[] = ['Date', 'Priority', 'Updates', 'Participants'];

/** Writes a value restored from the URL into a control without echoing it back. */
function setSilently<T>(control: FormControl<T>, value: T): void {
  if (control.value !== value) {
    control.setValue(value, { emitEvent: false });
  }
}

/** The URL is hand-editable: anything that is not a known key means "no filter". */
function asKeyOf<K extends string>(value: string | null, known: Record<K, unknown>): K | '' {
  return value && value in known ? (value as K) : '';
}

@Component({
  selector: 'app-request-list',
  standalone: true,
  imports: [
    PageHeaderComponent,
    DataTableComponent,
    SpinnerComponent,
    SearchSelectComponent,
    ReactiveFormsModule,
    RouterLink,
    TablerIconComponent,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-list.component.html',
  styles: [
    `
      .requests-board-card--draggable {
        cursor: grab;
      }
      .requests-board-card--draggable:active {
        cursor: grabbing;
      }
      /* Card lifted while dragging (rendered in an overlay by the CDK). */
      .cdk-drag-preview {
        border-radius: 6px;
        box-shadow:
          0 5px 5px -3px rgba(0, 0, 0, 0.2),
          0 8px 10px 1px rgba(0, 0, 0, 0.14),
          0 3px 14px 2px rgba(0, 0, 0, 0.12);
        background: var(--tblr-bg-surface, #fff);
      }
      /* Gap left behind in the source column. */
      .requests-board-card__placeholder {
        min-height: 64px;
        border: 1px dashed var(--tblr-border-color, #dadfe5);
        border-radius: 6px;
        background: var(--tblr-bg-surface-secondary, #f8fafc);
      }
      .cdk-drag-animating {
        transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
      }
      .requests-board-column.cdk-drop-list-dragging
        .list-group-item:not(.cdk-drag-placeholder) {
        transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
      }
    `,
  ],
})
export class RequestListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(RequestsService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly apartmentsLookup = inject(ApartmentsLookupService);
  private readonly membershipsLookup = inject(MembershipsLookupService);

  // ── List view ────────────────────────────────────────────────────────────
  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  // ── Board view ───────────────────────────────────────────────────────────
  readonly boardColumns = this.service.boardColumns;
  readonly boardTotals = this.service.boardTotals;
  readonly boardLoading = this.service.boardLoading;
  readonly boardError = this.service.boardError;

  // ── View mode ────────────────────────────────────────────────────────────
  readonly view = signal<ViewMode>('list');

  /** List ordering (server-side); defaults to the API's own Date/Desc. */
  readonly sort = signal<TableSort>({ key: DEFAULT_SORT_BY, direction: DEFAULT_SORT_DIR });

  /** Filters currently applied, mirrored from the URL to drive "Limpiar filtros". */
  private readonly appliedFilters = signal<Record<string, string | null>>({});

  readonly hasFilters = computed(() => Object.values(this.appliedFilters()).some(Boolean));

  /** Only holders of requests.edit may drag cards to change status. */
  readonly canEdit = computed(() => this.permissions.has('requests.edit'));

  // ── Filter controls ──────────────────────────────────────────────────────
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl<RequestStatus | ''>('', { nonNullable: true });
  readonly priorityControl = new FormControl<RequestPriority | ''>('', { nonNullable: true });
  /** Holds the selected apartment id → sent as `apartmentId` to `GET /requests`. */
  readonly apartmentControl = new FormControl<string | null>(null);
  /** Holds the selected resident's userId → sent as `participantUserId`. */
  readonly residentControl = new FormControl<string | null>(null);

  /** Remote lookups for the two `app-search-select` filters (id-by-text-search). */
  readonly searchApartments: SearchSelectFn = (term) =>
    this.apartmentsLookup.search(term).pipe(
      map((items) =>
        items.map((a) => ({
          value: a.id,
          label: a.tower ? `${a.tower} · ${a.number}` : a.number,
        })),
      ),
    );

  readonly searchResidents: SearchSelectFn = (term) =>
    this.membershipsLookup.search(term).pipe(
      map((items) =>
        items.map((m) => ({
          value: m.userId,
          label: m.userName,
          sublabel: m.phone,
        })),
      ),
    );

  /**
   * Label lookups for the ids these two filters hold. Needed because a filter
   * restored from the URL arrives as a bare id, which says nothing on screen.
   */
  readonly resolveApartment: SearchSelectResolveFn = (id) =>
    this.apartmentsLookup
      .getById(id)
      .pipe(
        map((a) =>
          a ? { value: a.id, label: a.tower ? `${a.tower} · ${a.number}` : a.number } : null,
        ),
      );

  readonly resolveResident: SearchSelectResolveFn = (userId) =>
    this.membershipsLookup
      .getByUserId(userId)
      .pipe(map((m) => (m ? { value: m.userId, label: m.userName, sublabel: m.phone } : null)));

  // ── Table columns ────────────────────────────────────────────────────────
  readonly columns: readonly TableColumn<RequestDto>[] = [
    {
      header: 'Código',
      value: (r) => r.code,
      class: 'w-1 text-nowrap',
      link: (r) => this.detailLink(r),
    },
    {
      header: 'Título',
      value: (r) => this.truncate(r.title),
      class: 'table-cell-wrap',
      link: (r) => this.detailLink(r),
    },
    {
      header: 'Estado',
      value: (r) => STATUS_LABEL[r.status],
      badgeClass: (r) => STATUS_BADGE[r.status],
    },
    {
      header: 'Prioridad',
      value: (r) => PRIORITY_LABEL[r.priority],
      badgeClass: (r) => PRIORITY_BADGE[r.priority],
      sortKey: 'Priority',
    },
    {
      // `Updates` counts every timeline entry (comment, progress, evidence,
      // resolution) — the same number this column shows.
      header: 'Comentarios',
      value: (r) => r.updatesCount,
      icon: 'message',
      class: 'w-1 text-center text-secondary',
      sortKey: 'Updates',
    },
    {
      header: 'Participantes',
      value: (r) => r.participantsCount,
      icon: 'users',
      class: 'w-1 text-center text-secondary',
      sortKey: 'Participants',
    },
    {
      header: 'Fecha',
      value: (r) => this.formatDate(r.createdAtUtc),
      class: 'text-secondary text-nowrap',
      sortKey: 'Date',
    },
    {
      // Only stamped once the request reaches Resolved; the API clears it if the
      // request is reopened, so an empty cell is the normal case for open PQRS.
      header: 'Resuelto',
      value: (r) => (r.resolvedAtUtc ? this.formatDate(r.resolvedAtUtc) : '—'),
      class: 'text-secondary text-nowrap',
    },
  ];

  readonly rowKey = (r: RequestDto): string => r.id;
  readonly detailLink = (r: RequestDto): unknown[] => ['/requests', r.id];

  // ── Board display helpers ────────────────────────────────────────────────
  readonly boardStatuses = BOARD_STATUSES;
  readonly statusLabel = STATUS_LABEL;
  readonly statusBadge = STATUS_BADGE;
  readonly statusColor = STATUS_COLOR;
  readonly priorityLabel = PRIORITY_LABEL;
  readonly priorityBadge = PRIORITY_BADGE;
  readonly typeLabel = TYPE_LABEL;

  private readonly pageSize = 20;

  constructor() {
    // The URL is the single source of truth for what the list shows: every
    // control writes to it and this subscription is what applies it and
    // fetches. That makes the view shareable by link, and brings the filters
    // back untouched when the user returns from a request's detail.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.applyParams(params));

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.patchQuery({ search: value.trim() || null }));

    this.statusControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.patchQuery({ status: value || null }));

    this.priorityControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.patchQuery({ priority: value || null }));

    this.apartmentControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.patchQuery({ apartmentId: value }));

    this.residentControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.patchQuery({ residentId: value }));
  }

  switchView(mode: ViewMode): void {
    // The page belongs to the list view; keep it so coming back lands where it was.
    this.patchQuery({ view: mode === 'board' ? 'board' : null }, { resetPage: false });
  }

  onPageChange(page: number): void {
    this.patchQuery({ page: page > 1 ? page : null }, { resetPage: false });
  }

  /** A header sort click: the URL change is what reorders and goes back to page 1. */
  onSortChange(sort: TableSort): void {
    this.patchQuery({
      sortBy: sort.key === DEFAULT_SORT_BY ? null : sort.key,
      dir: sort.direction === DEFAULT_SORT_DIR ? null : sort.direction,
    });
  }

  /** Drops every filter; the ordering and the current view are left alone. */
  clearFilters(): void {
    this.patchQuery({
      search: null,
      status: null,
      priority: null,
      apartmentId: null,
      residentId: null,
    });
  }

  /** Titles can run long; cap them so a row keeps a predictable height. */
  private truncate(text: string, max = 150): string {
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  /**
   * Pushes a change into the query string; `applyParams` then does the work.
   * It replaces the history entry instead of adding one, so a few keystrokes
   * in the search box don't bury the list under a pile of back steps — the one
   * entry left always carries the latest filters.
   */
  private patchQuery(changes: Params, options: { resetPage?: boolean } = {}): void {
    const queryParams = options.resetPage === false ? changes : { ...changes, page: null };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** URL → controls → fetch. Controls are written silently; only the URL reloads. */
  private applyParams(params: ParamMap): void {
    const search = params.get('search') ?? '';
    const status = asKeyOf<RequestStatus>(params.get('status'), STATUS_LABEL);
    const priority = asKeyOf<RequestPriority>(params.get('priority'), PRIORITY_LABEL);
    const apartmentId = params.get('apartmentId');
    const residentId = params.get('residentId');
    const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
    const sortBy = SORT_KEYS.find((key) => key === params.get('sortBy')) ?? DEFAULT_SORT_BY;
    const direction = params.get('dir') === 'asc' ? 'asc' : 'desc';
    const view: ViewMode = params.get('view') === 'board' ? 'board' : 'list';

    // Compared trimmed: the URL carries the trimmed term, and rewriting the box
    // while the user is still typing would move their cursor.
    if (this.searchControl.value.trim() !== search) {
      setSilently(this.searchControl, search);
    }
    setSilently(this.statusControl, status);
    setSilently(this.priorityControl, priority);
    setSilently(this.apartmentControl, apartmentId);
    setSilently(this.residentControl, residentId);

    this.sort.set({ key: sortBy, direction });
    this.view.set(view);
    this.appliedFilters.set({ search, status, priority, apartmentId, residentId });
    // Replayed by the detail's "Volver" link; the browser's back button reads the URL itself.
    this.service.setLastListQuery(
      Object.fromEntries(params.keys.map((key) => [key, params.get(key)!])),
    );

    // The board shows every status in its own column, so it ignores the filters.
    if (view === 'board') {
      this.service.loadBoard();
      return;
    }

    const ordering: RequestSort = {
      sortBy,
      direction: direction === 'asc' ? 'Asc' : 'Desc',
    };
    this.service.list(
      page,
      this.pageSize,
      status ? [status] : [],
      priority || null,
      search,
      apartmentId,
      residentId,
      ordering,
    );
  }

  // ── Board drag & drop ──────────────────────────────────────────────────────

  /**
   * Server rule (RequestStatus.cs): every transition is allowed EXCEPT
   * Closed → New and Resolved → New. Same-column moves are not transitions.
   */
  canTransition(from: RequestStatus, to: RequestStatus): boolean {
    if (from === to) return false;
    if (to === 'New' && (from === 'Closed' || from === 'Resolved')) return false;
    return true;
  }

  /**
   * Predicate CDK calls before a card may enter a column. `drop.data` is the
   * target status, `drag.data` the dragged request — reject invalid transitions
   * so the illegal drop zone rejects the card visually.
   */
  readonly canDropInto = (
    drag: CdkDrag<RequestDto>,
    drop: CdkDropList<RequestStatus>,
  ): boolean => this.canTransition(drag.data.status, drop.data);

  /** Apply a drop: optimistic move, persist, revert + notify on failure. */
  onDrop(event: CdkDragDrop<RequestStatus, RequestStatus, RequestDto>): void {
    if (!this.canEdit()) return;

    const from = event.previousContainer.data;
    const to = event.container.data;
    if (from === to || !this.canTransition(from, to)) return;

    const item = event.item.data;
    this.service.moveInBoard(item, from, to);

    this.service.changeStatus(item.id, to).subscribe({
      next: () =>
        this.notifications.success(`${item.code} movido a «${STATUS_LABEL[to]}».`),
      error: (err) => {
        this.service.moveInBoard(item, to, from);
        this.notifications.error(toMessage(err));
      },
    });
  }
}
