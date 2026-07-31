import { AnnouncementStatus } from './announcement.models';

/**
 * Derived, user-facing state of an announcement. Unlike the raw `status`, this
 * folds in the visibility window so the UI can show whether the announcement is
 * actually visible to residents *right now*. Single source of truth reused by
 * the list, detail and edit views.
 *
 * An announcement is `active` (visible) iff it is `Published` AND not expired
 * (`expiresAtUtc` is null or in the future).
 */
export type DisplayState = 'draft' | 'active' | 'expired' | 'archived';

/** Minimal shape needed to compute the display state. */
interface StatefulAnnouncement {
  status: AnnouncementStatus;
  expiresAtUtc: string | null;
}

/** Compute the derived display state. `now` is injectable for testing/consistency. */
export function getDisplayState(a: StatefulAnnouncement, now: Date = new Date()): DisplayState {
  switch (a.status) {
    case 'Draft':
      return 'draft';
    case 'Archived':
      return 'archived';
    case 'Published': {
      const expired = a.expiresAtUtc !== null && new Date(a.expiresAtUtc) <= now;
      return expired ? 'expired' : 'active';
    }
  }
}

/** True when the announcement is currently visible to residents. */
export function isActive(a: StatefulAnnouncement, now: Date = new Date()): boolean {
  return getDisplayState(a, now) === 'active';
}

/** Spanish label for a display state (UI copy). */
export function displayStateLabel(state: DisplayState): string {
  switch (state) {
    case 'draft':
      return 'Borrador';
    case 'active':
      return 'Activo';
    case 'expired':
      return 'Expirado';
    case 'archived':
      return 'Archivado';
  }
}

/** Tabler badge class for a display state. */
export function displayStateBadgeClass(state: DisplayState): string {
  switch (state) {
    case 'active':
      return 'badge bg-success text-white';
    case 'expired':
      return 'badge bg-warning text-dark';
    case 'draft':
      return 'badge bg-secondary text-white';
    case 'archived':
      return 'badge bg-red-lt';
  }
}
