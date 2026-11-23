import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import {
  DataTableComponent,
  TableColumn,
} from '../../../shared/ui/data-table/data-table.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
  SearchSelectResolveFn,
} from '../../../shared/ui/search-select/search-select.component';
import { apartmentLabel } from '../../apartments/data-access/apartment.models';
import { formatDay, instantToReportDay } from '../../dashboard/data-access/date-range';
import { formatInstant } from '../../reservations/data-access/reservation-format';
import { ApartmentOptionsService } from '../../reservations-admin/data-access/apartment-options.service';
import {
  VISIT_KIND_LABEL,
  VISIT_KINDS,
  VISIT_STATUS_BADGE,
  VISIT_STATUS_LABEL,
  VISIT_STATUSES,
  VisitDto,
  VisitKind,
  VisitStatus,
  visitDisplayName,
} from '../data-access/visit.models';
import { VISITS_CREATE } from '../data-access/visit.permissions';
import { VisitsService } from '../data-access/visits.service';

/**
 * Admin visits list: every pre-authorized visit of the conjunto, filterable by
 * kind, status, apartment, a day inside the validity range and free text (name,
 * document, company or plate). The API fixes the order — newest `validFrom` first — so
 * the "Creada" column is informative, not a sort key.
 */
@Component({
  selector: 'app-visit-list',
  standalone: true,
  imports: [
    PageHeaderComponent,
    DataTableComponent,
    ReactiveFormsModule,
    SearchSelectComponent,
    RouterLink,
    TablerIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit-list.component.html',
})
export class VisitListComponent {
  private readonly service = inject(VisitsService);
  private readonly apartmentOptions = inject(ApartmentOptionsService);
  private readonly permissions = inject(PermissionStore);

  /** Hiding the button is UX; the route guard and the API are what enforce `visits.create`. */
  readonly canCreate = computed(() => this.permissions.has(VISITS_CREATE));

  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  readonly kinds = VISIT_KINDS;
  readonly kindLabel = VISIT_KIND_LABEL;
  readonly statuses = VISIT_STATUSES;
  readonly statusLabel = VISIT_STATUS_LABEL;

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly kindControl = new FormControl<VisitKind | ''>('', { nonNullable: true });
  readonly statusControl = new FormControl<VisitStatus | ''>('', { nonNullable: true });
  readonly validOnControl = new FormControl('', { nonNullable: true });
  readonly apartmentControl = new FormControl<string | null>(null);

  readonly searchApartments: SearchSelectFn = (term) =>
    this.apartmentOptions
      .search(term)
      .pipe(map((items) => items.map((a) => ({ value: a.id, label: apartmentLabel(a) }))));

  readonly resolveApartment: SearchSelectResolveFn = (id) =>
    this.apartmentOptions
      .getById(id)
      .pipe(map((a) => (a ? { value: a.id, label: apartmentLabel(a) } : null)));

  readonly columns = computed<readonly TableColumn<VisitDto>[]>(() => [
    {
      header: 'Visitante',
      value: (v) => visitDisplayName(v),
      class: 'fw-medium',
      link: (v) => this.detailLink(v),
    },
    { header: 'Documento', value: (v) => v.visitorDocument ?? '—', class: 'text-nowrap' },
    { header: 'Placa', value: (v) => v.vehiclePlate ?? '—', class: 'text-nowrap' },
    { header: 'Tipo', value: (v) => VISIT_KIND_LABEL[v.kind], class: 'text-nowrap' },
    {
      header: 'Apto',
      value: (v) => (v.apartment ? apartmentLabel(v.apartment) : '—'),
      class: 'text-nowrap',
    },
    { header: 'Vigencia', value: (v) => this.rangeLabel(v), class: 'text-nowrap' },
    { header: 'Ingresos', value: (v) => v.entriesCount, class: 'text-center' },
    {
      header: 'Último ingreso',
      value: (v) => (v.lastEnteredAtUtc ? formatInstant(v.lastEnteredAtUtc) : '—'),
      class: 'text-nowrap',
    },
    {
      header: 'Creada',
      value: (v) => formatDay(instantToReportDay(v.createdAtUtc)),
      class: 'text-nowrap',
    },
    {
      header: 'Estado',
      value: (v) => VISIT_STATUS_LABEL[v.status],
      badgeClass: (v) => VISIT_STATUS_BADGE[v.status],
    },
  ]);

  readonly rowKey = (v: VisitDto): string => v.id;
  readonly detailLink = (v: VisitDto): unknown[] => ['/visits', v.id];

  private readonly pageSize = 20;

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));

    for (const control of [
      this.kindControl,
      this.statusControl,
      this.validOnControl,
      this.apartmentControl,
    ]) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    }

    this.reload(1);
  }

  onPageChange(page: number): void {
    this.reload(page);
  }

  clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.kindControl.setValue('', { emitEvent: false });
    this.statusControl.setValue('', { emitEvent: false });
    this.validOnControl.setValue('', { emitEvent: false });
    this.apartmentControl.setValue(null, { emitEvent: false });
    this.reload(1);
  }

  private rangeLabel(v: VisitDto): string {
    return v.validFrom === v.validUntil
      ? formatDay(v.validFrom)
      : `${formatDay(v.validFrom)} – ${formatDay(v.validUntil)}`;
  }

  private reload(page: number): void {
    this.service.list(
      {
        kind: this.kindControl.value || null,
        status: this.statusControl.value || null,
        apartmentId: this.apartmentControl.value || null,
        validOn: this.validOnControl.value || null,
        search: this.searchControl.value,
      },
      page,
      this.pageSize,
    );
  }
}
