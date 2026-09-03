import type { Tag } from "./types";

export interface PromptAnalysisResult {
  sentences: string[];
  recognized: Tag[];
  unknown: string[];
  weights: Record<string, number>;
}

const cleanTerm = (value: string) =>
  value
    .replace(/^\((.+?):[\d.]+\)$/i, "$1")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();

const boundaryMatch = (text: string, term: string) => {
  const at = text.indexOf(term);
  if (at < 0) return -1;
  const before = text[at - 1];
  const after = text[at + term.length];
  return (!before || /\s/.test(before)) && (!after || /\s/.test(after)) ? at : -1;
};

/**
 * Finds catalog tags in both comma-separated tag prompts and natural-language
 * prose. It is deliberately read-only: this never creates catalog entries.
 */
export function analyzePromptText(
  rawPrompt: string,
  tags: Tag[],
): PromptAnalysisResult {
  const sentences = rawPrompt
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const aliases = tags
    .flatMap((tag) => [tag.name, tag.displayName ?? "", ...(tag.aliases ?? [])]
      .map((term) => ({ tag, term: cleanTerm(term) }))
      .filter((item) => item.term.length > 1))
    .sort((a, b) => b.term.length - a.term.length);
  const recognized = new Map<string, { tag: Tag; at: number; weight?: number }>();
  const unknown: string[] = [];
  const fragments = rawPrompt.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);

  let promptOffset = 0;
  for (const fragment of fragments) {
    const weighted = fragment.match(/^\(\s*(.+?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\)$/);
    const explicitWeight = weighted ? Number(weighted[2]) : undefined;
    const normalized = cleanTerm(fragment);
    const found = new Set<string>();
    for (const candidate of aliases) {
      const at = boundaryMatch(normalized, candidate.term);
      if (at < 0 || found.has(candidate.tag.id)) continue;
      found.add(candidate.tag.id);
      const current = recognized.get(candidate.tag.id);
      const absoluteAt = promptOffset + at;
      if (!current || absoluteAt < current.at) {
        recognized.set(candidate.tag.id, { tag: candidate.tag, at: absoluteAt, weight: explicitWeight });
      }
    }
    if (!found.size && fragment.length < 80) unknown.push(fragment);
    promptOffset += normalized.length + 1;
  }
  return {
    sentences,
    recognized: [...recognized.values()].sort((a, b) => a.at - b.at).map((item) => item.tag),
    unknown: [...new Set(unknown)].slice(0, 24),
    weights: Object.fromEntries([...recognized.values()].filter((item) => item.weight !== undefined).map((item) => [item.tag.id, item.weight!])),
  };
}
