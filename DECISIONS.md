# Design decisions

Why this is built the way it is. Written for anyone reading the repo cold — including me,
six months from now, wondering what past-me was thinking.

---

## 1. Independence is the architecture, not the marketing

Most shopping recommendations are advertising wearing a lab coat. The revenue model
determines the advice: if you're paid on conversion, you cannot be the person who says
"don't buy this." Roughly three-quarters of people say they'd trust an AI shopping tool
*less* if its results were sponsored — so the obvious monetisation is also the thing that
destroys the product.

So independence is treated as a constraint the code has to satisfy, not a claim on a
landing page:

- `prompts/independence-charter.md` is versioned alongside the code, because it's a
  promise, and promises should have a change history.
- The same charter text is injected into every system prompt (`lib/advisor.ts`), so the
  model's behaviour and the public claim can't drift apart.
- The advisor is explicitly instructed to be willing to say *skip*, *wait*, and *the
  cheaper one*. The demo scripts include a `Skip` verdict for the same reason — if the
  happy path never refuses a sale, the promise is decorative.
- Every verdict carries an `independenceNote`, and shared text carries it too
  (`verdictToShareText`), so advice stays attributable when it leaves the app.

**The test that matters:** if a feature or revenue idea would break a charter line, it
doesn't ship. That rules out affiliate links, sponsored placement, and pay-to-rank — which
is precisely the moat, because incumbents' revenue depends on not being neutral.

## 2. A provider-agnostic data layer, with Shopify first

`lib/data/` defines one interface (`ShoppingProvider`) and the rest of the app depends only
on `ProductResult`. Two adapters implement it today: Shopify Storefront and SerpApi.

Why bother with the indirection for two providers?

- **The data source is the least stable part of the product.** Pricing APIs change terms,
  get acquired, or price you out. Product logic shouldn't move when that happens.
- **It makes the fallback honest.** `fetchProducts` returns `[]` on any failure, and the
  advisor falls back to its own knowledge rather than erroring. A missing API key degrades
  the answer; it never breaks the app.
- **It makes the tradeoff visible.** Shopify gives you one merchant's real catalog with
  real inventory. SerpApi gives you the whole web with less depth. Neither is strictly
  better, so the code supports both and picks by configuration.

Shopify is preferred when configured, and the app uses the **private** Storefront token
(`Shopify-Storefront-Private-Token`) rather than the public one, because this adapter only
ever runs server-side inside the API route. Using the browser-facing token on a server
would work — it's just the wrong tool, and the distinction is exactly the kind of thing
worth getting right.

## 3. Deal detection: where the platform work meets the thesis

The Storefront query asks for more than title and price. It asks for `compareAtPrice`,
`availableForSale`, and per-variant availability — and the adapter **discards a compare-at
price that isn't actually higher than the current price** (`lib/data/shopify.ts`).

That single condition is the most on-thesis code in the repo. A permanent "was $200, now
$120" where nothing ever sold at $200 is the oldest trick in retail. A tool that repeats
it back to you as a saving has quietly switched sides. So:

- Real markdowns are surfaced to the model as *"a real 23% markdown"*.
- Fake ones produce nothing at all, and the advisor is instructed to say plainly that the
  current price is just the price.
- Out-of-stock items are flagged early, because letting someone deliberate over something
  they can't buy wastes their time.

**A quirk worth knowing**, found by querying a real store rather than reading the docs:
Shopify returns `compareAtPriceRange` of **`"0.0"`, not `null`**, for products with no
markdown. A plausible-looking `compareAtPrice !== null` check would therefore render
"was $0.00" as a saving on every full-price item in the catalog. Comparing magnitudes
(`compareValue > priceValue`) is immune to it. There's a regression test pinning this,
derived from observed API behaviour.

### People ask questions; search engines want keywords

`lib/data/query.ts` exists because of a bug caught while testing against a real store. The
user's message was being passed verbatim to Shopify's catalog search — so the API was
literally being asked for *"Is the Compare at Price Snowboard worth it?"*, question mark
included. It matched nothing, returned zero products, and the app degraded gracefully to
"no live data" — which is exactly the right failure behaviour, and exactly why the bug was
invisible. Nothing errored. Nothing looked broken. The advice was just quietly worse.

The fix is deliberately unclever: strip stopwords and shopping filler, keep the nouns.
`"Is the Compare at Price Snowboard worth it?"` → `"compare snowboard"`. No stemming, no
NLP. The failure mode of over-aggressive filtering (dropping a real product word) is worse
than under-filtering, so the stopword list only contains words that are never part of a
product name. Single letters survive, because the "C" in "vitamin C serum" matters.

