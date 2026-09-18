import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from 'angular-tabler-icons';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { DataTableComponent, TableColumn } from '../../../shared/ui/data-table/data-table.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
} from '../../../shared/ui/search-select/search-select.component';
import {
  APARTMENT_STATUS_BADGE,
  APARTMENT_STATUS_LABEL,
  APARTMENT_TYPE_LABEL,
  ApartmentDto,
} from '../data-access/apartment.models';
import { ApartmentsService } from '../data-access/apartments.service';
import { ResidentsLookupService } from '../data-access/residents-lookup.service';

/**
 * Apartment list. Apartments are read-only in this portal — there is no create
 * action; the row action opens the detail, where residents are managed.
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apartment-list.component.html',
})
export class ApartmentListComponent {
  private readonly service = inject(ApartmentsService);
  private readonly residentsLookup = inject(ResidentsLookupService);

  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  /** Free text → `search`, which the API matches against the apartment NUMBER only. */
  readonly searchControl = new FormControl('', { nonNullable: true });
  /** Holds the picked resident's userId → sent as `residentUserId`. */
  readonly residentControl = new FormControl<string | null>(null);

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

  readonly columns: readonly TableColumn<ApartmentDto>[] = [
    {
      header: 'Torre',
      value: (a) => a.tower ?? '—',
      class: 'w-1 text-nowrap text-secondary',
    },
    { header: 'Apartamento', value: (a) => a.number, class: 'fw-medium' },
    { header: 'Tipo', value: (a) => APARTMENT_TYPE_LABEL[a.type] },
    {
      header: 'Estado',
      value: (a) => APARTMENT_STATUS_LABEL[a.status],
      badgeClass: (a) => APARTMENT_STATUS_BADGE[a.status],
    },
  ];

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

    this.reload(1);
  }

  onPageChange(page: number): void {
    this.reload(page);
  }

  private reload(page: number): void {
    this.service.list(
      page,
      this.pageSize,
      this.searchControl.value,
      this.residentControl.value,
    );
  }
}
