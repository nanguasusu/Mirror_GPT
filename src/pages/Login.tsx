import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";

type ConversationPayload = {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    imageDataUrl?: string;
  }>;
  model: string;
  mode: "chat" | "code" | "translate" | "writing" | "research";
  updatedAt: string;
};

type SessionPayload = {
  authenticated: boolean;
  username: string;
};

type LoginPayload = {
  ok?: boolean;
  error?: string;
  username?: string;
  conversation?: ConversationPayload;
  conversations?: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
  activeConversationId?: string;
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo123456");
  const [loginError, setLoginError] = useState("");
  const from = (location.state as { from?: string } | null)?.from || "/";

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/session");
        const data = (await response.json()) as SessionPayload;
        setUsername(data.username || "demo");
        if (data.authenticated) {
          navigate(from, { replace: true });
          return;
        }
      } catch {
        setLoginError("Unable to load session.");
      } finally {
        setCheckingSession(false);
      }
    };

    void loadSession();
  }, [from, navigate]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json()) as LoginPayload;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Login failed.");
      }

      navigate(from, { replace: true });
    } catch (loginRequestError) {
      setLoginError(
        loginRequestError instanceof Error
          ? loginRequestError.message
          : "Login failed.",
      );
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.45)_45%,transparent_100%)]" />
      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-2">
        <section className="hidden rounded-3xl border border-white/70 bg-white/70 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur lg:block">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">AI Mirror</p>
              <p className="text-xs text-slate-500">Private Edge Workspace</p>
            </div>
          </div>
          <h2 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">
            Ship your own AI chat, secured by session login.
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This demo runs on Cloudflare Pages Functions with fixed credentials, model switching,
            and cloud-saved conversations.
          </p>
          <div className="mt-8 space-y-3">
            <Feature text="Cookie-based session authentication" />
            <Feature text="Multi-conversation cloud history (KV)" />
            <Feature text="Streaming responses + image input" />
          </div>
        </section>

        <form
          onSubmit={handleLogin}
          className="rounded-3xl border border-white/80 bg-white/90 px-6 py-7 shadow-[0_20px_60px_rgba(15,23,42,0.14)] backdrop-blur sm:px-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Lock className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
              <p className="text-sm text-slate-500">Access your conversation workspace</p>
            </div>
          </div>

          <div className="space-y-3">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-offset-2 transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
              placeholder="Username"
              disabled={checkingSession}
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-offset-2 transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
              placeholder="Password"
              disabled={checkingSession}
            />
          </div>

          {loginError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loginError}
            </div>
          )}

          <Button
            type="submit"
            className="mt-5 h-11 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
            disabled={checkingSession}
          >
            {checkingSession ? "Loading..." : "Sign in"}
          </Button>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Credentials come from `DEMO_USERNAME` and `DEMO_PASSWORD` in Cloudflare Pages environment variables.
          </p>
        </form>
      </div>
    </div>
  );
};

const Feature = ({ text }: { text: string }) => (
  <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
    <span>{text}</span>
  </div>
);

export default Login;
