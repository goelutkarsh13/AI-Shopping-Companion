// Lightweight local persistence for saved verdicts.
// Phase 3 uses localStorage; swap this module for a real DB when accounts land —
// the rest of the app only touches these functions.

import type { Verdict } from "./advisor";

export type SavedVerdict = {
  id: string;
  topic: string; // the user's original question, used as the label
  verdict: Verdict;
  savedAt: number; // epoch ms
};

const KEY = "sbt.saved.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function loadSaved(): SavedVerdict[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedVerdict[]) : [];
  } catch {
    return [];
  }
}

function persist(list: SavedVerdict[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked — fail quietly; saving is a convenience, not critical
  }
}

export function saveVerdict(topic: string, verdict: Verdict): SavedVerdict {
  const entry: SavedVerdict = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    topic: topic.slice(0, 140),
    verdict,
    savedAt: Date.now(),
  };
  const list = [entry, ...loadSaved()];
  persist(list);
  return entry;
}

export function removeSaved(id: string): SavedVerdict[] {
  const list = loadSaved().filter((s) => s.id !== id);
  persist(list);
  return list;
}

// A clean, branded, screenshot-friendly text summary of a verdict — the growth loop.
export function verdictToShareText(topic: string, v: Verdict): string {
  const lines: string[] = [];
  lines.push(`🛒 Should I buy: ${topic}`);
  lines.push("");
  const label = v.call === "Worth it" ? "✅ Worth it" : v.call === "Skip" ? "🚫 I'd skip it" : "🤔 Maybe";
  lines.push(`${label} — ${v.headline}`);
  if (v.why?.length) {
    lines.push("");
    lines.push("Why:");
    v.why.forEach((w) => lines.push(`• ${w}`));
  }
  if (v.watchOut?.length) {
    lines.push("");
    lines.push("Watch out for:");
    v.watchOut.forEach((w) => lines.push(`• ${w}`));
  }
  lines.push("");
  lines.push("— Should I Buy This? · independent advice, never sponsored");
  return lines.join("\n");
}
