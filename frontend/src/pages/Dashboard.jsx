import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { Inbox, CheckCircle2, Calendar as CalIcon, LogOut, Sun, Moon, RefreshCw, Settings as SettingsIcon, Bell, Trash2, Plus, AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { LOGO_URL, APP_NAME, greeting } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import EmailDetail from "@/components/EmailDetail";
import TaskPanel from "@/components/TaskPanel";
import CalendarPanel from "@/components/CalendarPanel";

const POLL_MS = 60000;
const MAX_NOTIFS = 30;

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [emails, setEmails] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState("inbox"); // inbox | tasks | calendar
  const [notifications, setNotifications] = useState([]);
  const seededRef = useRef(false);

  const pushNotification = useCallback((kind, title, meta = {}) => {
    setNotifications((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, title, time: new Date().toISOString(), read: false, ...meta },
      ...prev,
    ].slice(0, MAX_NOTIFS));
  }, []);

  const loadEmails = useCallback(async (silent = false) => {
    if (!silent) setLoadingEmails(true);
    setRefreshing(true);
    try {
      const { data } = await api.get("/emails", { params: { max_results: 40, include_spam: true } });
      setEmails((prev) => {
        if (silent && seededRef.current) {
          const known = new Set(prev.map((e) => e.id));
          const newImportant = (data || []).filter((e) => !known.has(e.id) && e.classification === "important");
          newImportant.slice(0, 3).forEach((e) => {
            pushNotification("email", `Important email from ${e.sender_name || e.sender_email}`, { subject: e.subject });
            toast.message(`New important: ${e.subject}`);
          });
        }
        return data || [];
      });
      if (!selectedId && data && data.length) setSelectedId(data[0].id);
      seededRef.current = true;
    } catch (e) {
      if (!silent) toast.error("Failed to load emails");
    } finally {
      setLoadingEmails(false);
      setRefreshing(false);
    }
  }, [selectedId, pushNotification]);

  const loadTasks = useCallback(async () => {
    try {
      const [{ data: t }, { data: s }] = await Promise.all([
        api.get("/tasks"),
        api.get("/stats"),
      ]);
      setTasks(t || []);
      setStats(s || { total: 0, completed: 0, pending: 0 });
    } catch {}
  }, []);

  useEffect(() => { loadEmails(); loadTasks(); }, []); // eslint-disable-line
  useEffect(() => {
    const id = setInterval(() => loadEmails(true), POLL_MS);
    return () => clearInterval(id);
  }, [loadEmails]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      tasks.forEach((t) => {
        if (t.status !== "pending" || !t.deadline) return;
        const diff = new Date(t.deadline).getTime() - now;
        const key = `notif-${t.id}-1h`;
        if (diff > 0 && diff < 60 * 60 * 1000 && !sessionStorage.getItem(key)) {
          toast.warning(`Due in <1h: ${t.title}`, { duration: 8000 });
          pushNotification("deadline", `Due in <1h: ${t.title}`, { taskId: t.id });
          sessionStorage.setItem(key, "1");
        }
      });
    }, 60000);
    return () => clearInterval(id);
  }, [tasks, pushNotification]);

  const filteredEmails = useMemo(() => {
    if (filter === "all") return emails;
    return emails.filter((e) => e.classification === filter);
  }, [emails, filter]);

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedId) || null,
    [emails, selectedId]
  );

  const onTaskCreated = (newTasks) => {
    setTasks((prev) => [...newTasks, ...prev]);
    loadTasks();
    (newTasks || []).forEach((t) =>
      pushNotification("task_created", `Task created: ${t.title}`, { taskId: t.id })
    );
  };

  const unread = notifications.filter((n) => !n.read).length;

  const markAllRead = () => setNotifications((p) => p.map((n) => ({ ...n, read: true })));
  const clearNotifs = () => setNotifications([]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" data-testid="dashboard">
      {/* Sidebar */}
      <aside className="w-16 flex-shrink-0 border-r bg-card/40 flex flex-col items-center py-4 gap-2">
        <img src={LOGO_URL} alt="Syncra" className="h-9 w-9 object-contain rounded" data-testid="sidebar-logo"/>
        <div className="h-px w-8 bg-border my-2" />
        <NavBtn icon={<Inbox className="h-4 w-4" />} label="Inbox" active={view === "inbox"} onClick={() => setView("inbox")} testid="nav-inbox" />
        <NavBtn icon={<CheckCircle2 className="h-4 w-4" />} label="Tasks" active={view === "tasks"} onClick={() => setView("tasks")} testid="nav-tasks" />
        <NavBtn icon={<CalIcon className="h-4 w-4" />} label="Calendar" active={view === "calendar"} onClick={() => setView("calendar")} testid="nav-calendar" />
        <div className="flex-1" />

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" data-testid="notifications-button" title="Notifications">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span
                  data-testid="notif-badge"
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full ai-gradient text-[9px] mono font-bold text-white flex items-center justify-center"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-80 p-0" data-testid="notifications-panel">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">Notifications</div>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <>
                    <button onClick={markAllRead} className="text-[10px] mono uppercase tracking-wider text-muted-foreground hover:text-foreground" data-testid="notif-mark-read">Mark read</button>
                    <button onClick={clearNotifs} className="text-[10px] mono uppercase tracking-wider text-muted-foreground hover:text-foreground" data-testid="notif-clear">Clear</button>
                  </>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-xs text-muted-foreground text-center flex flex-col items-center gap-2">
                  <Bell className="h-6 w-6 opacity-30" />
                  No notifications yet.
                </div>
              ) : notifications.map((n, i) => <NotifRow key={n.id} n={n} index={i} />)}
            </div>
          </PopoverContent>
        </Popover>

        {/* Settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="settings-button" title="Settings">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-72 p-0" data-testid="settings-panel">
            <div className="px-4 py-3 border-b">
              <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">Settings</div>
              <div className="text-sm font-medium truncate mt-1">{user?.name || user?.email}</div>
              <div className="text-[10px] mono text-muted-foreground truncate">{user?.email}</div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between border-b">
              <div className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                <span className="text-sm">Dark mode</span>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={toggle}
                data-testid="theme-toggle"
              />
            </div>
            <button
              onClick={logout}
              data-testid="logout-button"
              className="w-full px-4 py-3 flex items-center gap-2 text-sm text-rose-500 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </PopoverContent>
        </Popover>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center px-6 border-b shrink-0 justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="h-9 w-9 rounded-full border" />
            ) : (
              <div className="h-9 w-9 rounded-full ai-gradient text-white flex items-center justify-center text-sm font-bold">
                {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-semibold tracking-tight truncate" data-testid="greeting">
                {greeting(user?.name || user?.email)}
              </div>
              <div className="text-[11px] mono text-muted-foreground uppercase tracking-[0.2em] truncate">
                {view === "inbox" ? "Inbox · Tasks · Calendar" : view === "tasks" ? "All Tasks" : "Calendar View"}
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Stat label="TOTAL" value={stats.total} testid="stat-total"/>
            <Stat label="PENDING" value={stats.pending} highlight testid="stat-pending"/>
            <Stat label="DONE" value={stats.completed} testid="stat-completed"/>
            <Button
              variant="outline" size="sm"
              onClick={() => { loadEmails(); loadTasks(); }}
              data-testid="refresh-button"
              className="ml-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              <span className="text-xs mono">SYNC</span>
            </Button>
          </div>
        </header>

        {/* Content panes */}
        {view === "inbox" && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
            {/* Email list */}
            <section className="md:col-span-3 border-r flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b">
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList className="grid grid-cols-4 h-8 w-full">
                    <TabsTrigger value="all" className="text-[10px] mono uppercase tracking-wider" data-testid="filter-all">All</TabsTrigger>
                    <TabsTrigger value="important" className="text-[10px] mono uppercase tracking-wider" data-testid="filter-important">Imp</TabsTrigger>
                    <TabsTrigger value="normal" className="text-[10px] mono uppercase tracking-wider" data-testid="filter-normal">Norm</TabsTrigger>
                    <TabsTrigger value="spam" className="text-[10px] mono uppercase tracking-wider" data-testid="filter-spam">Spam</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex-1 overflow-y-auto" data-testid="email-list">
                {loadingEmails ? (
                  <div className="p-6 text-sm text-muted-foreground">Loading inbox…</div>
                ) : filteredEmails.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground flex flex-col items-center text-center gap-2">
                    <Inbox className="h-8 w-8 opacity-30" />
                    No emails in this view.
                  </div>
                ) : filteredEmails.map((e, i) => (
                  <button
                    key={e.id}
                    data-testid={`email-item-${i}`}
                    onClick={() => setSelectedId(e.id)}
                    className={`w-full text-left px-3 py-3 border-b border-border/60 hover:bg-muted/40 transition-colors duration-150 ${selectedId === e.id ? "email-row-active" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-sm truncate ${e.is_unread ? "font-semibold" : "font-medium"}`}>
                        {e.sender_name || e.sender_email || "(unknown)"}
                      </span>
                      <span className="text-[10px] mono text-muted-foreground shrink-0">{fmtTime(e.timestamp)}</span>
                    </div>
                    <div className="text-sm truncate mb-1">{e.subject}</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground truncate flex-1">{e.snippet}</div>
                      <ClassificationBadge type={e.classification} />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Email detail */}
            <section className="md:col-span-5 border-r flex flex-col overflow-hidden">
              <EmailDetail email={selectedEmail} onTaskCreated={onTaskCreated} />
            </section>

            {/* Tasks + Calendar */}
            <section className="md:col-span-4 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 border-b overflow-hidden">
                <TaskPanel tasks={tasks} setTasks={setTasks} reload={loadTasks} onNotify={pushNotification} />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <CalendarPanel tasks={tasks} />
              </div>
            </section>
          </div>
        )}

        {view === "tasks" && (
          <div className="flex-1 overflow-hidden">
            <TaskPanel tasks={tasks} setTasks={setTasks} reload={loadTasks} onNotify={pushNotification} expanded />
          </div>
        )}

        {view === "calendar" && (
          <div className="flex-1 overflow-hidden">
            <CalendarPanel tasks={tasks} expanded />
          </div>
        )}
      </main>
    </div>
  );
}

