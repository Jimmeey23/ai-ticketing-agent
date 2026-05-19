import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { TicketProvider } from './ticketing/TicketContext';
import { useTickets } from './ticketing/TicketContext';
import { ChatInterface } from './ticketing/ChatInterface';
import { TicketDetailDrawer } from './ticketing/TicketDetailDrawer';
import { AuthGate } from './AuthGate';
import { BackendAuthProvider, useBackendAuth } from '@/contexts/BackendAuthContext';
import { AlertTriangle, BarChart3, Bell, CheckCircle2, Clock, Flame, Gauge, MessageSquareText, RotateCcw, Settings, ShieldAlert, Tickets, Users, Workflow } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { ASSOCIATES, CATEGORIES, PRIORITY_SLA, STUDIOS, getEscalationTarget, getSlaState, isClosedTicket, isTicketBreached, Ticket } from '@/lib/ticketing-data';
import {
  DepartmentSetting,
  EmployeeSetting,
  LocationSetting,
  RoutingRuleSetting,
  RoutingSettings,
  applyCategoryCityRouting,
  defaultRoutingSettings,
  inferRoutingCity,
  loadRoutingSettings,
  physique57RoutingPresets,
  saveRoutingSettings,
} from '@/lib/routing-settings';
import {
  EMPTY_ROUTING_FILTERS,
  applyBulkRoutingOperation,
  applyRoutingRulePatch,
  filterRoutingRules,
  uniqueText,
  type BulkRoutingOperation,
  type RoutingFilterState,
  type RoutingStateFilter,
} from '@/lib/settings-routing-ops';

const TicketDashboard = lazy(() =>
  import('./ticketing/TicketDashboard').then((module) => ({ default: module.TicketDashboard }))
);

const sideTabs = [
  { value: 'chat', label: 'Chat Intake', icon: MessageSquareText },
  { value: 'queue', label: 'Triage Queue', icon: Gauge },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'tickets', label: 'Submitted Tickets', icon: Tickets },
  { value: 'insights', label: 'Insights', icon: BarChart3 },
  { value: 'momence', label: 'Momence Ops', icon: Workflow },
  { value: 'settings', label: 'Settings', icon: Settings },
];

const AppLayout: React.FC = () => {
  return (
    <BackendAuthProvider>
      <AuthGate>
        <TicketProvider>
          <SupportShell />
        </TicketProvider>
      </AuthGate>
    </BackendAuthProvider>
  );
};

