import { describe, expect, it } from 'vitest';
import {
  dismissedNotificationIdsFromRows,
  loadDismissedNotificationIds,
  mergeDismissedNotificationIds,
  notificationDismissalRows,
  notificationDismissalStorageKey,
  saveDismissedNotificationIds,
} from './notification-dismissals';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('notification dismissals', () => {
  it('builds a stable user-scoped storage key', () => {
    expect(notificationDismissalStorageKey(['  User@Physique57India.com ', 'user@physique57india.com'])).toBe(
      'athena-read-notifications::user@physique57india.com'
    );
  });

  it('loads dismissed notification ids from storage', () => {
    const storage = createStorage({
      'athena-read-notifications::user': JSON.stringify(['sla-breached-1', 'sla-at-risk-2']),
    });

    expect(Array.from(loadDismissedNotificationIds(storage, 'athena-read-notifications::user'))).toEqual([
      'sla-breached-1',
      'sla-at-risk-2',
    ]);
  });

  it('saves unique dismissed notification ids for later reloads', () => {
    const storage = createStorage();

    saveDismissedNotificationIds(storage, 'athena-read-notifications::user', new Set([
      'sla-breached-1',
      'sla-breached-1',
      'sla-at-risk-2',
    ]));

    expect(loadDismissedNotificationIds(storage, 'athena-read-notifications::user')).toEqual(new Set([
      'sla-breached-1',
      'sla-at-risk-2',
    ]));
  });

  it('falls back to no dismissed ids when storage is malformed', () => {
    const storage = createStorage({
      'athena-read-notifications::user': '{not json',
    });

    expect(loadDismissedNotificationIds(storage, 'athena-read-notifications::user')).toEqual(new Set());
  });

  it('builds unique Supabase rows for a dismissed notification set', () => {
    expect(notificationDismissalRows('user-1', new Set(['sla-breached-1', '', 'sla-at-risk-2']))).toEqual([
      { user_id: 'user-1', notification_id: 'sla-breached-1' },
      { user_id: 'user-1', notification_id: 'sla-at-risk-2' },
    ]);
  });

  it('extracts dismissed ids from Supabase rows', () => {
    expect(dismissedNotificationIdsFromRows([
      { notification_id: 'sla-breached-1' },
      { notification_id: 'sla-at-risk-2' },
      { notification_id: null },
    ])).toEqual(new Set(['sla-breached-1', 'sla-at-risk-2']));
  });

  it('merges local and remote dismissal sets without losing current state', () => {
    expect(mergeDismissedNotificationIds(
      new Set(['current']),
      new Set(['local']),
      new Set(['remote'])
    )).toEqual(new Set(['current', 'local', 'remote']));
  });
});
