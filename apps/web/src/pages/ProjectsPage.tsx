import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../lib/api";

interface Project {
  id: string;
  name: string;
  created_at: string;
}

export function ProjectsPage() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ projects: Project[] }>("/projects");
    setProjects(data.projects);
  }

  useEffect(() => {
    if (!user) return;
    load().catch((e) => setError(String(e.message || e)));
  }, [user]);

  if (!user) return <Navigate to="/login" replace />;

  async function createProject(e: FormEvent) {
    e.preventDefault();
    await api("/projects", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    await load();
  }

  return (
    <Shell userEmail={user.email} onLogout={logout}>
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-moss-deep)] mb-2">
        Projects
      </h1>
      <p className="text-sm text-[var(--color-moss)] mb-8">Pick a workspace for chats, knowledge, and approvals.</p>
      {error && <p className="text-[var(--color-clay)] text-sm mb-4">{error}</p>}
      <form onSubmit={createProject} className="flex gap-2 mb-8 max-w-xl">
        <input
          className="flex-1 rounded-md border border-[var(--color-line)] bg-white/70 px-3 py-2"
          placeholder="New project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button className="rounded-md bg-[var(--color-moss)] px-4 py-2 text-white">Create</button>
      </form>
      <ul className="space-y-3 max-w-xl">
        {projects.map((p) => (
          <li key={p.id} className="border-b border-[var(--color-line)] pb-3">
            <Link className="text-lg text-[var(--color-ink)] hover:text-[var(--color-moss)]" to={`/p/${p.id}`}>
              {p.name}
            </Link>
          </li>
        ))}
        {projects.length === 0 && <li className="text-sm text-[var(--color-moss)]">No projects yet.</li>}
      </ul>
    </Shell>
  );
}

export function Shell({
  userEmail,
  onLogout,
  children,
  projectId,
}: {
  userEmail: string;
  onLogout: () => void;
  children: React.ReactNode;
  projectId?: string;
}) {
  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--color-line)] bg-white/40 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-moss-deep)]">
              AI Agent
            </Link>
            {projectId && (
              <nav className="flex gap-4 text-sm">
                <Link to={`/p/${projectId}`}>Chat</Link>
                <Link to={`/p/${projectId}/docs`}>Documents</Link>
                <Link to={`/p/${projectId}/approvals`}>Approvals</Link>
                <Link to={`/p/${projectId}/runs`}>Runs</Link>
              </nav>
            )}
          </div>
          <div className="text-sm flex items-center gap-3">
            <span className="text-[var(--color-moss)]">{userEmail}</span>
            <button onClick={onLogout} className="underline">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
