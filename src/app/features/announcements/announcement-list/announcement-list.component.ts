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
import { distinctUntilChanged } from 'rxjs';
import { TablerIconComponent } from 'angular-tabler-icons';
import { PermissionStore } from '../../../core/authz/permission.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  DataTableComponent,
  TableColumn,
} from '../../../shared/ui/data-table/data-table.component';
import {
  MultiSelectComponent,
  MultiSelectOption,
} from '../../../shared/ui/multi-select/multi-select.component';
import { AnnouncementsService } from '../data-access/announcements.service';
import {
  AnnouncementFilters,
  AnnouncementListItem,
  AnnouncementStatus,
} from '../data-access/announcement.models';
import {
  displayStateBadgeClass,
  displayStateLabel,
  getDisplayState,
} from '../data-access/announcement-status.util';
import { ANNOUNCEMENTS_CREATE } from '../data-access/announcement.permissions';
import { RequestCategoriesService } from '../data-access/request-categories.service';
import { priorityBadgeClass, priorityLabel } from '../shared/priority';
import { formatDate } from '../shared/format-date';

/**
 * Announcements list. Server-side filters (`status` + `categoryIds` multi-select)
 * + paging via the shared DataTable.
 */
@Component({
  selector: 'app-announcement-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TablerIconComponent,
    PageHeaderComponent,
    DataTableComponent,
    MultiSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-list.component.html',
})
export class AnnouncementListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionStore);
  readonly service = inject(AnnouncementsService);
  private readonly categoriesService = inject(RequestCategoriesService);

  private page = 1;

  readonly canCreate = computed(
    () => !this.permissions.loaded() || this.permissions.has(ANNOUNCEMENTS_CREATE),
  );

  readonly statusControl = new FormControl<AnnouncementStatus | ''>('', { nonNullable: true });
  readonly categoryControl = new FormControl<string[]>([], { nonNullable: true });

  readonly statusOptions: readonly { value: AnnouncementStatus | ''; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'Draft', label: 'Borrador' },
    { value: 'Published', label: 'Publicado' },
    { value: 'Archived', label: 'Archivado' },
  ];

  readonly categoryOptions = computed<MultiSelectOption[]>(() =>
    this.categoriesService.categories().map((c) => ({ value: c.id, label: c.name })),
  );

  readonly columns = computed<readonly TableColumn<AnnouncementListItem>[]>(() => {
    const cats = this.categoriesService.categories();
    const catMap = new Map(cats.map((c) => [c.id, c.name]));
    return [
      { header: 'Título', value: (r) => r.title },
      {
        header: 'Categoría',
        value: (r) => (r.categoryId ? (catMap.get(r.categoryId) ?? '—') : '—'),
      },
      {
        header: 'Prioridad',
        value: (r) => priorityLabel(r.priority),
        badgeClass: (r) => priorityBadgeClass(r.priority),
        class: 'w-1 text-center',
      },
      {
        header: 'Estado',
        value: (r) => displayStateLabel(getDisplayState(r)),
        badgeClass: (r) => displayStateBadgeClass(getDisplayState(r)),
      },
      { header: 'Expira', value: (r) => formatDate(r.expiresAtUtc) },
    ];
  });

  readonly rowLink = (row: AnnouncementListItem): unknown[] => ['/announcements', row.id];
  readonly rowKey = (row: AnnouncementListItem): unknown => row.id;

  ngOnInit(): void {
    this.categoriesService.load();

    this.statusControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page = 1;
        this.reload();
      });

    this.categoryControl.valueChanges
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

  private currentFilters(): AnnouncementFilters {
    const categoryIds = this.categoryControl.value;
    return {
      status: this.statusControl.value || null,
      categoryIds: categoryIds.length ? categoryIds : [],
    };
  }
}
