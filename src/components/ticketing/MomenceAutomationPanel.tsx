import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMomenceMemberToSessionForFree,
  addMomenceMemberToWaitlist,
  assignMomenceTag,
  cancelMomenceBooking,
  checkInMomenceBooking,
  getMomenceMember,
  getMomenceMemberBookings,
  getMomenceMemberMemberships,
  getMomenceMemberNotes,
  getMomenceSession,
  getMomenceSessionBookings,
  listMomenceTags,
  MomenceMemberBooking,
  MomenceMemberDetail,
  MomenceMemberNote,
  MomenceMemberOption,
  MomenceMembership,
  MomenceSessionBooking,
  MomenceSessionDetail,
  MomenceSessionOption,
  MomenceTag,
  removeMomenceBookingCheckIn,
  searchMomenceMembers,
  searchMomenceSessions,
  unassignMomenceTag,
} from '@/lib/momence-api';
import { Ticket } from '@/lib/ticketing-data';
import { BadgeCheck, Calendar, CheckCircle2, Loader2, Tag, User, XCircle } from 'lucide-react';

interface Props {
  ticket: Ticket;
}

interface MomenceState {
  member?: MomenceMemberDetail;
  memberships: MomenceMembership[];
  memberBookings: MomenceMemberBooking[];
  notes: MomenceMemberNote[];
  session?: MomenceSessionDetail;
  sessionBookings: MomenceSessionBooking[];
  tags: MomenceTag[];
}

const emptyState: MomenceState = {
  memberships: [],
  memberBookings: [],
  notes: [],
  sessionBookings: [],
  tags: [],
};

