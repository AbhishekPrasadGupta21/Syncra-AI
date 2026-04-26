import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";

function AuthCallback() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { handleCallback } = useAuth();
  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    const token = params.get("token");
    if (token) {
      handleCallback(token).then((u) => {
        navigate(u ? "/dashboard" : "/login?error=session_failed", { replace: true });
      });
    } else {
      navigate("/login?error=no_token", { replace: true });
    }
    // eslint-disable-next-line
  }, []);
  return (
    <div className="h-screen flex items-center justify-center text-muted-foreground">
      Signing you in…
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Public><LoginPage /></Public>} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
