import { AnnouncementPriority } from '../data-access/announcement.models';

/** Spanish label for an announcement priority (UI copy). */
export function priorityLabel(priority: AnnouncementPriority): string {
  switch (priority) {
    case 'High':
      return 'Alta';
    case 'Medium':
      return 'Media';
    case 'Low':
      return 'Baja';
  }
}

/** Tabler badge class for a priority. */
export function priorityBadgeClass(priority: AnnouncementPriority): string {
  switch (priority) {
    case 'High':
      return 'badge bg-red-lt';
    case 'Medium':
      return 'badge bg-yellow-lt';
    case 'Low':
      return 'badge bg-secondary-lt';
  }
}

/** Options for the priority select in the create/edit forms (highest first). */
export const PRIORITY_OPTIONS: readonly { value: AnnouncementPriority; label: string }[] = [
  { value: 'High', label: 'Alta' },
  { value: 'Medium', label: 'Media' },
  { value: 'Low', label: 'Baja' },
];

/** Default priority for a new announcement. */
export const DEFAULT_PRIORITY: AnnouncementPriority = 'Medium';
