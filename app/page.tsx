"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@/lib/advisor";
import {
  loadSaved,
  saveVerdict,
  removeSaved,
  verdictToShareText,
  type SavedVerdict,
} from "@/lib/storage";

type AdvisorResponse =
  | Verdict
  | { type: "question"; message: string }
  | { type: "reply"; message: string };

type ChatMessage =
  | { role: "user"; kind: "text"; text: string }
  | { role: "assistant"; kind: "text"; text: string }
  | { role: "assistant"; kind: "verdict"; verdict: Verdict };

type WireMessage = { role: "user" | "assistant"; content: string };

const EXAMPLES = [
  "A $1,200 laptop for design work",
  "Are these $180 running shoes worth it?",
  "Is this $65 vitamin C serum actually better?",
];

export default function Home() {
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wire, setWire] = useState<WireMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState(""); // first user message = what this decision is about
  const [saved, setSaved] = useState<SavedVerdict[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;

    if (!started) setStarted(true);
    if (!topic) setTopic(clean);
    const nextWire: WireMessage[] = [...wire, { role: "user", content: clean }];
    setMessages((m) => [...m, { role: "user", kind: "text", text: clean }]);
    setWire(nextWire);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextWire }),
      });
      const body = await res.json().catch(() => null);
      const data: AdvisorResponse | null =
        body && typeof body === "object" && typeof body.type === "string" ? body : null;

      if (!data) {
        // Validation failures come back as { error: "..." } — show the real reason
        // rather than a generic shrug, so the user knows what to do differently.
        const reason =
          body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Something went wrong on my end just now — mind trying that again?";
        setMessages((m) => [...m, { role: "assistant", kind: "text", text: reason }]);
        return;
      }

      if (data.type === "verdict") {
        setMessages((m) => [...m, { role: "assistant", kind: "verdict", verdict: data }]);
        setWire((w) => [...w, { role: "assistant", content: JSON.stringify(data) }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", kind: "text", text: data.message }]);
        setWire((w) => [...w, { role: "assistant", content: data.message }]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", kind: "text", text: "I couldn't reach myself just now — mind trying again?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSave(v: Verdict) {
    saveVerdict(topic || "A purchase decision", v);
    setSaved(loadSaved());
  }

  function handleRemove(id: string) {
    setSaved(removeSaved(id));
  }

  function resetToNew() {
    setStarted(false);
    setMessages([]);
    setWire([]);
    setTopic("");
    setInput("");
    setDrawerOpen(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4">
      <header className="flex items-center gap-2 pb-2 pt-6">
        <button
          onClick={resetToNew}
          className="flex items-center gap-2"
          title="Start a new question"
          aria-label="Start a new question"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage text-sm text-cream">☕</div>
          <span className="text-sm font-medium text-sagedark">Should I Buy This?</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-full border border-warm bg-white/60 px-3 py-1 text-[11px] text-sagedark transition hover:bg-white"
          >
            Saved{saved.length ? ` · ${saved.length}` : ""}
          </button>
          <span className="hidden rounded-full bg-warm px-3 py-1 text-[11px] text-sagedark sm:inline">
            Independent · never sponsored
          </span>
        </div>
      </header>

      {!started ? (
        <Landing onPick={send} input={input} setInput={setInput} loading={loading} />
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-4">
            {messages.map((m, i) =>
              m.kind === "verdict" ? (
                <VerdictCard key={i} v={m.verdict} topic={topic} onSave={() => handleSave(m.verdict)} />
              ) : (
                <Bubble key={i} role={m.role} text={m.text} />
              )
            )}
            {loading && <Thinking />}
          </div>
          <Composer input={input} setInput={setInput} onSend={() => send(input)} loading={loading} />
        </>
      )}

      {drawerOpen && (
        <SavedDrawer saved={saved} onClose={() => setDrawerOpen(false)} onRemove={handleRemove} />
      )}
    </main>
  );
}

function Landing({
  onPick,
  input,
  setInput,
  loading,
}: {
  onPick: (t: string) => void;
  input: string;
  setInput: (s: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <h1 className="max-w-md text-3xl font-semibold leading-tight text-ink">
        Thinking about buying something?
      </h1>
      <p className="mt-3 max-w-sm text-ink/60">
        Talk it through with a companion that&apos;s honestly on your side — not the seller&apos;s.
        Name a product or paste a link and I&apos;ll give you a straight answer.
      </p>

      <div className="mt-8 w-full max-w-lg">
        <Composer
          input={input}
          setInput={setInput}
          onSend={() => onPick(input)}
          loading={loading}
          placeholder="e.g. Is the MacBook Air M3 worth it for me?"
        />
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => onPick(ex)}
              className="rounded-full border border-warm bg-white/50 px-3 py-1.5 text-xs text-sagedark transition hover:bg-white"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  loading,
  placeholder = "Tell me a bit more…",
}: {
  input: string;
  setInput: (s: string) => void;
  onSend: () => void;
  loading: boolean;
  placeholder?: string;
}) {
  return (
    <div className="sticky bottom-0 flex items-end gap-2 bg-cream pb-6 pt-2">
      <textarea
        value={input}
        aria-label="Message"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        maxLength={4000}
        placeholder={placeholder}
        className="max-h-40 flex-1 resize-none rounded-2xl border border-warm bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none focus:border-sage"
      />
      <button
        onClick={onSend}
        disabled={loading || !input.trim()}
        className="rounded-2xl bg-sage px-4 py-3 text-sm font-medium text-cream transition hover:bg-sagedark disabled:opacity-40"
      >
        Ask
      </button>
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} animate-fadein`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
          mine ? "bg-sage text-cream" : "bg-white text-ink shadow-sm"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex justify-start animate-fadein">
      <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-sage"
            style={{ animation: "dotpulse 1.2s infinite", animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function VerdictCard({
  v,
  topic,
  onSave,
}: {
  v: Verdict;
  topic: string;
  onSave: () => void;
}) {
  const [savedFlash, setSavedFlash] = useState(false);
  const [shareFlash, setShareFlash] = useState<string | null>(null);

  const tone =
    v.call === "Worth it"
      ? { chip: "bg-sage text-cream", label: "Worth it 👍" }
      : v.call === "Skip"
      ? { chip: "bg-[#B25B4C] text-cream", label: "I'd skip it" }
      : { chip: "bg-[#C9A227] text-ink", label: "Maybe 🤔" };

  function doSave() {
    onSave();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }

  async function doShare() {
    const text = verdictToShareText(topic || "A purchase decision", v);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Should I Buy This?", text });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setShareFlash("Copied ✓");
      } else {
        setShareFlash("Not supported here");
      }
    } catch {
      setShareFlash("Couldn't share");
    }
    setTimeout(() => setShareFlash(null), 1800);
  }

  return (
    <div className="animate-fadein rounded-3xl border border-warm bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.chip}`}>{tone.label}</span>
      </div>
      <p className="mt-3 text-[15px] font-medium leading-snug text-ink">{v.headline}</p>

      {v.why?.length > 0 && (
        <Section title="Why">
          {v.why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </Section>
      )}

      {v.watchOut?.length > 0 && (
        <Section title="Watch out for">
          {v.watchOut.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </Section>
      )}

      {v.alternatives?.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-sagedark">Worth a look</h4>
          <div className="mt-2 space-y-2">
            {v.alternatives.map((a, i) => (
              <div key={i} className="rounded-xl bg-cream px-3 py-2">
                <p className="text-sm font-medium text-ink">{a.name}</p>
                <p className="text-xs text-ink/60">{a.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {v.independenceNote && (
        <p className="mt-4 border-t border-warm pt-3 text-[11px] italic text-sagedark">{v.independenceNote}</p>
      )}

      {v.dataSource && (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-ink/30">
          Live prices via {v.dataSource}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={doSave}
          className="rounded-full border border-warm bg-cream px-3 py-1.5 text-xs font-medium text-sagedark transition hover:bg-warm/60"
        >
          {savedFlash ? "Saved ✓" : "Save"}
        </button>
        <button
          onClick={doShare}
          className="rounded-full border border-warm bg-cream px-3 py-1.5 text-xs font-medium text-sagedark transition hover:bg-warm/60"
        >
          {shareFlash ?? "Share"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-sagedark">{title}</h4>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink/80 marker:text-sage">{children}</ul>
    </div>
  );
}

function SavedDrawer({
  saved,
  onClose,
  onRemove,
}: {
  saved: SavedVerdict[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-cream shadow-xl animate-fadein">
        <div className="flex items-center justify-between border-b border-warm px-4 py-4">
          <span className="text-sm font-semibold text-sagedark">Saved decisions</span>
          <button onClick={onClose} className="text-sm text-ink/50 hover:text-ink">
            Close
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {saved.length === 0 ? (
            <p className="mt-10 text-center text-sm text-ink/40">
              Nothing saved yet. Tap “Save” on any verdict to keep it here.
            </p>
          ) : (
            saved.map((s) => (
              <div key={s.id} className="rounded-2xl border border-warm bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      s.verdict.call === "Worth it"
                        ? "bg-sage text-cream"
                        : s.verdict.call === "Skip"
                        ? "bg-[#B25B4C] text-cream"
                        : "bg-[#C9A227] text-ink"
                    }`}
                  >
                    {s.verdict.call}
                  </span>
                  <button
                    onClick={() => onRemove(s.id)}
                    className="text-[11px] text-ink/40 hover:text-[#B25B4C]"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-2 text-sm font-medium text-ink">{s.topic}</p>
                <p className="mt-1 text-xs text-ink/60">{s.verdict.headline}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-ink/30">
                  {new Date(s.savedAt).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
