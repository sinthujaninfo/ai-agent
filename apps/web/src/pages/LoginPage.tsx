import { FormEvent, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../auth";

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <p className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-moss-deep)] mb-2">
          AI Agent
        </p>
        <p className="text-[var(--color-moss)] mb-8 text-sm">
          Plan, retrieve, and act — with human approval when it matters.
        </p>
        <form onSubmit={onSubmit} className="space-y-4 border-t border-[var(--color-line)] pt-6">
          {mode === "register" && (
            <label className="block text-sm">
              Name
              <input
                className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-white/70 px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-white/70 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-white/70 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-[var(--color-clay)]">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-md bg-[var(--color-moss)] px-4 py-2.5 text-white font-medium hover:bg-[var(--color-moss-deep)] transition-colors disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-[var(--color-moss)] underline"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
        <p className="mt-8 text-xs text-[var(--color-moss)]/70">
          <Link to="/">Back</Link>
        </p>
      </div>
    </div>
  );
}
