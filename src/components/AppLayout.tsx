import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { TicketProvider } from './ticketing/TicketContext';
import { useTickets } from './ticketing/useTickets';
import { ChatInterface } from './ticketing/ChatInterface';
import { TicketDetailDrawer } from './ticketing/TicketDetailDrawer';
import { AuthGate } from './AuthGate';
import { BackendAuthProvider, useBackendAuth } from '@/contexts/BackendAuthContext';
import { AlertTriangle, BarChart3, Bell, CheckCircle2, Clock, Flame, Gauge, MessageSquareText, PanelRightClose, PanelRightOpen, RotateCcw, Settings, ShieldAlert, Tickets, Users, Workflow } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { ASSOCIATES, CATEGORIES, PRIORITY_SLA, STUDIOS, getEscalationTarget, getSlaState, isClosedTicket, isTicketBreached, Ticket } from '@/lib/ticketing-data';
import {
  DepartmentSetting,
  EmployeeSetting,
  LocationSetting,
  RoutingRuleSetting,
  RoutingSettings,
  defaultRoutingSettings,
  inferRoutingCity,
  loadRoutingSettings,
  physique57RoutingPresets,
  routingRuleId,
  saveRoutingSettings,
} from '@/lib/routing-settings';
import {
  EMPTY_ROUTING_FILTERS,
  applyBulkRoutingOperation,
  applyRoutingRulePatch,
  buildCategoryRoutingRows,
  createCityRoutingRules,
  deleteCategoryRoutingRules,
  filterRoutingRules,
  isCityRoutingRule,
  routingScopeKey,
  uniqueText,
  type BulkRoutingOperation,
  type CategoryRoutingRow,
  type RoutingFilterState,
  type RoutingScopeKey,
  type RoutingScopeSummary,
  type RoutingStateFilter,
} from '@/lib/settings-routing-ops';

const TicketDashboard = lazy(() =>
  import('./ticketing/TicketDashboard').then((module) => ({ default: module.TicketDashboard }))
);
const AiReportsPanel = lazy(() =>
  import('./ticketing/AiReportsPanel').then((module) => ({ default: module.AiReportsPanel }))
);

