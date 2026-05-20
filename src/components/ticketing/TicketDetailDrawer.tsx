import React, { useEffect, useState } from 'react';
import { Ticket, PRIORITY_SLA, STATUSES, ASSOCIATES, CATEGORIES, STUDIOS, CLASS_TYPES, TRAINERS, getEscalationTarget } from '@/lib/ticketing-data';
import { buildTicketEditPatch } from '@/lib/ticket-editing';
import { canSelectStatusFromTicket, validateTicketStatusUpdate } from '@/lib/ticket-status-lifecycle';
import { TicketStatusUpdateInput } from './TicketContext';
import { useTickets } from './useTickets';
import { X, Clock, MapPin, User, Calendar, Tag, MessageSquare, Phone, Lock, Pencil, Save, Trash2, Link2, Plus } from 'lucide-react';
import { MomenceAutomationPanel } from './MomenceAutomationPanel';

interface Props {
  ticket: Ticket | null;
  onClose: () => void;
}

interface TicketAttachmentRecord {
  path?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  publicUrl?: string;
  uploadedAt?: string;
}

function readTicketAttachments(ticket: Ticket): TicketAttachmentRecord[] {
  const raw = (ticket.metadata as Record<string, unknown> | undefined)?.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is TicketAttachmentRecord => Boolean(entry && typeof entry === 'object'));
}

function defaultStatusValues(ticket?: Ticket | null): TicketStatusUpdateInput {
  return {
    status: ticket?.status || 'New',
    reason: '',
    actionTaken: '',
    actionDate: new Date().toISOString().slice(0, 10),
    followUps: [],
    comments: '',
    notes: '',
    resolutionSummary: '',
    outcome: '',
  };
}

