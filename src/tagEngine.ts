import type { SelectedTag, Tag, TagRelationship } from './types'
export interface SelectionResult { selected: SelectedTag[]; conflicts: Tag[] }
export function addTag(tag: Tag, current: SelectedTag[], tags: Map<string, Tag>, relationships: TagRelationship[], replace = false): SelectionResult {
  if (current.some(s => s.id === tag.id)) return { selected: current.filter(s => s.id !== tag.id), conflicts: [] }
  const conflicts = relationships.filter(r => r.type === 'conflicts' && ((r.source === tag.id && current.some(s => s.id === r.target)) || (r.target === tag.id && current.some(s => s.id === r.source)))).map(r => tags.get(r.source === tag.id ? r.target : r.source)).filter((x): x is Tag => !!x)
  if (conflicts.length && !replace) return { selected: current, conflicts }
  const next = current.filter(s => !conflicts.some(c => c.id === s.id)); const add = (id: string, source: SelectedTag['source']) => { if (!next.some(s => s.id === id)) { const t = tags.get(id); next.push({ id, weight: t?.defaultWeight ?? 1, source, order: next.length }) } }
  add(tag.id, 'user'); let cursor = 0; while (cursor < next.length) { const id = next[cursor++].id; relationships.filter(r => r.source === id && (r.type === 'implies' || r.type === 'requires')).forEach(r => add(r.target, r.type === 'requires' ? 'dependency' : 'auto-added')) }
  // Taxonomy is authored per DLC, so selection order is never derived from a
  // hard-coded category list. Keep the user's order, then append dependencies.
  return { selected: next.map((s, order) => ({ ...s, order })), conflicts: [] }
}
