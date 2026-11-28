import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  Blocks,
  Download,
  ExternalLink,
  MessageSquare,
  ShieldAlert,
  Square,
  Volume2,
} from "lucide-react";
import { AnnieMascot } from "./components/AnnieMascot";
import {
  CalendarIcon,
  GitHubIcon,
  GmailIcon,
  IMessageIcon,
  OutlookIcon,
  SearchConsoleIcon,
  TelegramIcon,
  TregIcon,
  WhatsAppIcon,
} from "./components/BrandIcons";
import { FloatingComposer } from "./components/FloatingComposer";
import { SpotlightCard } from "./components/SpotlightCard";

type TabKey = "chat" | "integrations" | "reminders" | "monitor";

interface ChatMessage {
  id: string;
  role: "user" | "annie" | "proactive";
  text: string;
  reminderId?: string;
  mapsUrl?: string;
}

interface TraceEvent {
  runId: string;
  seq: number;
  type: string;
  summary: string;
  warn?: boolean;
}

interface ReminderItem {
  id: string;
  title: string;
  locationLabel?: string | null;
  eventAt: string;
  notifyAt: string;
  icsArtifactId?: string | null;
  status: string;
}

interface ConnectionItem {
  id: string;
  provider: string;
  scopes: string;
}

const INTEGRATION_CATALOG = [
  { key: "google_gmail", name: "Gmail", desc: "Read unread threads and triage renewal notices", Icon: GmailIcon, oauth: true },
  { key: "google_calendar", name: "Google Calendar", desc: "Create events and arm 30-minute departure checks", Icon: CalendarIcon, oauth: true },
  { key: "google_search_console", name: "Search Console", desc: "Track clicks, impressions, and top search queries", Icon: SearchConsoleIcon, oauth: true },
  { key: "microsoft_outlook", name: "Outlook", desc: "Shared mail and calendar across Web and phone", Icon: OutlookIcon, oauth: false },
  { key: "github", name: "GitHub", desc: "Check open pull requests, issues, and mentions", Icon: GitHubIcon, oauth: false },
  { key: "treg", name: "Treg Gateway", desc: "One token for TikTok stats, SEO, and 4,200+ APIs", Icon: TregIcon, oauth: false },
  { key: "telegram", name: "Telegram", desc: "Text Annie with inline approval and map buttons", Icon: TelegramIcon, channel: true },
  { key: "whatsapp", name: "WhatsApp Cloud", desc: "Official Meta Cloud API with shared account vault", Icon: WhatsAppIcon, channel: true },
  { key: "bluebubbles", name: "iMessage", desc: "Self-hosted BlueBubbles bridge for Apple Messages", Icon: IMessageIcon, channel: true },
];

const STARTERS = [
  "Remind me to go to school Tuesday 6pm",
  "Check my unread emails",
  "Check github manofval0r/Annie",
  "Plan Saturday in Lisbon for two, budget 60 euros",
];