The wider lesson, which is why it's written up here: **a graceful fallback can hide a bug.**
Anything that silently degrades needs a way to tell "working" from "quietly doing nothing" —
which is part of why verdicts display their data source in the UI.

## 4. A structured verdict contract, not free-form chat

The model must return exactly one of three JSON shapes: `question`, `verdict`, or `reply`.

- **It makes the product's shape explicit.** A verdict has a call, reasons, *and at least
  one honest caveat*. Making `watchOut` structurally required means the interface itself
  enforces the honesty, rather than hoping the prose remembers.
- **It renders reliably.** The UI can style a verdict card properly instead of parsing prose.
- **It survives the model misbehaving.** `parseAdvisorResponse` strips code fences,
  recovers JSON embedded in chatty text, and degrades to a plain reply rather than
  throwing. This is the most heavily tested function in the codebase, because it's the
  seam most likely to fail in production.

The cost is real: structured output is less fluid than open chat, and the model
occasionally wants to say something that doesn't fit the schema. The `reply` type is the
escape hatch for exactly that.

## 5. Demo mode, because the first click matters

With no `ANTHROPIC_API_KEY`, the app serves scripted conversations rather than an error.
A reviewer opening the deployed URL gets a working product instead of a dead end.

The constraint: **demo responses disclose that they're scripted**, in both the question and
the verdict. A product whose premise is "I won't quietly mislead you" cannot quietly fake
its own intelligence. There's a test asserting this that will fail if anyone removes it.

## 6. Hardening proportionate to the stage

The chat endpoint validates message count, per-message size, total conversation size, and
roles; then rate-limits per client IP. Every rejected request is one that would otherwise
have cost API credits.

The rate limiter is deliberately in-process (`lib/ratelimit.ts`), and the file says so in
a comment: on serverless each instance keeps its own counter, so this bounds the realistic
failure — a runaway tab burning credits — rather than a determined attacker. Redis would
fix that properly and the interface wouldn't change. Shipping the simple version *and
documenting its limits* seemed more honest than either over-building or pretending.

## 7. Deliberately not built

Things left out, on purpose, so their absence reads as a choice:

- **Accounts and a database.** Saved verdicts use `localStorage` (`lib/storage.ts`). Until
  people return for a second opinion, cross-device sync solves a problem nobody has yet.
  The module boundary is drawn so a real datastore replaces it without touching the UI.
- **Affiliate links.** Structurally excluded. See above.
- **More categories.** Three (`laptops, sneakers, skincare`), chosen to span durable goods,
  fit-dependent goods, and ingredient-claim goods — different failure modes for advice.
  `LAUNCH_CATEGORIES` is a one-line change; the rest of the stack is category-agnostic.
- **Streaming responses.** Verdicts are structured JSON rendered as a card, so
  progressive text reveal buys little and complicates parsing.
- **Review/ratings data.** Shopify's Storefront API doesn't expose it (it lives in review
  apps), and `ProductResult` has the fields ready for a provider that does.

## 8. Keeping the dependency tree clean

The project started on Next 14.2.5, which carried a critical advisory, and the 14.x line
retained several high-severity ones (DoS via the image optimizer, request smuggling in
rewrites) that were only fixed in 16. None of them were reachable in this app — it uses no
`next/image`, no rewrites, and deploys to Vercel rather than self-hosting.

It was upgraded to **Next 16 / React 19** anyway, and `npm audit` now reports zero
vulnerabilities. The reasoning: "not exploitable in our configuration" is a judgement that
has to be re-made every time the code changes, and it's not a judgement a reviewer running
`npm audit` on the repo can verify at a glance. A clean tree is cheaper to maintain than a
documented-exception list.

## 9. Known limitations

Stated plainly, because a portfolio piece that claims to be finished is less credible than
one that knows what it isn't:

- Verdict quality is unmeasured. There's no eval set, no human rating, no way to know if
  the advice is *good* — only that it's well-formed. Phase 4 (testing with real solo
  deciders) is where that gets addressed.
- Shopify search quality is only as good as one store's catalog and Shopify's own query
  matching; there's no semantic fallback when a query doesn't match cleanly.
- The rate limiter's per-instance scope, as above.
- No observability. A production version would need structured logging and per-request
  cost tracking.
