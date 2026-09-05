import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { DataTableComponent, TableColumn } from '../../../shared/ui/data-table/data-table.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
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
  RequestStatus,
  STATUS_BADGE,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_LABEL,
} from '../data-access/request.models';

type ViewMode = 'list' | 'board';

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

  // ── Table columns ────────────────────────────────────────────────────────
  readonly columns: readonly TableColumn<RequestDto>[] = [
    {
      header: 'Código',
      value: (r) => r.code,
      class: 'w-1 text-nowrap text-secondary',
    },
    {
      header: 'Título',
      value: (r) => this.truncate(r.title),
      class: 'table-cell-wrap',
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
    },
    {
      header: 'Comentarios',
      value: (r) => r.updatesCount,
      icon: 'message',
      class: 'w-1 text-center text-secondary',
    },
    {
      header: 'Participantes',
      value: (r) => r.participantsCount,
      icon: 'users',
      class: 'w-1 text-center text-secondary',
    },
    {
      header: 'Fecha',
      value: (r) => this.formatDate(r.createdAtUtc),
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
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => this.reload(1));

    this.statusControl.valueChanges.pipe(
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => this.reload(1));

    this.priorityControl.valueChanges.pipe(
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => this.reload(1));

    this.apartmentControl.valueChanges.pipe(
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => this.reload(1));

    this.residentControl.valueChanges.pipe(
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => this.reload(1));

    this.reload(1);
  }

  switchView(mode: ViewMode): void {
    this.view.set(mode);
    if (mode === 'board') {
      this.service.loadBoard();
    }
  }

  onPageChange(page: number): void {
    this.reload(page);
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

  private reload(page: number): void {
    const statuses: RequestStatus[] = this.statusControl.value
      ? [this.statusControl.value as RequestStatus]
      : [];
    const priority = (this.priorityControl.value as RequestPriority) || null;
    const search = this.searchControl.value;
    const apartmentId = this.apartmentControl.value;
    const participantUserId = this.residentControl.value;
    this.service.list(page, this.pageSize, statuses, priority, search, apartmentId, participantUserId);
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
