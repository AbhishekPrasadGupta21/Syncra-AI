import { useMemo, useState } from "react";
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
      .slice(0, 4);
  }, [tasks]);

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

      <div className="px-3 py-2 grid grid-cols-7 gap-1 text-center text-[9px] mono uppercase tracking-wider text-muted-foreground shrink-0">
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="px-3 grid grid-cols-7 gap-1 shrink-0">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const ev = eventsByDay[k] || [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const today = isSameDay(d, new Date());
          return (
            <div
              key={k}
              className={`aspect-square rounded-sm border text-[10px] flex flex-col items-center justify-start py-1 relative
                ${inMonth ? "bg-card" : "bg-transparent text-muted-foreground/40"}
                ${today ? "ring-1 ring-blue-500" : "border-border/60"}`}
              data-testid={`cal-day-${k}`}
            >
              <span className={`mono ${today ? "text-blue-500 font-bold" : ""}`}>{format(d, "d")}</span>
              <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                {ev.slice(0, 3).map((e) => (
                  <span key={e.id} className={`h-1 w-1 rounded-full ${TYPE_COLOR[e.type] || TYPE_COLOR.task}`} title={e.title}/>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t mt-2 shrink-0">
        <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground mb-1">Upcoming</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-1.5">
        {upcoming.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nothing scheduled.</div>
        ) : upcoming.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-xs py-1" data-testid={`upcoming-${t.id}`}>
            <span className={`h-2 w-2 rounded-full ${TYPE_COLOR[t.type] || TYPE_COLOR.task}`} />
            <span className="font-medium truncate flex-1">{t.title}</span>
            <span className="mono text-muted-foreground shrink-0">{format(new Date(t.deadline), "MMM d HH:mm")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
