# AI Shopping Companion — "Should I Buy This?" prototype

A warm, honest, **independent** shopping companion. Name a product (or paste a link), answer a
question or two, and get a straight second opinion — worth it, maybe, or skip — with the reasoning,
the honest caveats, and better alternatives. Built for people who make purchase decisions alone.

The core conversation loop is powered by Claude. Launch categories: **laptops, sneakers, skincare**
— narrow on purpose, to prove the voice lands before spreading out (see Roadmap).

## The two files that _are_ the product

- `lib/advisor.ts` — the advisor persona, honesty rules, and the verdict format. Iterate here most.
- `prompts/independence-charter.md` — the public promise the whole product rests on.

## Run it locally

You'll need Node 18+ and an Anthropic API key.

```bash
# 1. install
npm install

# 2. add your key
cp .env.example .env.local
# then edit .env.local and paste your ANTHROPIC_API_KEY

# 3. run
npm run dev
```

Open http://localhost:3000 and start talking to it.

> Without a key the app still runs, but the companion will tell you it isn't connected yet.

## Live product data

The advisor works fine on Claude's own knowledge alone, but it's better grounded with a live data
provider — the app never breaks on a missing data key, it just falls back gracefully. Two providers
are built in, picked automatically from what's set in `.env.local`:

- **Shopify Storefront API** (recommended) — `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_STOREFRONT_PRIVATE_TOKEN`.
  Uses Shopify's official GraphQL Storefront API to query a real store's live catalog: title,
  current price, availability, image — the same read surface a production Shopify app would use.
  Free to set up against any Shopify Partner dev store: install the **Headless** sales channel,
  create a storefront, copy its private access token (see `.env.example` for the exact path).
- **SerpApi (Google Shopping)** — `SERPAPI_KEY`. Broader (whole web, not one store), useful when
  there's no single store to ground against. Free tier: 250 searches/month at https://serpapi.com/.

When both are set, Shopify wins. When a verdict is grounded in live data, the card shows exactly
where the prices came from ("Live prices via Shopify"), because "independent" only means something
if it's honest about its own inputs too.

Swapping in another provider later means writing one adapter in `lib/data/` (see `shopify.ts` or
`serpapi.ts` for the shape) — nothing else changes.

## How it works

```
app/page.tsx          entry + conversation UI, verdict card, save/share, history drawer
app/api/chat/route.ts fetches live product data, then calls Claude for a structured response
lib/advisor.ts         system prompt + independence charter + verdict schema  ← the brain
lib/data/              provider-agnostic shopping data (Shopify + SerpApi adapters, fallback)
lib/storage.ts         saved verdicts + shareable summary (localStorage)
prompts/               the independence charter (versioned)
```

The API returns one of three shapes, and the UI renders each differently:
- `question` — the companion needs one quick thing (usually use case + budget)
- `verdict` — the call, why, watch-outs, alternatives, independence note, and (if live data
  grounded it) which provider
- `reply` — normal conversation / pushback / reassurance

## Roadmap (from the project plan)

- **Phase 2 ✅:** live product/price data wired in via a provider-agnostic layer (Shopify Storefront
  API + SerpApi).
- **Phase 3 ✅ (local):** saved-verdict history + shareable verdict summaries. Accounts/cross-device next.
- **Phase 3.5 ✅:** widened from laptops-only to laptops, sneakers, and skincare — same voice, more
  categories, still honest about what it doesn't know best.
- **Phase 4:** test with 10–20 real "solo deciders"; measure return-for-a-second-gut-check.
- **Later:** more categories, price-drop watching, voice mode, a real embeddable Shopify app so a
  merchant can drop this on their own storefront.

## Change the categories

Edit `LAUNCH_CATEGORIES` in `lib/advisor.ts` (and tune the persona if needed). Everything else —
data fetching, the verdict schema, the UI — is already category-agnostic.