function fullName(value?: { firstName?: string; lastName?: string }) {
  return [value?.firstName, value?.lastName].filter(Boolean).join(' ') || 'Unknown';
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function stripHtml(value?: string) {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function confirmed(message: string, action: () => Promise<unknown>) {
  if (!window.confirm(message)) return false;
  await action();
  return true;
}

export const MomenceAutomationPanel: React.FC<Props> = ({ ticket }) => {
  const [memberQuery, setMemberQuery] = useState(ticket.memberName || '');
  const [sessionQuery, setSessionQuery] = useState(ticket.classType || '');
  const [memberOptions, setMemberOptions] = useState<MomenceMemberOption[]>([]);
  const [sessionOptions, setSessionOptions] = useState<MomenceSessionOption[]>([]);
  const [selectedMember, setSelectedMember] = useState<MomenceMemberOption | null>(null);
  const [selectedSession, setSelectedSession] = useState<MomenceSessionOption | null>(null);
  const [data, setData] = useState<MomenceState>(emptyState);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setMemberQuery(ticket.memberName || '');
    setSessionQuery(ticket.classType || '');
    setSelectedMember(null);
    setSelectedSession(null);
    setData(emptyState);
    setError(null);
    setNotice(null);
  }, [ticket.id, ticket.memberName, ticket.classType]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (memberQuery.trim().length < 2) {
        setMemberOptions([]);
        return;
      }
      try {
        setMemberOptions(await searchMomenceMembers(memberQuery));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Member search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [memberQuery]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      try {
        setSessionOptions(await searchMomenceSessions(sessionQuery));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Session search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [sessionQuery]);

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [member, memberships, memberBookings, notes, session, sessionBookings, tags] = await Promise.all([
        selectedMember ? getMomenceMember(selectedMember.id) : Promise.resolve(undefined),
        selectedMember ? getMomenceMemberMemberships(selectedMember.id) : Promise.resolve([]),
        selectedMember ? getMomenceMemberBookings(selectedMember.id) : Promise.resolve([]),
        selectedMember ? getMomenceMemberNotes(selectedMember.id) : Promise.resolve([]),
        selectedSession ? getMomenceSession(selectedSession.id) : Promise.resolve(undefined),
        selectedSession ? getMomenceSessionBookings(selectedSession.id) : Promise.resolve([]),
        listMomenceTags(),
      ]);
      setData({ member, memberships, memberBookings, notes, session, sessionBookings, tags });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Momence context');
    } finally {
      setLoading(false);
    }
  }, [selectedMember, selectedSession]);

  useEffect(() => {
    if (selectedMember || selectedSession) loadContext();
  }, [loadContext, selectedMember, selectedSession]);

  const runAction = async (key: string, message: string, action: () => Promise<unknown>) => {
    setActionLoading(key);
    setError(null);
    setNotice(null);
    try {
      const didRun = await confirmed(message, action);
      if (didRun) {
        setNotice('Momence action completed.');
        await loadContext();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Momence action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const selectedMemberTagIds = useMemo(() => {
    return new Set((data.member?.customerTags || []).map((tag) => String(tag.id)));
  }, [data.member?.customerTags]);

  const matchingSessionBooking = useMemo(() => {
    if (!selectedMember) return undefined;
    return data.sessionBookings.find((booking) => String(booking.member?.id) === selectedMember.id && !booking.cancelledAt);
  }, [data.sessionBookings, selectedMember]);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3 space-y-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Momence Automations</div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Select the live Momence member and session before running operations.
        </p>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
      {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">{notice}</div>}

      <div className="grid grid-cols-1 gap-2">
        <SearchBox<MomenceMemberOption>
          icon={<User className="w-3.5 h-3.5" />}
          label="Member"
          query={memberQuery}
          onQueryChange={setMemberQuery}
          options={memberOptions}
          selectedLabel={selectedMember?.label}
          onSelect={setSelectedMember}
        />
        <SearchBox<MomenceSessionOption>
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Session"
          query={sessionQuery}
          onQueryChange={setSessionQuery}
          options={sessionOptions}
          selectedLabel={selectedSession?.label}
          onSelect={setSelectedSession}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton disabled={!selectedMember || !selectedSession} loading={actionLoading === 'free'} onClick={() => {
          if (!selectedMember || !selectedSession) return;
          runAction(
            'free',
            `Add ${selectedMember.label} to ${selectedSession.classType} for free in Momence?`,
            () => addMomenceMemberToSessionForFree(selectedMember.id, selectedSession.id)
          );
        }}>
          Add Free Booking
        </ActionButton>
        <ActionButton disabled={!selectedMember || !selectedSession} loading={actionLoading === 'waitlist'} onClick={() => {
          if (!selectedMember || !selectedSession) return;
          runAction(
            'waitlist',
            `Add ${selectedMember.label} to the waitlist for ${selectedSession.classType}?`,
            () => addMomenceMemberToWaitlist(selectedMember.id, selectedSession.id)
          );
        }}>
          Add Waitlist
        </ActionButton>
        {matchingSessionBooking && (
          <>
            <ActionButton loading={actionLoading === 'checkin'} onClick={() => {
              runAction(
                'checkin',
                `${matchingSessionBooking.checkedIn ? 'Remove check-in for' : 'Check in'} ${selectedMember?.label}?`,
                () => matchingSessionBooking.checkedIn
                  ? removeMomenceBookingCheckIn(matchingSessionBooking.id)
                  : checkInMomenceBooking(matchingSessionBooking.id)
              );
            }}>
              {matchingSessionBooking.checkedIn ? 'Remove Check-in' : 'Check In'}
            </ActionButton>
            <ActionButton tone="danger" loading={actionLoading === 'cancel'} onClick={() => {
              runAction(
                'cancel',
                `Cancel the Momence booking for ${selectedMember?.label}? This will not refund by default.`,
                () => cancelMomenceBooking(matchingSessionBooking.id)
              );
            }}>
              Cancel Booking
            </ActionButton>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <InfoBlock title="Member Context" icon={<User className="w-3.5 h-3.5" />}>
          {loading ? <LoadingLine /> : data.member ? (
            <div className="space-y-2">
              <Metric label="Name" value={fullName(data.member)} />
              <Metric label="Contact" value={[data.member.email, data.member.phoneNumber].filter(Boolean).join(' · ') || 'Not returned'} />
              <Metric label="Last Seen" value={formatDate(data.member.lastSeen)} />
              <div className="flex flex-wrap gap-1">
                {(data.member.customerTags || []).map((tag) => (
                  <span key={tag.id} className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">{tag.name}</span>
                ))}
              </div>
            </div>
          ) : <EmptyLine text="No Momence member selected." />}
        </InfoBlock>

        <InfoBlock title="Active Memberships" icon={<BadgeCheck className="w-3.5 h-3.5" />}>
          {data.memberships.length ? data.memberships.slice(0, 3).map((membership) => (
            <div key={membership.id} className="border-b border-slate-200 pb-1 last:border-0">
              <div className="text-xs font-medium text-slate-800 dark:text-slate-100">
                {membership.membership?.name || membership.type || `Membership #${membership.id}`}
              </div>
              <div className="text-[11px] text-slate-500">
                Ends {formatDate(membership.endDate)} · {membership.isFrozen ? 'Frozen' : 'Active'}
              </div>
            </div>
          )) : <EmptyLine text="No active memberships loaded." />}
        </InfoBlock>

        <InfoBlock title="Session Context" icon={<Calendar className="w-3.5 h-3.5" />}>
          {data.session ? (
            <div className="space-y-1">
              <Metric label="Session" value={data.session.name || `Session #${data.session.id}`} />
              <Metric label="Starts" value={formatDate(data.session.startsAt)} />
              <Metric label="Booked" value={`${data.session.bookingCount ?? 0}/${data.session.capacity ?? 'unlimited'}`} />
              <Metric label="Waitlist" value={`${data.session.waitlistBookingCount ?? 0}/${data.session.waitlistCapacity ?? 'n/a'}`} />
            </div>
          ) : <EmptyLine text="No Momence session selected." />}
        </InfoBlock>

        <InfoBlock title="Member Sessions & Notes" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
          {data.memberBookings.slice(0, 3).map((booking) => (
            <div key={booking.id} className="text-[11px] text-slate-600 dark:text-slate-300">
              {booking.session?.name || `Booking #${booking.id}`} · {formatDate(booking.session?.startsAt)}
            </div>
          ))}
          {data.notes.slice(0, 2).map((note) => (
            <div key={note.id} className="mt-1 rounded bg-white p-1.5 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              {stripHtml(note.note).slice(0, 160)}
            </div>
          ))}
          {!data.memberBookings.length && !data.notes.length && <EmptyLine text="No bookings or notes loaded." />}
        </InfoBlock>
      </div>

      {selectedMember && data.tags.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedTagId}
            onChange={(event) => setSelectedTagId(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Select Momence tag</option>
            {data.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
          <ActionButton disabled={!selectedTagId} loading={actionLoading === 'tag'} onClick={() => {
            if (!selectedTagId || !selectedMember) return;
            const hasTag = selectedMemberTagIds.has(selectedTagId);
            runAction(
              'tag',
              `${hasTag ? 'Remove' : 'Assign'} this Momence tag for ${selectedMember.label}?`,
              () => hasTag ? unassignMomenceTag(selectedMember.id, selectedTagId) : assignMomenceTag(selectedMember.id, selectedTagId)
            );
          }}>
            <Tag className="w-3 h-3" />
            {selectedMemberTagIds.has(selectedTagId) ? 'Remove' : 'Assign'}
          </ActionButton>
        </div>
      )}
    </div>
  );
};

const SearchBox = <TOption extends { id: string; label: string; description: string }>({
  icon,
  label,
  query,
  onQueryChange,
  options,
  selectedLabel,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: TOption[];
  selectedLabel?: string;
  onSelect: (option: TOption) => void;
}) => (
  <div>
    <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {icon}
      {label}
    </label>
    <input
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      placeholder={`Search Momence ${label.toLowerCase()}`}
      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />
    {selectedLabel && <div className="mt-1 text-[11px] font-medium text-emerald-700">Selected: {selectedLabel}</div>}
    {options.length > 0 && (
      <div className="mt-1 max-h-24 overflow-y-auto rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {options.slice(0, 5).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option)}
            className="block w-full border-b border-slate-100 px-2 py-1.5 text-left text-xs last:border-0 hover:bg-violet-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            <div className="font-medium text-slate-800 dark:text-slate-100">{option.label}</div>
            <div className="text-[11px] text-slate-500">{option.description}</div>
          </button>
        ))}
      </div>
    )}
  </div>
);

const InfoBlock: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {icon}
      {title}
    </div>
    {children}
  </div>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-2 text-[11px]">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-800 dark:text-slate-100">{value}</span>
  </div>
);

const ActionButton: React.FC<{
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'default' | 'danger';
  onClick: () => void;
}> = ({ children, disabled, loading, tone = 'default', onClick }) => (
  <button
    type="button"
    disabled={disabled || loading}
    onClick={onClick}
    className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
      tone === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-violet-600 text-white hover:bg-violet-700'
    }`}
  >
    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
    {children}
  </button>
);

const LoadingLine = () => (
  <div className="flex items-center gap-1 text-xs text-slate-500">
    <Loader2 className="w-3 h-3 animate-spin" />
    Loading from Momence...
  </div>
);

const EmptyLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center gap-1 text-xs text-slate-400">
    <XCircle className="w-3 h-3" />
    {text}
  </div>
);
