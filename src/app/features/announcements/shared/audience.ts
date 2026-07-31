import { AudienceType } from '../data-access/announcement.models';

/** Spanish label for an audience type (UI copy). */
export function audienceTypeLabel(type: AudienceType): string {
  switch (type) {
    case 'AllTenant':
      return 'Todo el conjunto';
    case 'ByTower':
      return 'Por torre';
    case 'ByApartments':
      return 'Por apartamentos';
  }
}

/** Options for the audience-type select in the edit form. */
export const AUDIENCE_OPTIONS: readonly { value: AudienceType; label: string }[] = [
  { value: 'AllTenant', label: 'Todo el conjunto' },
  { value: 'ByTower', label: 'Por torre' },
  { value: 'ByApartments', label: 'Por apartamentos' },
];
