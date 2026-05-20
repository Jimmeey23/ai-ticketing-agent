import React, { useEffect, useMemo, useState } from 'react';
import { useTickets } from './useTickets';
import { backendSupabase } from '@/lib/backend-supabase';
import {
  ALL_REPORT_DEFINITIONS,
  DEFAULT_REPORT_FILTERS,
  GeneratedReport,
  REPORT_BRAND,
  ReportDefinition,
  ReportFilters,
  ReportId,
  ReportNarrative,
  ReportPeriod,
  ReportSection,
  TicketReportEvent,
  buildReport,
  csvForReport,
  fallbackNarrativeForReport,
  htmlForReport,
  jsonForReport,
  paginateReportRows,
  reportFileSlug,
} from '@/lib/ai-reports';
import { CATEGORIES, STATUSES, Ticket } from '@/lib/ticketing-data';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  CheckCircle2,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  FileJson,
  FileSpreadsheet,
  Filter,
  LineChart as LineChartIcon,
  Printer,
  RefreshCw,
  Search,
  Table2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type PeriodPreset = '7d' | '30d' | '90d' | 'month' | 'quarter' | 'custom';

interface TicketEventRow {
  id: string;
  ticket_id: string;
  event_type: string;
  actor?: string | null;
  from_value?: string | null;
  to_value?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

const CHART_COLORS = ['#0f766e', '#2563eb', '#be123c', '#7c3aed', '#ca8a04', '#475569', '#0891b2', '#16a34a'];
const REPORT_GROUPS: ReportDefinition['group'][] = ['Leadership', 'Operations', 'Member Voice', 'Revenue', 'Quality'];
const PRIORITIES: Ticket['priority'][] = ['Critical', 'High', 'Medium', 'Low'];
const SLA_STATES = ['Breached', 'At Risk', 'On Track', 'Closed'];
const SOURCE_TYPES: Array<{ value: ReportFilters['sourceType']; label: string }> = [
  { value: 'all', label: 'Live + Historic' },
  { value: 'live', label: 'Live only' },
  { value: 'historic', label: 'Historic only' },
];

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultPeriod(): ReportPeriod {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 29);
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

function periodForPreset(preset: PeriodPreset): ReportPeriod {
  const now = new Date();
  const from = new Date(now);
  if (preset === '7d') from.setDate(now.getDate() - 6);
  if (preset === '30d') from.setDate(now.getDate() - 29);
  if (preset === '90d') from.setDate(now.getDate() - 89);
  if (preset === 'month') from.setDate(1);
  if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    from.setMonth(quarterStartMonth, 1);
  }
  return { from: formatDateInput(from), to: formatDateInput(now) };
}

function mapEvent(row: TicketEventRow): TicketReportEvent {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    eventType: row.event_type,
    actor: row.actor,
    fromValue: row.from_value,
    toValue: row.to_value,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function uniqueSorted(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value)))).sort((a, b) => a.localeCompare(b));
}