const SupportShell: React.FC = () => {
  const { user, signOut, accessRole } = useBackendAuth();
  const { notifications, selectedTicket, setSelectedTicket } = useTickets();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('chat');
  const [hasOpenedTickets, setHasOpenedTickets] = useState(false);
  const [chatResetVersion, setChatResetVersion] = useState(0);

  const goHome = () => {
    navigate('/');
    setActiveTab('chat');
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'tickets') setHasOpenedTickets(true);
  };

  const startNewChat = () => {
    setActiveTab('chat');
    setChatResetVersion((version) => version + 1);
  };

  return (
      <div className="p57-app-bg flex h-screen w-screen flex-col overflow-hidden text-stone-950">
        <header className="z-20 flex-shrink-0 border-b border-slate-200/80 bg-white/88 px-5 py-2 shadow-[0_10px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] items-center gap-3">
            <button
              type="button"
              onClick={goHome}
              aria-label="Go to Chat Intake home"
              className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-blue-200 bg-slate-950 text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
            >
              <img src="/athena-logo.svg" alt="Athena" className="h-full w-full rounded-full object-cover animate-athena-logo-rotate" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight text-stone-950">
                Athena - Physique 57's Support Agent
              </h1>
              <p className="text-[11px] leading-tight text-stone-500">
                Intelligent intake, ticketing, SLA control and enterprise analytics
              </p>
            </div>
            <div className="ml-auto hidden items-center gap-4 md:flex">
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600">
                  Logged in as
                </div>
                <div className="mt-0.5 text-sm font-semibold text-stone-700">
                  {user?.email || 'Authenticated user'} · {accessRole}
                </div>
              </div>
              <button
                onClick={() => void signOut()}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-500/15"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full min-h-0">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <TabsContent forceMount value="chat" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                <ChatInterface
                  resetVersion={chatResetVersion}
                  onOpenExistingTicket={(ticket) => {
                    setSelectedTicket(ticket);
                    setHasOpenedTickets(true);
                    setActiveTab('tickets');
                  }}
                />
              </TabsContent>
              <TabsContent value="queue" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                <TriageQueuePanel />
              </TabsContent>
              <TabsContent value="tickets" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                {(activeTab === 'tickets' || hasOpenedTickets) && (
                  <Suspense fallback={<div className="flex h-full items-center justify-center bg-white text-sm text-stone-500">Loading submitted tickets...</div>}>
                    <TicketDashboard />
                  </Suspense>
                )}
              </TabsContent>
              <TabsContent value="notifications" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                <NotificationsPanel
                  onOpen={(ticket) => {
                    setSelectedTicket(ticket);
                    setHasOpenedTickets(true);
                  }}
                />
              </TabsContent>
              <TabsContent value="insights" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                <InsightsPanel />
              </TabsContent>
              <TabsContent value="momence" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                <MomenceOpsPanel />
              </TabsContent>
              <TabsContent value="settings" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                <SettingsPanel userEmail={user?.email || 'Authenticated user'} accessRole={accessRole} />
              </TabsContent>
            </div>

            <aside className="z-10 hidden w-20 flex-shrink-0 flex-col border-l border-slate-200/80 bg-white/68 px-2 py-3 shadow-[-10px_0_40px_rgba(15,23,42,0.04)] backdrop-blur-xl md:flex lg:w-56">
              <button
                type="button"
                onClick={startNewChat}
                className="mb-2 flex h-11 w-full items-center justify-center rounded-2xl border border-blue-200 bg-blue-600 px-0 text-xs font-semibold text-white shadow-[0_16px_36px_rgba(37,99,235,0.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 lg:justify-start lg:px-3"
              >
                <RotateCcw className="h-4 w-4 lg:mr-2" />
                <span className="hidden truncate lg:inline">New chat</span>
              </button>
              <TabsList className="flex h-auto w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-1.5 shadow-inner shadow-slate-200/50">
                {sideTabs.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger key={value} value={value} className="h-11 w-full justify-center rounded-xl px-0 text-xs font-semibold text-slate-500 transition duration-200 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-[0_10px_24px_rgba(15,23,42,0.08)] lg:justify-start lg:px-3">
                    <span className="relative lg:mr-2">
                      <Icon className="h-4 w-4" />
                      {value === 'notifications' && notifications.length > 0 && (
                        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white">
                          {notifications.length > 9 ? '9+' : notifications.length}
                        </span>
                      )}
                    </span>
                    <span className="hidden truncate lg:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </aside>

            <div className="fixed bottom-3 right-3 z-30 md:hidden">
              <TabsList className="h-11 rounded-2xl border border-slate-200 bg-white/92 p-1 shadow-[0_18px_44px_rgba(15,23,42,0.16)] backdrop-blur-xl">
                {sideTabs.slice(0, 5).map(({ value, label, icon: Icon }) => (
                  <TabsTrigger key={value} value={value} aria-label={label} className="h-9 rounded-xl px-2.5 text-slate-500 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <span className="relative">
                      <Icon className="h-4 w-4" />
                      {value === 'notifications' && notifications.length > 0 && (
                        <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                      )}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </main>
        <TicketDetailDrawer ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      </div>
  );
};

const WorkspacePanel: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="h-full overflow-y-auto px-5 py-5">
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      </div>
      {children}
    </div>
  </div>
);

const StatCard: React.FC<{ label: string; value: string | number; tone?: 'default' | 'danger' | 'blue' | 'green' }> = ({ label, value, tone = 'default' }) => {
  const toneClass = {
    default: 'text-stone-950',
    danger: 'text-red-700',
    blue: 'text-blue-700',
    green: 'text-emerald-700',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
};

const TriageQueuePanel: React.FC = () => {
  const { tickets, setSelectedTicket } = useTickets();
  const openTickets = tickets.filter((ticket) => !['Resolved', 'Closed'].includes(ticket.status));
  const breached = openTickets.filter((ticket) => getSlaState(ticket) === 'Breached');
  const atRisk = openTickets.filter((ticket) => getSlaState(ticket) === 'At Risk');
  const critical = openTickets.filter((ticket) => ticket.priority === 'Critical' || ticket.priority === 'High');
  const awaiting = openTickets.filter((ticket) => ticket.status === 'Awaiting Member');
  const unassigned = openTickets.filter((ticket) => !ticket.assignedTo || ticket.assignedTo === '-' || ticket.assignedTo === 'Unassigned');
  const newest = openTickets.slice(0, 8);
  const avgAgeHours = averageAgeHours(openTickets);
  const queues = [
    { title: 'SLA Breached', description: 'Past due and still open', tickets: sortByDueDate(breached), tone: 'red' as const },
    { title: 'At Risk', description: 'Due in the next 2 hours', tickets: sortByDueDate(atRisk), tone: 'violet' as const },
    { title: 'Critical / High', description: 'Priority-led triage queue', tickets: sortByRisk(critical), tone: 'blue' as const },
    { title: 'Awaiting Member', description: 'Blocked on member response', tickets: newestByDate(awaiting), tone: 'emerald' as const },
  ];
  return (
    <WorkspacePanel title="Triage Queue" description="Live operational queue for active member voice follow-up.">
      <div className="grid gap-3 md:grid-cols-6">
        <StatCard label="Open" value={openTickets.length} />
        <StatCard label="Breached" value={breached.length} tone="danger" />
        <StatCard label="At Risk" value={atRisk.length} tone="blue" />
        <StatCard label="High Priority" value={critical.length} tone="danger" />
        <StatCard label="Awaiting" value={awaiting.length} tone="blue" />
        <StatCard label="Avg Age" value={`${avgAgeHours}h`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {queues.map((queue) => (
          <QueuePanel key={queue.title} {...queue} onOpen={setSelectedTicket} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <TriageTable title="Newest Open Tickets" tickets={newest} onOpen={setSelectedTicket} />
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ShieldAlert className="h-4 w-4 text-blue-600" />
            Ownership Signals
          </div>
          <SignalRow label="Unassigned tickets" value={unassigned.length} tone={unassigned.length ? 'red' : 'green'} />
          <SignalRow label="Breached requiring escalation" value={breached.filter((ticket) => ticket.assignedTo !== getEscalationTarget(ticket.assignedTo)).length} tone={breached.length ? 'red' : 'green'} />
          <SignalRow label="Open with member linked" value={openTickets.filter((ticket) => ticket.memberName).length} tone="blue" />
          <SignalRow label="Open without member context" value={openTickets.filter((ticket) => !ticket.memberName).length} tone="violet" />
        </div>
      </div>
    </WorkspacePanel>
  );
};

const NotificationsPanel: React.FC<{ onOpen: (ticket: Ticket) => void }> = ({ onOpen }) => {
  const { notifications, clearAllNotifications } = useTickets();
  const criticalCount = notifications.filter((notification) => notification.level === 'critical').length;
  const warningCount = notifications.filter((notification) => notification.level === 'warning').length;

  return (
    <WorkspacePanel title="Notifications" description="Owner-only SLA notifications for tickets assigned to the signed-in team member.">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Owner Alerts" value={notifications.length} tone={notifications.length ? 'blue' : 'green'} />
        <StatCard label="Breached" value={criticalCount} tone={criticalCount ? 'danger' : 'green'} />
        <StatCard label="At Risk" value={warningCount} tone={warningCount ? 'blue' : 'green'} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
          <h3 className="text-sm font-semibold">Ticket Owner Notifications</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300">{notifications.length} active</span>
            <button
              type="button"
              onClick={clearAllNotifications}
              disabled={notifications.length === 0}
              className="h-8 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear all notifications
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => onOpen(notification.ticket)}
              className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={notification.level === 'critical' ? 'Breached' : 'At Risk'} tone={notification.level === 'critical' ? 'red' : 'violet'} />
                  <span className="text-[11px] font-mono text-slate-400">{notification.ticketId}</span>
                </div>
                <div className="mt-2 truncate text-sm font-semibold text-slate-950">{notification.title}</div>
                <div className="mt-1 text-xs text-slate-500">{notification.message}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                <StatusPill value={notification.ticket.priority} tone={notification.ticket.priority === 'Critical' || notification.ticket.priority === 'High' ? 'red' : 'blue'} />
                <div className="truncate text-xs font-medium text-slate-600 md:max-w-40">{notification.owner}</div>
              </div>
            </button>
          ))}
          {notifications.length === 0 && (
            <div className="px-4 py-12 text-center">
              <Bell className="mx-auto h-9 w-9 text-slate-300" />
              <div className="mt-3 text-sm font-semibold text-slate-700">No owner notifications</div>
              <div className="mt-1 text-xs text-slate-500">SLA alerts appear here only when the signed-in user owns the ticket.</div>
            </div>
          )}
        </div>
      </div>
    </WorkspacePanel>
  );
};

const InsightsPanel: React.FC = () => {
  const { tickets, setSelectedTicket } = useTickets();
  const open = tickets.filter((ticket) => !isClosedTicket(ticket));
  const closed = tickets.filter(isClosedTicket);
  const highRisk = sortByRisk(open.filter((ticket) => ['Critical', 'High'].includes(ticket.priority) || getSlaState(ticket) === 'Breached')).slice(0, 10);
  const topCategories = countBy(tickets, (ticket) => ticket.category).slice(0, 8);
  const topSubCategories = countBy(tickets, (ticket) => ticket.subCategory).slice(0, 8);
  const byStudio = countBy(tickets, (ticket) => ticket.studio).slice(0, 8);
  const byAssignee = countBy(tickets, (ticket) => ticket.assignedTo).slice(0, 8);
  const byStatus = countBy(tickets, (ticket) => ticket.status);
  const byPriority = countBy(tickets, (ticket) => ticket.priority);
  const bySla = countBy(tickets, (ticket) => getSlaState(ticket));
  const createdTrend = createdTrendByDay(tickets, 10);
  const resolutionRate = tickets.length ? Math.round((closed.length / tickets.length) * 100) : 0;
  return (
    <WorkspacePanel title="Insights" description="Quick signal view across submitted and historic tickets.">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Tickets" value={tickets.length} />
        <StatCard label="Open" value={open.length} tone="blue" />
        <StatCard label="Resolution Rate" value={`${resolutionRate}%`} tone="green" />
        <StatCard label="Studios" value={new Set(tickets.map((ticket) => ticket.studio)).size} tone="blue" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <BreakdownCard title="Category Drivers" items={topCategories} total={tickets.length} color="bg-blue-600" />
        <BreakdownCard title="Recurring Subcategories" items={topSubCategories} total={tickets.length} color="bg-violet-600" />
        <BreakdownCard title="SLA Health" items={bySla} total={tickets.length} color="bg-emerald-600" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <BreakdownCard title="Studio Workload" items={byStudio} total={tickets.length} color="bg-cyan-600" />
        <BreakdownCard title="Team Workload" items={byAssignee} total={tickets.length} color="bg-slate-700" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid gap-4">
          <BreakdownCard title="Status Funnel" items={byStatus} total={tickets.length} color="bg-blue-600" compact />
          <BreakdownCard title="Priority Mix" items={byPriority} total={tickets.length} color="bg-red-600" compact />
          <TrendCard title="Created Trend" items={createdTrend} />
        </div>
        <TriageTable title="Highest Risk Tickets" tickets={highRisk} onOpen={setSelectedTicket} />
      </div>
    </WorkspacePanel>
  );
};

function countBy(tickets: Ticket[], selector: (ticket: Ticket) => string | undefined) {
  return Object.entries(
    tickets.reduce<Record<string, number>>((acc, ticket) => {
      const key = selector(ticket) || 'Unspecified';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function newestByDate(tickets: Ticket[]) {
  return [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function sortByDueDate(tickets: Ticket[]) {
  return [...tickets].sort((a, b) => new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime());
}

function riskWeight(ticket: Ticket) {
  const priority = { Critical: 4, High: 3, Medium: 2, Low: 1 }[ticket.priority] || 1;
  const sla = getSlaState(ticket) === 'Breached' ? 4 : getSlaState(ticket) === 'At Risk' ? 3 : 1;
  return priority + sla;
}

function sortByRisk(tickets: Ticket[]) {
  return [...tickets].sort((a, b) => riskWeight(b) - riskWeight(a) || new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime());
}

function averageAgeHours(tickets: Ticket[]) {
  if (tickets.length === 0) return 0;
  const now = Date.now();
  const total = tickets.reduce((sum, ticket) => sum + Math.max(0, now - new Date(ticket.createdAt).getTime()), 0);
  return Math.round(total / tickets.length / 36e5);
}

function createdTrendByDay(tickets: Ticket[], days: number) {
  const now = new Date();
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - index - 1));
    const key = date.toISOString().slice(0, 10);
    return { key, name: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }), value: 0 };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const ticket of tickets) {
    const key = new Date(ticket.createdAt).toISOString().slice(0, 10);
    const bucket = byKey.get(key);
    if (bucket) bucket.value += 1;
  }
  return buckets;
}

const QueuePanel: React.FC<{
  title: string;
  description: string;
  tickets: Ticket[];
  tone: 'red' | 'violet' | 'blue' | 'emerald';
  onOpen: (ticket: Ticket) => void;
}> = ({ title, description, tickets, tone, onOpen }) => {
  const toneClass = {
    red: 'border-red-200 bg-red-50 text-red-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[tone];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{tickets.length}</span>
      </div>
      <div className="space-y-2">
        {tickets.slice(0, 5).map((ticket) => (
          <TicketMiniRow key={ticket.id} ticket={ticket} onOpen={onOpen} />
        ))}
        {tickets.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No tickets in this queue.</div>}
      </div>
    </section>
  );
};

const TicketMiniRow: React.FC<{ ticket: Ticket; onOpen: (ticket: Ticket) => void }> = ({ ticket, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(ticket)}
    className="grid w-full gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/50 md:grid-cols-[1fr_auto]"
  >
    <div className="min-w-0">
      <div className="truncate font-semibold text-slate-950">{ticket.title}</div>
      <div className="mt-0.5 truncate text-slate-500">{ticket.category} / {ticket.subCategory}</div>
    </div>
    <div className="flex items-center gap-1.5">
      <StatusPill value={ticket.priority} tone={ticket.priority === 'Critical' || ticket.priority === 'High' ? 'red' : 'blue'} />
      <StatusPill value={getSlaState(ticket)} tone={getSlaState(ticket) === 'Breached' ? 'red' : getSlaState(ticket) === 'At Risk' ? 'violet' : 'green'} />
    </div>
  </button>
);

const TriageTable: React.FC<{ title: string; tickets: Ticket[]; onOpen: (ticket: Ticket) => void }> = ({ title, tickets, onOpen }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className="text-xs text-slate-300">{tickets.length} tickets</span>
    </div>
    <div className="divide-y divide-slate-100">
      {tickets.map((ticket) => (
        <button
          type="button"
          key={ticket.id}
          onClick={() => onOpen(ticket)}
          className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[1fr_120px_120px_140px]"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950">{ticket.title}</div>
            <div className="mt-0.5 truncate text-xs text-slate-500">{ticket.id} · {ticket.category} / {ticket.subCategory}</div>
          </div>
          <StatusPill value={ticket.priority} tone={ticket.priority === 'Critical' || ticket.priority === 'High' ? 'red' : 'blue'} />
          <StatusPill value={getSlaState(ticket)} tone={getSlaState(ticket) === 'Breached' ? 'red' : getSlaState(ticket) === 'At Risk' ? 'violet' : 'green'} />
          <div className="truncate text-xs font-medium text-slate-600">{ticket.assignedTo}</div>
        </button>
      ))}
      {tickets.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-500">No tickets available for this view.</div>}
    </div>
  </section>
);

const StatusPill: React.FC<{ value: string; tone: 'red' | 'blue' | 'violet' | 'green' }> = ({ value, tone }) => {
  const className = {
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[tone];
  return <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>{value}</span>;
};

const SignalRow: React.FC<{ label: string; value: number; tone: 'red' | 'blue' | 'violet' | 'green' }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
    <span className="text-sm font-medium text-slate-600">{label}</span>
    <StatusPill value={String(value)} tone={tone} />
  </div>
);

const BreakdownCard: React.FC<{ title: string; items: Array<{ name: string; value: number }>; total: number; color: string; compact?: boolean }> = ({
  title,
  items,
  total,
  color,
  compact,
}) => {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <span className="text-xs text-slate-400">{total} total</span>
      </div>
      <div className="space-y-3">
        {items.slice(0, compact ? 5 : 8).map((item) => (
          <div key={item.name}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-semibold text-slate-700">{item.name}</span>
              <span className="font-mono text-slate-500">{item.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No data yet.</div>}
      </div>
    </section>
  );
};

const TrendCard: React.FC<{ title: string; items: Array<{ name: string; value: number }> }> = ({ title, items }) => {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 flex h-28 items-end gap-2">
        {items.map((item) => (
          <div key={item.name} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-lg bg-blue-600" style={{ height: `${Math.max(8, (item.value / max) * 100)}%` }} />
            <div className="truncate text-[10px] text-slate-400">{item.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const MomenceOpsPanel: React.FC = () => (
  <WorkspacePanel title="Momence Ops" description="Operational shortcuts that depend on selected ticket, member, and session context.">
    <div className="grid gap-3 md:grid-cols-3">
      {['Member search required for member-specific tickets', 'Class search required for class-related feedback', 'Automation actions remain inside ticket detail'].map((item) => (
        <div key={item} className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm font-semibold text-stone-700 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
          {item}
        </div>
      ))}
    </div>
  </WorkspacePanel>
);

function collapseCategoryRouting(settings: RoutingSettings): RoutingSettings {
  const byKey = new Map<string, RoutingRuleSetting>();
  for (const rule of settings.routingRules) {
    const key = `${rule.category}__${rule.location || ''}`;
    const existing = byKey.get(key);
    const owners = uniqueText([...(existing?.owners || []), ...(rule.owners?.length ? rule.owners : [rule.owner])]);
    byKey.set(key, {
      ...(existing || rule),
      subCategory: '',
      owners: owners.length ? owners : [rule.owner].filter(Boolean),
      owner: owners[0] || existing?.owner || rule.owner,
      active: (existing?.active ?? false) || rule.active,
    });
  }
  return { ...settings, routingRules: Array.from(byKey.values()) };
}

const SettingsPanel: React.FC<{ userEmail: string; accessRole: string }> = ({ userEmail, accessRole }) => {
  const [settings, setSettings] = useState<RoutingSettings>(() => collapseCategoryRouting(defaultRoutingSettings()));
  const [activeSection, setActiveSection] = useState<'routing' | 'employees' | 'departments' | 'locations'>('routing');
  const [routingFilters, setRoutingFilters] = useState<RoutingFilterState>(EMPTY_ROUTING_FILTERS);
  const [bulkOwners, setBulkOwners] = useState<string[]>([]);
  const [bulkDepartment, setBulkDepartment] = useState('');
  const [bulkEscalation, setBulkEscalation] = useState('');
  const [bulkPriority, setBulkPriority] = useState<RoutingRuleSetting['priority']>('Medium');
  const [bulkSlaHours, setBulkSlaHours] = useState('24');
  const [cityBulkCategory, setCityBulkCategory] = useState('Scheduling');
  const [cityBulkMumbaiOwners, setCityBulkMumbaiOwners] = useState<string[]>(['Mrigakshi Jaiswal', 'Vivaran Dhasmana']);
  const [cityBulkBengaluruOwners, setCityBulkBengaluruOwners] = useState<string[]>(['Pushyank Nahar']);
  const [cityBulkDepartment, setCityBulkDepartment] = useState('Training');
  const [cityBulkEscalation, setCityBulkEscalation] = useState('Anisha Shah');
  const [cityBulkPriority, setCityBulkPriority] = useState<RoutingRuleSetting['priority']>('Medium');
  const [cityBulkSlaHours, setCityBulkSlaHours] = useState('24');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeDepartmentFilters, setEmployeeDepartmentFilters] = useState<string[]>([]);
  const [employeeLocationFilters, setEmployeeLocationFilters] = useState<string[]>([]);
  const [departmentQuery, setDepartmentQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const isAdmin = accessRole === 'admin';
  const employeeNames = useMemo(() => settings.employees.filter((item) => item.active).map((item) => item.name), [settings.employees]);
  const departments = useMemo(() => settings.departments.filter((item) => item.active).map((item) => item.name), [settings.departments]);
  const locations = useMemo(() => settings.locations.filter((item) => item.active).map((item) => item.name), [settings.locations]);
  const employeeLocations = useMemo(() => uniqueText(settings.employees.map((item) => item.location || '')), [settings.employees]);
  const employeeLocationOptions = useMemo(() => uniqueText([...employeeLocations, ...locations]), [employeeLocations, locations]);
  const routingLocationOptions = useMemo(() => uniqueText(['All locations', ...locations, 'Mumbai', 'Bengaluru']), [locations]);
  const filteredRoutingRules = useMemo(() => {
    const byId = new Map<string, RoutingRuleSetting>();
    for (const rule of filterRoutingRules(settings.routingRules, routingFilters)) {
      if (!byId.has(rule.id)) byId.set(rule.id, rule);
    }
    return Array.from(byId.values());
  }, [routingFilters, settings.routingRules]);
  const filteredRoutingRuleIds = useMemo(() => new Set(filteredRoutingRules.map((rule) => rule.id)), [filteredRoutingRules]);
  const activeFilteredRoutingRules = useMemo(() => filteredRoutingRules.filter((rule) => rule.active).length, [filteredRoutingRules]);
  const filteredOwnerPoolRules = useMemo(() => filteredRoutingRules.filter((rule) => (rule.owners?.length ? rule.owners : [rule.owner]).length > 1).length, [filteredRoutingRules]);
  const filteredCities = useMemo(() => uniqueText(filteredRoutingRules.map((rule) => inferRoutingCity(rule.location) || (rule.location ? 'Other' : 'Global'))), [filteredRoutingRules]);
  const routingFilterCount = useMemo(() => [
    routingFilters.query.trim(),
    ...routingFilters.categories,
    ...routingFilters.departments,
    ...routingFilters.owners,
    ...routingFilters.locations,
    ...routingFilters.priorities,
    ...routingFilters.states,
  ].filter(Boolean).length, [routingFilters]);
  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    return settings.employees.filter((employee) => {
      if (employeeDepartmentFilters.length > 0 && !employeeDepartmentFilters.includes(employee.department)) return false;
      if (employeeLocationFilters.length > 0 && !employeeLocationFilters.includes(employee.location || '')) return false;
      if (!query) return true;
      return [employee.name, employee.email, employee.department, employee.role, employee.location, employee.manager]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [employeeDepartmentFilters, employeeLocationFilters, employeeQuery, settings.employees]);
  const filteredDepartments = useMemo(() => {
    const query = departmentQuery.trim().toLowerCase();
    if (!query) return settings.departments;
    return settings.departments.filter((department) => [department.name, department.description].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [departmentQuery, settings.departments]);
  const filteredLocations = useMemo(() => {
    const query = locationQuery.trim().toLowerCase();
    if (!query) return settings.locations;
    return settings.locations.filter((location) => [location.name, location.city].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [locationQuery, settings.locations]);

  useEffect(() => {
    let mounted = true;
    loadRoutingSettings().then((loaded) => {
      if (mounted) setSettings(collapseCategoryRouting(loaded));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (bulkOwners.length === 0 && employeeNames.length > 0) setBulkOwners([employeeNames[0]]);
    if (!bulkDepartment && departments.length > 0) setBulkDepartment(departments[0]);
    if (!bulkEscalation && employeeNames.length > 0) setBulkEscalation(employeeNames[0]);
    setCityBulkMumbaiOwners((owners) => {
      const filtered = owners.filter((owner) => employeeNames.includes(owner));
      const defaults = ['Mrigakshi Jaiswal', 'Vivaran Dhasmana'].filter((owner) => employeeNames.includes(owner));
      return filtered.length ? filtered : defaults;
    });
    setCityBulkBengaluruOwners((owners) => {
      const filtered = owners.filter((owner) => employeeNames.includes(owner));
      const defaults = ['Pushyank Nahar'].filter((owner) => employeeNames.includes(owner));
      return filtered.length ? filtered : defaults;
    });
    if (!departments.includes(cityBulkDepartment) && departments.length > 0) setCityBulkDepartment(departments[0]);
    if (!employeeNames.includes(cityBulkEscalation) && employeeNames.length > 0) setCityBulkEscalation(employeeNames[0]);
  }, [bulkDepartment, bulkEscalation, bulkOwners.length, cityBulkDepartment, cityBulkEscalation, departments, employeeNames]);

  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      await saveRoutingSettings(settings);
      setStatus('Settings saved to Supabase. New drafts will use this routing.');
    } catch (error) {
      setStatus(error instanceof Error ? `Settings not saved: ${error.message}` : 'Settings not saved: Supabase save failed.');
    } finally {
      setSaving(false);
    }
  };

  const updateRule = (id: string, patch: Partial<RoutingRuleSetting>) => {
    setSettings((current) => ({
      ...current,
      routingRules: current.routingRules.map((rule) => rule.id === id ? applyRoutingRulePatch(rule, patch, current.employees) : rule),
    }));
  };

  const updateEmployee = (id: string, patch: Partial<EmployeeSetting>) => {
    setSettings((current) => ({
      ...current,
      employees: current.employees.map((employee) => employee.id === id ? { ...employee, ...patch } : employee),
    }));
  };

  const updateDepartment = (id: string, patch: Partial<DepartmentSetting>) => {
    setSettings((current) => ({
      ...current,
      departments: current.departments.map((department) => department.id === id ? { ...department, ...patch } : department),
    }));
  };

  const updateLocation = (id: string, patch: Partial<LocationSetting>) => {
    setSettings((current) => ({
      ...current,
      locations: current.locations.map((location) => location.id === id ? { ...location, ...patch } : location),
    }));
  };

  const addRule = () => {
    const category = Object.keys(CATEGORIES)[0] || 'General Feedback';
    const owner = employeeNames[0] || ASSOCIATES[0]?.name || 'Nunu Yeptomi';
    const employee = settings.employees.find((item) => item.name === owner);
    setSettings((current) => ({
      ...current,
      routingRules: [
        {
          id: `rule-${Date.now()}`,
          category,
          subCategory: '',
          location: '',
          owner,
          owners: [owner],
          department: employee?.department || departments[0] || 'Customer Service',
          escalation: employee?.manager || 'Mitali Kumar',
          priority: 'Medium',
          slaHours: PRIORITY_SLA.Medium.hours,
          active: true,
        },
        ...current.routingRules,
      ],
    }));
  };

  const applyPresets = () => {
    const presets = physique57RoutingPresets();
    setSettings((current) => {
      const byId = new Map(current.routingRules.map((rule) => [rule.id, rule]));
      for (const preset of presets) byId.set(preset.id, preset);
      return collapseCategoryRouting({ ...current, routingRules: Array.from(byId.values()) });
    });
    setStatus('Physique 57 routing presets applied. Review and save settings.');
  };

  const runBulkOperation = (operation: BulkRoutingOperation, label: string) => {
    if (filteredRoutingRuleIds.size === 0) {
      setStatus('No category routing rules match the current filters.');
      return;
    }

    setSettings((current) => ({
      ...current,
      routingRules: applyBulkRoutingOperation(current.routingRules, filteredRoutingRuleIds, operation, current.employees),
    }));
    setStatus(`${label} applied to ${filteredRoutingRuleIds.size} filtered category routing rules. Save settings to sync Supabase.`);
  };

  const bulkSetActive = (active: boolean) => runBulkOperation({ type: 'setActive', active }, active ? 'Activate' : 'Pause');

  const applyCityBulkRouting = () => {
    setSettings((current) => applyCategoryCityRouting(current, {
      category: cityBulkCategory,
      department: cityBulkDepartment,
      escalation: cityBulkEscalation,
      priority: cityBulkPriority,
      slaHours: Number(cityBulkSlaHours) || PRIORITY_SLA[cityBulkPriority].hours,
      cityRouting: [
        { city: 'Mumbai', owners: cityBulkMumbaiOwners },
        { city: 'Bengaluru', owners: cityBulkBengaluruOwners },
      ],
    }));
    setRoutingFilters((filters) => ({
      ...filters,
      categories: [cityBulkCategory],
      locations: [],
      departments: [cityBulkDepartment],
    }));
    setStatus(`Applied ${cityBulkCategory} city routing in memory. Save settings to sync it to Supabase.`);
  };

  const addEmployee = () => {
    setSettings((current) => ({
      ...current,
      employees: [
        {
          id: `employee-${Date.now()}`,
          name: 'New Employee',
          email: '',
          department: departments[0] || 'Customer Service',
          role: '',
          location: locations[0] || '',
          manager: 'Mitali Kumar',
          active: true,
        },
        ...current.employees,
      ],
    }));
  };

  const addDepartment = () => {
    setSettings((current) => ({
      ...current,
      departments: [{ id: `department-${Date.now()}`, name: 'New Department', description: '', active: true }, ...current.departments],
    }));
  };

  const addLocation = () => {
    setSettings((current) => ({
      ...current,
      locations: [{ id: `location-${Date.now()}`, name: 'New Location', city: '', active: true }, ...current.locations],
    }));
  };

  return (
    <WorkspacePanel title="Settings" description="Admin-controlled routing, ownership, departments, employees, escalation and location intelligence.">
      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.35fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Signed in</div>
          <div className="mt-2 text-sm font-semibold text-stone-900">{userEmail}</div>
          <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${isAdmin ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {isAdmin ? 'Admin access' : 'Support read-only'}
          </div>
          <div className="mt-5 grid gap-2">
            {[
              ['routing', 'Issue Routing', `${settings.routingRules.length} rules`],
              ['employees', 'Employees', `${settings.employees.length} people`],
              ['departments', 'Departments', `${settings.departments.length} teams`],
              ['locations', 'Locations', `${settings.locations.length} studios`],
            ].map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key as typeof activeSection)}
                className={`rounded-xl border px-3 py-3 text-left transition ${activeSection === key ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="text-sm font-semibold">{label}</div>
                <div className="mt-0.5 text-xs opacity-70">{count}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!isAdmin || saving}
            className="mt-5 h-10 w-full rounded-xl bg-slate-950 px-4 text-xs font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          {status && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{status}</div>}
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_54px_rgba(15,23,42,0.07)]">
          {activeSection === 'routing' && (
            <SettingsSection
              title="Issue Owner Routing"
              action={isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <SmallButton onClick={applyPresets}>Apply P57 presets</SmallButton>
                  <SmallButton onClick={addRule}>Add rule</SmallButton>
                </div>
              ) : null}
            >
              <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 to-blue-950 p-4 text-white md:grid-cols-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">Routing coverage</div>
                  <div className="mt-1 text-2xl font-semibold">{settings.routingRules.filter((rule) => rule.active).length}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">Selected scope</div>
                  <div className="mt-1 text-2xl font-semibold">{filteredRoutingRules.length}</div>
                  <div className="mt-0.5 text-[11px] text-blue-100">{routingFilterCount ? `${routingFilterCount} filters active` : 'All category rules'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">Active in scope</div>
                  <div className="mt-1 text-2xl font-semibold">{activeFilteredRoutingRules}</div>
                  <div className="mt-0.5 text-[11px] text-blue-100">{filteredOwnerPoolRules} owner-pool rules</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">Cities in scope</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(filteredCities.length ? filteredCities : ['None']).slice(0, 4).map((city) => (
                      <span key={city} className="rounded-full bg-white/12 px-2 py-1 text-[11px] font-semibold text-white">{city}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">Advanced routing filters</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Bulk actions apply to the currently filtered category rules.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRoutingFilters(EMPTY_ROUTING_FILTERS)}
                    className="h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                  >
                    Reset filters
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SettingsInput label="Search" value={routingFilters.query} onChange={(query) => setRoutingFilters((filters) => ({ ...filters, query }))} />
                  <SettingsMultiSelect
                    label="Categories"
                    values={Object.keys(CATEGORIES)}
                    selected={routingFilters.categories}
                    placeholder="Search categories..."
                    emptyText="All categories"
                    compact
                    onChange={(categories) => setRoutingFilters((filters) => ({ ...filters, categories }))}
                  />
                  <SettingsMultiSelect
                    label="Departments"
                    values={departments}
                    selected={routingFilters.departments}
                    placeholder="Search departments..."
                    emptyText="All departments"
                    compact
                    onChange={(departments) => setRoutingFilters((filters) => ({ ...filters, departments }))}
                  />
                  <SettingsMultiSelect
                    label="Owners"
                    values={employeeNames}
                    selected={routingFilters.owners}
                    placeholder="Search owners..."
                    emptyText="All owners"
                    compact
                    onChange={(owners) => setRoutingFilters((filters) => ({ ...filters, owners }))}
                  />
                  <SettingsMultiSelect
                    label="Locations"
                    values={routingLocationOptions}
                    selected={routingFilters.locations}
                    placeholder="Search locations..."
                    emptyText="All locations and cities"
                    compact
                    onChange={(locations) => setRoutingFilters((filters) => ({ ...filters, locations }))}
                  />
                  <SettingsMultiSelect
                    label="State"
                    values={['Active', 'Paused']}
                    selected={routingFilters.states}
                    placeholder="Search state..."
                    emptyText="All states"
                    compact
                    onChange={(states) => setRoutingFilters((filters) => ({ ...filters, states: states as RoutingStateFilter[] }))}
                  />
                  <SettingsMultiSelect
                    label="Priority"
                    values={Object.keys(PRIORITY_SLA)}
                    selected={routingFilters.priorities}
                    placeholder="Search priority..."
                    emptyText="All priorities"
                    compact
                    onChange={(priorities) => setRoutingFilters((filters) => ({ ...filters, priorities }))}
                  />
                </div>
              </div>
              {isAdmin && (
                <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-emerald-950">City split category routing</h4>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      Creates or replaces category-level rules for every studio in each city, covering all subcategories.
                    </p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-3">
                      <SettingsSelect label="Category" value={cityBulkCategory} values={Object.keys(CATEGORIES)} onChange={setCityBulkCategory} />
                    </div>
                    <div className="lg:col-span-3">
                      <SettingsSelect label="Department" value={cityBulkDepartment} values={departments} onChange={setCityBulkDepartment} />
                    </div>
                    <div className="lg:col-span-3">
                      <SettingsSelect label="Escalation" value={cityBulkEscalation} values={employeeNames} onChange={setCityBulkEscalation} />
                    </div>
                    <div className="lg:col-span-2">
                      <SettingsSelect label="Priority" value={cityBulkPriority} values={Object.keys(PRIORITY_SLA)} onChange={(priority) => setCityBulkPriority(priority as RoutingRuleSetting['priority'])} />
                    </div>
                    <div className="lg:col-span-1">
                      <SettingsInput label="SLA" value={cityBulkSlaHours} onChange={setCityBulkSlaHours} />
                    </div>
                    <div className="lg:col-span-6">
                      <SettingsMultiSelect label="Mumbai owners" values={employeeNames} selected={cityBulkMumbaiOwners} placeholder="Search Mumbai owners..." emptyText="No Mumbai owners selected" onChange={setCityBulkMumbaiOwners} />
                    </div>
                    <div className="lg:col-span-6">
                      <SettingsMultiSelect label="Bengaluru owners" values={employeeNames} selected={cityBulkBengaluruOwners} placeholder="Search Bengaluru owners..." emptyText="No Bengaluru owners selected" onChange={setCityBulkBengaluruOwners} />
                    </div>
                    <div className="lg:col-span-12">
                      <SmallButton onClick={applyCityBulkRouting}>Apply city split routing</SmallButton>
                    </div>
                  </div>
                </div>
              )}
              {isAdmin && (
                <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-blue-950">Bulk operations</h4>
                    <p className="mt-0.5 text-xs text-blue-700">{filteredRoutingRules.length} category rules selected by current filters.</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                      <SettingsMultiSelect label="Bulk owner pool" values={employeeNames} selected={bulkOwners} placeholder="Search owners..." emptyText="No owners selected" onChange={setBulkOwners} />
                    </div>
                    <div className="lg:col-span-3">
                      <SettingsSelect label="Bulk department" value={bulkDepartment} values={departments} onChange={setBulkDepartment} />
                    </div>
                    <div className="lg:col-span-3">
                      <SettingsSelect label="Bulk escalation" value={bulkEscalation} values={employeeNames} onChange={setBulkEscalation} />
                    </div>
                    <div className="lg:col-span-1">
                      <SettingsInput label="SLA" value={bulkSlaHours} onChange={setBulkSlaHours} />
                    </div>
                    <div className="lg:col-span-3">
                      <SettingsSelect label="Bulk priority" value={bulkPriority} values={Object.keys(PRIORITY_SLA)} onChange={(priority) => setBulkPriority(priority as RoutingRuleSetting['priority'])} />
                    </div>
                    <div className="flex flex-wrap items-end gap-2 lg:col-span-9">
                      <SmallButton disabled={!bulkOwners.length} onClick={() => runBulkOperation({ type: 'setOwners', owners: bulkOwners }, 'Owner pool replacement')}>Set owners</SmallButton>
                      <SmallButton disabled={!bulkOwners.length} variant="outline" onClick={() => runBulkOperation({ type: 'addOwners', owners: bulkOwners }, 'Owner add')}>Add owners</SmallButton>
                      <SmallButton disabled={!bulkOwners.length} variant="outline" onClick={() => runBulkOperation({ type: 'removeOwners', owners: bulkOwners }, 'Owner removal')}>Remove owners</SmallButton>
                      <SmallButton onClick={() => runBulkOperation({ type: 'setDepartment', department: bulkDepartment }, 'Department update')}>Set department</SmallButton>
                      <SmallButton onClick={() => runBulkOperation({ type: 'setEscalation', escalation: bulkEscalation }, 'Escalation update')}>Set escalation</SmallButton>
                      <SmallButton onClick={() => runBulkOperation({ type: 'setPriority', priority: bulkPriority }, 'Priority update')}>Set priority</SmallButton>
                      <SmallButton onClick={() => runBulkOperation({ type: 'setSlaHours', slaHours: Number(bulkSlaHours) || PRIORITY_SLA.Medium.hours }, 'SLA update')}>Set SLA</SmallButton>
                      <SmallButton variant="success" onClick={() => bulkSetActive(true)}>Activate</SmallButton>
                      <SmallButton variant="danger" onClick={() => bulkSetActive(false)}>Pause</SmallButton>
                    </div>
                  </div>
                </div>
              )}
              <SettingsTable
                headers={['Category', 'Location', 'Owner Pool', 'Department', 'Escalation', 'Priority', 'SLA', 'Active']}
                minWidth="min-w-[1320px]"
              >
                {filteredRoutingRules.slice(0, 160).map((rule) => (
                  <tr key={rule.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50/70">
                    <SettingsTd className="w-[220px]">
                      <SettingsSelect disabled={!isAdmin} value={rule.category} values={Object.keys(CATEGORIES)} onChange={(category) => updateRule(rule.id, { category })} />
                    </SettingsTd>
                    <SettingsTd className="w-[220px]">
                      <SettingsSelect disabled={!isAdmin} value={rule.location || ''} values={['', ...locations, 'Mumbai', 'Bengaluru']} onChange={(location) => updateRule(rule.id, { location })} />
                      <div className="mt-1 text-[10px] font-semibold text-slate-400">All subcategories</div>
                    </SettingsTd>
                    <SettingsTd className="w-[320px]">
                      <SettingsMultiSelect
                        disabled={!isAdmin}
                        values={employeeNames}
                        selected={rule.owners?.length ? rule.owners : [rule.owner]}
                        emptyText="No owners"
                        inline
                        onChange={(owners) => updateRule(rule.id, { owners, owner: owners[0] || rule.owner })}
                      />
                    </SettingsTd>
                    <SettingsTd className="w-[190px]">
                      <SettingsSelect disabled={!isAdmin} value={rule.department} values={departments} onChange={(department) => updateRule(rule.id, { department })} />
                    </SettingsTd>
                    <SettingsTd className="w-[220px]">
                      <SettingsSelect disabled={!isAdmin} value={rule.escalation} values={employeeNames} onChange={(escalation) => updateRule(rule.id, { escalation })} />
                    </SettingsTd>
                    <SettingsTd className="w-[140px]">
                      <SettingsSelect disabled={!isAdmin} value={rule.priority} values={Object.keys(PRIORITY_SLA)} onChange={(priority) => updateRule(rule.id, { priority: priority as RoutingRuleSetting['priority'] })} />
                    </SettingsTd>
                    <SettingsTd className="w-[100px]">
                      <SettingsInput disabled={!isAdmin} value={String(rule.slaHours)} onChange={(slaHours) => updateRule(rule.id, { slaHours: Number(slaHours) || rule.slaHours })} />
                    </SettingsTd>
                    <SettingsTd className="w-[90px]">
                      <SettingsCheckbox disabled={!isAdmin} checked={rule.active} onChange={(active) => updateRule(rule.id, { active })} />
                    </SettingsTd>
                  </tr>
                ))}
                {filteredRoutingRules.length === 0 && (
                  <SettingsEmptyRow colSpan={8}>No category routing rules match the current filters.</SettingsEmptyRow>
                )}
              </SettingsTable>
            </SettingsSection>
          )}

          {activeSection === 'employees' && (
            <SettingsSection title="Employee Directory" action={isAdmin ? <SmallButton onClick={addEmployee}>Add employee</SmallButton> : null}>
              <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-3">
                <SettingsInput label="Search employees" value={employeeQuery} onChange={setEmployeeQuery} />
                <SettingsMultiSelect
                  label="Departments"
                  values={departments}
                  selected={employeeDepartmentFilters}
                  placeholder="Search departments..."
                  emptyText="All departments"
                  compact
                  onChange={setEmployeeDepartmentFilters}
                />
                <SettingsMultiSelect
                  label="Locations"
                  values={employeeLocations}
                  selected={employeeLocationFilters}
                  placeholder="Search locations..."
                  emptyText="All locations"
                  compact
                  onChange={setEmployeeLocationFilters}
                />
              </div>
              <SettingsTable
                headers={['Name', 'Email', 'Department', 'Manager', 'Role', 'Location', 'Active']}
                minWidth="min-w-[1180px]"
              >
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50/70">
                    <SettingsTd className="w-[170px]">
                      <SettingsInput disabled={!isAdmin} value={employee.name} onChange={(name) => updateEmployee(employee.id, { name })} />
                    </SettingsTd>
                    <SettingsTd className="w-[220px]">
                      <SettingsInput disabled={!isAdmin} value={employee.email || ''} onChange={(email) => updateEmployee(employee.id, { email })} />
                    </SettingsTd>
                    <SettingsTd className="w-[190px]">
                      <SettingsSelect disabled={!isAdmin} value={employee.department} values={departments} onChange={(department) => updateEmployee(employee.id, { department })} />
                    </SettingsTd>
                    <SettingsTd className="w-[190px]">
                      <SettingsSelect disabled={!isAdmin} value={employee.manager || ''} values={employeeNames} onChange={(manager) => updateEmployee(employee.id, { manager })} />
                    </SettingsTd>
                    <SettingsTd className="w-[200px]">
                      <SettingsInput disabled={!isAdmin} value={employee.role || ''} onChange={(role) => updateEmployee(employee.id, { role })} />
                    </SettingsTd>
                    <SettingsTd className="w-[210px]">
                      <SettingsSelect disabled={!isAdmin} value={employee.location || ''} values={employeeLocationOptions} onChange={(location) => updateEmployee(employee.id, { location })} />
                    </SettingsTd>
                    <SettingsTd className="w-[90px]">
                      <SettingsCheckbox disabled={!isAdmin} checked={employee.active} onChange={(active) => updateEmployee(employee.id, { active })} />
                    </SettingsTd>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <SettingsEmptyRow colSpan={7}>No employees match the current filters.</SettingsEmptyRow>
                )}
              </SettingsTable>
            </SettingsSection>
          )}

          {activeSection === 'departments' && (
            <SettingsSection title="Departments" action={isAdmin ? <SmallButton onClick={addDepartment}>Add department</SmallButton> : null}>
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <SettingsInput label="Search departments" value={departmentQuery} onChange={setDepartmentQuery} />
              </div>
              <SettingsList items={filteredDepartments} disabled={!isAdmin} onChange={updateDepartment} />
            </SettingsSection>
          )}

          {activeSection === 'locations' && (
            <SettingsSection title="Locations" action={isAdmin ? <SmallButton onClick={addLocation}>Add location</SmallButton> : null}>
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <SettingsInput label="Search locations" value={locationQuery} onChange={setLocationQuery} />
              </div>
              <SettingsTable
                headers={['Studio / Location', 'City', 'Active']}
                minWidth="min-w-[680px]"
              >
                {filteredLocations.map((location) => (
                  <tr key={location.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50/70">
                    <SettingsTd className="w-[360px]">
                      <SettingsInput disabled={!isAdmin} value={location.name} onChange={(name) => updateLocation(location.id, { name })} />
                    </SettingsTd>
                    <SettingsTd className="w-[220px]">
                      <SettingsInput disabled={!isAdmin} value={location.city || ''} onChange={(city) => updateLocation(location.id, { city })} />
                    </SettingsTd>
                    <SettingsTd className="w-[90px]">
                      <SettingsCheckbox disabled={!isAdmin} checked={location.active} onChange={(active) => updateLocation(location.id, { active })} />
                    </SettingsTd>
                  </tr>
                ))}
                {filteredLocations.length === 0 && (
                  <SettingsEmptyRow colSpan={3}>No locations match the current search.</SettingsEmptyRow>
                )}
              </SettingsTable>
            </SettingsSection>
          )}
        </div>
      </div>
    </WorkspacePanel>
  );
};

const SettingsSection: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <div>
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">Changes here affect new ticket drafts, assignment, escalation and SLA routing.</p>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const SettingsTable: React.FC<{ headers: string[]; minWidth?: string; children: React.ReactNode }> = ({ headers, minWidth = 'min-w-[900px]', children }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left ${minWidth}`}>
        <thead className="bg-slate-100/90">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {children}
        </tbody>
      </table>
    </div>
  </div>
);

const SettingsTd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`px-3 py-2 ${className}`}>
    {children}
  </td>
);

const SettingsEmptyRow: React.FC<{ colSpan: number; children: React.ReactNode }> = ({ colSpan, children }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
      {children}
    </td>
  </tr>
);

const SmallButton: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean; variant?: 'primary' | 'outline' | 'danger' | 'success' }> = ({ onClick, children, disabled, variant = 'primary' }) => {
  const classes = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  }[variant];

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-xl px-3 py-2 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${classes}`}>
      {children}
    </button>
  );
};

const SettingsInput: React.FC<{ label?: string; value: string; disabled?: boolean; onChange: (value: string) => void }> = ({ label, value, disabled, onChange }) => (
  <label className="block">
    {label && <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>}
    <input
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
    />
  </label>
);

const SettingsSelect: React.FC<{ label?: string; value: string; values: string[]; disabled?: boolean; onChange: (value: string) => void }> = ({ label, value, values, disabled, onChange }) => (
  <label className="block">
    {label && <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>}
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
    >
      {values.map((item) => <option key={item || 'blank'} value={item}>{item || 'All'}</option>)}
    </select>
  </label>
);

const SettingsMultiSelect: React.FC<{
  label?: string;
  values: string[];
  selected: string[];
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  compact?: boolean;
  inline?: boolean;
  onChange: (value: string[]) => void;
}> = ({ label, values, selected, disabled, placeholder = 'Search options...', emptyText = 'No options selected', compact, inline, onChange }) => {
  const [query, setQuery] = useState('');
  const normalizedValues = uniqueText(values);
  const normalizedSelected = uniqueText(selected);
  const filtered = normalizedValues.filter((value) => value.toLowerCase().includes(query.toLowerCase())).slice(0, compact ? 10 : 18);
  const selectedSet = new Set(normalizedSelected);
  const availableValues = normalizedValues.filter((value) => !selectedSet.has(value));
  const toggle = (value: string) => {
    if (disabled) return;
    const next = selectedSet.has(value)
      ? normalizedSelected.filter((item) => item !== value)
      : [...normalizedSelected, value];
    onChange(next);
  };

  if (inline) {
    return (
      <div>
        {label && <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <div className="mb-2 flex min-h-7 flex-wrap gap-1.5">
            {normalizedSelected.length ? normalizedSelected.map((item) => (
              <button
                key={item}
                type="button"
                disabled={disabled}
                onClick={() => toggle(item)}
                className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 disabled:cursor-default"
              >
                {item} x
              </button>
            )) : <span className="px-1 py-1 text-xs text-slate-400">{emptyText}</span>}
          </div>
          <select
            value=""
            disabled={disabled || availableValues.length === 0}
            onChange={(event) => {
              if (event.target.value) toggle(event.target.value);
            }}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Add owner...</option>
            {availableValues.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {normalizedSelected.length ? normalizedSelected.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => toggle(item)}
              className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 disabled:cursor-default"
            >
              {item}
            </button>
          )) : <span className="px-1 text-xs text-slate-400">{emptyText}</span>}
        </div>
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="mb-2 h-8 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100"
        />
        <div className={`grid gap-1 overflow-y-auto ${compact ? 'max-h-28' : 'max-h-36 sm:grid-cols-2'}`}>
          {filtered.map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(value)}
              className={`rounded-xl px-2 py-1.5 text-left text-[11px] font-semibold transition ${selectedSet.has(value) ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 hover:bg-blue-50'} disabled:cursor-default disabled:opacity-60`}
            >
              {value}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-xl bg-white px-2 py-2 text-[11px] font-semibold text-slate-400">No matching options</div>
          )}
        </div>
      </div>
    </div>
  );
};

const SettingsCheckbox: React.FC<{ label?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, disabled, onChange }) => (
  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
    {label}
  </label>
);

const SettingsList: React.FC<{ items: DepartmentSetting[]; disabled: boolean; onChange: (id: string, patch: Partial<DepartmentSetting>) => void }> = ({ items, disabled, onChange }) => (
  <SettingsTable
    headers={['Department', 'Description', 'Active']}
    minWidth="min-w-[760px]"
  >
    {items.map((item) => (
      <tr key={item.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50/70">
        <SettingsTd className="w-[240px]">
          <SettingsInput disabled={disabled} value={item.name} onChange={(name) => onChange(item.id, { name })} />
        </SettingsTd>
        <SettingsTd className="w-[420px]">
          <SettingsInput disabled={disabled} value={item.description || ''} onChange={(description) => onChange(item.id, { description })} />
        </SettingsTd>
        <SettingsTd className="w-[90px]">
          <SettingsCheckbox disabled={disabled} checked={item.active} onChange={(active) => onChange(item.id, { active })} />
        </SettingsTd>
      </tr>
    ))}
    {items.length === 0 && (
      <SettingsEmptyRow colSpan={3}>No departments match the current search.</SettingsEmptyRow>
    )}
  </SettingsTable>
);

export default AppLayout;
