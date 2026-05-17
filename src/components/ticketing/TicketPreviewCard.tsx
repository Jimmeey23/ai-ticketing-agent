import React, { useState } from 'react';
import { PRIORITY_SLA } from '@/lib/ticketing-data';
import { Sparkles, Check, Pencil, MapPin, User, Calendar, Tag, Clock, ShieldCheck } from 'lucide-react';

interface DraftTicket {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  tags: string[];
  sentiment?: string;
  conversationSummary?: string;
}

interface Props {
  draft: DraftTicket;
  onConfirm: () => void;
  onEdit: () => void;
  onSaveEdit?: (draft: DraftTicket) => void;
  confirmed?: boolean;
  ticketId?: string;
}

export const TicketPreviewCard: React.FC<Props> = ({ draft, onConfirm, onEdit, onSaveEdit, confirmed, ticketId }) => {
  const priorityMeta = PRIORITY_SLA[draft.priority];
  const [editing, setEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState<DraftTicket>(draft);

  React.useEffect(() => {
    setEditedDraft(draft);
  }, [draft]);

  const updateEditedDraft = (field: keyof DraftTicket, value: string) => {
    setEditedDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="relative my-3 overflow-hidden rounded-2xl border border-blue-100 bg-white p-4 shadow-2xl shadow-indigo-950/20 dark:border-blue-300/15 dark:bg-stone-900 dark:shadow-black/30">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-indigo-300 to-pink-200 dark:from-blue-700 dark:via-indigo-700 dark:to-pink-900" />
      <div className="mb-3 flex items-center justify-between gap-3 pt-1">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
          <Sparkles className="h-3 w-3" />
          Athena draft
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase text-white ${priorityMeta.color}`}>
          {draft.priority} priority
        </span>
      </div>

      <div className="mb-3">
        {editing ? (
          <input
            value={editedDraft.title}
            onChange={(event) => updateEditedDraft('title', event.target.value)}
            className="h-10 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold text-stone-950 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-50"
          />
        ) : (
          <h4 className="text-base font-semibold leading-snug text-stone-950 dark:text-stone-50">{draft.title}</h4>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
          <span>{draft.category}</span>
          <span className="text-blue-500">/</span>
          <span>{draft.subCategory}</span>
          {draft.sentiment && (
            <>
              <span className="text-blue-500">/</span>
              <span>{draft.sentiment}</span>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={editedDraft.description}
          onChange={(event) => updateEditedDraft('description', event.target.value)}
          rows={8}
          className="mb-4 w-full resize-y rounded-xl border border-blue-100 bg-white p-3 text-xs leading-relaxed text-stone-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300"
        />
      ) : (
        <FormattedDescription text={draft.description} />
      )}

      <div className="mb-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
        <Row icon={<Tag className="h-3 w-3" />} label="Classification" value={`${draft.category} / ${draft.subCategory}`} />
        <Row icon={<MapPin className="h-3 w-3" />} label="Studio" value={draft.studio} />
        {draft.memberName && <Row icon={<User className="h-3 w-3" />} label="Community member" value={draft.memberName} />}
        {draft.memberContact && <Row icon={<User className="h-3 w-3" />} label="Member contact" value={draft.memberContact} />}
        {draft.trainer && <Row icon={<User className="h-3 w-3" />} label="Instructor" value={draft.trainer} />}
        {draft.classType && <Row icon={<Calendar className="h-3 w-3" />} label="Signature experience" value={draft.classType} />}
        {draft.classDateTime && <Row icon={<Clock className="h-3 w-3" />} label="Session time" value={new Date(draft.classDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />}
        {draft.reportedBy && <Row icon={<ShieldCheck className="h-3 w-3" />} label="Documented by" value={draft.reportedBy} />}
      </div>

      {draft.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {draft.tags.map((t) => (
            <span key={t} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
              #{t}
            </span>
          ))}
        </div>
      )}

      {confirmed ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
          <Check className="w-4 h-4" />
          Ticket {ticketId} published to dashboard
        </div>
      ) : (
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => {
                  onSaveEdit?.(editedDraft);
                  setEditing(false);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Check className="w-3.5 h-3.5" /> Save edited draft
              </button>
              <button
                onClick={() => {
                  setEditedDraft(draft);
                  setEditing(false);
                }}
                className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-blue-400 hover:bg-blue-50 dark:border-blue-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onConfirm}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                <Check className="w-3.5 h-3.5" /> Publish ticket
              </button>
              <button
                onClick={() => {
                  onEdit();
                  setEditing(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit draft
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const cleanInlineMarkdown = (value: string) =>
  value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^[-*]\s+/, '')
    .trim();

const FormattedDescription: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="my-2 list-disc space-y-1 pl-5">
        {bullets.map((line, index) => <li key={index}>{cleanInlineMarkdown(line)}</li>)}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || /^(\*{3,}|-{3,})$/.test(line)) {
      flushBullets();
      elements.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line);
      return;
    }
    flushBullets();
    elements.push(<p key={`p-${index}`} className="mb-1">{cleanInlineMarkdown(line)}</p>);
  });
  flushBullets();

  return (
    <div className="mb-4 rounded-xl border border-blue-100 bg-white p-3 text-xs leading-relaxed text-stone-700 shadow-inner shadow-indigo-100/70 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
      {elements}
    </div>
  );
};

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-2 rounded-xl border border-stone-200 bg-white/80 px-2.5 py-2 dark:border-stone-800 dark:bg-stone-950/60">
    <div className="mt-0.5 text-blue-600 dark:text-blue-300">{icon}</div>
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</div>
      <div className="truncate text-stone-700 dark:text-stone-200">{value}</div>
    </div>
  </div>
);