function downloadText(filename: string, text: string, contentType: string) {
  const blob = new Blob([text], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function printReport(report: GeneratedReport) {
  const html = htmlForReport(report);
  const printWindow = window.open('', '_blank', 'width=1280,height=900');
  if (!printWindow) {
    downloadText(`${reportFileSlug(report)}.html`, html, 'text/html;charset=utf-8');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 350);
}

export const AiReportsPanel: React.FC = () => {
  const { tickets, loading, error, refresh, setSelectedTicket } = useTickets();
  const [selectedReportId, setSelectedReportId] = useState<ReportId>('executive_operations_summary');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d');
  const [period, setPeriod] = useState<ReportPeriod>(() => defaultPeriod());
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_REPORT_FILTERS);
  const [events, setEvents] = useState<TicketReportEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [narrative, setNarrative] = useState<ReportNarrative | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const options = useMemo(() => ({
    studios: uniqueSorted(tickets.map((ticket) => ticket.studio)),
    categories: uniqueSorted([...Object.keys(CATEGORIES), ...tickets.map((ticket) => ticket.category)]),
    owners: uniqueSorted(tickets.map((ticket) => ticket.assignedTo)),
    sentiments: uniqueSorted(tickets.map((ticket) => ticket.sentiment || 'Unspecified')),
  }), [tickets]);

  useEffect(() => {
    let cancelled = false;
    const ids = tickets.filter((ticket) => !ticket.tags.includes('historic')).map((ticket) => ticket.id).filter(Boolean);
    if (ids.length === 0) {
      setEvents([]);
      return;
    }

    const loadEvents = async () => {
      setEventsLoading(true);
      setEventsError('');
      try {
        const rows: TicketEventRow[] = [];
        for (let index = 0; index < ids.length; index += 100) {
          const batch = ids.slice(index, index + 100);
          const { data, error: eventError } = await backendSupabase
            .from('ticket_events')
            .select('id,ticket_id,event_type,actor,from_value,to_value,metadata,created_at')
            .in('ticket_id', batch)
            .order('created_at', { ascending: true });
          if (eventError) throw eventError;
          rows.push(...((data || []) as TicketEventRow[]));
        }
        if (!cancelled) setEvents(rows.map(mapEvent));
      } catch (eventLoadError) {
        if (!cancelled) {
          setEvents([]);
          setEventsError(eventLoadError instanceof Error ? eventLoadError.message : 'Unable to load ticket events');
        }
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    };

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [tickets]);

  const report = useMemo(() => {
    const built = buildReport({
      reportId: selectedReportId,
      tickets,
      events,
      period,
      filters,
    });
    return narrative ? { ...built, narrative } : built;
  }, [events, filters, narrative, period, selectedReportId, tickets]);

  const ticketById = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets]);

  const setFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setNarrative(null);
  };

  const setPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset !== 'custom') setPeriod(periodForPreset(preset));
    setNarrative(null);
  };

  const refreshSummary = () => {
    setNarrative(fallbackNarrativeForReport(report));
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const exportCsv = () => downloadText(`${reportFileSlug(report)}.csv`, csvForReport(report), 'text/csv;charset=utf-8');
  const exportJson = () => downloadText(`${reportFileSlug(report)}.json`, jsonForReport(report), 'application/json;charset=utf-8');
  const exportHtml = () => downloadText(`${reportFileSlug(report)}.html`, htmlForReport(report), 'text/html;charset=utf-8');

  return (
    <div className="ai-reports-shell flex h-full min-h-0 flex-col bg-[#f8fafc] text-slate-950">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              <FileText className="h-4 w-4" />
              Reports
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Operations Reporting</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Table-first operational reports built from ticket data, with paginated source registers, computed KPIs, and export-ready layouts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh tickets
            </button>
            <button
              type="button"
              onClick={refreshSummary}
              disabled={report.reportTickets === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Refresh summary
            </button>
            <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </button>
            <button type="button" onClick={exportJson} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
              <FileJson className="h-3.5 w-3.5" />
              JSON
            </button>
            <button type="button" onClick={exportHtml} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
              <FileText className="h-3.5 w-3.5" />
              HTML
            </button>
            <button type="button" onClick={() => printReport(report)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
              <Printer className="h-3.5 w-3.5" />
              Print/PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <div className="grid gap-2 sm:grid-cols-4">
            <FilterSelect label="Period" value={periodPreset} values={[
              ['7d', '7 days'],
              ['30d', '30 days'],
              ['90d', '90 days'],
              ['month', 'This month'],
              ['quarter', 'This quarter'],
              ['custom', 'Custom'],
            ]} onChange={(value) => setPreset(value as PeriodPreset)} />
            <DateInput label="From" value={period.from} onChange={(value) => {
              setPeriodPreset('custom');
              setPeriod((current) => ({ ...current, from: value }));
              setNarrative(null);
            }} />
            <DateInput label="To" value={period.to} onChange={(value) => {
              setPeriodPreset('custom');
              setPeriod((current) => ({ ...current, to: value }));
              setNarrative(null);
            }} />
            <FilterSelect label="Source" value={filters.sourceType} values={SOURCE_TYPES.map((item) => [item.value, item.label])} onChange={(value) => setFilter('sourceType', value as ReportFilters['sourceType'])} />
          </div>
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
            <TextFilter value={filters.query} onChange={(value) => setFilter('query', value)} />
            <FilterSelect label="Studio" value={filters.studio} values={['All', ...options.studios]} onChange={(value) => setFilter('studio', value)} />
            <FilterSelect label="Category" value={filters.category} values={['All', ...options.categories]} onChange={(value) => setFilter('category', value)} />
            <FilterSelect label="Priority" value={filters.priority} values={['All', ...PRIORITIES]} onChange={(value) => setFilter('priority', value)} />
            <FilterSelect label="Status" value={filters.status} values={['All', ...STATUSES]} onChange={(value) => setFilter('status', value)} />
            <FilterSelect label="Owner" value={filters.owner} values={['All', ...options.owners]} onChange={(value) => setFilter('owner', value)} />
            <FilterSelect label="SLA" value={filters.sla} values={['All', ...SLA_STATES]} onChange={(value) => setFilter('sla', value)} />
            <input
              value={filters.tag}
              onChange={(event) => setFilter('tag', event.target.value)}
              placeholder="Tag"
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
            />
          </div>
        </div>
      </header>

      <div className="ai-reports-content-grid grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[310px_minmax(0,1fr)_380px]">
        <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            <Filter className="h-4 w-4" />
            Report Catalog
          </div>
          <div className="flex flex-col gap-4">
            {REPORT_GROUPS.map((group) => (
              <section key={group}>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{group}</h3>
                <div className="flex flex-col gap-2">
                  {ALL_REPORT_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => (
                    <ReportCatalogButton
                      key={definition.id}
                      definition={definition}
                      selected={definition.id === selectedReportId}
                      onSelect={() => {
                        setSelectedReportId(definition.id);
                        setNarrative(null);
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <main className="ai-report-print min-h-0 overflow-y-auto p-5">
          <ReportPrintHeader report={report} />
          {(error || eventsError) && (
            <div className="mb-4 grid gap-2">
              {error && <AlertMessage tone="danger" text={error} />}
              {eventsError && <AlertMessage tone="warning" text={`Event data unavailable: ${eventsError}. Lifecycle reports will use ticket metadata fallback.`} />}
            </div>
          )}

          <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">
                    <BarChart3 className="h-4 w-4" />
                    {report.definition.group}
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{report.definition.title}</h1>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{report.definition.description}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Period</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{report.period.from} to {report.period.to}</div>
                  <div className="mt-1 text-xs text-slate-500">{report.reportTickets} report tickets · {report.allTicketsInPeriod} period tickets</div>
                </div>
              </div>
            </div>
          </section>

          {loading && tickets.length === 0 ? (
            <EmptyState label="Loading tickets for reporting..." />
          ) : report.reportTickets === 0 ? (
            <EmptyState label="No tickets match the selected report period and filters." />
          ) : (
            <div className="grid gap-5">
              <SourceRowsTable report={report} ticketById={ticketById} onOpen={setSelectedTicket} />
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">Key Performance Indicators</h2>
                    <p className="mt-1 text-xs text-slate-500">Computed from the filtered source register above.</p>
                  </div>
                  <ReportBadge tone="neutral" minWidth="min-w-[84px]">Computed</ReportBadge>
                </div>
                <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-5">
                  {report.metrics.slice(0, 10).map((metric) => (
                    <MetricCard key={metric.id} metric={metric} />
                  ))}
                </div>
              </section>
              <section className="grid gap-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">Analysis</h2>
                    <p className="mt-1 text-xs text-slate-500">Charts and ranked views are secondary to the ticket source table.</p>
                  </div>
                </div>
                <div className="grid gap-5 2xl:grid-cols-2">
                  {report.sections.map((section) => (
                    <ReportSectionPanel key={section.id} section={section} />
                  ))}
                </div>
              </section>
            </div>
          )}
          <ReportPrintFooter />
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white/80 p-4">
          <NarrativePanel report={report} eventsLoading={eventsLoading} />
        </aside>
      </div>
    </div>
  );
};

const ReportCatalogButton: React.FC<{
  definition: ReportDefinition;
  selected: boolean;
  onSelect: () => void;
}> = ({ definition, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={`group w-full rounded-xl border p-3 text-left transition ${
      selected
        ? 'border-slate-300 bg-slate-100 shadow-sm'
        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'
    }`}
  >
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-950 group-hover:text-white'}`}>
        <LineChartIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-slate-950">{definition.title}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{definition.bestFor}</span>
      </span>
      <ChevronRight className={`mt-2 h-4 w-4 shrink-0 ${selected ? 'text-slate-700' : 'text-slate-300'}`} />
    </div>
  </button>
);

const ReportPrintHeader: React.FC<{ report: GeneratedReport }> = ({ report }) => (
  <div className="report-print-brand">
    <div>
      <div className="report-print-brand-label">Physique 57 India</div>
      <div className="report-print-brand-title">{report.definition.title}</div>
      <div className="report-print-brand-subtitle">{report.definition.description}</div>
    </div>
    <div className="report-print-brand-meta">
      {REPORT_BRAND.product}<br />
      {report.period.from} to {report.period.to}<br />
      {report.reportTickets} report tickets
    </div>
  </div>
);

const ReportPrintFooter: React.FC = () => (
  <div className="report-print-footer">
    <span>{REPORT_BRAND.footer}</span>
    <span>{REPORT_BRAND.context}</span>
  </div>
);

const FilterSelect: React.FC<{
  label: string;
  value: string;
  values: Array<string | readonly [string, string]> | readonly string[];
  onChange: (value: string) => void;
}> = ({ label, value, values, onChange }) => (
  <label className="min-w-0">
    <span className="sr-only">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
      aria-label={label}
    >
      {values.map((item) => {
        const optionValue = Array.isArray(item) ? item[0] : item;
        const optionLabel = Array.isArray(item) ? item[1] : item;
        return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
      })}
    </select>
  </label>
);

const DateInput: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="min-w-0">
    <span className="sr-only">{label}</span>
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
      aria-label={label}
    />
  </label>
);

const TextFilter: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => (
  <div className="relative md:col-span-2 xl:col-span-1">
    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search"
      className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
    />
  </div>
);

const AlertMessage: React.FC<{ tone: 'warning' | 'danger'; text: string }> = ({ tone, text }) => (
  <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs ${
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-800'
  }`}>
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{text}</span>
  </div>
);

const MetricCard: React.FC<{ metric: GeneratedReport['metrics'][number] }> = ({ metric }) => {
  const accent = {
    neutral: 'bg-slate-300 text-slate-700',
    success: 'bg-emerald-500 text-emerald-700',
    warning: 'bg-amber-500 text-amber-700',
    danger: 'bg-red-500 text-red-700',
    info: 'bg-blue-500 text-blue-700',
  }[metric.tone || 'neutral'];
  return (
    <div className="min-h-[132px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{metric.label}</div>
        <span className={`h-2 w-2 rounded-full ${accent.split(' ')[0]}`} />
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight ${accent.split(' ')[1]}`}>{metric.value}</div>
      {metric.description && <div className="mt-2 text-xs leading-relaxed text-slate-500">{metric.description}</div>}
    </div>
  );
};

const ReportSectionPanel: React.FC<{ section: ReportSection }> = ({ section }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-slate-950">{section.title}</h3>
      <ReportBadge tone="neutral" minWidth="min-w-[68px]">{section.kind}</ReportBadge>
    </div>
    {section.kind === 'line' ? (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={section.rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#be123c" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    ) : section.kind === 'donut' ? (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={section.rows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
            {section.rows.map((row, index) => (
              <Cell key={row.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    ) : section.kind === 'bar' ? (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={section.rows} layout={section.rows.length > 5 ? 'vertical' : 'horizontal'} margin={section.rows.length > 5 ? { left: 24 } : undefined}>
          <CartesianGrid strokeDasharray="3 3" horizontal={section.rows.length <= 5} vertical={section.rows.length > 5} />
          {section.rows.length > 5 ? (
            <>
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={135} tickLine={false} axisLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            </>
          )}
          <Tooltip />
          <Bar dataKey="value" radius={section.rows.length > 5 ? [0, 8, 8, 0] : [8, 8, 0, 0]} fill="#0f766e" />
        </BarChart>
      </ResponsiveContainer>
    ) : (
      <RankedRows rows={section.rows} />
    )}
  </section>
);

const RankedRows: React.FC<{ rows: ReportSection['rows'] }> = ({ rows }) => {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.slice(0, 12).map((row) => (
        <div key={`${row.name}-${row.secondaryValue || ''}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-slate-800">{row.name}</span>
            <span className="font-mono text-slate-500">{row.value}{row.percent != null ? ` · ${row.percent}%` : ''}</span>
          </div>
          {row.secondaryValue && <div className="mt-1 truncate text-[11px] text-slate-500">{row.secondaryValue}</div>}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-rose-700" style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const SourceRowsTableMarkup: React.FC<{
  rows: GeneratedReport['sourceRows'];
  ticketById: Map<string, Ticket>;
  onOpen: (ticket: Ticket) => void;
  interactive?: boolean;
}> = ({ rows, ticketById, onOpen, interactive = true }) => (
  <div className="report-source-table-wrap overflow-x-auto">
    <table className="report-source-table w-full min-w-[1280px] table-fixed text-left text-xs">
      <colgroup>
        <col className="w-[280px]" />
        <col className="w-[116px]" />
        <col className="w-[100px]" />
        <col className="w-[116px]" />
        <col className="w-[104px]" />
        <col className="w-[240px]" />
        <col className="w-[160px]" />
        <col className="w-[160px]" />
        <col className="w-[116px]" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.15em] text-slate-500">
        <tr>
          {['Ticket', 'Status', 'Priority', 'SLA', 'Source', 'Category', 'Studio', 'Owner', 'Created'].map((heading) => (
            <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const ticket = ticketById.get(row.ticketId);
          return (
            <tr
              key={row.ticketId}
              onClick={() => interactive && ticket && onOpen(ticket)}
              className={`h-16 border-b border-slate-100 ${interactive && ticket ? 'cursor-pointer hover:text-slate-950' : ''}`}
            >
              <td className="h-16 px-4 py-2 align-middle">
                <div className="flex h-10 min-w-0 flex-col justify-center">
                  <div className="truncate font-semibold text-slate-950" title={row.title}>{row.title}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">{row.ticketId}</div>
                </div>
              </td>
              <td className="h-16 whitespace-nowrap px-4 py-2 align-middle font-medium text-slate-700">{row.status}</td>
              <td className="h-16 whitespace-nowrap px-4 py-2 align-middle font-medium text-slate-700">{row.priority}</td>
              <td className="h-16 whitespace-nowrap px-4 py-2 align-middle font-medium text-slate-700">{row.slaState}</td>
              <td className="h-16 whitespace-nowrap px-4 py-2 align-middle font-medium text-slate-700">{row.sourceType}</td>
              <td className="h-16 px-4 py-2 align-middle">
                <div className="flex h-10 min-w-0 flex-col justify-center">
                  <div className="truncate font-medium text-slate-700" title={row.category}>{row.category}</div>
                  <div className="truncate text-[11px] text-slate-500" title={row.subCategory}>{row.subCategory}</div>
                </div>
              </td>
              <td className="h-16 truncate px-4 py-2 align-middle text-slate-600" title={row.studio}>{row.studio}</td>
              <td className="h-16 truncate px-4 py-2 align-middle text-slate-600" title={row.owner}>{row.owner}</td>
              <td className="h-16 whitespace-nowrap px-4 py-2 align-middle text-slate-500 tabular-nums">{new Date(row.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const SourceRowsTable: React.FC<{
  report: GeneratedReport;
  ticketById: Map<string, Ticket>;
  onOpen: (ticket: Ticket) => void;
}> = ({ report, ticketById, onOpen }) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pagination = useMemo(
    () => paginateReportRows(report.sourceRows, page, pageSize),
    [page, pageSize, report.sourceRows]
  );

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), pagination.totalPages));
  }, [pagination.totalPages]);

  useEffect(() => {
    setPage(1);
  }, [
    report.definition.id,
    report.period.from,
    report.period.to,
    report.filters.category,
    report.filters.owner,
    report.filters.priority,
    report.filters.query,
    report.filters.sentiment,
    report.filters.sla,
    report.filters.sourceType,
    report.filters.status,
    report.filters.studio,
    report.filters.tag,
  ]);

  return (
    <section className="report-source-section overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white"><Table2 className="h-4 w-4" /></span>
            Source Ticket Register
          </h3>
          <p className="mt-1 text-xs text-slate-500">Primary report table with every source row behind the computed metrics.</p>
        </div>
        <div className="report-screen-controls flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 tabular-nums">
            {pagination.startRow}-{pagination.endRow} of {pagination.totalRows}
          </span>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
            aria-label="Rows per page"
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} rows</option>)}
          </select>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
            <PaginationButton label="First page" disabled={pagination.page <= 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></PaginationButton>
            <PaginationButton label="Previous page" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="h-3.5 w-3.5" /></PaginationButton>
            <span className="px-2 text-xs font-semibold text-slate-600">{pagination.page} / {pagination.totalPages}</span>
            <PaginationButton label="Next page" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}><ChevronRight className="h-3.5 w-3.5" /></PaginationButton>
            <PaginationButton label="Last page" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></PaginationButton>
          </div>
        </div>
      </div>
      <div className="report-screen-table">
        <SourceRowsTableMarkup rows={pagination.rows} ticketById={ticketById} onOpen={onOpen} />
      </div>
      <div className="report-print-table">
        <SourceRowsTableMarkup rows={report.sourceRows} ticketById={ticketById} onOpen={onOpen} interactive={false} />
      </div>
    </section>
  );
};

const PaginationButton: React.FC<{
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}> = ({ children, disabled, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
    aria-label={label}
  >
    {children}
  </button>
);

type ReportBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function badgeToneFor(value: string): ReportBadgeTone {
  const normalized = value.toLowerCase();
  if (/critical|high|breach|blocked|escalated|overdue/.test(normalized)) return 'danger';
  if (/medium|risk|progress|waiting|pending/.test(normalized)) return 'warning';
  if (/low|closed|resolved|track|complete/.test(normalized)) return 'success';
  if (/new|live/.test(normalized)) return 'info';
  return 'neutral';
}

const ReportBadge: React.FC<{ children: React.ReactNode; tone?: ReportBadgeTone; minWidth?: string }> = ({
  children,
  tone = 'neutral',
  minWidth = 'min-w-[72px]',
}) => {
  const toneClass = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  }[tone];
  return (
    <span className={`inline-flex h-6 ${minWidth} items-center justify-center rounded-md border px-2 text-[11px] font-semibold leading-none ${toneClass}`}>
      {children}
    </span>
  );
};

const NarrativePanel: React.FC<{ report: GeneratedReport; eventsLoading: boolean }> = ({ report, eventsLoading }) => {
  const narrative = report.narrative || fallbackNarrativeForReport(report);
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Executive Summary</div>
          <CheckCircle2 className="h-4 w-4 text-slate-300" />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-100">{narrative.summary}</p>
        {!report.narrative && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
            Computed summary built from the current report metrics and source register.
          </div>
        )}
      </section>

      <NarrativeList title="Findings" items={narrative.findings} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
      <NarrativeList title="Risks" items={narrative.risks} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} />
      <NarrativeList title="Recommended Actions" items={narrative.recommendedActions} icon={<FileText className="h-4 w-4 text-slate-700" />} />
      <NarrativeList title="Data Quality Notes" items={Array.from(new Set([...report.dataQualityNotes, ...narrative.dataQualityNotes]))} icon={<CalendarDays className="h-4 w-4 text-blue-600" />} />
      <NarrativeList title="Assumptions" items={report.assumptions} icon={<FileText className="h-4 w-4 text-slate-600" />} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500">
        Event data: {eventsLoading ? 'Loading ticket lifecycle events...' : 'Loaded when available. Historic imports may not include events.'}
      </div>
    </div>
  );
};

const NarrativeList: React.FC<{ title: string; items: string[]; icon: React.ReactNode }> = ({ title, items, icon }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">{icon}{title}</h3>
    <div className="flex flex-col gap-2">
      {(items.length ? items : ['No specific items generated for this section.']).map((item) => (
        <div key={item} className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{item}</div>
      ))}
    </div>
  </section>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 text-center">
    <BarChart3 className="h-10 w-10 text-slate-300" />
    <div className="mt-3 text-sm font-semibold text-slate-700">{label}</div>
    <div className="mt-1 text-xs text-slate-500">Adjust the report period or filters to widen the dataset.</div>
  </div>
);

export default AiReportsPanel;
