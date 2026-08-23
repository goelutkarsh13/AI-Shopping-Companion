# AI Shopping Companion — "Should I Buy This?"

A warm, honest, **independent** shopping companion. Name a product (or paste a link), answer a
question or two, and get a straight second opinion — worth it, maybe, or skip — with the reasoning,
the honest caveats, and better alternatives. Built for people who make purchase decisions alone.

Launch categories: **laptops, sneakers, skincare, snowboards** — narrow on purpose, chosen to span
different ways buying advice goes wrong: durable goods, fit-dependent goods, ingredient-claim goods,
and seasonal/occasional-use goods.

> **Why it exists:** most shopping recommendations are advertising in a lab coat. If you're paid on
> conversion, you can't be the one who says "don't buy this." This app is built so that it can.
> See [`DECISIONS.md`](./DECISIONS.md) for the architectural and product reasoning.

## What it looks like

![A verdict confirming a real 11% markdown, then advising against the purchase](./docs/screenshots/verdict-real-discount.png)

Asked about a snowboard discounted from $885.95 to $785.95, it pulls both figures from the
merchant's live Shopify catalog, verifies the markdown is genuine — and then suggests renting
instead, plus a cheaper board the merchant doesn't stock.

That last part is the whole argument. A recommendation engine funded by conversion cannot say
"rent instead" or "buy something we don't sell."

![A verdict leading with the fact that the item is out of stock](./docs/screenshots/verdict-out-of-stock.png)

## The two files that _are_ the product

- [`lib/advisor.ts`](./lib/advisor.ts) — the advisor persona, honesty rules, and the verdict contract.
- [`prompts/independence-charter.md`](./prompts/independence-charter.md) — the public promise
  everything else rests on. Versioned alongside the code, because promises should have a changelog.

## Run it locally

Node 18+ required.

```bash
npm install
cp .env.example .env.local     # then paste your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

**No API key?** The app still works — it serves scripted demo conversations (clearly labelled as
scripted) so you can experience the product without credentials. That's deliberate; see
[Demo mode](#demo-mode).

```bash
npm test          # 122 unit tests
npm run typecheck # tsc --noEmit
npm run build     # production build
npm run eval      # scores the advisor against the charter (calls the real API)
```

## Live product data

The advisor works on Claude's own knowledge alone, but it's better grounded with a live provider.
Two adapters ship, selected automatically from `.env.local`:

| Provider | Env vars | What it gives you |
|---|---|---|
| **Shopify Storefront API** *(preferred)* | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_PRIVATE_TOKEN` | One merchant's real catalog: live prices, genuine markdowns, stock status, variants |
| **SerpApi (Google Shopping)** | `SERPAPI_KEY` | Whole-web breadth, less depth. Free tier: 250 searches/mo |

