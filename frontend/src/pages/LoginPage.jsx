import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { LOGO_URL, APP_NAME, TAGLINE } from "@/lib/brand";
import { toast } from "sonner";

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const err = params.get("error");
    if (err) toast.error(`Sign-in failed: ${err}`);
  }, [params]);

  const onClick = async () => {
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (e) {
      toast.error("Could not start Google sign-in");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-5 bg-background" data-testid="login-page">
      {/* Left brand pane */}
      <div className="hidden lg:flex lg:col-span-3 relative overflow-hidden border-r">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-background to-purple-600/20" />
        <div className="absolute inset-0 opacity-[0.04]"
             style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "24px 24px" }}/>
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Syncra AI" className="h-12 w-12 object-contain" />
            <div>
              <div className="text-xl font-bold tracking-tight">{APP_NAME}</div>
              <div className="text-xs text-muted-foreground mono">{TAGLINE}</div>
            </div>
          </div>

          <div className="max-w-xl space-y-6">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mono">v1.0 · Real-time Inbox AI</div>
            <h1 className="text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Your inbox, <br />
              <span className="ai-gradient-text">organized by intelligence.</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed max-w-md">
              Syncra AI reads your Gmail in real time, surfaces the messages that matter, and turns
              decisions, deadlines and meetings into structured tasks — automatically.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-md pt-4">
              {[
                ["LIVE GMAIL SYNC", "Polled every 60s"],
                ["AI TASK EXTRACTION", "Claude Sonnet 4.5"],
                ["SMART CALENDAR", "Meetings + deadlines"],
                ["ZERO STORED MAIL", "Privacy by default"],
              ].map(([k, v]) => (
                <div key={k} className="border rounded-md p-3 bg-card/40">
                  <div className="text-[10px] mono uppercase tracking-[0.2em] text-muted-foreground">{k}</div>
                  <div className="text-sm font-medium mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground mono">
            © {new Date().getFullYear()} {APP_NAME}
          </div>
        </div>
      </div>

      {/* Right login pane */}
      <div className="lg:col-span-2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <img src={LOGO_URL} alt="Syncra AI" className="h-10 w-10 object-contain" />
            <div className="text-lg font-bold">{APP_NAME}</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mono">Sign in</div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome back.</h2>
            <p className="text-sm text-muted-foreground">
              Connect your Google account to sync your Gmail and start turning emails into action.
            </p>
          </div>

          <Button
            data-testid="login-google-button"
            onClick={onClick}
            disabled={submitting}
            className="w-full h-12 bg-white hover:bg-white/90 text-slate-900 border border-slate-200 shadow-sm font-semibold transition-all duration-200 active:scale-[0.98]"
          >
            <GoogleIcon className="mr-2 h-5 w-5" />
            {submitting ? "Redirecting…" : "Continue with Google"}
          </Button>

          <div className="text-[11px] text-muted-foreground mono leading-relaxed">
            By continuing you grant Syncra AI read-only access to your Gmail metadata and content for
            classification and task extraction. Emails are never stored permanently.
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.7 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C40.8 35.7 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
