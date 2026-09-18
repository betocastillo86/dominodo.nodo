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
import { PermissionStore } from '../../../core/authz/permission.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  DataTableComponent,
  TableColumn,
} from '../../../shared/ui/data-table/data-table.component';
import { KnowledgeResourcesService } from '../data-access/knowledge-resources.service';
import {
  KnowledgeResourceFilters,
  KnowledgeResourceListItem,
  KnowledgeResourceStatus,
} from '../data-access/knowledge-resource.models';

const STATUS_LABELS: Record<KnowledgeResourceStatus, string> = {
  Draft: 'Borrador',
  Published: 'Publicado',
  Archived: 'Archivado',
};

const STATUS_BADGE: Record<KnowledgeResourceStatus, string> = {
  Draft: 'badge bg-secondary-lt',
  Published: 'badge bg-success-lt',
  Archived: 'badge bg-warning-lt',
};

@Component({
  selector: 'app-knowledge-resource-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TablerIconComponent, PageHeaderComponent, DataTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './knowledge-resource-list.component.html',
})
export class KnowledgeResourceListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionStore);
  readonly service = inject(KnowledgeResourcesService);

  private page = 1;

  readonly canEdit = computed(
    () => !this.permissions.loaded() || this.permissions.has('knowledge.edit'),
  );

  readonly searchControl = new FormControl<string>('', { nonNullable: true });
  readonly statusControl = new FormControl<KnowledgeResourceStatus | ''>('', { nonNullable: true });

  readonly statusOptions: readonly { value: KnowledgeResourceStatus | ''; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'Draft', label: 'Borrador' },
    { value: 'Published', label: 'Publicado' },
    { value: 'Archived', label: 'Archivado' },
  ];

  readonly columns = computed<readonly TableColumn<KnowledgeResourceListItem>[]>(() => [
    { header: 'Título', value: (r) => r.title },
    {
      header: 'Estado',
      value: (r) => STATUS_LABELS[r.status],
      badgeClass: (r) => STATUS_BADGE[r.status],
    },
  ]);

  readonly editLink = (row: KnowledgeResourceListItem): unknown[] => [
    '/knowledge-resources',
    row.id,
    'edit',
  ];
  readonly rowKey = (row: KnowledgeResourceListItem): unknown => row.id;

  ngOnInit(): void {
    this.searchControl.valueChanges
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

  private currentFilters(): KnowledgeResourceFilters {
    return {
      search: this.searchControl.value || null,
      status: this.statusControl.value || null,
    };
  }
}
