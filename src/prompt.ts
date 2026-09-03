import type { PromptModel, SelectedTag, Tag } from "./types";
export type PromptFormat =
  "model-default" | "tags" | "natural" | "natural-and-tags";
export type WeightMode = "non-default" | "always" | "off";
export type PromptFormatOptions = {
  weightMode?: WeightMode;
  separator?: ", " | "\n";
  template?: string;
};
const readable = (tag: Tag) =>
  (tag.displayName ?? tag.name).replaceAll("_", " ");
export function naiPrompt(selected: SelectedTag[], tags: Map<string, Tag>, weightMode: WeightMode = "non-default", separator = ", ") {
  return [...selected].sort((a, b) => a.order - b.order)
    .map((s) => {
      const tag = tags.get(s.id);
      const value = tag ? tag.name : s.id;
      return weightMode === "off" || (weightMode === "non-default" && s.weight === 1)
        ? value
        : `(${value}:${s.weight.toFixed(2).replace(/0$/, "")})`;
    })
    .join(separator);
}
function intensity(weight: number) {
  return weight >= 1.75
    ? "hyper "
    : weight >= 1.4
      ? "extremely "
      : weight >= 1.15
        ? "very "
        : weight < 0.9
          ? "slightly "
          : "";
}
export function naturalPrompt(selected: SelectedTag[], tags: Map<string, Tag>) {
  if (!selected.length) return "";
  // Taxonomy labels are user-defined, so natural phrasing keeps the explicit selected order.
  const words = selected.flatMap((s) => {
    const tag = tags.get(s.id);
    return tag ? [`${intensity(s.weight)}${readable(tag)}`] : [];
  });
  return words.join(", ");
}
export function generatePrompt(
  model: PromptModel,
  selected: SelectedTag[],
  tags: Map<string, Tag>,
) {
  return model === "NAI"
    ? naiPrompt(selected, tags)
    : naturalPrompt(selected, tags);
}
export function applyPromptTemplate(template: string, values: { tags: string; natural: string; positive: string; model: string; categories: Record<string, string> }) {
  if (!template.trim()) return values.positive;
  return template.replace(/\{(tags|natural|positive|model|category:([^}]+))\}/gi, (_, key, category) => {
    if (category) return values.categories[category.toLowerCase()] ?? "";
    return values[key.toLowerCase() as "tags" | "natural" | "positive" | "model"] ?? "";
  }).replace(/\n{3,}/g, "\n\n").trim();
}
export function formatPrompt(
  format: PromptFormat,
  model: PromptModel,
  selected: SelectedTag[],
  tags: Map<string, Tag>,
  options: PromptFormatOptions = {},
) {
  const separator = options.separator ?? ", ";
  const tagText = naiPrompt(selected, tags, options.weightMode ?? "non-default", separator);
  const natural = naturalPrompt(selected, tags);
  const base = format === "tags" ? tagText : format === "natural" ? natural : format === "natural-and-tags"
    ? natural && tagText ? `${natural}\n\nTags: ${tagText}` : natural || tagText
    : model === "NAI" ? tagText : natural;
  const categories = selected.reduce<Record<string, string[]>>((all, item) => {
    const tag = tags.get(item.id);
    if (tag) (all[tag.category.toLowerCase()] ??= []).push(tag.name);
    return all;
  }, {});
  return applyPromptTemplate(options.template ?? "", { tags: tagText, natural, positive: base, model, categories: Object.fromEntries(Object.entries(categories).map(([key, names]) => [key, names.join(separator)])) });
}