async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshReminders = async () => {
    try {
      const res = await fetch("/api/reminders?senderId=web-sandbox");
      if (res.ok) {
        const data = (await res.json()) as { reminders?: ReminderItem[] };
        setReminders(data.reminders ?? []);
      }
    } catch {
      // ignore offline
    }
  };

  const refreshConnections = async () => {
    try {
      const res = await fetch("/api/connections?senderId=web-sandbox");
      if (res.ok) {
        const data = (await res.json()) as { connections?: ConnectionItem[] };
        setConnections(data.connections ?? []);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    void refreshReminders();
    void refreshConnections();

    const sse = new EventSource("/monitor");
    sse.addEventListener("audit", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as TraceEvent;
        setLastRunId(ev.runId);
        const warn = ev.type.includes("quarantine") || ev.type.includes("killed");
        setTraces((prev) => [{ ...ev, warn }, ...prev].slice(0, 60));
      } catch {
        // ignore malformed event
      }
    });
    return () => sse.close();
  }, []);

  const pushMsg = (msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: `${Date.now()}-${Math.random()}` }]);
  };

  const handleSend = async (text: string) => {
    pushMsg({ role: "user", text });
    setBusy(true);
    try {
      const data = await postJson<{
        runId?: string;
        reply?: string;
        reminderId?: string;
      }>("/message", { channel: "web", senderId: "web-sandbox", text });
      if (data.runId) setLastRunId(data.runId);
      pushMsg({
        role: "annie",
        text: data.reply || "Done.",
        reminderId: data.reminderId,
      });
      if (data.reminderId) void refreshReminders();
    } catch (err) {
      pushMsg({
        role: "annie",
        text: `Could not finish that request: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAttach = async (file: File) => {
    const content = await file.slice(0, 8192).text();
    await handleSend(`Renewal file (${file.name}):\n${content.slice(0, 4000)}`);
  };

  const handleSandbox = async () => {
    try {
      const data = await postJson<{
        userId: string;
        linkCode: string;
        connections: ConnectionItem[];
      }>("/api/sandbox", {});
      setConnections(data.connections ?? []);
      setLinkCode(data.linkCode);
      void refreshReminders();
      pushMsg({
        role: "proactive",
        text: "Sandbox active. Home and school are saved, and sample Gmail, Search Console, GitHub, and Treg connections are linked.",
      });
    } catch (err) {
      pushMsg({ role: "annie", text: `Sandbox failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const res = await fetch("/auth/google", { redirect: "manual" });
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        window.location.href = "/auth/google";
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setTab("chat");
      pushMsg({
        role: "annie",
        text: data.message || "Set GOOGLE_CLIENT_ID in .env for live Google OAuth, or click Sandbox.",
      });
    } catch (err) {
      pushMsg({ role: "annie", text: `Google connect error: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleTick = async () => {
    try {
      const data = await postJson<{
        processed: number;
        alerts?: Array<{ body: string; buttons?: Array<{ url?: string }> }>;
      }>("/api/debug/tick", {});
      if (data.processed > 0 && data.alerts?.[0]) {
        const a = data.alerts[0];
        let safeUrl: string | undefined;
        const raw = a.buttons?.[0]?.url;
        if (raw) {
          try {
            const u = new URL(raw);
            if (u.protocol === "https:") safeUrl = u.toString();
          } catch {
            // ignore
          }
        }
        setTab("chat");
        pushMsg({ role: "proactive", text: a.body, mapsUrl: safeUrl });
        void refreshReminders();
      } else {
        setTab("chat");
        pushMsg({ role: "annie", text: "No reminders are due yet. Ask Annie to set one first." });
      }
    } catch (err) {
      pushMsg({ role: "annie", text: `Check failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleSpeak = async (text: string) => {
    try {
      const v = await postJson<{ mode: string; spokenText: string; note: string }>("/api/voice-escalate", {
        message: text,
      });
      if (v.mode === "web_speech_fallback" && "speechSynthesis" in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(v.spokenText));
      }
    } catch (err) {
      pushMsg({
        role: "annie",
        text: `Voice alert failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleKill = async () => {
    if (!lastRunId) {
      pushMsg({ role: "annie", text: "Nothing is running right now." });
      return;
    }
    try {
      await postJson(`/kill/${encodeURIComponent(lastRunId)}`, {
        channel: "web",
        senderId: "web-sandbox",
      });
      setTraces((prev) => [
        { runId: lastRunId, seq: prev.length + 1, type: "killed_by_user", summary: "Run aborted by user", warn: true },
        ...prev,
      ]);
    } catch (err) {
      pushMsg({
        role: "annie",
        text: `Could not stop run: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const connectedKeys = new Set(connections.map((c) => c.provider));

  const navItems: Array<{ key: TabKey; label: string; Icon: typeof MessageSquare }> = [
    { key: "chat", label: "Chat", Icon: MessageSquare },
    { key: "integrations", label: "Integrations", Icon: Blocks },
    { key: "reminders", label: "Reminders", Icon: Bell },
    { key: "monitor", label: "Monitor", Icon: Activity },
  ];

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#0D0E11] text-[#F4F6F8]">
      {/* Minimal Desktop Left Rail */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-[#A8B0B8]/15 bg-[#0D0E11] p-4 md:flex">
        <div>
          <div className="mb-8 flex items-center gap-3 px-2 pt-1">
            <AnnieMascot size={36} />
            <div>
              <div className="text-[17px] font-extrabold tracking-tight text-[#F4F6F8]">Annie</div>
              <div className="text-[12px] text-[#A8B0B8]">Personal Agent</div>
            </div>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Primary navigation">
            {navItems.map(({ key, label, Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 text-[14px] font-bold transition-colors ${
                    active
                      ? "bg-[#1A1C20] text-[#F4F6F8] ring-1 ring-[#D6DCE2]/25"
                      : "text-[#A8B0B8] hover:bg-[#1A1C20]/60 hover:text-[#F4F6F8]"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#A8B0B8]/15 pt-4">
          <button
            type="button"
            onClick={() => void handleSandbox()}
            className="min-h-[44px] rounded-full border border-[#A8B0B8]/25 bg-[#1A1C20] px-4 text-[13px] font-bold text-[#F4F6F8] transition hover:border-[#F4F6F8]"
          >
            Enable Sandbox
          </button>
          <button
            type="button"
            onClick={() => void handleKill()}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#A8B0B8]/20 bg-transparent px-4 text-[13px] font-bold text-[#D6DCE2] transition hover:border-[#F4F6F8] hover:text-[#F4F6F8]"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop Active Run
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact Mobile Header */}
        <header className="flex items-center justify-between border-b border-[#A8B0B8]/15 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2.5">
            <AnnieMascot size={30} />
            <span className="text-[16px] font-extrabold tracking-tight">Annie</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSandbox()}
              className="min-h-[44px] rounded-full border border-[#A8B0B8]/25 bg-[#1A1C20] px-3.5 text-[12.5px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8]"
            >
              Sandbox
            </button>
            <button
              type="button"
              onClick={() => void handleKill()}
              className="min-h-[44px] rounded-full border border-[#A8B0B8]/25 px-3.5 text-[12.5px] font-bold text-[#D6DCE2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8]"
            >
              Stop
            </button>
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {tab === "chat" && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pb-36 pt-8"
              >
                {messages.length === 0 ? (
                  <div className="my-auto flex flex-col items-center text-center">
                    <AnnieMascot size={78} className="mb-4" />
                    <h1 className="text-2xl font-extrabold tracking-tight text-[#F4F6F8]">
                      What should I handle?
                    </h1>
                    <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#A8B0B8]">
                      Ask once. I schedule your calendar, check weather and routes before you leave,
                      triage bills, and pull updates from your connected accounts.
                    </p>
                    <div className="mt-7 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {STARTERS.map((prompt) => (
                        <SpotlightCard key={prompt} className="p-0">
                          <button
                            type="button"
                            onClick={() => void handleSend(prompt)}
                            className="flex min-h-[54px] w-full items-center px-4 py-3 text-left text-[13.5px] font-semibold text-[#D6DCE2] transition hover:text-[#F4F6F8]"
                          >
                            {prompt}
                          </button>
                        </SpotlightCard>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {messages.map((m) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                        className={
                          m.role === "user"
                            ? "ml-auto max-w-[84%] rounded-2xl rounded-br-md bg-[#F4F6F8] px-4 py-3 text-[15px] font-semibold leading-relaxed text-[#0D0E11]"
                            : "max-w-[88%]"
                        }
                      >
                        {m.role === "user" ? (
                          m.text
                        ) : (
                          <SpotlightCard
                            className={`px-4 py-3.5 text-[15px] leading-relaxed text-[#F4F6F8] ${
                              m.role === "proactive" ? "border-[#D6DCE2]/40" : ""
                            }`}
                          >
                            <div>{m.text}</div>
                            {(m.reminderId || m.mapsUrl) && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {m.reminderId && (
                                  <a
                                    href={`/artifacts/${encodeURIComponent(m.reminderId)}.ics`}
                                    download
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#F4F6F8] px-4 text-[13px] font-bold text-[#0D0E11] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8]"
                                  >
                                    <Download className="h-4 w-4" />
                                    Calendar File
                                  </a>
                                )}
                                {m.mapsUrl && (
                                  <>
                                    <a
                                      href={m.mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#F4F6F8] px-4 text-[13px] font-bold text-[#0D0E11] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8]"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      Open Directions
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => void handleSpeak(m.text)}
                                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#A8B0B8]/30 px-4 text-[13px] font-bold text-[#D6DCE2] hover:border-[#F4F6F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8]"
                                    >
                                      <Volume2 className="h-4 w-4" />
                                      Speak Alert
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </SpotlightCard>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {tab === "integrations" && (
              <motion.div
                key="integrations"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8"
              >
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Integrations</h1>
                    <p className="mt-1 text-[14.5px] text-[#A8B0B8]">
                      Connect once on the web. Every linked channel shares the same encrypted vault.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleGoogleConnect()}
                      className="min-h-[44px] rounded-full bg-[#F4F6F8] px-5 text-[13px] font-bold text-[#0D0E11]"
                    >
                      Connect Google
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSandbox()}
                      className="min-h-[44px] rounded-full border border-[#A8B0B8]/30 px-5 text-[13px] font-bold text-[#F4F6F8]"
                    >
                      Load Sandbox
                    </button>
                  </div>
                </div>

                {linkCode && (
                  <SpotlightCard className="mb-6 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <div className="text-[12px] font-bold uppercase tracking-wider text-[#A8B0B8]">
                        Cross-Channel Pairing Code
                      </div>
                      <div className="mt-1 text-[14px] text-[#D6DCE2]">
                        Send this code on Telegram, WhatsApp, or iMessage to share your connected accounts.
                      </div>
                    </div>
                    <div className="text-xl font-extrabold tracking-widest text-[#F4F6F8]">{linkCode}</div>
                  </SpotlightCard>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {INTEGRATION_CATALOG.map(({ key, name, desc, Icon, oauth, channel }) => {
                    const isLinked = connectedKeys.has(key);
                    return (
                      <SpotlightCard key={key} className="flex items-start gap-4 p-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#A8B0B8]/20 bg-[#0D0E11] text-[#D6DCE2]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[15px] font-bold text-[#F4F6F8]">{name}</span>
                            <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#D6DCE2]">
                              <span
                                className={`h-0.5 w-3 rounded-full ${
                                  isLinked ? "bg-[#F4F6F8]" : "bg-[#A8B0B8]/35"
                                }`}
                              />
                              {isLinked ? "Linked" : channel ? "Webhook" : "Ready"}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] leading-snug text-[#A8B0B8]">{desc}</p>
                          {oauth && !isLinked && (
                            <button
                              type="button"
                              onClick={() => void handleGoogleConnect()}
                              className="mt-3 text-[12.5px] font-bold text-[#F4F6F8] underline decoration-[#A8B0B8]/50 underline-offset-4 hover:decoration-[#F4F6F8]"
                            >
                              Connect account
                            </button>
                          )}
                        </div>
                      </SpotlightCard>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {tab === "reminders" && (
              <motion.div
                key="reminders"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="mx-auto w-full max-w-2xl px-4 pb-28 pt-8"
              >
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Reminders</h1>
                    <p className="mt-1 text-[14.5px] text-[#A8B0B8]">
                      Annie checks live weather and walking ETA 30 minutes before each event.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleTick()}
                    className="min-h-[44px] rounded-full bg-[#F4F6F8] px-5 text-[13px] font-bold text-[#0D0E11]"
                  >
                    Run T-30m Check Now
                  </button>
                </div>

                {reminders.length === 0 ? (
                  <SpotlightCard className="p-6 text-[14.5px] text-[#A8B0B8]">
                    No reminders scheduled yet. Ask Annie in Chat to set one.
                  </SpotlightCard>
                ) : (
                  <div className="flex flex-col gap-3">
                    {reminders.map((r) => (
                      <SpotlightCard key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                          <div className="text-[15px] font-bold text-[#F4F6F8]">{r.title}</div>
                          <div className="mt-1 text-[13px] text-[#A8B0B8]">
                            Event: {new Date(r.eventAt).toLocaleString()} · Status: {r.status}
                          </div>
                        </div>
                        {r.icsArtifactId && (
                          <a
                            href={`/artifacts/${encodeURIComponent(r.icsArtifactId)}`}
                            download
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#A8B0B8]/30 px-4 text-[13px] font-bold text-[#F4F6F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F6F8]"
                          >
                            <Download className="h-4 w-4" />
                            .ics
                          </a>
                        )}
                      </SpotlightCard>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {tab === "monitor" && (
              <motion.div
                key="monitor"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="mx-auto w-full max-w-2xl px-4 pb-28 pt-8"
              >
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Live Monitor</h1>
                    <p className="mt-1 text-[14.5px] text-[#A8B0B8]">
                      Real-time policy checks, Trap Pack quarantines, and SHA-256 hash-chained events.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleKill()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#D6DCE2]/40 bg-[#1A1C20] px-5 text-[13px] font-bold text-[#F4F6F8]"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Stop Active Run
                  </button>
                </div>

                {traces.length === 0 ? (
                  <SpotlightCard className="p-6 text-[14.5px] text-[#A8B0B8]">
                    Listening on /monitor. Send a message in Chat to watch every step live.
                  </SpotlightCard>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {traces.map((t, idx) => (
                      <div
                        key={`${t.runId}-${t.seq}-${idx}`}
                        className={`rounded-r-xl border-l-2 bg-[#1A1C20] px-4 py-3 text-[13.5px] leading-relaxed ${
                          t.warn ? "border-[#F4F6F8] text-[#F4F6F8]" : "border-[#A8B0B8]/50 text-[#D6DCE2]"
                        }`}
                      >
                        <div className="font-bold text-[#F4F6F8]">
                          #{t.seq} · {t.type} <span className="font-normal text-[#A8B0B8]">({t.runId})</span>
                        </div>
                        <div className="mt-0.5 text-[#D6DCE2]">{t.summary}</div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {tab === "chat" && (
          <FloatingComposer onSend={handleSend} onAttachFile={handleAttach} disabled={busy} />
        )}

        {/* Mobile Thumb-Zone Bottom Bar */}
        <nav
          className="grid shrink-0 grid-cols-4 border-t border-[#A8B0B8]/15 bg-[#0D0E11] pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Mobile navigation"
        >
          {navItems.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[54px] flex-col items-center justify-center gap-1 text-[11.5px] font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F4F6F8] ${
                  active ? "text-[#F4F6F8]" : "text-[#A8B0B8]"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