function NavBtn({ icon, active, label, onClick, testid }) {
  return (
    <Button
      variant="ghost" size="icon"
      onClick={onClick} data-testid={testid} title={label}
      className={`relative transition-colors duration-200 ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon}
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 ai-gradient rounded-r" />}
    </Button>
  );
}

function Stat({ label, value, highlight, testid }) {
  return (
    <div className="flex items-baseline gap-1.5 px-3 py-1 rounded-md border bg-card" data-testid={testid}>
      <span className="text-[10px] mono uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className={`text-base font-bold mono ${highlight ? "ai-gradient-text" : ""}`}>{value}</span>
    </div>
  );
}

function ClassificationBadge({ type }) {
  if (type === "important") return <Badge className="text-[9px] mono uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500/15">IMP</Badge>;
  if (type === "spam") return <Badge className="text-[9px] mono uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/15">SPAM</Badge>;
  return <Badge className="text-[9px] mono uppercase tracking-wider bg-muted text-muted-foreground border border-border hover:bg-muted">NRM</Badge>;
}

function NotifRow({ n, index }) {
  const Icon = n.kind === "task_completed" ? CheckCircle2
    : n.kind === "task_created" ? Plus
    : n.kind === "deadline" ? AlertCircle
    : n.kind === "email" ? Inbox
    : Bell;
  const tone = n.kind === "task_completed" ? "text-emerald-500"
    : n.kind === "task_created" ? "text-blue-500"
    : n.kind === "deadline" ? "text-rose-500"
    : "text-muted-foreground";
  return (
    <div className={`px-4 py-3 border-b border-border/60 flex items-start gap-3 ${n.read ? "opacity-60" : ""}`} data-testid={`notif-item-${index}`}>
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug">{n.title}</div>
        <div className="text-[10px] mono uppercase tracking-wider text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(n.time), { addSuffix: true })}
        </div>
      </div>
      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5" />}
    </div>
  );
}
