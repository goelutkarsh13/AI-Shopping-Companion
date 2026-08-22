// Demo mode: lets the app be *experienced* without an Anthropic API key.
//
// Why this exists: the live URL is the first thing a reviewer clicks, and asking them to
// supply their own API key before they can see anything is a great way to lose them. With
// no key configured, the app stays fully interactive on scripted responses instead of
// showing a dead end.
//
// The honesty rule applies to us too: demo replies say they're canned. A product whose
// whole premise is "we don't quietly mislead you" cannot quietly fake its own intelligence.

import type { AdvisorResponse, Verdict } from "./advisor";

export const DEMO_NOTE =
  "You're in demo mode — this is a scripted answer, not a live one. Add an ANTHROPIC_API_KEY to get real advice.";

type Script = {
  /** Lowercased substrings; any match selects this script. */
  match: string[];
  question?: string;
  verdict: Omit<Verdict, "type">;
};

const SCRIPTS: Script[] = [
  {
    match: ["laptop", "macbook", "notebook", "design work"],
    question:
      "Happy to help you think it through. What'll you mostly be doing on it — and is there a number you'd rather not go past?",
    verdict: {
      call: "Maybe",
      headline:
        "It's a lovely machine, but for what you've described you'd be paying for headroom you won't touch.",
      why: [
        "For browsing, docs, and the odd photo edit, the base model already feels instant — the upgrade mostly shows up in heavy video work.",
        "The build quality is genuinely good, so it'll still feel current in four or five years.",
      ],
      watchOut: [
        "Memory is soldered in, so whatever you pick today is what you're stuck with. That's the one place skimping actually bites.",
        "Last year's model usually drops in price right after a refresh — if you're not in a hurry, waiting a few weeks often saves real money.",
      ],
      alternatives: [
        {
          name: "The base configuration",
          note: "Same chassis, same screen, a few hundred less. For your use case I'd struggle to tell them apart.",
        },
        {
          name: "Last year's model, refurbished",
          note: "Often 20–30% off with the same warranty. The performance gap is smaller than the price gap.",
        },
      ],
      independenceNote:
        "I don't earn anything whichever way you go — including if you close this tab and buy nothing.",
    },
  },
  {
    match: ["shoe", "sneaker", "running", "trainer"],
    question:
      "Sure — are these for actual running, or more everyday wear? And roughly how much are you looking to spend?",
    verdict: {
      call: "Worth it",
      headline: "If you're running regularly, this is the one category where paying up actually pays off.",
      why: [
        "Cushioning breaks down around 300–500 miles, and worn-out shoes are a genuinely common source of knee and shin trouble.",
        "Fit matters far more than brand here — and this model runs true to size, which takes the guesswork out.",
      ],
      watchOut: [
        "The colourways at the top of the price range are the same shoe. You're paying for the palette, not the engineering.",
        "If you're running less than once a week, the cheaper tier will serve you just as well for years.",
      ],
      alternatives: [
        {
          name: "Last season's colourway",
          note: "Physically identical, routinely 30% less. This is the easiest saving in the whole category.",
        },
      ],
      independenceNote:
        "No affiliate links here, no brand deals. If the cheap pair is right for you, that's what I'll say.",
    },
  },
  {
    match: ["snowboard", "board", "ski"],
    question:
      "Happy to help. How often do you actually get out on the mountain — and are you still finding your style, or pretty settled?",
    verdict: {
      call: "Maybe",
      headline:
        "It's a genuinely good board. Whether it's *your* board depends on how much you're riding.",
      why: [
        "If you're out more than a handful of days a season, owning beats renting within about two seasons.",
        "It's forgiving enough to learn on but won't hold you back once you progress — that's a rare combination.",
      ],
      watchOut: [
        "Boards hold their value badly. If there's any chance your style changes, renting a few more times costs less than buying twice.",
        "Bindings and boots usually aren't included, and they'll add a meaningful amount to the total.",
      ],
      alternatives: [
        {
          name: "Last season's model",
          note: "Board tech moves slowly. A year-old model is often near-identical for noticeably less.",
        },
      ],
      independenceNote:
        "I don't make anything on this either way — including if you decide to keep renting.",
    },
  },
  {
    match: ["serum", "skincare", "cream", "vitamin c", "moisturiz", "moisturis"],
    question:
      "Happy to dig in. What are you hoping it'll do for your skin — and have you used anything like it before?",
    verdict: {
      call: "Skip",
      headline: "Honestly? The active ingredient here is the same one you'll find for a fifth of the price.",
      why: [
        "The formulation is fine, but the concentration is unremarkable — you're mostly paying for packaging and marketing.",
        "Nothing in the ingredient list justifies the gap over well-reviewed budget options.",
      ],
      watchOut: [
        "Vitamin C oxidises. In a clear bottle it starts losing potency once opened, whatever you paid for it.",
        "'Clinically proven' on this kind of label usually means a small company-funded study. It isn't the reassurance it sounds like.",
      ],
      alternatives: [
        {
          name: "A basic 10% L-ascorbic acid serum",
          note: "Same active, opaque bottle, a fraction of the cost. Genuinely the better buy.",
        },
      ],
      independenceNote:
        "A retailer would push the expensive one. I'd rather you kept the difference.",
    },
  },
];

const FALLBACK: Omit<Verdict, "type"> = {
  call: "Maybe",
  headline: "I'd want to know a bit more about how you'd actually use it before calling this one.",
  why: [
    "The right answer here depends almost entirely on what you need it for — the specs alone don't decide it.",
    "Nothing about it looks like a bad product; the question is whether it's the right one for you specifically.",
  ],
  watchOut: [
    "Be wary of buying for the version of yourself you might become. Buy for the way you actually use things now.",
  ],
  alternatives: [],
  independenceNote: "No sponsorships, no commission — my only job is helping you decide well.",
};

function pickScript(text: string): Script | null {
  const lower = text.toLowerCase();
  return SCRIPTS.find((s) => s.match.some((m) => lower.includes(m))) ?? null;
}

/**
 * Produce a scripted response. Mirrors the real advisor's flow: ask one clarifying
 * question on the first turn, deliver a verdict once the user has answered.
 */
export function demoRespond(messages: { role: string; content: string }[]): AdvisorResponse {
  const userTurns = messages.filter((m) => m.role === "user");
  const first = userTurns[0]?.content ?? "";
  const script = pickScript(first);

  // First exchange: ask the clarifying question, same as the real thing would.
  if (userTurns.length <= 1) {
    const q =
      script?.question ??
      "Happy to think it through with you. What'll you be using it for, and roughly what's your budget?";
    return { type: "question", message: `${q}\n\n(${DEMO_NOTE})` };
  }

  const verdict = script?.verdict ?? FALLBACK;
  return {
    type: "verdict",
    ...verdict,
    independenceNote: `${verdict.independenceNote} · ${DEMO_NOTE}`,
  };
}
