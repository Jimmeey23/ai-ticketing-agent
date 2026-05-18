import React, { useState } from 'react';
import { CATEGORIES, PRIORITY_SLA, STUDIOS } from '@/lib/ticketing-data';
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
    <div className="relative my-3 overflow-hidden rounded-3xl border border-slate-200 bg-white/96 p-5 shadow-[0_26px_80px_rgba(15,23,42,0.14)] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-blue-600" />
      <div className="mb-3 flex items-center justify-between gap-3 pt-1">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
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
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-stone-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        ) : (
          <h4 className="text-lg font-semibold leading-snug text-stone-950">{draft.title}</h4>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
          <span>{draft.category}</span>
          <span className="text-blue-600">/</span>
          <span>{draft.subCategory}</span>
          {draft.sentiment && (
            <>
              <span className="text-blue-600">/</span>
              <span>{draft.sentiment}</span>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mb-4 space-y-3">
          <textarea
            value={editedDraft.description}
            onChange={(event) => updateEditedDraft('description', event.target.value)}
            rows={8}
            className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-stone-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <EditSelect
              label="Priority"
              value={editedDraft.priority}
              options={Object.keys(PRIORITY_SLA)}
              onChange={(value) => updateEditedDraft('priority', value as DraftTicket['priority'])}
            />
            <EditSelect
              label="Category"
              value={editedDraft.category}
              options={Object.keys(CATEGORIES)}
              onChange={(value) => {
                setEditedDraft((current) => ({
                  ...current,
                  category: value,
                  subCategory: CATEGORIES[value]?.includes(current.subCategory) ? current.subCategory : CATEGORIES[value]?.[0] || 'Other',
                }));
              }}
            />
            <EditSelect
              label="Subcategory"
              value={editedDraft.subCategory}
              options={CATEGORIES[editedDraft.category] || []}
              onChange={(value) => updateEditedDraft('subCategory', value)}
            />
            <EditSelect
              label="Studio"
              value={editedDraft.studio}
              options={STUDIOS}
              onChange={(value) => updateEditedDraft('studio', value)}
            />
            <EditInput label="Instructor" value={editedDraft.trainer || ''} onChange={(value) => updateEditedDraft('trainer', value)} />
            <EditInput label="Signature experience" value={editedDraft.classType || ''} onChange={(value) => updateEditedDraft('classType', value)} />
            <EditInput label="Community member" value={editedDraft.memberName || ''} onChange={(value) => updateEditedDraft('memberName', value)} />
            <EditInput label="Member contact" value={editedDraft.memberContact || ''} onChange={(value) => updateEditedDraft('memberContact', value)} />
          </div>
        </div>
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
            <span key={t} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-950 py-2.5 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-stone-800"
              >
                <Check className="w-3.5 h-3.5" /> Save edited draft
              </button>
              <button
                onClick={() => {
                  setEditedDraft(draft);
                  setEditing(false);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition duration-200 hover:border-blue-200 hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onConfirm}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-950 py-2.5 text-xs font-semibold text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5 hover:bg-stone-800 hover:shadow-[0_20px_42px_rgba(15,23,42,0.22)]"
              >
                <Check className="w-3.5 h-3.5" /> Publish ticket
              </button>
              <button
                onClick={() => {
                  onEdit();
                  setEditing(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-slate-50"
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
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-relaxed text-stone-700 shadow-inner shadow-stone-200/60">
      {elements}
    </div>
  );
};

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-2 rounded-xl border border-stone-200 bg-white/80 px-2.5 py-2 dark:border-stone-800 dark:bg-stone-950/60">
    <div className="mt-0.5 text-blue-600">{icon}</div>
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</div>
      <div className="truncate text-stone-700">{value}</div>
    </div>
  </div>
);

const EditInput: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="block rounded-xl border border-slate-200 bg-white p-2">
    <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-stone-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
    />
  </label>
);

const EditSelect: React.FC<{ label: string; value: string; options: string[]; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
  <label className="block rounded-xl border border-slate-200 bg-white p-2">
    <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-stone-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
    >
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
);
