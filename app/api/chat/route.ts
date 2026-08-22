import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_PROMPT, parseAdvisorResponse } from "@/lib/advisor";
import { activeProviderLabel, fetchProducts, productsToContext } from "@/lib/data";
import { demoRespond } from "@/lib/demo";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { LIMITS, validateMessages } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Rate limit before doing any work — the point is to spend nothing on abusive traffic.
  const limit = rateLimit(
    clientKey(req.headers),
    LIMITS.requestsPerWindow,
    LIMITS.windowMs
  );
  if (!limit.ok) {
    return NextResponse.json(
      {
        type: "reply",
        message: "You're going a bit fast for me — give me a moment and try again.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsedInput = validateMessages((body as { messages?: unknown })?.messages);
  if (!parsedInput.ok) {
    return NextResponse.json({ error: parsedInput.error }, { status: 400 });
  }
  const messages = parsedInput.messages;

  // No key? Stay useful instead of showing a dead end — see lib/demo.ts.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(demoRespond(messages), { status: 200 });
  }

  // Ground the advice in live product data when a provider is configured.
  // We search on the first user message (the "topic"); identical repeat queries
  // are cached by the provider, so multi-turn chats don't burn quota.
  let system = SYSTEM_PROMPT;
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  const products = await fetchProducts(firstUser);
  const dataSource = products.length > 0 ? activeProviderLabel() : null;
  if (products.length > 0) {
    system += `

LIVE PRODUCT DATA (current, from a real shopping search for "${firstUser.slice(0, 120)}"):
${productsToContext(products)}

Use this live data to ground your prices, comparisons, and alternatives — quote current prices from it and prefer these real options when relevant. It reflects today's market, so you can speak about price with confidence. If the user's question isn't covered by this list, lean on your own knowledge and gently note the price may have shifted.`;
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const completion = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = completion.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseAdvisorResponse(text);
    const withSource = parsed.type === "verdict" && dataSource ? { ...parsed, dataSource } : parsed;
    return NextResponse.json(withSource, { status: 200 });
  } catch (err) {
    console.error("Anthropic API error:", err);
    return NextResponse.json(
      { type: "reply", message: "Something went wrong reaching me just now. Mind trying that again?" },
      { status: 200 }
    );
  }
}
