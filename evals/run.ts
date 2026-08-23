// Eval runner — scores the advisor against the charter.
//
//   npm run eval              all cases
//   npm run eval -- --case=fake-discount     one case
//   npm run eval -- --runs=3  repeat each case (the model is non-deterministic; a check
//                             that passes once but not three times isn't really passing)
//
// This calls the real Anthropic API and therefore costs money, which is why it isn't part
// of `npm test` or CI. Run it when you change the system prompt — that's the change most
// likely to quietly break a promise, and the one unit tests cannot catch.

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, parseAdvisorResponse } from "../lib/advisor";
import { productsToContext } from "../lib/data";
import { CASES, type EvalCase } from "./cases";

type CaseOutcome = {
  id: string;
  run: number;
  passed: number;
  total: number;
  failures: { check: string; detail: string }[];
  error?: string;
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

function buildSystem(c: EvalCase): string {
  if (!c.products?.length) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}

LIVE PRODUCT DATA (current, from a real shopping search):
${productsToContext(c.products)}

Use this live data to ground your prices, comparisons, and alternatives — quote current prices from it and prefer these real options when relevant. It reflects today's market, so you can speak about price with confidence. If the user's question isn't covered by this list, lean on your own knowledge and gently note the price may have shifted.`;
}

async function runCase(client: Anthropic, c: EvalCase, run: number): Promise<CaseOutcome> {
  try {
    const completion = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1024,
      system: buildSystem(c),
      messages: c.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = completion.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseAdvisorResponse(text);
    const failures: CaseOutcome["failures"] = [];
    let passed = 0;

    for (const check of c.checks) {
      const result = check.run(parsed);
      if (result.pass) passed++;
      else failures.push({ check: check.name, detail: result.detail });
    }

    return { id: c.id, run, passed, total: c.checks.length, failures };
  } catch (err) {
    return {
      id: c.id,
      run,
      passed: 0,
      total: c.checks.length,
      failures: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Evals call the real API — add it to .env.local.");
    process.exit(1);
  }

  const only = arg("case");
  const runs = Number(arg("runs") ?? 1);
  const cases = only ? CASES.filter((c) => c.id === only) : CASES;

  if (cases.length === 0) {
    console.error(`No case matching "${only}". Available: ${CASES.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  console.log(`\nRunning ${cases.length} case(s) × ${runs} run(s) against the charter\n`);

  const outcomes: CaseOutcome[] = [];

  for (const c of cases) {
    for (let run = 1; run <= runs; run++) {
      const outcome = await runCase(client, c, run);
      outcomes.push(outcome);

      const label = runs > 1 ? `${c.id} (run ${run})` : c.id;
      if (outcome.error) {
        console.log(`  ERROR  ${label} — ${outcome.error}`);
      } else if (outcome.failures.length === 0) {
        console.log(`  PASS   ${label}  ${outcome.passed}/${outcome.total}`);
      } else {
        console.log(`  FAIL   ${label}  ${outcome.passed}/${outcome.total}`);
        console.log(`         ${c.description}`);
        for (const f of outcome.failures) {
          console.log(`         ✗ ${f.check} — ${f.detail}`);
        }
      }
    }
  }

  const totalChecks = outcomes.reduce((n, o) => n + o.total, 0);
  const totalPassed = outcomes.reduce((n, o) => n + o.passed, 0);
  const failedCases = outcomes.filter((o) => o.failures.length > 0 || o.error);

  console.log(`\n${totalPassed}/${totalChecks} checks passed across ${outcomes.length} run(s).`);

  if (failedCases.length > 0) {
    // Group repeated failures — a check that fails every run is a real regression, while
    // one that fails intermittently is a robustness problem. They deserve different fixes.
    const byCheck = new Map<string, number>();
    for (const o of failedCases) {
      for (const f of o.failures) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
    }
    console.log("\nFailures by check:");
    for (const [check, count] of [...byCheck].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}×  ${check}`);
    }
    process.exit(1);
  }

  console.log("Every promise held.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
