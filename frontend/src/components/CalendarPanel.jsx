import { useMemo, useState } from "react";
import {
  format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, addMonths, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";

const TYPE_COLOR = {
  meeting: "bg-blue-500",
  deadline: "bg-rose-500",
  task: "bg-purple-500",
};

export default function CalendarPanel({ tasks, expanded = false }) {
  const [cursor, setCursor] = useState(new Date());

  const eventsByDay = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (!t.deadline) return;
      const d = new Date(t.deadline);
      const k = format(d, "yyyy-MM-dd");
      (map[k] = map[k] || []).push(t);
    });
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return tasks
      .filter((t) => t.deadline && new Date(t.deadline) >= now && t.status === "pending")
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, expanded ? 12 : 4);
  }, [tasks, expanded]);

  const today = () => setCursor(new Date());

  // --- EXPANDED FULL VIEW ---
  if (expanded) {
    return (
      <div className="flex flex-col lg:flex-row h-full overflow-hidden" data-testid="calendar-panel">
        {/* Calendar grid area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
            <div className="flex items-baseline gap-3">
              <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">Calendar</div>
              <button onClick={today} className="text-[10px] mono uppercase tracking-wider text-blue-500 hover:underline" data-testid="cal-today-btn">Today</button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCursor(subMonths(cursor, 1))} data-testid="cal-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm mono w-28 text-center">{format(cursor, "MMM yyyy")}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCursor(addMonths(cursor, 1))} data-testid="cal-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Scrollable calendar body */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 sm:px-6 py-3 grid grid-cols-7 gap-px bg-border/40 rounded-md overflow-hidden border">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                <div key={d} className="bg-card text-center text-[10px] mono uppercase tracking-wider text-muted-foreground py-2">{d}</div>
              ))}
              {days.map((d) => {
                const k = format(d, "yyyy-MM-dd");
                const ev = eventsByDay[k] || [];
                const inMonth = d.getMonth() === cursor.getMonth();
                const isTd = isSameDay(d, new Date());
                return (
                  <div
                    key={k}
                    className={`bg-card min-h-[88px] sm:min-h-[110px] p-1.5 sm:p-2 flex flex-col gap-1 transition-colors hover:bg-muted/40
                      ${inMonth ? "" : "opacity-40"}`}
                    data-testid={`cal-day-${k}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs sm:text-sm mono ${isTd ? "h-6 w-6 rounded-full ai-gradient text-white flex items-center justify-center font-bold" : ""}`}>
                        {format(d, "d")}
                      </span>
                      {ev.length > 0 && (
                        <span className="text-[9px] mono text-muted-foreground">{ev.length}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {ev.slice(0, 3).map((e) => (
                        <div key={e.id} className="flex items-center gap-1 text-[10px] truncate" title={e.title}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${TYPE_COLOR[e.type] || TYPE_COLOR.task}`} />
                          <span className={`truncate ${e.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                            {e.title}
                          </span>
                        </div>
                      ))}
                      {ev.length > 3 && (
                        <div className="text-[9px] mono text-muted-foreground">+{ev.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="h-4" />
          </div>
        </div>

        {/* Upcoming sidebar */}
        <div className="lg:w-72 lg:border-l border-t lg:border-t-0 flex flex-col overflow-hidden shrink-0 max-h-[40vh] lg:max-h-none">
          <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">Upcoming</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {upcoming.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">Nothing scheduled.</div>
            ) : upcoming.map((t) => (
              <div key={t.id} className="rounded-md border p-2.5 bg-card hover:bg-muted/40 transition-colors" data-testid={`upcoming-${t.id}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${TYPE_COLOR[t.type] || TYPE_COLOR.task}`} />
                  <div className="text-sm font-medium truncate flex-1">{t.title}</div>
                </div>
                <div className="text-[10px] mono uppercase tracking-wider text-muted-foreground mt-1">
                  {format(new Date(t.deadline), "EEE MMM d · HH:mm")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- COMPACT VIEW (in bento right column) ---
  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="calendar-panel">
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">Calendar</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCursor(subMonths(cursor, 1))} data-testid="cal-prev">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs mono w-24 text-center">{format(cursor, "MMM yyyy")}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCursor(addMonths(cursor, 1))} data-testid="cal-next">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* The whole content scrolls vertically when it doesn't fit */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-2 grid grid-cols-7 gap-1 text-center text-[9px] mono uppercase tracking-wider text-muted-foreground">
          {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => <div key={d}>{d}</div>)}
        </div>

        <div className="px-3 grid grid-cols-7 gap-1 mt-1">
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const ev = eventsByDay[k] || [];
            const inMonth = d.getMonth() === cursor.getMonth();
            const isTd = isSameDay(d, new Date());
            return (
              <div
                key={k}
                className={`min-h-[36px] rounded-sm border text-[10px] flex flex-col items-center justify-start py-1 relative
                  ${inMonth ? "bg-card" : "bg-transparent text-muted-foreground/40"}
                  ${isTd ? "ring-1 ring-blue-500" : "border-border/60"}`}
                data-testid={`cal-day-${k}`}
              >
                <span className={`mono ${isTd ? "text-blue-500 font-bold" : ""}`}>{format(d, "d")}</span>
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {ev.slice(0, 3).map((e) => (
                    <span key={e.id} className={`h-1 w-1 rounded-full ${TYPE_COLOR[e.type] || TYPE_COLOR.task}`} title={e.title}/>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t mt-3">
          <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">Upcoming</div>
        </div>
        <div className="px-4 pb-3 space-y-1.5">
          {upcoming.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nothing scheduled.</div>
          ) : upcoming.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs py-1" data-testid={`upcoming-${t.id}`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${TYPE_COLOR[t.type] || TYPE_COLOR.task}`} />
              <span className="font-medium truncate flex-1">{t.title}</span>
              <span className="mono text-muted-foreground shrink-0">{format(new Date(t.deadline), "MMM d HH:mm")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