const sideTabs = [
  { value: 'chat', label: 'Chat Intake', icon: MessageSquareText },
  { value: 'queue', label: 'Triage Queue', icon: Gauge },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'tickets', label: 'Submitted Tickets', icon: Tickets },
  { value: 'reports', label: 'Reports', icon: BarChart3 },
  { value: 'insights', label: 'Insights', icon: BarChart3 },
  { value: 'momence', label: 'Momence Ops', icon: Workflow },
  { value: 'settings', label: 'Settings', icon: Settings },
];
const ADMIN_ONLY_TABS = new Set(['queue', 'notifications', 'tickets', 'reports', 'insights', 'momence', 'settings']);

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
  const { user, profile, signOut, accessRole } = useBackendAuth();
  const { notifications, selectedTicket, setSelectedTicket } = useTickets();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('chat');
  const [hasOpenedTickets, setHasOpenedTickets] = useState(false);
  const [chatResetVersion, setChatResetVersion] = useState(0);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const userDisplayName = (
    profile?.full_name ||
    (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
    (typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name : '') ||
    'Authenticated user'
  ).trim();

  const visibleTabs = useMemo(
    () => sideTabs.filter((tab) => accessRole === 'admin' || !ADMIN_ONLY_TABS.has(tab.value)),
    [accessRole]
  );

  useEffect(() => {
    if (accessRole === 'admin') return;
    if (ADMIN_ONLY_TABS.has(activeTab)) setActiveTab('chat');
  }, [accessRole, activeTab]);

  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  const openEmptyIntake = () => {
    setSelectedTicket(null);
    setActiveTab('chat');
    setChatResetVersion((version) => version + 1);
  };

  const goHome = () => {
    navigate('/');
    openEmptyIntake();
  };

  const handleTabChange = (value: string) => {
    if (accessRole !== 'admin' && ADMIN_ONLY_TABS.has(value)) {
      setActiveTab('chat');
      return;
    }
    setActiveTab(value);
    if (value === 'tickets') setHasOpenedTickets(true);
  };

  const startNewChat = () => {
    openEmptyIntake();
  };

  const sidebarExpanded = sidebarPinned || sidebarHovered;

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
              <img src="/download-1.png" alt="Athena bot face" className="-scale-x-100 h-full w-full rounded-full object-cover" />
            </button>
            <div className="min-w-0">
              <div className="flex items-end gap-0 leading-none">
                <h1 className="text-[28px] font-black uppercase tracking-[0.28em] text-stone-900 ml-2">
                  Athena
                </h1>
                <span className="ai-kinetic mb-[16px] text-[13px] font-semibold">
                  Ai
                </span>
              </div>
              <div className="ml-2 mt-1 h-px w-[308px] bg-gradient-to-r from-rose-500 via-violet-500 to-indigo-500/10" />
              <div className="mt-1 flex items-center gap-2">
                <div className="h-px w-0 bg-gradient-to-r from-violet-500 to-transparent" />
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-stone-500">
                  Intelligent Member Support
                </p>
              </div>
            </div>
            <div className="ml-auto hidden items-center gap-4 md:flex">
              <div className="px-1 text-right">
                <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
                  {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
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
                {(accessRole === 'admin' && (activeTab === 'tickets' || hasOpenedTickets)) && (
                  <Suspense fallback={<div className="flex h-full items-center justify-center bg-white text-sm text-stone-500">Loading submitted tickets...</div>}>
                    <TicketDashboard />
                  </Suspense>
                )}
              </TabsContent>
              <TabsContent value="notifications" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                {accessRole === 'admin' && <NotificationsPanel
                  onOpen={(ticket) => {
                    setSelectedTicket(ticket);
                    setHasOpenedTickets(true);
                  }}
                />}
              </TabsContent>
              <TabsContent value="reports" className="reports-print-root m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                {accessRole === 'admin' && activeTab === 'reports' && (
                  <Suspense fallback={<div className="flex h-full items-center justify-center bg-white text-sm text-stone-500">Loading reports...</div>}>
                    <AiReportsPanel />
                  </Suspense>
                )}
              </TabsContent>
              <TabsContent value="insights" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                {accessRole === 'admin' && <InsightsPanel />}
              </TabsContent>
              <TabsContent value="momence" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                {accessRole === 'admin' && <MomenceOpsPanel />}
              </TabsContent>
              <TabsContent value="settings" className="m-0 h-full min-h-0 overflow-hidden data-[state=inactive]:hidden">
                {accessRole === 'admin' && <SettingsPanel userEmail={userDisplayName} accessRole={accessRole} />}
              </TabsContent>
            </div>

            <aside
              onMouseEnter={() => setSidebarHovered(true)}
              onMouseLeave={() => setSidebarHovered(false)}
              className={`z-10 hidden flex-shrink-0 flex-col border-l border-slate-200/80 bg-white/75 py-3 shadow-[-10px_0_40px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-all duration-300 md:flex ${
                sidebarExpanded ? 'w-56 px-2.5' : 'w-[72px] px-2'
              }`}
            >
              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setSidebarPinned((current) => !current)}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                    sidebarPinned
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'
                  }`}
                  aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                  title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                >
                  {sidebarPinned ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={startNewChat}
                className={`mb-2 flex h-11 w-full items-center rounded-xl border border-slate-700 bg-slate-950 text-xs font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.35)] transition duration-200 hover:-translate-y-0.5 hover:bg-black focus:outline-none focus:ring-4 focus:ring-slate-500/20 ${
                  sidebarExpanded ? 'justify-start px-3' : 'justify-center px-0'
                }`}
              >
                <RotateCcw className={`h-4 w-4 ${sidebarExpanded ? 'mr-2' : ''}`} />
                <span className={`${sidebarExpanded ? 'inline' : 'hidden'} truncate`}>New chat</span>
              </button>
              <TabsList className="flex h-auto w-full flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50/90 p-1.5 shadow-inner shadow-slate-200/40">
                {visibleTabs.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={`h-11 w-full rounded-xl text-xs font-semibold transition duration-200 ${
                      sidebarExpanded ? 'justify-between px-3' : 'justify-center px-0'
                    } text-slate-500 hover:bg-white/80 hover:text-slate-700 data-[state=active]:bg-rose-700 data-[state=active]:text-white data-[state=active]:shadow-[0_8px_20px_rgba(190,24,93,0.28)]`}
                  >
                    <span className={`relative inline-flex items-center ${sidebarExpanded ? 'mr-2' : ''}`}>
                      <Icon className="h-4 w-4" />
                      {value === 'notifications' && notifications.length > 0 && (
                        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white">
                          {notifications.length > 9 ? '9+' : notifications.length}
                        </span>
                      )}
                    </span>
                    <span className={`${sidebarExpanded ? 'inline' : 'hidden'} flex-1 truncate text-left`}>{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="mt-auto pt-3">
                <div className="rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm">
                  <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 ${sidebarExpanded ? '' : 'hidden'}`}>
                    Logged In As
                  </div>
                  <div className={`mt-1 truncate text-xs font-semibold text-slate-800 ${sidebarExpanded ? '' : 'hidden'}`}>
                    {userDisplayName}
                  </div>
                  <div className={`truncate text-[11px] text-slate-500 ${sidebarExpanded ? '' : 'hidden'}`}>{accessRole}</div>
                  <button
                    onClick={() => void signOut()}
                    className={`mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition hover:bg-slate-50 ${
                      sidebarExpanded ? 'w-full px-3' : 'w-9 px-0'
                    }`}
                    aria-label="Sign out"
                  >
                    <span className={sidebarExpanded ? '' : 'hidden'}>Sign out</span>
                    <span className={sidebarExpanded ? 'hidden' : ''}>⎋</span>
                  </button>
                </div>
              </div>
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

