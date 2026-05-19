import React, { useEffect, useState } from 'react';
import { Ticket, PRIORITY_SLA, STATUSES, ASSOCIATES, CATEGORIES, STUDIOS, CLASS_TYPES, TRAINERS, getEscalationTarget } from '@/lib/ticketing-data';
import { TicketStatusUpdateInput, useTickets } from './TicketContext';
import { X, Clock, MapPin, User, Calendar, Tag, MessageSquare, Phone, Lock, Pencil, Save, Trash2 } from 'lucide-react';
import { MomenceAutomationPanel } from './MomenceAutomationPanel';

interface Props {
  ticket: Ticket | null;
  onClose: () => void;
}

function defaultStatusValues(ticket?: Ticket | null): TicketStatusUpdateInput {
  return {
    status: ticket?.status || 'New',
    reason: '',
    actionTaken: '',
    actionDate: new Date().toISOString().slice(0, 10),
    followUpDate: '',
    comments: '',
    notes: '',
  };
}

export const TicketDetailDrawer: React.FC<Props> = ({ ticket, onClose }) => {
  const { updateTicket, updateTicketStatus, canUpdateTicketStatus, deleteTicket } = useTickets();
  const [editingLinkedContext, setEditingLinkedContext] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [editValues, setEditValues] = useState<Partial<Ticket>>({});
  const [statusValues, setStatusValues] = useState<TicketStatusUpdateInput>(() => defaultStatusValues(ticket));

  useEffect(() => {
    setEditingLinkedContext(false);
    setEditing(false);
    setEditValues(ticket || {});
    setStatusValues(defaultStatusValues(ticket));
    setStatusError('');
  }, [ticket]);

  if (!ticket) return null;

  const priorityMeta = PRIORITY_SLA[ticket.priority];
  const currentValues = { ...ticket, ...editValues };
  const subCategories = CATEGORIES[currentValues.category || ticket.category] || ['Other'];
  const statusAllowed = canUpdateTicketStatus(ticket);
  const statusChanged = statusValues.status !== ticket.status;
  const statusReady = statusAllowed && statusChanged && Boolean(statusValues.reason.trim()) && Boolean(statusValues.actionTaken.trim());
  const latestResolution = ticket.metadata?.latestResolution;

  const saveEdits = async () => {
    setSaving(true);
    try {
      await updateTicket(ticket.id, {
        title: currentValues.title,
        description: currentValues.description,
        category: currentValues.category,
        subCategory: currentValues.subCategory,
        priority: currentValues.priority,
        studio: currentValues.studio,
        trainer: currentValues.trainer,
        classType: currentValues.classType,
        memberName: currentValues.memberName,
        memberContact: currentValues.memberContact,
        assignedTo: currentValues.assignedTo,
        team: currentValues.team,
        sentiment: currentValues.sentiment,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const removeTicket = async () => {
    if (!window.confirm(`Delete ticket ${ticket.id}? This permanently removes the submitted ticket from the backend.`)) return;
    await deleteTicket(ticket.id);
    onClose();
  };

  const submitStatusUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!statusReady) return;
    setStatusSaving(true);
    setStatusError('');
    try {
      await updateTicketStatus(ticket.id, statusValues);
      setStatusValues(defaultStatusValues({ ...ticket, status: statusValues.status }));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Unable to update ticket status.');
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white z-50 shadow-2xl overflow-y-auto border-l border-slate-200">
        <div className="sticky top-0 bg-white/92 backdrop-blur-xl border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-400">{ticket.id}</span>
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded text-white ${priorityMeta.color}`}>
                {ticket.priority}
              </span>
            </div>
            {editing ? (
              <input
                value={currentValues.title || ''}
                onChange={(event) => setEditValues((values) => ({ ...values, title: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-stone-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            ) : (
              <h3 className="font-bold text-stone-900 leading-snug pr-2">{ticket.title}</h3>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {editing ? (
              <>
                <button onClick={saveEdits} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-stone-950 px-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-40">
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setEditValues(ticket); }} className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-stone-600 transition hover:bg-slate-50">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-stone-600 transition hover:bg-slate-50">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button onClick={removeTicket} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <form onSubmit={submitStatusUpdate} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status and resolution</label>
                <p className="mt-1 text-xs text-slate-500">
                  Status changes require owner/admin access plus reason and action taken.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                Current: {ticket.status}
              </span>
            </div>

            {!statusAllowed && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Only the assigned owner or an admin can change this ticket status.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <EditSelect
                label="New status"
                value={statusValues.status}
                values={STATUSES}
                disabled={!statusAllowed}
                onChange={(status) => setStatusValues((values) => ({ ...values, status: status as Ticket['status'] }))}
              />
              <EditText
                label="Action date"
                value={statusValues.actionDate}
                type="date"
                disabled={!statusAllowed}
                onChange={(actionDate) => setStatusValues((values) => ({ ...values, actionDate }))}
              />
              <div className="md:col-span-2">
                <EditText
                  label="Reason for status change"
                  value={statusValues.reason}
                  disabled={!statusAllowed}
                  onChange={(reason) => setStatusValues((values) => ({ ...values, reason }))}
                />
              </div>
              <div className="md:col-span-2">
                <EditTextarea
                  label="Action taken"
                  value={statusValues.actionTaken}
                  rows={3}
                  disabled={!statusAllowed}
                  onChange={(actionTaken) => setStatusValues((values) => ({ ...values, actionTaken }))}
                />
              </div>
              <EditText
                label="Follow-up date"
                value={statusValues.followUpDate || ''}
                type="date"
                disabled={!statusAllowed}
                onChange={(followUpDate) => setStatusValues((values) => ({ ...values, followUpDate }))}
              />
              <EditText
                label="Comments"
                value={statusValues.comments || ''}
                disabled={!statusAllowed}
                onChange={(comments) => setStatusValues((values) => ({ ...values, comments }))}
              />
              <div className="md:col-span-2">
                <EditTextarea
                  label="Internal notes"
                  value={statusValues.notes || ''}
                  rows={3}
                  disabled={!statusAllowed}
                  onChange={(notes) => setStatusValues((values) => ({ ...values, notes }))}
                />
              </div>
            </div>

            {latestResolution && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">Latest resolution note</div>
                <div className="mt-1">Reason: {latestResolution.reason}</div>
                <div className="mt-0.5">Action: {latestResolution.actionTaken}</div>
                {latestResolution.followUpDate && <div className="mt-0.5">Follow-up: {latestResolution.followUpDate}</div>}
              </div>
            )}

            {statusError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {statusError}
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={!statusReady || statusSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" />
                {statusSaving ? 'Saving...' : 'Save status update'}
              </button>
            </div>
          </form>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">Assigned To</label>
            <select
              value={editing ? currentValues.assignedTo : ticket.assignedTo}
              onChange={(e) => {
                const found = ASSOCIATES.find((a) => a.name === e.target.value);
                if (editing) setEditValues((values) => ({ ...values, assignedTo: e.target.value, team: found?.team || ticket.team }));
                else updateTicket(ticket.id, { assignedTo: e.target.value, team: found?.team || ticket.team });
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900 dark:text-slate-100"
            >
              {ASSOCIATES.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} — {a.role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">Description</label>
            {editing ? (
              <textarea
                value={currentValues.description || ''}
                onChange={(event) => setEditValues((values) => ({ ...values, description: event.target.value }))}
                rows={10}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-relaxed text-stone-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            ) : (
              <FormattedTicketText text={ticket.description} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {editing ? (
              <>
                <EditSelect label="Category" value={currentValues.category || ''} values={Object.keys(CATEGORIES)} onChange={(value) => setEditValues((state) => ({ ...state, category: value, subCategory: CATEGORIES[value]?.[0] || 'Other' }))} />
                <EditSelect label="Sub-category" value={currentValues.subCategory || ''} values={subCategories} onChange={(value) => setEditValues((state) => ({ ...state, subCategory: value }))} />
                <EditSelect label="Studio" value={currentValues.studio || ''} values={STUDIOS} onChange={(value) => setEditValues((state) => ({ ...state, studio: value }))} />
                <EditSelect label="Priority" value={currentValues.priority || ''} values={['Critical', 'High', 'Medium', 'Low']} onChange={(value) => setEditValues((state) => ({ ...state, priority: value as Ticket['priority'] }))} />
                <EditText label="Member" value={currentValues.memberName || ''} onChange={(value) => setEditValues((state) => ({ ...state, memberName: value || undefined }))} />
                <EditText label="Contact" value={currentValues.memberContact || ''} onChange={(value) => setEditValues((state) => ({ ...state, memberContact: value || undefined }))} />
                <EditSelect label="Instructor" value={currentValues.trainer || ''} values={['', ...TRAINERS]} onChange={(value) => setEditValues((state) => ({ ...state, trainer: value || undefined }))} />
                <EditSelect label="Session" value={currentValues.classType || ''} values={['', ...CLASS_TYPES]} onChange={(value) => setEditValues((state) => ({ ...state, classType: value || undefined }))} />
              </>
            ) : (
              <>
                <Field icon={<Tag className="w-3.5 h-3.5" />} label="Category" value={ticket.category} />
                <Field icon={<Tag className="w-3.5 h-3.5" />} label="Sub-category" value={ticket.subCategory} />
                <Field icon={<MapPin className="w-3.5 h-3.5" />} label="Studio" value={ticket.studio} />
              </>
            )}
            <Field icon={<Clock className="w-3.5 h-3.5" />} label="SLA Due" value={new Date(ticket.slaDueAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />
            <Field icon={<User className="w-3.5 h-3.5" />} label="Owner" value={ticket.assignedTo} />
            <Field icon={<User className="w-3.5 h-3.5" />} label="Next Escalation" value={getEscalationTarget(ticket.assignedTo)} />
            {ticket.reportedBy && <Field icon={<MessageSquare className="w-3.5 h-3.5" />} label="Reported By" value={ticket.reportedBy} />}
            {ticket.sentiment && <Field icon={<MessageSquare className="w-3.5 h-3.5" />} label="Sentiment" value={ticket.sentiment} />}
          </div>

          {(ticket.memberName || ticket.memberContact || ticket.classType || ticket.classDateTime || ticket.trainer) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Lock className="w-3.5 h-3.5" />
                  Locked creation context
                </div>
                <button
                  type="button"
                  onClick={() => setEditingLinkedContext((value) => !value)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <Pencil className="w-3 h-3" />
                  {editingLinkedContext ? 'Hide edit' : 'Edit linked context'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {ticket.memberName && <Field icon={<User className="w-3.5 h-3.5" />} label="Member" value={ticket.memberName} />}
                {ticket.memberContact && <Field icon={<Phone className="w-3.5 h-3.5" />} label="Contact" value={ticket.memberContact} />}
                {ticket.classType && <Field icon={<Calendar className="w-3.5 h-3.5" />} label="Session" value={ticket.classType} />}
                {ticket.classDateTime && <Field icon={<Clock className="w-3.5 h-3.5" />} label="Session Time" value={new Date(ticket.classDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} />}
                {ticket.trainer && <Field icon={<User className="w-3.5 h-3.5" />} label="Instructor" value={ticket.trainer} />}
              </div>
            </div>
          )}

          {editingLinkedContext && <MomenceAutomationPanel ticket={ticket} />}

          {ticket.tags.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300 rounded-md">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            Created {new Date(ticket.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
      </div>
    </>
  );
};

const Field: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div>
    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
      {icon}
      {label}
    </div>
    <div className="text-sm text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const EditText: React.FC<{ label: string; value: string; type?: string; disabled?: boolean; onChange: (value: string) => void }> = ({ label, value, type = 'text', disabled, onChange }) => (
  <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
    {label}
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium normal-case tracking-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
    />
  </label>
);

const EditTextarea: React.FC<{ label: string; value: string; rows?: number; disabled?: boolean; onChange: (value: string) => void }> = ({ label, value, rows = 3, disabled, onChange }) => (
  <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
    {label}
    <textarea
      value={value}
      rows={rows}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-medium normal-case tracking-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
    />
  </label>
);

const EditSelect: React.FC<{ label: string; value: string; values: string[] | readonly string[]; disabled?: boolean; onChange: (value: string) => void }> = ({ label, value, values, disabled, onChange }) => (
  <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
    {label}
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium normal-case tracking-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
    >
      {values.map((item) => (
        <option key={item} value={item}>{item || 'None'}</option>
      ))}
    </select>
  </label>
);

const FormattedTicketText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="my-2 list-disc space-y-1 pl-5">
        {bullets.map((line, index) => (
          <li key={index}>{line.replace(/^[-*]\s+/, '').trim()}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      elements.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line);
      return;
    }
    flushBullets();
    elements.push(<p key={`p-${index}`} className="mb-2">{line}</p>);
  });
  flushBullets();

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-relaxed text-stone-700 shadow-inner shadow-stone-200/50">
      {elements}
    </div>
  );
};
