import { FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { api, streamRun } from "../lib/api";
import { Shell } from "./ProjectsPage";

interface Conversation {
  id: string;
  title: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
}

export function ChatPage() {
  const { projectId = "" } = useParams();
  const { user, logout } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [streaming, setStreaming] = useState("");
  const [plan, setPlan] = useState<unknown>(null);
  const stopRef = useRef<(() => void) | null>(null);

  async function loadConversations() {
    const data = await api<{ conversations: Conversation[] }>(`/conversations?projectId=${projectId}`);
    setConversations(data.conversations);
    if (!conversationId && data.conversations[0]) {
      setConversationId(data.conversations[0].id);
    }
  }

  async function loadMessages(id: string) {
    const data = await api<{ messages: Message[] }>(`/conversations/${id}/messages`);
    setMessages(data.messages);
  }

  useEffect(() => {
    if (!user) return;
    loadConversations().catch(console.error);
    return () => stopRef.current?.();
  }, [projectId, user]);

  useEffect(() => {
    if (conversationId) loadMessages(conversationId).catch(console.error);
  }, [conversationId]);

  if (!user) return <Navigate to="/login" replace />;

  async function newChat() {
    const data = await api<{ id: string; title: string }>("/conversations", {
      method: "POST",
      body: JSON.stringify({ projectId, title: "New chat" }),
    });
    setConversationId(data.id);
    await loadConversations();
    setMessages([]);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !input.trim()) return;
    const message = input.trim();
    setInput("");
    setStreaming("");
    setPlan(null);
    setStatus("starting");
    setMessages((m) => [...m, { id: "tmp", role: "user", content: message }]);

    const { runId } = await api<{ runId: string }>("/agent/runs", {
      method: "POST",
      body: JSON.stringify({ conversationId, message }),
    });

    stopRef.current?.();
    stopRef.current = streamRun(runId, (type, data) => {
      if (type === "run_status") setStatus(String((data as { status: string }).status));
      if (type === "plan") setPlan(data);
      if (type === "token") setStreaming((s) => s + ((data as { delta: string }).delta || ""));
      if (type === "approval_required") setStatus("awaiting_approval");
      if (type === "done") {
        setStatus((data as { status: string }).status);
        loadMessages(conversationId).catch(console.error);
        setStreaming("");
      }
      if (type === "error") setStatus("error");
    });
  }

  return (
    <Shell userEmail={user.email} onLogout={logout} projectId={projectId}>
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 min-h-[70vh]">
        <aside className="border-r border-[var(--color-line)] pr-4">
          <button onClick={newChat} className="mb-4 w-full rounded-md bg-[var(--color-moss)] px-3 py-2 text-white text-sm">
            New chat
          </button>
          <ul className="space-y-2 text-sm">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  className={`text-left w-full truncate ${c.id === conversationId ? "text-[var(--color-moss-deep)] font-medium" : "text-[var(--color-moss)]"}`}
                  onClick={() => setConversationId(c.id)}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="flex flex-col">
          <div className="flex-1 space-y-4 mb-4 overflow-auto max-h-[60vh]">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[var(--color-moss)] text-white"
                      : "bg-white/70 border border-[var(--color-line)]"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap bg-white/70 border border-[var(--color-line)]">
                {streaming}
              </div>
            )}
          </div>
          {plan != null && (
            <pre className="mb-3 text-xs bg-[var(--color-mist)]/50 p-3 rounded-md overflow-auto max-h-40">
              {JSON.stringify(plan, null, 2)}
            </pre>
          )}
          {status && <p className="text-xs text-[var(--color-moss)] mb-2">Run status: {status}</p>}
          <form onSubmit={send} className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-[var(--color-line)] bg-white/80 px-3 py-2"
              placeholder="Ask the agent…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="rounded-md bg-[var(--color-clay)] px-4 py-2 text-white">Send</button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