function toDateTimeLocalInputValue(value?: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function tagsFromInput(value: string): string[] {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

export const TicketDetailDrawer: React.FC<Props> = ({ ticket, onClose }) => {
  const { updateTicket, updateTicketStatus, canUpdateTicketStatus, deleteTicket } = useTickets();
  const [editingLinkedContext, setEditingLinkedContext] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [editValues, setEditValues] = useState<Partial<Ticket>>({});
  const [statusValues, setStatusValues] = useState<TicketStatusUpdateInput>(() => defaultStatusValues(ticket));

  useEffect(() => {
    setEditingLinkedContext(false);
    setEditing(false);
    setEditValues(ticket || {});
    setEditError('');
    setStatusValues(defaultStatusValues(ticket));
    setStatusError('');
  }, [ticket]);

  if (!ticket) return null;

  const priorityMeta = PRIORITY_SLA[ticket.priority];
  const currentValues = { ...ticket, ...editValues };
  const subCategories = CATEGORIES[currentValues.category || ticket.category] || ['Other'];
  const statusAllowed = canUpdateTicketStatus(ticket);
  const statusChanged = statusValues.status !== ticket.status;
  const statusValidationErrors = statusAllowed ? validateTicketStatusUpdate(ticket, statusValues) : [];
  const statusInputStarted = statusChanged ||
    Boolean(statusValues.reason.trim()) ||
    Boolean(statusValues.actionTaken.trim()) ||
    Boolean(statusValues.resolutionSummary?.trim()) ||
    Boolean(statusValues.outcome?.trim()) ||
    Boolean(statusValues.comments?.trim()) ||
    Boolean(statusValues.notes?.trim()) ||
    Boolean((statusValues.followUps || []).some((followUp) => followUp.date?.trim() || followUp.notes?.trim()));
  const statusReady = statusAllowed && statusValidationErrors.length === 0;
  const latestResolution = ticket.metadata?.latestResolution;
  const resolutionHistory = Array.isArray(ticket.metadata?.resolutionHistory)
    ? ticket.metadata.resolutionHistory
    : [];
  const followUpHistory = Array.isArray(ticket.metadata?.followUpHistory)
    ? ticket.metadata.followUpHistory
    : [];
  const ticketAttachments = readTicketAttachments(ticket);

  const saveEdits = async () => {
    setSaving(true);
    setEditError('');
    try {
      await updateTicket(ticket.id, buildTicketEditPatch(ticket, editValues));
      setEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Unable to save ticket edits.');
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
    if (!statusReady) {
      setStatusError(statusValidationErrors.join(' '));
      return;
    }
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
                  Status changes require reason and action taken. Follow-up-only saves need a complete date and note.
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
                values={STATUSES.filter((status) => canSelectStatusFromTicket(ticket, status))}
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
              {(statusValues.status === 'Resolved' || statusValues.status === 'Closed') && (
                <>
                  <div className="md:col-span-2">
                    <EditTextarea
                      label="Resolution summary"
                      value={statusValues.resolutionSummary || ''}
                      rows={3}
                      disabled={!statusAllowed}
                      onChange={(resolutionSummary) => setStatusValues((values) => ({ ...values, resolutionSummary }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <EditTextarea
                      label="Final outcome"
                      value={statusValues.outcome || ''}
                      rows={3}
                      disabled={!statusAllowed}
                      onChange={(outcome) => setStatusValues((values) => ({ ...values, outcome }))}
                    />
                  </div>
                </>
              )}
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
              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Follow-up dates and notes</label>
                  <button
                    type="button"
                    disabled={!statusAllowed}
                    onClick={() => setStatusValues((values) => ({
                      ...values,
                      followUps: [...(values.followUps || []), { date: '', notes: '' }],
                    }))}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add follow-up
                  </button>
                </div>
                {(statusValues.followUps || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
                    No follow-up dates added.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(statusValues.followUps || []).map((followUp, index) => (
                      <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 md:grid-cols-[150px_1fr_auto]">
                        <input
                          type="date"
                          value={followUp.date || ''}
                          disabled={!statusAllowed}
                          onChange={(event) => setStatusValues((values) => ({
                            ...values,
                            followUps: (values.followUps || []).map((item, itemIndex) => (
                              itemIndex === index ? { ...item, date: event.target.value } : item
                            )),
                          }))}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-stone-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        <textarea
                          value={followUp.notes || ''}
                          rows={2}
                          disabled={!statusAllowed}
                          placeholder="Follow-up note"
                          onChange={(event) => setStatusValues((values) => ({
                            ...values,
                            followUps: (values.followUps || []).map((item, itemIndex) => (
                              itemIndex === index ? { ...item, notes: event.target.value } : item
                            )),
                          }))}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-stone-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        <button
                          type="button"
                          disabled={!statusAllowed}
                          onClick={() => setStatusValues((values) => ({
                            ...values,
                            followUps: (values.followUps || []).filter((_, itemIndex) => itemIndex !== index),
                          }))}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Remove follow-up"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {latestResolution && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">Latest resolution note</div>
                <div className="mt-1">Reason: {latestResolution.reason}</div>
                <div className="mt-0.5">Action: {latestResolution.actionTaken}</div>
                {latestResolution.resolutionSummary && <div className="mt-0.5">Resolution: {latestResolution.resolutionSummary}</div>}
                {latestResolution.outcome && <div className="mt-0.5">Outcome: {latestResolution.outcome}</div>}
                {latestResolution.closedAt && <div className="mt-0.5">Closed: {new Date(latestResolution.closedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
              </div>
            )}

            {followUpHistory.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">Saved follow-ups</div>
                <div className="mt-2 space-y-1.5">
                  {followUpHistory.slice(0, 8).map((followUp, index) => (
                    <div key={`${followUp.date}-${followUp.createdAt}-${index}`} className="grid gap-1 border-t border-slate-100 pt-1.5 first:border-t-0 first:pt-0 md:grid-cols-[110px_1fr]">
                      <span className="font-semibold text-slate-700">{followUp.date}</span>
                      <span>{followUp.notes}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resolutionHistory.length > 1 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">Resolution history</div>
                <div className="mt-2 space-y-2">
                  {resolutionHistory.slice(1, 6).map((entry, index) => (
                    <div key={`${entry.createdAt}-${index}`} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                      <div className="font-semibold text-slate-700">{entry.previousStatus} → {entry.status}</div>
                      <div className="mt-0.5">{entry.actionTaken}</div>
                      {entry.resolutionSummary && <div className="mt-0.5 text-slate-500">{entry.resolutionSummary}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {statusError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {statusError}
              </div>
            )}

            {!statusError && statusInputStarted && statusValidationErrors.length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {statusValidationErrors.join(' ')}
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={!statusReady || statusSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" />
                {statusSaving ? 'Saving...' : 'Save ticket update'}
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
                else {
                  setEditError('');
                  updateTicket(ticket.id, { assignedTo: e.target.value, team: found?.team || ticket.team })
                    .catch((error) => setEditError(error instanceof Error ? error.message : 'Unable to update assignment.'));
                }
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

          {editError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {editError}
            </div>
          )}

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
                <EditText label="Session Time" value={toDateTimeLocalInputValue(currentValues.classDateTime)} type="datetime-local" onChange={(value) => setEditValues((state) => ({ ...state, classDateTime: value || undefined }))} />
                <EditText label="Reported By" value={currentValues.reportedBy || ''} onChange={(value) => setEditValues((state) => ({ ...state, reportedBy: value || undefined }))} />
                <EditSelect label="Sentiment" value={currentValues.sentiment || ''} values={['', 'Positive', 'Neutral', 'Negative', 'Angry']} onChange={(value) => setEditValues((state) => ({ ...state, sentiment: value ? value as Ticket['sentiment'] : undefined }))} />
                <EditText label="Tags" value={(currentValues.tags || []).join(', ')} onChange={(value) => setEditValues((state) => ({ ...state, tags: tagsFromInput(value) }))} />
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

          {!editing && (ticket.memberName || ticket.memberContact || ticket.classType || ticket.classDateTime || ticket.trainer) && (
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

          {ticketAttachments.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">Attachments</label>
              <div className="space-y-2">
                {ticketAttachments.map((attachment, index) => (
                  <a
                    key={`${attachment.path || attachment.publicUrl || attachment.fileName || 'attachment'}-${index}`}
                    href={attachment.publicUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition hover:border-rose-200 hover:bg-rose-50"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                      <span className="truncate">{attachment.fileName || `Attachment ${index + 1}`}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      {attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : 'File'}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

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
