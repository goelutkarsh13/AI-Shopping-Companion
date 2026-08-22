// Turning a conversational question into a product search query.
//
// People type "Is the Compare at Price Snowboard worth it?" — but a catalog search API
// wants "compare price snowboard". Passing the raw sentence through matches nothing and
// silently produces zero results, which looks identical to "this store has no such
// product". This module is the translation layer between how people talk and what
// search engines accept.
//
// Deliberately dumb: stopword removal, no stemming, no NLP. The failure mode of being too
// aggressive (dropping a real product word) is worse than being too lax, so the list only
// contains words that are never part of a product name.

const STOPWORDS = new Set([
  // question framing
  "is", "are", "was", "were", "be", "been", "am",
  "do", "does", "did", "should", "would", "could", "can", "will", "shall",
  "i", "me", "my", "mine", "you", "your", "we", "us", "our", "it", "its",
  "this", "that", "these", "those", "there", "here",
  "a", "an", "the", "of", "for", "to", "in", "on", "at", "by", "with", "from",
  "and", "or", "but", "if", "then", "than", "so", "as", "too", "very", "just",
  // shopping filler
  "buy", "buying", "bought", "purchase", "purchasing", "get", "getting", "got",
  "worth", "worthwhile", "good", "bad", "better", "best", "great", "nice",
  "deal", "deals", "price", "priced", "cost", "costs", "expensive", "cheap",
  "recommend", "recommendation", "suggest", "opinion", "thoughts",
  "think", "thinking", "wonder", "wondering", "maybe", "perhaps", "probably",
  "help", "need", "needed", "want", "wanted", "looking", "look", "considering", "consider",
  "any", "some", "much", "many", "more", "most", "really", "actually",
  "please", "thanks", "hi", "hello", "hey",
  "one", "ones", "thing", "things", "stuff", "item", "product",
  "about", "like", "know", "tell", "what", "which", "who", "when", "where",
  "why", "how", "worthit",
]);

/** Words that carry meaning even though they'd otherwise look like stopwords. */
const MAX_TERMS = 8;

/**
 * Extract search terms from a conversational message.
 * Returns "" when nothing meaningful survives — callers should treat that as
 * "don't search", not as "search for everything".
 */
export function extractSearchTerms(message: string): string {
  if (!message) return "";

  const words = message
    .toLowerCase()
    // Keep letters, digits, and intra-word hyphens/apostrophes; drop everything else.
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter(Boolean);

  const kept = words.filter((w) => {
    if (STOPWORDS.has(w)) return false;
    // Single letters that survive the stopword list are usually meaningful — the "C" in
    // "vitamin C serum", the "X" in a model name — so they're kept. ("a" and "i" are
    // already stopwords.) Bare numbers are dropped: they're budgets, not product names.
    if (/^\d+$/.test(w)) return false;
    return true;
  });

  // If stripping left nothing, the message was pure filler — better to skip the search
  // than to query for junk.
  if (kept.length === 0) return "";

  return kept.slice(0, MAX_TERMS).join(" ");
}