Setup for Shopify is free: create a [Partner](https://partners.shopify.com) dev store, install the
**Headless** sales channel, create a storefront, and copy its **private** access token. Exact path is
in [`.env.example`](./.env.example).

**Missing or broken data never breaks the app** — `fetchProducts` returns `[]` on any failure and the
advisor falls back to its own knowledge. When live data *did* ground a verdict, the card says so
("Live prices via Shopify"), because a product about honest inputs should be honest about its own.

### Deal detection

The Storefront query asks for `compareAtPrice` and availability, and **discards a compare-at price
that isn't actually higher than the current price**. A permanent "was $200, now $120" where nothing
ever sold at $200 is the oldest trick in retail — repeating it back to you as a saving would mean
quietly switching sides. Real markdowns get surfaced; fake ones get called what they are.

## Demo mode

With no `ANTHROPIC_API_KEY` set, `lib/demo.ts` serves scripted conversations covering every launch
category — including a `Skip` verdict, because a demo that never refuses a sale would undersell
the whole premise.

Demo responses **always disclose that they're scripted**. There's a test enforcing it.

## How it works

```
app/page.tsx           conversation UI, verdict card, save/share, history drawer
app/api/chat/route.ts  rate limit → validate → fetch live data → call Claude
lib/advisor.ts         system prompt + charter + verdict schema   ← the brain
lib/data/              provider-agnostic shopping data (Shopify + SerpApi + fallback)
lib/data/query.ts      turns conversational questions into catalog search terms
lib/validation.ts      request bounds — message count, sizes, roles
lib/ratelimit.ts       per-IP fixed-window limiter
lib/demo.ts            keyless scripted mode
lib/storage.ts         saved verdicts + shareable summary (localStorage)
prompts/               the independence charter (versioned)
evals/                 charter-compliance scenarios + scored runner
```

The API returns exactly one of three shapes, each rendered differently:

- `question` — needs one quick thing (usually use case + budget)
- `verdict` — the call, why, **watch-outs**, alternatives, independence note, and the data source
- `reply` — conversation, pushback, reassurance

`watchOut` is structurally required, so the schema itself enforces the honesty rather than hoping
the prose remembers.

## Testing

122 unit tests across nine files, weighted toward the seams most likely to fail in production:

- **`advisor.test.ts`** — JSON parsing under adversarial model output: code fences, chatty
  wrappers, malformed payloads. Must never throw, never return something unrenderable.
- **`data/shopify.test.ts`** — Storefront adapter against mocked GraphQL: token header selection,
  field mapping, currency handling, and the fake-markdown rejection. Includes two cases found by
  querying a real store rather than reading docs: GraphQL returning **200 with an `errors` array**
  (which a naive client treats as success), and `compareAtPrice` coming back as **`"0.0"` rather
  than `null`** for full-price items.
- **`data/query.test.ts`** — turning "Is the Compare at Price Snowboard worth it?" into
  `compare snowboard`. Written after a live bug: raw questions were being sent to Shopify's
  catalog search, matching nothing, and degrading silently to "no live data".
- **`validation.test.ts`** — every rejected request is one that would otherwise cost API credits.
- **`ratelimit.test.ts`**, **`demo.test.ts`**, **`data/index.test.ts`**, **`storage.test.ts`**

### Evals — does it keep its promises?

Unit tests prove the output is *well-formed*. They can't prove it's *honest*, which is the
property the product actually rests on. `npm run eval` runs seven realistic scenarios against
the live model and scores each against a charter line:

| Scenario | What it proves |
|---|---|
| `overkill-purchase` | Won't just agree when someone wants to overspend |
| `fake-discount` | Won't invent a markdown the catalog doesn't show |
| `real-discount` | Reports a genuine markdown accurately, with the real figure |
| `out-of-stock` | Leads with unavailability instead of deliberating |
| `pushback` | Stays honest when pushed emotionally, without lecturing |
| `genuinely-worth-it` | **Willing to say yes** — an advisor that always says no is just as useless |
| `no-data-humility` | Won't fabricate specs for a product it knows nothing about |

Every check is deterministic — no LLM judge, no rubric. A charter violation should be as
unambiguous as a failing test. The graders are themselves unit-tested (`evals/cases.test.ts`),
because a broken grader reports "all clear" while the promise is being broken.

Evals cost API credits, so they're excluded from `npm test` and CI. Run them after changing
the system prompt — the change most likely to quietly break a promise, and the one unit tests
cannot catch. `--runs=3` repeats each case, since a check that passes once but not three times
isn't really passing.

## Continuous integration

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs tests, typecheck, build, and
`npm audit --audit-level=high` on every push and PR. The build step deliberately runs with **no
secrets configured** — that verifies the app degrades gracefully without API keys rather than
failing to compile, which is the same property demo mode depends on.

## Roadmap

- **Phase 1–3 ✅** — conversation loop, live data layer, saved/shareable verdicts
- **Phase 3.5 ✅** — widened categories, Shopify integration, deal detection, tests, hardening
- **Phase 4** — test with 10–20 real "solo deciders"; measure return-for-a-second-gut-check
- **Later** — accounts, price-drop watching, voice mode, an embeddable Shopify app so a merchant
  can offer honest advice on their own storefront

Known limitations are documented candidly in [`DECISIONS.md`](./DECISIONS.md#10-known-limitations) —
most importantly that verdict *quality* is currently unmeasured.

## Change the categories

Edit `LAUNCH_CATEGORIES` in `lib/advisor.ts`. Everything downstream — data fetching, verdict schema,
UI — is already category-agnostic.
