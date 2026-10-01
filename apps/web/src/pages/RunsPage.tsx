import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import { Shell } from "./ProjectsPage";

interface RunRow {
  id: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  conversation_id: string;
  error?: string | null;
}

export function RunsPage() {
  const { projectId = "" } = useParams();
  const { user, logout } = useAuth();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [selected, setSelected] = useState<unknown>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [runData, audit] = await Promise.all([
        api<{ runs: RunRow[] }>(`/agent/runs?projectId=${projectId}`),
        api<{ logs: unknown[] }>("/audit-logs"),
      ]);
      setRuns(runData.runs);
      setLogs(audit.logs);
    })().catch(console.error);
  }, [projectId, user]);

  if (!user) return <Navigate to="/login" replace />;

  async function openRun(runId: string) {
    const data = await api<{ run: unknown }>(`/agent/runs/${runId}`);
    setSelected(data.run);
  }

  return (
    <Shell userEmail={user.email} onLogout={logout} projectId={projectId}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl mb-2">Runs & audit</h1>
      <p className="text-sm text-[var(--color-moss)] mb-6">Agent run history and recent audit events.</p>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium mb-2">Agent runs</h2>
          <ul className="space-y-2 text-sm max-h-[60vh] overflow-auto">
            {runs.map((r) => (
              <li key={r.id} className="border-b border-[var(--color-line)] pb-2">
                <button className="text-left w-full hover:text-[var(--color-moss)]" onClick={() => openRun(r.id)}>
                  <span className="font-medium">{r.status}</span>
                  <span className="block text-xs text-[var(--color-moss)]">
                    {r.id.slice(0, 8)}… · {new Date(r.started_at).toLocaleString()}
                  </span>
                  {r.error && <span className="block text-xs text-[var(--color-clay)]">{r.error}</span>}
                </button>
              </li>
            ))}
            {runs.length === 0 && <li className="text-sm text-[var(--color-moss)]">No runs yet.</li>}
          </ul>
          {selected != null && (
            <pre className="mt-4 text-xs bg-white/70 p-3 rounded-md overflow-auto max-h-[40vh]">
              {JSON.stringify(selected, null, 2)}
            </pre>
          )}
        </div>
        <div>
          <h2 className="text-sm font-medium mb-2">Audit log</h2>
          <ul className="space-y-2 text-xs max-h-[60vh] overflow-auto">
            {logs.map((l, i) => (
              <li key={i} className="border-b border-[var(--color-line)] pb-2">
                <pre className="whitespace-pre-wrap">{JSON.stringify(l, null, 2)}</pre>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
