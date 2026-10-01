import { FormEvent, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { api, getAccessToken } from "../lib/api";
import { Shell } from "./ProjectsPage";

interface Doc {
  id: string;
  title: string;
  status: string;
  created_at: string;
  error?: string | null;
}

export function DocumentsPage() {
  const { projectId = "" } = useParams();
  const { user, logout } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function load() {
    const data = await api<{ documents: Doc[] }>(`/documents?projectId=${projectId}`);
    setDocs(data.documents);
  }

  useEffect(() => {
    if (!user) return;
    load().catch(console.error);
  }, [projectId, user]);

  if (!user) return <Navigate to="/login" replace />;

  async function uploadText(e: FormEvent) {
    e.preventDefault();
    await api("/documents/upload", {
      method: "POST",
      body: JSON.stringify({ projectId, title: title || "Note", content }),
    });
    setTitle("");
    setContent("");
    await load();
  }

  async function uploadFile(file: File) {
    const fd = new FormData();
    fd.append("projectId", projectId);
    fd.append("title", file.name);
    fd.append("file", file);
    const token = getAccessToken();
    const res = await fetch("/documents/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error("Upload failed");
    await load();
  }

  async function reindex(id: string) {
    await api(`/documents/${id}/reindex`, { method: "POST" });
    await load();
  }

  return (
    <Shell userEmail={user.email} onLogout={logout} projectId={projectId}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl mb-2">Documents</h1>
      <p className="text-sm text-[var(--color-moss)] mb-6">
        Knowledge is queued for indexing via cron (chunk → embed → MySQL).
      </p>
      <form onSubmit={uploadText} className="space-y-3 max-w-2xl mb-8">
        <input
          className="w-full rounded-md border border-[var(--color-line)] bg-white/70 px-3 py-2"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full min-h-32 rounded-md border border-[var(--color-line)] bg-white/70 px-3 py-2"
          placeholder="Paste knowledge text…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <div className="flex gap-3 items-center">
          <button className="rounded-md bg-[var(--color-moss)] text-white px-4 py-2">Add text</button>
          <label className="text-sm underline cursor-pointer">
            Upload .txt
            <input
              type="file"
              accept=".txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f).catch(console.error);
              }}
            />
          </label>
        </div>
      </form>
      <ul className="space-y-3">
        {docs.map((d) => (
          <li key={d.id} className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-2">
            <div>
              <p className="font-medium">{d.title}</p>
              <p className="text-xs text-[var(--color-moss)]">
                {d.status}
                {d.error ? ` — ${d.error}` : ""}
              </p>
            </div>
            <button onClick={() => reindex(d.id)} className="text-sm underline">
              Reindex
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
