import { useState } from "react";
import { format, isPast } from "date-fns";
import { Trash2, Plus, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { toast } from "sonner";

const PRIORITY_DOT = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};

export default function TaskPanel({ tasks, setTasks, reload, onNotify, expanded = false }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", deadline: "", priority: "medium", type: "task" });

  const onToggle = async (t) => {
    const next = t.status === "completed" ? "pending" : "completed";
    try {
      const { data } = await api.patch(`/tasks/${t.id}`, { status: next });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? data : x)));
      reload?.();
      if (next === "completed") {
        toast.success(`Completed: ${t.title}`);
        onNotify?.("task_completed", `Task completed: ${t.title}`, { taskId: t.id });
      }
    } catch { toast.error("Update failed"); }
  };

  const onDelete = async (t) => {
    try {
      await api.delete(`/tasks/${t.id}`);
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
      reload?.();
    } catch { toast.error("Delete failed"); }
  };

  const onCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    try {
      const payload = { ...form };
      if (payload.deadline) payload.deadline = new Date(payload.deadline).toISOString();
      else payload.deadline = null;
      const { data } = await api.post("/tasks", payload);
      setTasks((p) => [data, ...p]);
      reload?.();
      setOpen(false);
      setForm({ title: "", description: "", deadline: "", priority: "medium", type: "task" });
      toast.success("Task created");
      onNotify?.("task_created", `Task created: ${data.title}`, { taskId: data.id });
    } catch { toast.error("Could not create task"); }
  };

  const sorted = [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === "completed" ? 1 : -1;
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return ad - bd;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="task-panel">
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">Tasks</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5" data-testid="add-task-button">
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs">New</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="new-task-title"/>
              <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} data-testid="new-task-deadline"/>
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger data-testid="new-task-priority"><SelectValue placeholder="Priority"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger data-testid="new-task-type"><SelectValue placeholder="Type"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onCreate} className="ai-gradient text-white border-0" data-testid="save-task-button">Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="h-8 w-8 opacity-30" />
            No tasks yet. Convert an email or add one.
          </div>
        ) : sorted.map((t, i) => {
          const overdue = t.deadline && t.status === "pending" && isPast(new Date(t.deadline));
          return (
            <div key={t.id} className="px-4 py-3 border-b border-border/60 group hover:bg-muted/40 transition-colors" data-testid={`task-item-${i}`}>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  checked={t.status === "completed"}
                  onCheckedChange={() => onToggle(t)}
                  data-testid={`task-checkbox-${i}`}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[t.priority] || PRIORITY_DOT.medium}`} />
                    <span className={`text-sm font-medium ${t.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </span>
                  </div>
                  {t.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] mono uppercase tracking-wider">
                    <span className="text-muted-foreground">{t.type}</span>
                    {t.deadline && (
                      <span className={`flex items-center gap-1 ${overdue ? "text-rose-500" : "text-muted-foreground"}`}>
                        {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {format(new Date(t.deadline), "MMM d HH:mm")}
                      </span>
                    )}
                    {t.source_email_id && <span className="text-blue-500">FROM EMAIL</span>}
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="opacity-0 group-hover:opacity-100 h-7 w-7"
                  onClick={() => onDelete(t)}
                  data-testid={`task-delete-${i}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
