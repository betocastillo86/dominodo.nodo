import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import {
  DataTableComponent,
  TableColumn,
  TableSort,
} from '../../../shared/ui/data-table/data-table.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
} from '../../../shared/ui/search-select/search-select.component';
import {
  APARTMENT_STATUS_BADGE,
  APARTMENT_STATUS_LABEL,
  ApartmentDto,
  ApartmentSort,
  ApartmentSortBy,
  DEFAULT_APARTMENT_SORT,
  formatMoney,
} from '../data-access/apartment.models';
import {
  ACCOUNT_STATEMENT_IMPORT_PERMISSIONS,
  APARTMENT_IMPORT_PERMISSIONS,
} from '../data-access/apartment.permissions';
import { ApartmentsService } from '../data-access/apartments.service';
import { ResidentsLookupService } from '../data-access/residents-lookup.service';

/**
 * Apartment list. Apartments are read-only one by one in this portal — there is
 * no create action; the row action opens the detail, where residents are
 * managed.
 *
 * The single write path is the BULK IMPORT, which is how a conjunto is populated
 * on day one (API ADR-0012).
 */
@Component({
  selector: 'app-apartment-list',
  standalone: true,
  imports: [
    PageHeaderComponent,
    DataTableComponent,
    SearchSelectComponent,
    ReactiveFormsModule,
    TablerIconComponent,
    RouterLink,
    NgTemplateOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apartment-list.component.html',
  styles: [
    `
      /* An annex cell stacks one value per line; with several, the smaller type
         keeps the row from growing taller than its neighbours need. */
      .annex-values-many {
        font-size: 0.75rem;
        line-height: 1.2;
      }
    `,
  ],
})
export class ApartmentListComponent {
  private readonly service = inject(ApartmentsService);
  private readonly residentsLookup = inject(ResidentsLookupService);
  private readonly permissions = inject(PermissionStore);
  private readonly tenantInfo = inject(TenantInfoService);

  /**
   * The import needs apartments.create AND memberships.manage — the same pair
   * the API demands. Permissive only while the snapshot is still loading, as
   * everywhere else in the portal.
   */
  readonly canImport = computed(
    () =>
      !this.permissions.loaded() ||
      APARTMENT_IMPORT_PERMISSIONS.every((code) => this.permissions.has(code)),
  );

  /** The account-statement load: apartments.edit, plus tenant.info for the file ticket. */
  readonly canImportStatements = computed(
    () =>
      !this.permissions.loaded() ||
      ACCOUNT_STATEMENT_IMPORT_PERMISSIONS.every((code) => this.permissions.has(code)),
  );

  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  /** Header sort; the API's own default (tower, then number) until a header is clicked. */
  readonly sort = signal<TableSort>(toTableSort(DEFAULT_APARTMENT_SORT));

  /** True while the export is in flight — disables the button against double clicks. */
  readonly exporting = signal(false);

  /**
   * Free text → `search`, which the API matches against the apartment NUMBER
   * and its annexes — plate, parking spot or storage unit (ADR-0029 §1).
   */
  readonly searchControl = new FormControl('', { nonNullable: true });
  /** Holds the picked resident's userId → sent as `residentUserId`. */
  readonly residentControl = new FormControl<string | null>(null);
  /** Exact tower name → sent as `tower`. Empty string means "every tower". */
  readonly towerControl = new FormControl('', { nonNullable: true });
  /**
   * → sent as `isOverdue`. "No" also keeps the units that never received an
   * account statement: for the filter, no statement reads as not in arrears.
   * Empty string means "every unit".
   */
  readonly overdueControl = new FormControl<'' | 'true' | 'false'>('', { nonNullable: true });

  /**
   * The towers the conjunto declared, from `GET /tenants/info`. Empty when the
   * conjunto declares none — and the filter then stays hidden, since there
   * would be nothing to pick.
   */
  readonly towers = this.tenantInfo.towers;

  /**
   * Remote lookup for the resident filter. `GET /apartments` has no phone
   * filter, so we resolve the typed phone (or name) to a userId first — the
   * same typeahead the PQRS list uses.
   */
  readonly searchResidents: SearchSelectFn = (term) =>
    this.residentsLookup.search(term).pipe(
      map((items) =>
        items.map((m) => ({
          value: m.userId,
          label: m.userName,
          sublabel: m.phone,
        })),
      ),
    );

  /** Annex cells: one value per line, "—" when there is none. */
  private readonly plateCell = viewChild<TemplateRef<{ $implicit: ApartmentDto }>>('plateCell');
  private readonly parkingCell = viewChild<TemplateRef<{ $implicit: ApartmentDto }>>('parkingCell');
  private readonly storageCell = viewChild<TemplateRef<{ $implicit: ApartmentDto }>>('storageCell');

  readonly columns = computed<readonly TableColumn<ApartmentDto>[]>(() => [
    {
      header: 'Torre',
      value: (a) => a.tower ?? '—',
      sortKey: 'Tower' satisfies ApartmentSortBy,
      class: 'w-1 text-nowrap text-secondary',
    },
    {
      header: 'Apartamento',
      value: (a) => a.number,
      class: 'w-1 text-nowrap fw-medium',
      sortKey: 'Number' satisfies ApartmentSortBy,
    },
    {
      header: 'Estado',
      value: (a) => APARTMENT_STATUS_LABEL[a.status],
      badgeClass: (a) => APARTMENT_STATUS_BADGE[a.status],
      class: 'w-1 text-nowrap',
    },
    // Annexes (ADR-0029): what the search box also matches. "—" = none registered.
    // No fixed width: the three share the room the compact columns leave over.
    {
      header: 'Placa',
      value: (a) => joinOrDash(a.annexes.vehicles.map((v) => v.plate)),
      class: 'text-center',
      cellTemplate: this.plateCell(),
    },
    {
      header: 'Parqueadero',
      value: (a) => joinOrDash(a.annexes.parkingSpots),
      class: 'text-center',
      cellTemplate: this.parkingCell(),
    },
    {
      header: 'Depósito',
      value: (a) => joinOrDash(a.annexes.storageUnits),
      class: 'text-center',
      cellTemplate: this.storageCell(),
    },
    // The fee is unit configuration, not morosidad: null = not configured, 0 = exempt.
    {
      header: 'Administración',
      value: (a) => (a.administrationFee !== null ? formatMoney(a.administrationFee) : '—'),
      class: 'w-1 text-nowrap text-end',
      hint: 'Valor mensual de la administración. Vacío si no se ha configurado.',
    },
    // Two columns because the figures are independent (ADR-0025): a unit with a
    // balance may be exempted, a settled one may stay flagged. "—" = never loaded.
    {
      header: 'Saldo actual',
      sortKey: 'OverdueBalance' satisfies ApartmentSortBy,
      value: (a) => (a.accountStatement ? formatMoney(a.accountStatement.overdueBalance) : '—'),
      class: 'w-1 text-nowrap text-end',
      hint: 'Según el último estado de cuenta cargado. Vacío si la unidad nunca tuvo uno.',
    },
    {
      header: 'En mora',
      sortKey: 'IsOverdue' satisfies ApartmentSortBy,
      value: (a) => (a.accountStatement ? (a.accountStatement.isOverdue ? 'Sí' : 'No') : '—'),
      badgeClass: (a) =>
        a.accountStatement
          ? a.accountStatement.isOverdue
            ? 'badge bg-red-lt'
            : 'badge bg-green-lt'
          : '',
      class: 'w-1 text-nowrap',
    },
  ]);

  readonly plates = (a: ApartmentDto): string[] => a.annexes.vehicles.map((v) => v.plate);

  readonly rowKey = (a: ApartmentDto): string => a.id;
  readonly detailLink = (a: ApartmentDto): unknown[] => ['/apartments', a.id];

  private readonly pageSize = 20;

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));

    this.residentControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));

    this.towerControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));

    this.overdueControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));

    // The towers live behind `tenant.info`, which an apartments-only role may
    // not hold. Asking anyway would 403 on every visit, so the filter simply
    // does not exist for them. Permissive while the snapshot is still loading,
    // as everywhere else in the portal — a 403 costs one request, a false
    // negative costs the filter for the whole visit.
    if (!this.permissions.loaded() || this.permissions.has('tenant.info')) {
      this.tenantInfo.load().subscribe({
        // A failure costs the filter, not the list: swallow it deliberately.
        error: () => undefined,
      });
    }

    this.reload(1);
  }

  onPageChange(page: number): void {
    this.reload(page);
  }

  /** A header sort click reorders from the first page; the filters stay as they are. */
  onSortChange(sort: TableSort): void {
    this.sort.set(sort);
    this.reload(1);
  }

  /**
   * Downloads every apartment matching the CURRENT filters (not just the page
   * on screen). A failure is already toasted by the error interceptor.
   */
  exportCsv(): void {
    this.exporting.set(true);
    this.service
      .export(
        this.searchControl.value,
        this.residentControl.value,
        this.towerControl.value || null,
        this.isOverdue(),
      )
      .subscribe({
        next: (response) => {
          this.exporting.set(false);
          if (response.body) {
            saveBlob(response.body, exportFileName(response.headers.get('Content-Disposition')));
          }
        },
        error: () => this.exporting.set(false),
      });
  }

  private reload(page: number): void {
    this.service.list(
      page,
      this.pageSize,
      this.searchControl.value,
      this.residentControl.value,
      this.towerControl.value || null,
      this.isOverdue(),
      fromTableSort(this.sort()),
    );
  }

  private isOverdue(): boolean | null {
    const value = this.overdueControl.value;
    return value === '' ? null : value === 'true';
  }
}

/** The API's sort as the table's header state (`Asc` → `asc`). */
function toTableSort(sort: ApartmentSort): TableSort {
  return { key: sort.sortBy, direction: sort.direction === 'Asc' ? 'asc' : 'desc' };
}

function fromTableSort(sort: TableSort): ApartmentSort {
  return {
    sortBy: sort.key as ApartmentSortBy,
    direction: sort.direction === 'asc' ? 'Asc' : 'Desc',
  };
}

function joinOrDash(values: string[]): string {
  return values.length ? values.join(', ') : '—';
}

/**
 * The server's own name when CORS exposes `Content-Disposition`; otherwise the
 * same `apartamentos-yyyyMMdd.csv` it would have sent, dated locally.
 */
function exportFileName(contentDisposition: string | null): string {
  const match = contentDisposition && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition);
  if (match) return decodeURIComponent(match[1]);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `apartamentos-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
