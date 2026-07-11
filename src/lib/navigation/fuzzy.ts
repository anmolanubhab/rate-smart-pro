// src/lib/navigation/fuzzy.ts
//
// Small, dependency-free fuzzy matcher used to score NavItems against a
// search query. Supports:
//  - exact / prefix matches (highest score)
//  - partial / substring matches
//  - subsequence ("fuzzy") matches, e.g. "ldgr" -> "Ledger"
//  - basic typo tolerance via Levenshtein distance on individual words
//
// Returns a score in [0, 1] (0 = no match). Higher is better.

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Classic edit distance, capped early for performance on short strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

/** True if `needle` is a subsequence of `haystack` (chars in order, gaps allowed). */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Score a single haystack string against the query. 0 = no match. */
function scoreOne(query: string, haystack: string): number {
  const q = normalize(query);
  const h = normalize(haystack);
  if (!q) return 0;

  if (h === q) return 1;
  if (h.startsWith(q)) return 0.92;
  if (h.includes(q)) return 0.8;

  // word-level typo tolerance: allow small edit distance against any word
  const words = h.split(/\s+/);
  for (const w of words) {
    if (w.length < 3) continue;
    const dist = levenshtein(q, w);
    const tolerance = q.length <= 4 ? 1 : 2;
    if (dist <= tolerance) {
      return Math.max(0.55, 0.7 - dist * 0.1);
    }
  }

  if (isSubsequence(q, h)) return 0.35;

  return 0;
}

/**
 * Score a NavItem's combined searchable text against a query.
 * Considers title (weighted highest), aliases, keywords, module and description.
 */
export function scoreItem(
  query: string,
  fields: { title: string; aliases?: string[]; keywords?: string[]; module?: string; description?: string }
): number {
  if (!query.trim()) return 1; // empty query matches everything equally

  const weighted: Array<[string, number]> = [
    [fields.title, 1],
    ...(fields.aliases ?? []).map((a) => [a, 0.95] as [string, number]),
    ...(fields.keywords ?? []).map((k) => [k, 0.75] as [string, number]),
    [fields.module ?? "", 0.6],
    [fields.description ?? "", 0.5],
  ];

  let best = 0;
  for (const [text, weight] of weighted) {
    if (!text) continue;
    const s = scoreOne(query, text) * weight;
    if (s > best) best = s;
  }
  return best;
}
