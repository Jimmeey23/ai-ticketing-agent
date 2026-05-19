export interface NotificationDismissalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface NotificationDismissalRow {
  notification_id?: string | null;
}

const STORAGE_PREFIX = 'athena-read-notifications';

function uniqueNormalized(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

export function notificationDismissalStorageKey(identityValues: Array<string | null | undefined>): string {
  const normalized = uniqueNormalized(identityValues.map((value) => String(value || '')));
  return `${STORAGE_PREFIX}::${normalized.join('|') || 'anonymous'}`;
}

export function loadDismissedNotificationIds(
  storage: NotificationDismissalStorage | undefined,
  key: string
): Set<string> {
  if (!storage) return new Set();

  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function saveDismissedNotificationIds(
  storage: NotificationDismissalStorage | undefined,
  key: string,
  ids: Set<string>
) {
  if (!storage) return;
  storage.setItem(key, JSON.stringify(Array.from(ids).filter(Boolean)));
}

export function mergeDismissedNotificationIds(...sets: Array<Set<string>>): Set<string> {
  return new Set(sets.flatMap((set) => Array.from(set).filter(Boolean)));
}

export function dismissedNotificationIdsFromRows(rows: NotificationDismissalRow[]): Set<string> {
  return new Set(rows.map((row) => String(row.notification_id || '')).filter(Boolean));
}

export function notificationDismissalRows(userId: string, ids: Set<string>) {
  return Array.from(ids)
    .filter(Boolean)
    .map((notificationId) => ({
      user_id: userId,
      notification_id: notificationId,
    }));
}
