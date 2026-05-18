import React from 'react';
import { Ticket, PRIORITY_SLA, getEscalationTarget } from '@/lib/ticketing-data';
import { Clock, MapPin, User, Tag, AlertCircle, CheckCircle2, Circle, Loader2, ArrowUpRight, ShieldCheck } from 'lucide-react';

const STATUS_ICON: Record<string, React.ReactNode> = {
  'New': <Circle className="w-3.5 h-3.5" />,
  'In Progress': <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  'Awaiting Member': <AlertCircle className="w-3.5 h-3.5" />,
  'Resolved': <CheckCircle2 className="w-3.5 h-3.5" />,
  'Closed': <CheckCircle2 className="w-3.5 h-3.5" />,
};

const STATUS_COLOR: Record<string, string> = {
  'New': 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  'In Progress': 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900',
  'Awaiting Member': 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900',
  'Resolved': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  'Closed': 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

function formatSla(slaDueAt: string): { text: string; breached: boolean; warning: boolean } {
  const diffMs = new Date(slaDueAt).getTime() - Date.now();
  const breached = diffMs < 0;
  const abs = Math.abs(diffMs);
  const hours = Math.floor(abs / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  let text;
  if (hours >= 24) text = `${Math.floor(hours / 24)}d ${hours % 24}h`;
  else if (hours > 0) text = `${hours}h ${mins}m`;
  else text = `${mins}m`;
  const warning = !breached && diffMs < 2 * 3600 * 1000;
  return {
    text: breached ? `Overdue ${text}` : `${text} left`,
    breached,
    warning,
  };
}

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-500',
  'from-stone-500 to-stone-800',
  'from-sky-500 to-cyan-600',
  'from-emerald-400 to-teal-500',
  'from-indigo-500 to-sky-500',
  'from-zinc-500 to-neutral-800',
];

function gradientFor(name: string) {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

interface Props {
  ticket: Ticket;
  onClick?: () => void;
}

export const TicketCard: React.FC<Props> = ({ ticket, onClick }) => {
  const sla = formatSla(ticket.slaDueAt);
  const priorityMeta = PRIORITY_SLA[ticket.priority];
  const primaryPerson = ticket.memberName || ticket.reportedBy || 'No member linked';
  const primaryPersonLabel = ticket.memberName ? 'Member' : ticket.reportedBy ? 'Reported by' : 'Member context';
  const escalation = getEscalationTarget(ticket.assignedTo);

  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-white/94 p-4 text-left shadow-[0_18px_54px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-sky-400 to-emerald-400" />
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md text-white ${priorityMeta.color}`}>
            <AlertCircle className="w-3 h-3" />
            {ticket.priority}
          </span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATUS_COLOR[ticket.status]}`}>
            {STATUS_ICON[ticket.status]}
            {ticket.status}
          </span>
        </div>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-mono text-stone-400">{ticket.id}</span>
      </div>

      <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-snug text-stone-950 transition group-hover:text-blue-700">
        {ticket.title}
      </h3>

      <DescriptionPreview text={ticket.description} />

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
          {ticket.category}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
          {ticket.subCategory}
        </span>
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-xs text-stone-600">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{ticket.studio}</span>
        </div>
        {(ticket.trainer || ticket.classType || ticket.classDateTime) && (
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {[ticket.trainer, ticket.classType, ticket.classDateTime ? new Date(ticket.classDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className={`flex items-center gap-1.5 rounded-xl bg-white px-2 py-1.5 font-medium ${sla.breached ? 'text-red-700' : sla.warning ? 'text-blue-700' : 'text-emerald-700'}`}>
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span>{sla.text}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-white px-2 py-1.5 font-medium text-slate-700">
            <ShieldCheck className="w-3 h-3 flex-shrink-0 text-blue-600" />
            <span className="truncate">{ticket.team}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradientFor(primaryPerson)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
            {initials(primaryPerson)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-stone-900 truncate">{primaryPerson}</div>
            <div className="text-[10px] text-stone-500 truncate">{primaryPersonLabel} · Owner: {ticket.assignedTo}</div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2">
          <div className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Next escalation
            <div className="mt-0.5 truncate text-xs normal-case tracking-normal text-slate-700">{escalation}</div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            {ticket.tags.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px]">
                <Tag className="w-3 h-3" />
                {ticket.tags.length}
              </span>
            )}
            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-blue-600" />
          </div>
        </div>
      </div>
    </button>
  );
};

const DescriptionPreview: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line)).slice(0, 3);
  if (bulletLines.length > 0) {
    return (
      <ul className="mb-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-stone-600">
        {bulletLines.map((line, index) => (
          <li key={index} className="line-clamp-1">{line.replace(/^[-*]\s+/, '')}</li>
        ))}
      </ul>
    );
  }

  return <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-stone-600">{text}</p>;
};