const StatCard: React.FC<{ label: string; value: string | number; tone?: 'default' | 'danger' | 'blue' | 'green' }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">{label}</div>
    <div className="mt-2 text-3xl font-semibold text-stone-950">{value}</div>
  </div>
);

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
          className="grid w-full gap-3 px-4 py-3 text-left transition hover:text-slate-950 md:grid-cols-[1fr_120px_120px_140px]"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950">{ticket.title}</div>
            <div className="mt-0.5 truncate text-xs text-slate-500">{ticket.id} · {ticket.category} / {ticket.subCategory}</div>
          </div>
          <PlainDataValue value={ticket.priority} />
          <PlainDataValue value={getSlaState(ticket)} />
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

const PlainDataValue: React.FC<{ value: string }> = ({ value }) => (
  <span className="truncate text-xs font-medium text-slate-700">{value}</span>
);

const SignalRow: React.FC<{ label: string; value: number; tone: 'red' | 'blue' | 'violet' | 'green' }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
    <span className="text-sm font-medium text-slate-600">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-slate-950">{value}</span>
  </div>
);

const BreakdownCard: React.FC<{ title: string; items: Array<{ name: string; value: number }>; total: number; color: string; compact?: boolean }> = ({
  title,
  items,
  total,
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
              <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
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
            <div className="w-full rounded-t-lg bg-slate-700" style={{ height: `${Math.max(8, (item.value / max) * 100)}%` }} />
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

function scopeLocation(scope: RoutingScopeKey): string {
  if (scope === 'mumbai') return 'Mumbai';
  if (scope === 'bengaluru') return 'Bengaluru';
  return '';
}

function selectValues(current: string, values: string[], includeBlank = false): string[] {
  const options = uniqueText([current, ...values]);
  return includeBlank ? ['', ...options] : options;
}

function createRoutingScopeRule(
  settings: RoutingSettings,
  category: string,
  scope: RoutingScopeKey,
  patch: Partial<RoutingRuleSetting>,
): RoutingRuleSetting {
  const requestedOwners = uniqueText(patch.owners?.length ? patch.owners : patch.owner ? [patch.owner] : []);
  const fallbackOwner = settings.employees.find((employee) => employee.active)?.name || ASSOCIATES[0]?.name || 'Nunu Yeptomi';
  const owners = requestedOwners.length ? requestedOwners : [fallbackOwner];
  const owner = owners[0] || fallbackOwner;
  const employee = settings.employees.find((item) => item.name === owner);
  const priority = patch.priority || 'Medium';
  const location = scopeLocation(scope);

  return {
    id: routingRuleId(category, location),
    category,
    subCategory: '',
    location,
    owner,
    owners,
    department: patch.department || employee?.department || settings.departments.find((department) => department.active)?.name || 'Customer Service',
    escalation: patch.escalation || employee?.manager || getEscalationTarget(owner),
    priority,
    slaHours: patch.slaHours || PRIORITY_SLA[priority].hours,
    active: patch.active ?? true,
  };
}

function createRoutingCategoryRules(
  settings: RoutingSettings,
  category: string,
  patch: Partial<RoutingRuleSetting>,
): RoutingRuleSetting[] {
  const requestedOwners = uniqueText(patch.owners?.length ? patch.owners : patch.owner ? [patch.owner] : []);
  const fallbackOwner = settings.employees.find((employee) => employee.active)?.name || ASSOCIATES[0]?.name || 'Nunu Yeptomi';
  const owners = requestedOwners.length ? requestedOwners : [fallbackOwner];
  const owner = owners[0] || fallbackOwner;
  const employee = settings.employees.find((item) => item.name === owner);
  const priority = patch.priority || 'Medium';

  return createCityRoutingRules({
    category,
    owner,
    owners,
    department: patch.department || employee?.department || settings.departments.find((department) => department.active)?.name || 'Customer Service',
    escalation: patch.escalation || employee?.manager || getEscalationTarget(owner),
    priority,
    slaHours: patch.slaHours || PRIORITY_SLA[priority].hours,
    active: patch.active ?? true,
  });
}

function nextRoutingCategoryName(rules: RoutingRuleSetting[]): string {
  const existing = new Set(rules.map((rule) => rule.category));
  let index = 1;
  while (existing.has(index === 1 ? 'New Routing Row' : `New Routing Row ${index}`)) index += 1;
  return index === 1 ? 'New Routing Row' : `New Routing Row ${index}`;
}

const SettingsPanel: React.FC<{ userEmail: string; accessRole: string }> = ({ userEmail, accessRole }) => {
  const [settings, setSettings] = useState<RoutingSettings>(() => collapseCategoryRouting(defaultRoutingSettings()));
  const [activeSection, setActiveSection] = useState<'overview' | 'routing' | 'team' | 'catalog'>('overview');
  const [employeeQuery, setEmployeeQuery] = useState('');
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
  const categoryRoutingRows = useMemo(() => {
    const categoryOrder = new Map(Object.keys(CATEGORIES).map((category, index) => [category, index]));
    return buildCategoryRoutingRows(settings.routingRules, EMPTY_ROUTING_FILTERS).sort((a, b) => (
      (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER) ||
      a.category.localeCompare(b.category)
    ));
  }, [settings.routingRules]);
  const activeRoutingRules = useMemo(() => settings.routingRules.filter((rule) => isCityRoutingRule(rule) && rule.active).length, [settings.routingRules]);
  const pausedRoutingRules = useMemo(() => settings.routingRules.filter((rule) => isCityRoutingRule(rule) && !rule.active).length, [settings.routingRules]);
  const escalationsConfigured = useMemo(
    () => settings.routingRules.filter((rule) => isCityRoutingRule(rule) && Boolean(rule.escalation)).length,
    [settings.routingRules]
  );
  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    return settings.employees.filter((employee) => {
      if (!query) return true;
      return [employee.name, employee.email, employee.department, employee.role, employee.location, employee.manager]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [employeeQuery, settings.employees]);
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

  const updateCategoryRow = (row: CategoryRoutingRow, patch: Partial<RoutingRuleSetting>) => {
    setSettings((current) => {
      const targetIds = new Set(
        current.routingRules
          .filter((rule) => (
            patch.category
              ? rule.category === row.category && !rule.subCategory
              : row.ruleIds.includes(rule.id)
          ))
          .map((rule) => rule.id)
      );

      if (targetIds.size === 0) {
        return {
          ...current,
          routingRules: [...createRoutingCategoryRules(current, row.category, patch), ...current.routingRules],
        };
      }

      return {
        ...current,
        routingRules: current.routingRules.map((rule) => (
          targetIds.has(rule.id) ? applyRoutingRulePatch(rule, patch, current.employees) : rule
        )),
      };
    });
  };

  const updateCategoryScope = (category: string, scope: RoutingScopeKey, patch: Partial<RoutingRuleSetting>) => {
    setSettings((current) => {
      const targetIds = new Set(
        current.routingRules
          .filter((rule) => rule.category === category && !rule.subCategory && routingScopeKey(rule) === scope)
          .map((rule) => rule.id)
      );

      if (targetIds.size === 0) {
        return {
          ...current,
          routingRules: [createRoutingScopeRule(current, category, scope, patch), ...current.routingRules],
        };
      }

      return {
        ...current,
        routingRules: current.routingRules.map((rule) => (
          targetIds.has(rule.id) ? applyRoutingRulePatch(rule, patch, current.employees) : rule
        )),
      };
    });
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

  const deleteCategoryRow = (category: string) => {
    setSettings((current) => ({
      ...current,
      routingRules: deleteCategoryRoutingRules(current.routingRules, category),
    }));
    setStatus(`Deleted ${category} routing entries in memory. Save settings to sync Supabase.`);
  };

  const deleteEmployee = (id: string) => {
    setSettings((current) => ({
      ...current,
      employees: current.employees.filter((employee) => employee.id !== id),
    }));
    setStatus('Employee entry deleted in memory. Save settings to sync Supabase.');
  };

  const deleteDepartment = (id: string) => {
    setSettings((current) => ({
      ...current,
      departments: current.departments.filter((department) => department.id !== id),
    }));
    setStatus('Department entry deleted in memory. Save settings to sync Supabase.');
  };

  const deleteLocation = (id: string) => {
    setSettings((current) => ({
      ...current,
      locations: current.locations.filter((location) => location.id !== id),
    }));
    setStatus('Location entry deleted in memory. Save settings to sync Supabase.');
  };

  const addRule = () => {
    setSettings((current) => ({
      ...current,
      routingRules: [...createRoutingCategoryRules(current, nextRoutingCategoryName(current.routingRules), {}), ...current.routingRules],
    }));
    setStatus('New city routing row added in memory. Save settings to sync Supabase.');
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

  const resetDefaults = () => {
    setSettings(collapseCategoryRouting(defaultRoutingSettings()));
    setStatus('Default routing restored in memory. Review and save settings to sync Supabase.');
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
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Signed in</div>
              <div className="mt-1 truncate text-sm font-semibold text-stone-900">{userEmail}</div>
              <div className={`mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${isAdmin ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                {isAdmin ? 'Admin access' : 'Support read-only'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SmallButton onClick={save} disabled={!isAdmin || saving}>{saving ? 'Saving...' : 'Save settings'}</SmallButton>
              {isAdmin && <SmallButton variant="outline" onClick={resetDefaults}>Reset defaults</SmallButton>}
            </div>
          </div>
          <div className="grid border-b border-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['overview', 'Overview', 'Health snapshot'],
              ['routing', 'Routing Rules', `${categoryRoutingRows.length} categories`],
              ['team', 'Team Directory', `${settings.employees.length} people`],
              ['catalog', 'Departments & Locations', `${settings.departments.length + settings.locations.length} entries`],
            ].map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key as typeof activeSection)}
                className={`border-r border-slate-200 px-4 py-3 text-left transition last:border-r-0 ${activeSection === key ? 'bg-blue-50 text-blue-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="text-sm font-semibold">{label}</div>
                <div className="mt-0.5 text-xs opacity-70">{count}</div>
              </button>
            ))}
          </div>
          {status && <div className="px-4 py-3 text-xs font-semibold text-slate-600">{status}</div>}
        </div>

        <div className="min-w-0">
          {activeSection === 'overview' && (
            <SettingsSection title="Settings Overview">
              <SettingsTable headers={['Area', 'Current State', 'What It Controls', 'Recommended Action']} minWidth="min-w-[980px]">
                <tr className="border-b border-slate-100 last:border-b-0">
                  <SettingsTd>Routing coverage</SettingsTd>
                  <SettingsTd className="font-semibold text-slate-900">{categoryRoutingRows.length} categories configured</SettingsTd>
                  <SettingsTd>Owner assignment for new intake tickets by category and city</SettingsTd>
                  <SettingsTd>Review top 10 high-volume categories monthly</SettingsTd>
                </tr>
                <tr className="border-b border-slate-100 last:border-b-0">
                  <SettingsTd>Active routing rules</SettingsTd>
                  <SettingsTd className="font-semibold text-slate-900">{activeRoutingRules} active / {pausedRoutingRules} paused</SettingsTd>
                  <SettingsTd>Whether each routing rule can be used for assignment</SettingsTd>
                  <SettingsTd>Pause only temporary exceptions and keep active defaults</SettingsTd>
                </tr>
                <tr className="border-b border-slate-100 last:border-b-0">
                  <SettingsTd>Escalation paths</SettingsTd>
                  <SettingsTd className="font-semibold text-slate-900">{escalationsConfigured} rules have escalation owners</SettingsTd>
                  <SettingsTd>Who gets escalated tickets when SLAs are at risk or breached</SettingsTd>
                  <SettingsTd>Ensure every active rule has an escalation owner</SettingsTd>
                </tr>
                <tr>
                  <SettingsTd>Directory readiness</SettingsTd>
                  <SettingsTd className="font-semibold text-slate-900">{employeeNames.length} active owners across {departments.length} departments</SettingsTd>
                  <SettingsTd>Owner lists, reporting structure, and routing options</SettingsTd>
                  <SettingsTd>Keep manager and location fields updated for all active team members</SettingsTd>
                </tr>
              </SettingsTable>
            </SettingsSection>
          )}

          {activeSection === 'routing' && (
            <SettingsSection
              title="Issue Owner Routing"
              action={isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <SmallButton onClick={applyPresets}>Apply P57 presets</SmallButton>
                  <SmallButton variant="outline" onClick={resetDefaults}>Reset defaults</SmallButton>
                  <SmallButton onClick={addRule}>Add row</SmallButton>
                </div>
              ) : null}
            >
              <SettingsTable
                headers={['Category', 'Mumbai routing', 'Mumbai escalation', 'Bengaluru routing', 'Bengaluru escalation', 'Department', 'Priority', 'SLA', 'Active', 'Actions']}
                minWidth="min-w-[1740px]"
              >
                {categoryRoutingRows.slice(0, 160).map((row) => (
                  <tr key={row.category} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50/70">
                    <SettingsTd className="w-[220px]">
                      <SettingsInput disabled={!isAdmin} value={row.category} onChange={(category) => updateCategoryRow(row, { category })} />
                      <div className="mt-1 text-[10px] font-semibold text-slate-400">
                        {row.ruleIds.length} city rule{row.ruleIds.length === 1 ? '' : 's'}
                      </div>
                    </SettingsTd>
                    <SettingsTd className="w-[280px]">
                      <RoutingOwnersCell disabled={!isAdmin} scope={row.mumbai} employeeNames={employeeNames} onChange={(owners) => updateCategoryScope(row.category, 'mumbai', { owners, owner: owners[0] })} />
                    </SettingsTd>
                    <SettingsTd className="w-[210px]">
                      <SettingsSelect disabled={!isAdmin} value={row.mumbai.escalation} values={selectValues(row.mumbai.escalation, employeeNames)} onChange={(escalation) => updateCategoryScope(row.category, 'mumbai', { escalation })} />
                      {row.mumbai.mixed.escalation && <SettingsMixedHint />}
                    </SettingsTd>
                    <SettingsTd className="w-[280px]">
                      <RoutingOwnersCell disabled={!isAdmin} scope={row.bengaluru} employeeNames={employeeNames} onChange={(owners) => updateCategoryScope(row.category, 'bengaluru', { owners, owner: owners[0] })} />
                    </SettingsTd>
                    <SettingsTd className="w-[210px]">
                      <SettingsSelect disabled={!isAdmin} value={row.bengaluru.escalation} values={selectValues(row.bengaluru.escalation, employeeNames)} onChange={(escalation) => updateCategoryScope(row.category, 'bengaluru', { escalation })} />
                      {row.bengaluru.mixed.escalation && <SettingsMixedHint />}
                    </SettingsTd>
                    <SettingsTd className="w-[190px]">
                      <SettingsSelect disabled={!isAdmin} value={row.summary.department} values={selectValues(row.summary.department, departments)} onChange={(department) => updateCategoryRow(row, { department })} />
                      {row.summary.mixed.department && <SettingsMixedHint />}
                    </SettingsTd>
                    <SettingsTd className="w-[140px]">
                      <SettingsSelect disabled={!isAdmin} value={row.summary.priority} values={Object.keys(PRIORITY_SLA)} onChange={(priority) => updateCategoryRow(row, { priority: priority as RoutingRuleSetting['priority'] })} />
                      {row.summary.mixed.priority && <SettingsMixedHint />}
                    </SettingsTd>
                    <SettingsTd className="w-[100px]">
                      <SettingsInput disabled={!isAdmin} value={String(row.summary.slaHours)} onChange={(slaHours) => updateCategoryRow(row, { slaHours: Number(slaHours) || row.summary.slaHours })} />
                      {row.summary.mixed.slaHours && <SettingsMixedHint />}
                    </SettingsTd>
                    <SettingsTd className="w-[90px]">
                      <SettingsCheckbox disabled={!isAdmin} checked={row.summary.active} onChange={(active) => updateCategoryRow(row, { active })} />
                      {row.summary.mixed.active && <SettingsMixedHint />}
                    </SettingsTd>
                    <SettingsTd className="w-[110px]">
                      <SmallButton disabled={!isAdmin} variant="danger" onClick={() => deleteCategoryRow(row.category)}>Delete row</SmallButton>
                    </SettingsTd>
                  </tr>
                ))}
                {categoryRoutingRows.length === 0 && (
                  <SettingsEmptyRow colSpan={10}>No category routing rows match the current filters.</SettingsEmptyRow>
                )}
              </SettingsTable>
            </SettingsSection>
          )}

          {activeSection === 'team' && (
            <SettingsSection title="Employee Directory" action={isAdmin ? <SmallButton onClick={addEmployee}>Add employee</SmallButton> : null}>
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <SettingsInput label="Search employees" value={employeeQuery} onChange={setEmployeeQuery} />
              </div>
              <SettingsTable
                headers={['Name', 'Email', 'Department', 'Manager', 'Role', 'Location', 'Active', 'Actions']}
                minWidth="min-w-[1290px]"
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
                    <SettingsTd className="w-[110px]">
                      <SmallButton disabled={!isAdmin} variant="danger" onClick={() => deleteEmployee(employee.id)}>Delete</SmallButton>
                    </SettingsTd>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <SettingsEmptyRow colSpan={8}>No employees match the current filters.</SettingsEmptyRow>
                )}
              </SettingsTable>
            </SettingsSection>
          )}

          {activeSection === 'catalog' && (
            <SettingsSection title="Departments & Locations">
              <div className="mb-4 flex flex-wrap gap-2">
                {isAdmin && <SmallButton onClick={addDepartment}>Add department</SmallButton>}
                {isAdmin && <SmallButton onClick={addLocation}>Add location</SmallButton>}
              </div>
              <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <SettingsInput label="Search departments" value={departmentQuery} onChange={setDepartmentQuery} />
              </div>
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <SettingsInput label="Search locations" value={locationQuery} onChange={setLocationQuery} />
              </div>
              <SettingsList items={filteredDepartments} disabled={!isAdmin} onChange={updateDepartment} onDelete={deleteDepartment} />
              <div className="mt-5">
              <SettingsTable
                headers={['Studio / Location', 'City', 'Active', 'Actions']}
                minWidth="min-w-[790px]"
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
                    <SettingsTd className="w-[110px]">
                      <SmallButton disabled={!isAdmin} variant="danger" onClick={() => deleteLocation(location.id)}>Delete</SmallButton>
                    </SettingsTd>
                  </tr>
                ))}
                {filteredLocations.length === 0 && (
                  <SettingsEmptyRow colSpan={4}>No locations match the current search.</SettingsEmptyRow>
                )}
              </SettingsTable>
              </div>
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
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left ${minWidth}`}>
        <thead className="bg-slate-100/90">
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`} scope="col" className="border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
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

const SettingsMixedHint: React.FC = () => (
  <div className="mt-1 text-[10px] font-semibold text-amber-700">Mixed values in this category</div>
);

const RoutingOwnersCell: React.FC<{
  scope: RoutingScopeSummary;
  employeeNames: string[];
  disabled: boolean;
  onChange: (owners: string[]) => void;
}> = ({ scope, employeeNames, disabled, onChange }) => (
  <div>
    <SettingsMultiSelect
      disabled={disabled}
      values={employeeNames}
      selected={scope.owners}
      emptyText={`No ${scope.label.toLowerCase()} rule`}
      inline
      onChange={onChange}
    />
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-slate-400">
      <span>{scope.ruleIds.length ? `${scope.ruleIds.length} rule${scope.ruleIds.length === 1 ? '' : 's'}` : 'Create on owner add'}</span>
      {scope.locations.length > 0 && <span>{scope.locations.join(', ')}</span>}
      {scope.mixed.owners && <span className="text-amber-700">Mixed pools</span>}
    </div>
  </div>
);

const SmallButton: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean; variant?: 'primary' | 'outline' | 'danger' | 'success' }> = ({ onClick, children, disabled, variant = 'primary' }) => {
  const classes = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  }[variant];

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-md px-3 py-2 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${classes}`}>
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
      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
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
      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-500"
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
  const filtered = normalizedValues.filter((value) => value.toLowerCase().includes(query.toLowerCase())).slice(0, compact ? 4 : 18);
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
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
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
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-400"
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
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
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
          className="mb-2 h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100"
        />
        <div className={`grid gap-1 overflow-y-auto ${compact ? 'max-h-20' : 'max-h-36 sm:grid-cols-2'}`}>
          {filtered.map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(value)}
              className={`rounded-md px-2 py-1.5 text-left text-[11px] font-semibold transition ${selectedSet.has(value) ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 hover:bg-blue-50'} disabled:cursor-default disabled:opacity-60`}
            >
              {value}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-md bg-white px-2 py-2 text-[11px] font-semibold text-slate-400">No matching options</div>
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

const SettingsList: React.FC<{
  items: DepartmentSetting[];
  disabled: boolean;
  onChange: (id: string, patch: Partial<DepartmentSetting>) => void;
  onDelete: (id: string) => void;
}> = ({ items, disabled, onChange, onDelete }) => (
  <SettingsTable
    headers={['Department', 'Description', 'Active', 'Actions']}
    minWidth="min-w-[870px]"
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
        <SettingsTd className="w-[110px]">
          <SmallButton disabled={disabled} variant="danger" onClick={() => onDelete(item.id)}>Delete</SmallButton>
        </SettingsTd>
      </tr>
    ))}
    {items.length === 0 && (
      <SettingsEmptyRow colSpan={4}>No departments match the current search.</SettingsEmptyRow>
    )}
  </SettingsTable>
);

export default AppLayout;
