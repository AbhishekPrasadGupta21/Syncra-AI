import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Sparkles, Plus, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { toast } from "sonner";

export default function EmailDetail({ email, onTaskCreated }) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    setFull(null);
    setSummary(null);
    if (!email?.id) return;
    setLoading(true);
    api.get(`/emails/${email.id}`)
      .then(({ data }) => setFull(data))
      .catch(() => toast.error("Could not load email body"))
      .finally(() => setLoading(false));
  }, [email?.id]);

  const onSummarize = async () => {
    if (!email?.id) return;
    setSummarizing(true);
    try {
      const { data } = await api.post(`/emails/${email.id}/summary`);
      setSummary(data.summary);
    } catch {
      toast.error("Summary failed");
    } finally {
      setSummarizing(false);
    }
  };

  const onConvert = async () => {
    if (!email?.id) return;
    setExtracting(true);
    try {
      const { data } = await api.post(`/emails/${email.id}/extract-tasks`);
      if (data.count === 0) toast.info("No actionable items detected");
      else toast.success(`${data.count} task${data.count > 1 ? "s" : ""} created`);
      onTaskCreated?.(data.tasks || []);
    } catch {
      toast.error("Could not extract tasks");
    } finally {
      setExtracting(false);
    }
  };

  if (!email) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <Mail className="h-10 w-10 opacity-25 mb-3" />
        <div className="text-sm">Select an email to begin.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="email-detail">
      <div className="px-6 py-4 border-b shrink-0">
        <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground mb-2">Email</div>
        <h2 className="text-lg font-semibold tracking-tight leading-snug" data-testid="email-subject">{email.subject}</h2>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{email.sender_name}</span>{" "}
            <span className="mono">&lt;{email.sender_email}&gt;</span>
          </span>
          <span className="mono text-muted-foreground">{format(new Date(email.timestamp), "MMM d, yyyy · HH:mm")}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-3 border-b shrink-0 bg-card/30">
        <Button
          size="sm" onClick={onSummarize} disabled={summarizing || loading}
          data-testid="summary-button"
          variant="outline"
          className="gap-2 transition-all duration-200 active:scale-[0.97]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="text-xs">{summarizing ? "Summarizing…" : "Quick Summary"}</span>
        </Button>
        <Button
          size="sm" onClick={onConvert} disabled={extracting || loading}
          data-testid="convert-task-btn"
          className="gap-2 ai-gradient text-white border-0 ai-glow transition-all duration-200 hover:scale-[1.02] active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{extracting ? "Extracting…" : "Convert to Task"}</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {summary && (
          <div className="rounded-md border p-4 relative overflow-hidden" data-testid="summary-card">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                <div className="text-[10px] mono uppercase tracking-[0.3em] text-muted-foreground">AI Summary</div>
              </div>
              <p className="text-sm leading-relaxed">{summary}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading email body…</div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90" data-testid="email-body">
            {full?.body || email.snippet || "(empty)"}
          </pre>
        )}
      </div>
    </div>
  );
}
