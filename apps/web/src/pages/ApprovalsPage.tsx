import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import { Shell } from "./ProjectsPage";

interface Approval {
  id: string;
  tool: string;
  risk: string;
  input_json: unknown;
  requested_at: string;
}

export function ApprovalsPage() {
  const { projectId = "" } = useParams();
  const { user, logout } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);

  async function load() {
    const data = await api<{ approvals: Approval[] }>("/approvals?status=pending");
    setApprovals(data.approvals);
  }

  useEffect(() => {
    if (!user) return;
    load().catch(console.error);
  }, [user]);

  if (!user) return <Navigate to="/login" replace />;

  async function decide(id: string, decision: "approved" | "rejected") {
    await api(`/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    await load();
  }

  return (
    <Shell userEmail={user.email} onLogout={logout} projectId={projectId}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl mb-2">Approvals</h1>
      <p className="text-sm text-[var(--color-moss)] mb-6">Write and destructive tool calls pause here until you decide.</p>
      <ul className="space-y-4">
        {approvals.map((a) => (
          <li key={a.id} className="border border-[var(--color-line)] rounded-lg p-4 bg-white/60">
            <div className="flex justify-between gap-4 items-start">
              <div>
                <p className="font-medium">{a.tool}</p>
                <p className="text-xs text-[var(--color-moss)] mb-2">risk: {a.risk}</p>
                <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(a.input_json, null, 2)}</pre>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => decide(a.id, "approved")} className="rounded-md bg-[var(--color-moss)] text-white px-3 py-1.5 text-sm">
                  Approve
                </button>
                <button onClick={() => decide(a.id, "rejected")} className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm">
                  Reject
                </button>
              </div>
            </div>
          </li>
        ))}
        {approvals.length === 0 && <li className="text-sm text-[var(--color-moss)]">No pending approvals.</li>}
      </ul>
    </Shell>
  );
}
