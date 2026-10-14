import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TablerIconComponent } from 'angular-tabler-icons';
import { PermissionStore } from '../../../../core/authz/permission.store';
import {
  DataTableComponent,
  TableColumn,
} from '../../../../shared/ui/data-table/data-table.component';
import { AmenitiesService } from '../data-access/amenities.service';
import { AmenityFilters, AmenityListItem, AmenityStatus } from '../data-access/amenity.models';
import { AMENITIES_CREATE } from '../data-access/amenity.permissions';

const STATUS_LABELS: Record<AmenityStatus, string> = {
  Active: 'Activa',
  OutOfService: 'Fuera de servicio',
};

const STATUS_BADGE: Record<AmenityStatus, string> = {
  Active: 'badge bg-success-lt',
  OutOfService: 'badge bg-warning-lt',
};

/**
 * Amenities list ("Áreas sociales" tab of Mi Conjunto). Server-side filters
 * (`name` debounced text + `status`) + paging via the shared DataTable. The
 * activate / out-of-service toggle lives in the edit form, not here, so the
 * table keeps its single edit action (ADR-0016: no `amenities.delete`).
 */
@Component({
  selector: 'app-amenity-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TablerIconComponent, DataTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amenity-list.component.html',
})
export class AmenityListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionStore);
  readonly service = inject(AmenitiesService);

  private page = 1;

  readonly canCreate = computed(
    () => !this.permissions.loaded() || this.permissions.has(AMENITIES_CREATE),
  );

  readonly nameControl = new FormControl<string>('', { nonNullable: true });
  readonly statusControl = new FormControl<AmenityStatus | ''>('', { nonNullable: true });

  readonly statusOptions: readonly { value: AmenityStatus | ''; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'Active', label: 'Activa' },
    { value: 'OutOfService', label: 'Fuera de servicio' },
  ];

  readonly columns: readonly TableColumn<AmenityListItem>[] = [
    { header: 'Nombre', value: (r) => r.name },
    { header: 'Aforo', value: (r) => r.maxOccupancy, class: 'w-1 text-center' },
    {
      header: 'Requiere aprobación',
      value: (r) => (r.requiresApproval ? 'Sí' : 'No'),
      class: 'w-1 text-center',
    },
    {
      header: 'Estado',
      value: (r) => STATUS_LABELS[r.status],
      badgeClass: (r) => STATUS_BADGE[r.status],
    },
  ];

  readonly editLink = (row: AmenityListItem): unknown[] => [
    '/tenant-info',
    'amenities',
    row.id,
    'edit',
  ];
  readonly rowKey = (row: AmenityListItem): unknown => row.id;

  ngOnInit(): void {
    this.nameControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page = 1;
        this.reload();
      });

    this.statusControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page = 1;
        this.reload();
      });

    this.reload();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.reload();
  }

  private reload(): void {
    this.service.load(this.currentFilters(), this.page);
  }

  private currentFilters(): AmenityFilters {
    return {
      name: this.nameControl.value,
      status: this.statusControl.value || null,
    };
  }
}
