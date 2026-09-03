import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Download,
  ExternalLink,
  Image,
  Link2,
  Package,
  Plus,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import dollSilhouette from "./assets/doll-silhouette.png";
import type { Category, SpriteLayer } from "./types";
import {
  ParameterCheckbox,
  ParameterSlider,
  PreviewChoiceGrid,
} from "./components/ParameterControls";
import "./styles.css";
import "./packStudio.css";
import "./responsive.css";
import "./packStudioResponsive.css";
import "./studioExtras.css";
import "./parameter-controls.css";
import "./studioOwner.css";

type DraftTag = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  nsfw: boolean;
  slider: boolean;
  description: string;
  display: "chip" | "preview" | "checkbox";
  min: number;
  max: number;
  defaultWeight: number;
  preview?: string;
  sprite?: SpriteLayer;
  sprites?: SpriteLayer[];
};
const isOwnerEdition = __ATELIER_EDITION__ === "owner";
type DraftTagForm = Omit<DraftTag, "id" | "nsfw">;
type DraftRule = {
  source: string;
  target: string;
  type: "suggests" | "implies" | "requires" | "conflicts";
  strength: number;
};
type ContextKind = "color" | "material" | "body-detail" | "accessory" | "pattern" | "custom";
type DraftGroup = { name: string; tags: string[]; context: ContextKind };
type StudioSource = "danbooru" | "e621" | "gelbooru" | "aibooru";
type SourceResult = {
  name?: string;
  id?: string | number;
  postCount?: number;
  url?: string;
  preview?: string;
  body?: string;
  category?: number | string;
  type?: string;
  tags?: string[];
};
type StudioMatch = {
  kind: "category" | "subcategory" | "group" | "rule";
  title: string;
  detail: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
};
type IconTarget = {
  id: string;
  type: "category" | "subcategory";
  label: string;
};
const clean = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const ICON_LIBRARY = [
  ["Essentials", [["◇", "general"], ["◌", "detail"], ["◈", "collection"], ["◉", "focus"], ["✦", "sparkle"], ["✧", "accent"], ["⌁", "flow"], ["◒", "balance"], ["♢", "diamond"], ["⚑", "flag"], ["⌘", "control"], ["✚", "add"]]],
  ["Character", [["♙", "character identity"], ["♔", "hero royalty"], ["⚥", "gender"], ["☯", "identity duality"], ["♧", "origin"], ["✪", "featured character"], ["◎", "portrait"], ["☻", "face"], ["♡", "heart"], ["☄", "magic character"]]],
  ["Body & face", [["◯", "body silhouette"], ["◍", "eyes iris"], ["◉", "eye pupil"], ["〰", "hair wave"], ["≋", "hair strands"], ["⌇", "lashes"], ["♨", "skin warmth"], ["✤", "marking tattoo"], ["◐", "ear feature"], ["☼", "complexion glow"]]],
  ["Wardrobe", [["♢", "outfit clothing"], ["▣", "top shirt"], ["▱", "bottom skirt"], ["△", "dress"], ["⌂", "hood outerwear"], ["⌁", "fabric material"], ["▦", "pattern textile"], ["◒", "accessory jewel"], ["♧", "bag"], ["♛", "headwear crown"]]],
  ["Expression & pose", [["☺", "smile emotion"], ["☹", "sad emotion"], ["!", "surprise"], ["♥", "love emotion"], ["☄", "energy action"], ["↗", "movement pose"], ["↻", "turning pose"], ["⌁", "gesture"], ["⚡", "dynamic action"], ["◁", "camera angle"]]],
  ["Scene", [["☾", "night scene"], ["☀", "day sun"], ["☁", "cloud weather"], ["☂", "rain weather"], ["❄", "snow winter"], ["♨", "steam heat"], ["⌂", "home location"], ["⌘", "city architecture"], ["♜", "castle fantasy"], ["♆", "water ocean"]]],
  ["Nature", [["✿", "flower plant"], ["❀", "blossom"], ["♣", "leaves plant"], ["♠", "forest"], ["☘", "clover"], ["♒", "water"], ["☽", "moon"], ["☄", "star space"], ["⌇", "rain"], ["◈", "crystal"]]],
  ["Objects", [["⚔", "weapon sword"], ["⚙", "machine gear"], ["⚗", "potion science"], ["♜", "vehicle chess"], ["✉", "letter paper"], ["✎", "writing"], ["♫", "music"], ["♩", "sound"], ["⌕", "search lens"], ["⚿", "key lock"]]],
  ["Metadata", [["#", "tag"], ["@", "artist author"], ["★", "quality favorite"], ["✓", "approved enabled"], ["⚠", "warning nsfw"], ["⊕", "group"], ["⇄", "relationship link"], ["▤", "list"], ["▦", "grid"], ["◫", "preview"]]],
] as const;
const ICON_FAMILIES = ["All", ...ICON_LIBRARY.map(([family]) => family)];
const SPRITE_SLOT_PRESETS: Record<SpriteLayer["slot"], Omit<SpriteLayer, "image">> = {
  "base": { slot: "base", layer: 0, anchor: "canvas", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "full-body", view: "front" },
  "skin": { slot: "skin", layer: 10, anchor: "canvas", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "none", view: "front" },
  "face": { slot: "face", layer: 20, anchor: "head", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "none", view: "front" },
  "hair-back": { slot: "hair-back", layer: 35, anchor: "head", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "none", view: "front" },
  "hair-front": { slot: "hair-front", layer: 45, anchor: "head", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "none", view: "front" },
  "legs": { slot: "legs", layer: 60, anchor: "waist", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "legs", view: "front" },
  "bottom": { slot: "bottom", layer: 65, anchor: "waist", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "legs", view: "front" },
  "dress": { slot: "dress", layer: 72, anchor: "torso", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "full-body", view: "front" },
  "top": { slot: "top", layer: 75, anchor: "torso", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "torso", view: "front" },
  "outerwear": { slot: "outerwear", layer: 85, anchor: "torso", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "torso", view: "front" },
  "shoes": { slot: "shoes", layer: 95, anchor: "feet", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "none", view: "front" },
  "headwear": { slot: "headwear", layer: 105, anchor: "head", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "none", view: "front" },
  "accessory": { slot: "accessory", layer: 110, anchor: "canvas", x: 0, y: 0, scale: 1, opacity: 1, blend: "normal", coverage: "none", view: "front" },
  "effect": { slot: "effect", layer: 125, anchor: "canvas", x: 0, y: 0, scale: 1, opacity: 1, blend: "screen", coverage: "none", view: "front" },
};
function Studio() {
  const [manifest, setManifest] = useState({
    id: "my-dlc",
    name: "My DLC",
    version: "1.0.0",
    author: "",
    description: "",
  });
  useEffect(() => {
    window.atelier?.getSetting("ui-preferences").then((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const preferences = value as { scale?: string; density?: string; reduceMotion?: boolean };
      const scale = ["90", "100", "110"].includes(preferences.scale ?? "") ? preferences.scale : "100";
      document.documentElement.style.setProperty("--atelier-scale", `${Number(scale) / 100}`);
      document.documentElement.dataset.density = preferences.density === "compact" ? "compact" : "comfortable";
      document.documentElement.dataset.motion = preferences.reduceMotion ? "reduced" : "full";
    }).catch(() => undefined);
  }, []);
  const [tags, setTags] = useState<DraftTag[]>([]);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tag, setTag] = useState<DraftTagForm>({
    name: "",
    category: "" as Category,
    subcategory: "",
    slider: false,
    description: "",
    display: "chip" as "chip" | "preview" | "checkbox",
    min: 0.5,
    max: 2,
    defaultWeight: 1,
    preview: "",
  });
  const [status, setStatus] = useState("");
  const [ownerAction, setOwnerAction] = useState<"validate" | "install" | "publish" | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [dependenciesText, setDependenciesText] = useState("");
  const [conflictsText, setConflictsText] = useState("");
  const [authorTab, setAuthorTab] = useState<"tag" | "sprite" | "explorer" | "rules" | "taxonomy">(
    "tag",
  );
  const [iconTarget, setIconTarget] = useState<IconTarget | null>(null);
  const [iconQuery, setIconQuery] = useState("");
  const [iconFamily, setIconFamily] = useState("All");
  const [customIcon, setCustomIcon] = useState("");
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [rule, setRule] = useState<DraftRule>({
    source: "",
    target: "",
    type: "suggests",
    strength: 0.7,
  });
  const [ruleTargetMode, setRuleTargetMode] = useState<"tag" | "group">("tag");
  const [ruleGroupName, setRuleGroupName] = useState("");
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupContext, setGroupContext] = useState<ContextKind>("custom");
  const [groupTags, setGroupTags] = useState<string[]>([]);
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [source, setSource] = useState<StudioSource>("danbooru");
  const [sourceMode, setSourceMode] = useState<
    "tags" | "gallery" | "wiki" | "pools" | "groups"
  >("tags");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [sourceSort, setSourceSort] = useState<"relevance" | "posts" | "name">("relevance");
  const [sourceSelection, setSourceSelection] = useState(0);
  const [artPreview, setArtPreview] = useState<SourceResult | null>(null);
  const [sourceGroupTitle, setSourceGroupTitle] = useState("");
  const [sourceMessage, setSourceMessage] = useState("");
  const [sourceRecords, setSourceRecords] = useState<
    { source: StudioSource; kind: string; item: SourceResult }[]
  >([]);
  const [explorerQuery, setExplorerQuery] = useState("");
  const [studioQuery, setStudioQuery] = useState("");
  const [explorerResults, setExplorerResults] = useState<SourceResult[]>([]);
  const [explorerIndex, setExplorerIndex] = useState(-1);
  const [explorerMessage, setExplorerMessage] = useState("");
  const [composerText, setComposerText] = useState("");
  const [composerCaret, setComposerCaret] = useState(0);
  const [composerIndex, setComposerIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [taxonomy, setTaxonomy] = useState<
    {
      id: string;
      name: string;
      scope: "appearance" | "character" | "wardrobe" | "scene";
      icon?: string | null;
      subcategories: { id: string; name: string; icon?: string | null }[];
    }[]
  >([]);
  const [taxonomyInput, setTaxonomyInput] = useState<{
    category: string;
    subcategory: string;
    scope: "character" | "wardrobe" | "scene";
  }>({
    category: "",
    subcategory: "",
    scope: "character",
  });
  useEffect(() => {
    window.atelier
      ?.listTaxonomy()
      .then(setTaxonomy)
      .catch(() => undefined);
  }, []);
  const addTaxonomy = async () => {
    const created = await window.atelier?.createTaxonomy(taxonomyInput);
    if (!created) return;
    setTaxonomy(await window.atelier!.listTaxonomy());
    setTag({
      ...tag,
      category: created.category,
      subcategory: created.subcategory,
    });
    setTaxonomyInput({ category: "", subcategory: "", scope: "character" });
  };
  const refreshTaxonomy = () =>
    window.atelier?.listTaxonomy().then(setTaxonomy);
  const renameTaxonomy = async (
    id: string,
    type: "category" | "subcategory",
    name: string,
  ) => {
    const next = window.prompt(`Rename ${type}`, name);
    if (!next || next === name) return;
    try {
      await window.atelier?.renameTaxonomy({ id, type, name: next });
      await refreshTaxonomy();
      setStatus("Taxonomy updated.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to rename taxonomy.",
      );
    }
  };
  const deleteTaxonomy = async (
    id: string,
    type: "category" | "subcategory",
  ) => {
    if (!window.confirm(`Delete this ${type}? Any assigned tags will be kept and moved into the editable Inbox.`))
      return;
    try {
      const result = await window.atelier?.deleteTaxonomy({ id, type });
      await refreshTaxonomy();
      setStatus(result?.movedTags ? `Taxonomy entry deleted; ${result.movedTags} tags moved to Inbox.` : "Taxonomy entry deleted.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to delete taxonomy.",
      );
    }
  };
  const setTaxonomyIcon = async (icon: string) => {
    if (!iconTarget) return;
    try {
      await window.atelier?.setTaxonomyIcon({
        id: iconTarget.id,
        type: iconTarget.type,
        icon,
      });
      await refreshTaxonomy();
      setStatus(`Icon updated for ${iconTarget.label}.`);
      setIconTarget(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update icon.");
    }
  };
  const openIconLibrary = (target: IconTarget) => {
    setIconQuery("");
    setIconFamily("All");
    setCustomIcon("");
    setIconTarget(target);
  };
  const visibleIcons = useMemo(
    () =>
      ICON_LIBRARY.filter(([family]) => iconFamily === "All" || family === iconFamily)
        .flatMap(([family, icons]) =>
          icons.map(([glyph, label]) => ({ family, glyph, label })),
        )
        .filter(({ label, family }) =>
          `${label} ${family}`.toLowerCase().includes(iconQuery.trim().toLowerCase()),
        ),
    [iconFamily, iconQuery],
  );
  const draft = useMemo(
    () => ({
      format: "prompt-atelier.dlc",
      formatVersion: 1,
      manifest: {
        ...manifest,
        dependencies: dependenciesText
          .split(/[,\n]/)
          .map(clean)
          .filter(Boolean),
        conflicts: conflictsText
          .split(/[,\n]/)
          .map(clean)
          .filter(Boolean),
        tagCount: tags.length,
        relationshipCount: rules.length,
        tagGroups: groups,
        sourceRecords,
        taxonomy: taxonomy.filter((entry) =>
          tags.some((tag) => tag.category === entry.name),
        ),
      },
      tags: tags.map((t) => ({
        ...t,
        displayName: null,
        aliases: [],
        enabled: true,
      })),
      relationships: rules.map((item) => ({
        ...item,
        source: tags.find((tag) => tag.name === item.source)?.id ?? item.source,
        target: tags.find((tag) => tag.name === item.target)?.id ?? item.target,
      })),
    }),
    [conflictsText, dependenciesText, groups, manifest, rules, sourceRecords, tags, taxonomy],
  );
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!manifest.id || !/^[a-z0-9][a-z0-9_-]*$/i.test(manifest.id))
      errors.push("Use a valid pack identifier.");
    if (!manifest.name.trim()) errors.push("Give the pack a name.");
    if (!tags.length) errors.push("Add at least one tag.");
    const dependencies = dependenciesText.split(/[,\n]/).map(clean).filter(Boolean);
    const conflicts = conflictsText.split(/[,\n]/).map(clean).filter(Boolean);
    if (dependencies.includes(manifest.id) || conflicts.includes(manifest.id))
      errors.push("A pack cannot depend on or conflict with itself.");
    if (dependencies.some((id) => conflicts.includes(id)))
      errors.push("A pack cannot both require and conflict with the same DLC.");
    if (new Set(dependencies).size !== dependencies.length || new Set(conflicts).size !== conflicts.length)
      errors.push("Remove duplicate dependency or conflict IDs.");
    const names = new Set<string>();
    for (const item of tags) {
      if (!/^[a-z0-9][a-z0-9_()'!+-]*$/i.test(item.name))
        errors.push(`${item.name || "Untitled tag"}: use a canonical tag name.`);
      if (names.has(item.name)) errors.push(`${item.name}: canonical tag names must be unique.`);
      names.add(item.name);
      if (!item.category || !item.subcategory)
        errors.push(`${item.name}: choose a category and subcategory.`);
      const taxonomyEntry = taxonomy.find((entry) => entry.name === item.category);
      if (!taxonomyEntry?.subcategories.some((subcategory) => subcategory.name === item.subcategory))
        errors.push(`${item.name}: its category path is missing from live taxonomy.`);
      if (item.slider && (item.min >= item.max || item.defaultWeight < item.min || item.defaultWeight > item.max))
        errors.push(`${item.name}: fix its weight range.`);
      if (item.preview && !item.preview.startsWith("data:image/"))
        errors.push(`${item.name}: preview must be an embedded image.`);
      if (item.preview && item.preview.length > 7_000_000)
        errors.push(`${item.name}: embedded preview exceeds the 5 MB limit.`);
    }
    for (const item of rules) {
      if (!tags.some((tag) => tag.name === item.source) || !tags.some((tag) => tag.name === item.target))
        errors.push("A rule points to a tag that no longer exists.");
      if (item.source === item.target) errors.push("A rule cannot target itself.");
      if (!Number.isFinite(item.strength) || item.strength < 0 || item.strength > 1)
        errors.push("Rule strength must be between 0 and 1.");
    }
    for (const group of groups) {
      if (!group.name.trim()) errors.push("Every contextual group needs a name.");
      if (!group.tags.length) errors.push(`${group.name || "A contextual group"}: add at least one tag.`);
      if (group.tags.some((name) => !names.has(name))) errors.push(`${group.name}: contains a tag not included in this DLC.`);
    }
    return errors;
  }, [conflictsText, dependenciesText, groups, manifest.id, manifest.name, rules, tags, taxonomy]);
  const visibleDraftTags = useMemo(() => {
    const query = clean(tagFilter);
    return tags
      .filter(
        (item) =>
          !query ||
          `${item.name} ${item.category} ${item.subcategory} ${item.description}`
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) =>
        `${a.category}\u0000${a.subcategory}\u0000${a.name}`.localeCompare(
          `${b.category}\u0000${b.subcategory}\u0000${b.name}`,
        ),
      );
  }, [tagFilter, tags]);
  const add = () => {
    const name = clean(tag.name);
    if (
      !name ||
      !tag.category ||
      !tag.subcategory ||
      tags.some((item) => item.name === name && item.id !== editingTagId)
    ) {
      setStatus(
        "Choose a category, subcategory, and unique canonical tag name.",
      );
      return;
    }
    if (tag.slider && (tag.min >= tag.max || tag.defaultWeight < tag.min || tag.defaultWeight > tag.max)) {
      setStatus("Weight minimum, default, and maximum must form a valid range.");
      return;
    }
    const previous = editingTagId
      ? tags.find((item) => item.id === editingTagId)
      : undefined;
    const nextTag: DraftTag = {
      id: `${manifest.id}-${name}`,
      name,
      category: tag.category,
      subcategory: tag.subcategory,
      nsfw: tag.category === "NSFW",
      slider: tag.slider,
      description: tag.description,
      display: tag.display,
      min: tag.min,
      max: tag.max,
      defaultWeight: tag.defaultWeight,
      preview: tag.preview || undefined,
      sprite: tag.sprite,
      sprites: tag.sprite ? [tag.sprite, ...(tag.sprites ?? [])] : tag.sprites,
    };
    setTags(
      editingTagId
        ? tags.map((item) =>
            item.id === editingTagId ? { ...nextTag, id: editingTagId } : item,
          )
        : [...tags, nextTag],
    );
    if (previous && previous.name !== name) {
      setRules((items) =>
        items.map((item) => ({
          ...item,
          source: item.source === previous.name ? name : item.source,
          target: item.target === previous.name ? name : item.target,
        })),
      );
      setGroups((items) =>
        items.map((group) => ({
          ...group,
          tags: group.tags.map((value) =>
            value === previous.name ? name : value,
          ),
        })),
      );
    }
    setEditingTagId(null);
    setTag({ ...tag, name: "", description: "", preview: "", sprite: undefined, sprites: undefined });
    setStatus("");
  };
  const exportDraft = async () => {
    if (validation.length) {
      setStatus(validation[0]);
      return;
    }
    const bridge = window.atelier as
      | (typeof window.atelier & {
          exportDraftPack?: (value: unknown) => Promise<boolean>;
        })
      | undefined;
    try {
      const saved = await bridge?.exportDraftPack?.(draft);
      setStatus(saved ? "Pack exported as .atelier-dlc." : "Export cancelled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to export this pack.");
    }
  };
  const validateOwnerDraft = async () => {
    if (validation.length) { setStatus(validation[0]); return false; }
    setOwnerAction("validate");
    try {
      const result = await window.atelier?.validateDlcDraft?.(draft);
      if (!result) throw new Error("Owner validation is unavailable in this build.");
      setStatus(result.valid ? `Release check passed: ${result.summary?.tags ?? 0} tags · ${result.summary?.relationships ?? 0} rules.` : result.issues[0]);
      return result.valid;
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to validate DLC."); return false; }
    finally { setOwnerAction(null); }
  };
  const installOwnerDraft = async () => {
    if (!(await validateOwnerDraft())) return;
    setOwnerAction("install");
    try {
      const result = await window.atelier?.installDlcDraft?.(draft);
      if (!result) throw new Error("Owner installation is unavailable in this build.");
      setStatus(`Installed locally: ${result.added} tags. Existing DLC with the same ID was replaced.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to install this DLC locally."); }
    finally { setOwnerAction(null); }
  };
  const publishOwnerDraft = async () => {
    if (!(await validateOwnerDraft())) return;
    setOwnerAction("publish");
    try {
      const result = await window.atelier?.publishDlcDraft?.(draft);
      if (!result) throw new Error("Owner publishing is unavailable in this build.");
      setStatus(`Published ${result.pack} ${result.version}: ${result.url}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to publish this DLC."); }
    finally { setOwnerAction(null); }
  };
  const openDraft = async () => {
    let value: unknown;
    try {
      value = await window.atelier?.openDraftPack?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to open this DLC.");
      return;
    }
    if (!value || typeof value !== "object") return;
    const loaded = value as {
      manifest: typeof manifest & {
        tagGroups?: DraftGroup[];
        sourceRecords?: typeof sourceRecords;
        dependencies?: string[];
        conflicts?: string[];
      };
      tags: DraftTag[];
      relationships: {
        source: string;
        target: string;
        type: DraftRule["type"];
        strength?: number;
      }[];
    };
    const knownTags = Array.isArray(loaded.tags) ? loaded.tags : [];
    const nameById = new Map(knownTags.map((item) => [item.id, item.name]));
    setManifest({ ...manifest, ...loaded.manifest });
    setTags(knownTags);
    setRules(
      (loaded.relationships ?? []).map((item) => ({
        ...item,
        source: nameById.get(item.source) ?? item.source,
        target: nameById.get(item.target) ?? item.target,
        strength: item.strength ?? 1,
      })),
    );
    setGroups(
      Array.isArray(loaded.manifest?.tagGroups)
        ? loaded.manifest.tagGroups.map((group) => ({ ...group, context: group.context ?? "custom" }))
        : [],
    );
    setSourceRecords(
      Array.isArray(loaded.manifest?.sourceRecords)
        ? loaded.manifest.sourceRecords
        : [],
    );
    setDependenciesText((loaded.manifest?.dependencies ?? []).join(", "));
    setConflictsText((loaded.manifest?.conflicts ?? []).join(", "));
    setStatus(`Opened ${loaded.manifest?.name ?? "pack"} for editing.`);
  };
  const addRule = () => {
    const targets =
      ruleTargetMode === "group"
        ? groups.find((group) => group.name === ruleGroupName)?.tags ?? []
        : rule.target
          ? [rule.target]
          : [];
    if (!tags.some((item) => item.name === rule.source) || !targets.length) {
      setStatus("Choose a trigger tag and a contextual tag or group.");
      return;
    }
    const additions = targets
      .filter((target) => target !== rule.source)
      .filter(
        (target) =>
          !rules.some(
            (item) =>
              item.source === rule.source &&
              item.target === target &&
              item.type === rule.type,
          ),
      )
      .map((target) => ({
        ...rule,
        target,
        strength: Math.min(1, Math.max(0, rule.strength || 0)),
      }));
    if (!additions.length) {
      setStatus("Those contextual links already exist.");
      return;
    }
    setRules([...rules, ...additions]);
    setRule({ source: "", target: "", type: "suggests", strength: 0.7 });
    setRuleGroupName("");
    setStatus(
      additions.length === 1
        ? "Contextual link created."
        : `${additions.length} contextual links created from the selected group.`,
    );
  };
  const addGroup = () => {
    const name = groupName.trim();
    if (!name || !groupTags.length) {
      setStatus("Name the group and choose at least one tag.");
      return;
    }
    if (
      !editingGroupName &&
      groups.some((group) => group.name.toLowerCase() === name.toLowerCase())
    ) {
      setStatus("A group with this name already exists.");
      return;
    }
    setGroups(
      editingGroupName
        ? groups.map((group) =>
            group.name === editingGroupName ? { name, tags: groupTags, context: groupContext } : group,
          )
        : [...groups, { name, tags: groupTags, context: groupContext }],
    );
    setGroupName("");
    setGroupTags([]);
    setEditingGroupName(null);
    setGroupContext("custom");
  };
  const editTag = (item: DraftTag) => {
    setEditingTagId(item.id);
    setTag({ name:item.name, category:item.category, subcategory:item.subcategory, slider:item.slider, description:item.description, display:item.display, min:item.min, max:item.max, defaultWeight:item.defaultWeight, preview:item.preview ?? "", sprite:item.sprite ?? item.sprites?.[0], sprites:item.sprites?.slice(1) });
    setAuthorTab("tag");
  };
  const removeTag = (id: string) => {
    const removed = tags.find((item) => item.id === id);
    if (!removed) return;
    setTags((items) => items.filter((item) => item.id !== id));
    setRules((items) =>
      items.filter(
        (item) => item.source !== removed.name && item.target !== removed.name,
      ),
    );
    setGroups((items) =>
      items
        .map((group) => ({
          ...group,
          tags: group.tags.filter((name) => name !== removed.name),
        }))
        .filter((group) => group.tags.length),
    );
    setGroupTags((items) => items.filter((name) => name !== removed.name));
    if (editingTagId === id) setEditingTagId(null);
    setStatus(`Removed ${removed.name} and its related draft rules.`);
  };
  const resetTagEditor = () => {
    setEditingTagId(null);
    setTag({
      name: "",
      category: "",
      subcategory: "",
      slider: false,
      description: "",
      display: "chip",
      min: 0.5,
      max: 2,
      defaultWeight: 1,
      preview: "",
      sprite: undefined,
      sprites: undefined,
    });
    setStatus("Tag editor cleared.");
  };
  const findCanonicalTag = () => {
    setSourceMode("tags");
    setSourceQuery(tag.name);
    setSourceResults([]);
    setSourceSelection(-1);
    setAuthorTab("explorer");
    if (tag.name) void inspectCanonicalFromPost(tag.name);
  };
  const newDraft = () => {
    if (
      tags.length &&
      !window.confirm("Start a new draft? Unsaved changes in this Pack Studio window will be lost.")
    )
      return;
    setManifest({ id: "my-dlc", name: "My DLC", version: "1.0.0", author: "", description: "" });
    setDependenciesText("");
    setConflictsText("");
    setTags([]);
    setRules([]);
    setGroups([]);
    setSourceRecords([]);
    setEditingTagId(null);
    setTag({ name: "", category: "", subcategory: "", slider: false, description: "", display: "chip", min: 0.5, max: 2, defaultWeight: 1, preview: "", sprite: undefined, sprites: undefined });
    setStatus("New DLC draft ready.");
  };
  const searchSource = async () => {
    const bridge = window.atelier as
      | (typeof window.atelier & {
          studioSourceSearch?: (
            source: StudioSource,
            mode: string,
            query: string,
          ) => Promise<SourceResult[]>;
        })
      | undefined;
    if (!sourceQuery.trim()) {
      setSourceMessage("Enter a tag, pool, or wiki query.");
      return;
    }
    setSourceMessage("Searching source…");
    setSourceGroupTitle("");
    try {
      const results =
        (await bridge?.studioSourceSearch?.(source, sourceMode, sourceQuery)) ??
        [];
      setSourceResults(results as SourceResult[]);
      setSourceSelection(results.length ? 0 : -1);
      setSourceMessage(
        results.length ? `${results.length} results` : "No results.",
      );
    } catch (error) {
      setSourceResults([]);
      setSourceMessage(
        error instanceof Error ? error.message : "Source request failed.",
      );
    }
  };
  const bringTagIntoDraft = (result: SourceResult) => {
    const name = clean(result.name ?? "");
    if (!name || tags.some((item) => item.name === name)) return;
    const category = tag.category;
    if (!category || !tag.subcategory) {
      setStatus("Choose a Pack Studio category and subcategory before adding a source tag.");
      return;
    }
    setTags([
      ...tags,
      {
        id: `${manifest.id}-${name}`,
        name,
        category,
        subcategory: tag.subcategory,
        nsfw: category === "NSFW",
        slider: false,
        description: result.body?.slice(0, 500) ?? "",
        display: "chip",
        min: 0.5,
        max: 2,
        defaultWeight: 1,
        preview: result.preview,
      },
    ]);
    setSourceRecords((records) =>
      records.some(
        (record) =>
          record.source === source &&
          record.kind === "tags" &&
          (record.item.url === result.url || record.item.id === result.id),
      )
        ? records
        : [...records, { source, kind: "tags", item: result }],
    );
    setStatus(`${name} added to this draft. Review its category and controls before export.`);
  };
  const bringGalleryTagsIntoDraft = (result: SourceResult) => {
    if (!tag.category || !tag.subcategory) {
      setStatus("Choose a category and subcategory before importing post tags.");
      return;
    }
    const names = [...new Set((result.tags ?? []).map(clean).filter(Boolean))];
    const existing = new Set(tags.map((item) => item.name));
    const additions = names
      .filter((name) => !existing.has(name))
      .map((name) => ({
        id: `${manifest.id}-${name}`,
        name,
        category: tag.category,
        subcategory: tag.subcategory,
        nsfw: tag.category === "NSFW",
        slider: false,
        description: `Referenced by source post ${result.id ?? ""}.`.trim(),
        display: "chip" as const,
        min: 0.5,
        max: 2,
        defaultWeight: 1,
      }));
    setTags((items) => [...items, ...additions]);
    keepSourceRecord(result);
    setStatus(additions.length ? `Added ${additions.length} visible post tags to this DLC.` : "All visible post tags are already in this DLC.");
  };
  const inspectCanonicalFromPost = async (name: string) => {
    setSourceMode("tags");
    setSourceQuery(name);
    setSourceMessage("Looking up canonical tag…");
    try {
      const results = (await window.atelier?.studioSourceSearch(source, "tags", name) ?? []) as SourceResult[];
      setSourceResults(results);
      setSourceSelection(results.length ? 0 : -1);
      setSourceMessage(results.length ? `${results.length} canonical matches for ${name}.` : "No canonical match found.");
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : "Canonical lookup failed.");
    }
  };
  const keepSourceRecord = (item: SourceResult) => {
    if (
      sourceRecords.some(
        (record) =>
          record.source === source &&
          record.kind === sourceMode &&
          (record.item.url === item.url || record.item.id === item.id),
      )
    ) {
      setStatus("This source reference is already saved with the draft.");
      return;
    }
    setSourceRecords((records) => [...records, { source, kind: sourceMode, item }]);
    setStatus("Source reference saved with this DLC draft.");
  };
  const openSourceGroup = async (item: SourceResult) => {
    if (!item.name) return;
    const bridge = window.atelier as
      | (typeof window.atelier & {
          openSourceGroup?: (
            source: StudioSource,
            title: string,
          ) => Promise<{ title: string; body: string; items: SourceResult[] }>;
        })
      | undefined;
    setSourceMessage("Opening tag group…");
    try {
      const result = await bridge?.openSourceGroup?.(source, item.name);
      if (!result) return;
      const items = result.items as SourceResult[];
      setSourceResults(items);
      setSourceSelection(items.length ? 0 : -1);
      setSourceGroupTitle(result.title);
      setSourceMessage(
        items.length
          ? `${items.length} entries extracted from ${result.title}.`
          : "This group has no extractable tag links.",
      );
    } catch (error) {
      setSourceMessage(
        error instanceof Error ? error.message : "Unable to open this group.",
      );
    }
  };
  const addExtractedGroupTags = () => {
    if (!tag.category || !tag.subcategory) {
      setStatus("Choose a Pack Studio category and subcategory before adding group tags.");
      return;
    }
    const entries = sourceResults.filter((item) => item.type === "group tag");
    const existing = new Set(tags.map((item) => item.name));
    const additions = entries
      .map((item) => ({ item, name: clean(item.name ?? "") }))
      .filter(({ name }) => name && !existing.has(name))
      .map(({ item, name }) => ({
        id: `${manifest.id}-${name}`,
        name,
        category: tag.category,
        subcategory: tag.subcategory,
        nsfw: tag.category === "NSFW",
        slider: false,
        description: item.body?.slice(0, 500) ?? "",
        display: "chip" as const,
        min: 0.5,
        max: 2,
        defaultWeight: 1,
      }));
    setTags((items) => [...items, ...additions]);
    setStatus(additions.length ? `Added ${additions.length} tags from ${sourceGroupTitle || "this group"}.` : "All extracted group tags are already in this DLC.");
  };
  const explorerItems = useMemo(() => {
    const query = clean(explorerQuery);
    const local: SourceResult[] = tags
      .filter((item) => !query || `${item.name} ${item.description}`.includes(query))
      .map((item) => ({ name: item.name, id: item.id, body: item.description, type: "draft tag" }));
    const remote = explorerResults.filter(
      (item) => !local.some((localItem) => localItem.name === item.name),
    );
    return [...local, ...remote];
  }, [explorerQuery, explorerResults, tags]);
  const studioMatches = useMemo(() => {
    const query = clean(studioQuery);
    if (!query) return [];
    const matches: StudioMatch[] = [];
    for (const entry of taxonomy) {
      if (entry.name.toLowerCase().includes(query))
        matches.push({ kind: "category", title: entry.name, detail: `${entry.scope} category`, category: entry.name });
      for (const sub of entry.subcategories)
        if (`${entry.name} ${sub.name}`.toLowerCase().includes(query))
          matches.push({ kind: "subcategory", title: sub.name, detail: entry.name, category: entry.name, subcategory: sub.name });
    }
    for (const group of groups)
      if (`${group.name} ${group.tags.join(" ")}`.toLowerCase().includes(query))
        matches.push({ kind: "group", title: group.name, detail: `${group.tags.length} tags`, tags: group.tags });
    for (const item of rules)
      if (`${item.source} ${item.type} ${item.target}`.toLowerCase().includes(query))
        matches.push({ kind: "rule", title: `${item.source} ${item.type} ${item.target}`, detail: "Relationship rule" });
    return matches.slice(0, 12);
  }, [groups, rules, studioQuery, taxonomy]);
  const applyStudioMatch = (match: StudioMatch) => {
    if (match.kind === "category" || match.kind === "subcategory") {
      setTag({ ...tag, category: match.category ?? "", subcategory: match.subcategory ?? "" });
      setAuthorTab("tag");
      setStatus(`Tag editor positioned at ${match.category}${match.subcategory ? ` › ${match.subcategory}` : ""}.`);
      return;
    }
    if (match.kind === "group") {
      setComposerText((text) => `${text}${text.trim() ? ", " : ""}${(match.tags ?? []).join(", ")}`);
      setStatus(`Inserted ${match.title} into the composer.`);
      return;
    }
    setAuthorTab("rules");
  };
  const sortedSourceResults = useMemo(() => {
    const rows = [...sourceResults];
    if (sourceSort === "posts")
      return rows.sort((a, b) => (b.postCount ?? 0) - (a.postCount ?? 0));
    if (sourceSort === "name")
      return rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return rows;
  }, [sourceResults, sourceSort]);
  const selectedSourceResult = sortedSourceResults[sourceSelection] ?? null;
  const loadExplorerTag = (result: SourceResult) => {
    if (!result.name) return;
    setTag({
      ...tag,
      name: clean(result.name),
      description: result.body?.slice(0, 500) || tag.description,
    });
    setExplorerQuery(result.name);
    setExplorerIndex(-1);
    setStatus("Loaded into the tag form. Choose its taxonomy and save it explicitly.");
  };
  const composerQuery = clean(
    composerText.slice(0, composerCaret).split(/[,;\n]/).pop() ?? "",
  );
  const composerSuggestions = useMemo(
    () => explorerItems.filter((item) => !composerQuery || clean(item.name ?? "").includes(composerQuery)).slice(0, 8),
    [composerQuery, explorerItems],
  );
  const insertComposerTag = (result: SourceResult) => {
    const name = result.name;
    if (!name) return;
    const before = composerText.slice(0, composerCaret);
    const after = composerText.slice(composerCaret);
    const tokenStart = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("\n")) + 1;
    const inserted = `${before.slice(0, tokenStart)}${tokenStart && !/\s$/.test(before.slice(0, tokenStart)) ? " " : ""}${name}, `;
    const next = `${inserted}${after}`;
    const nextCaret = inserted.length;
    setComposerText(next);
    setComposerCaret(nextCaret);
    setComposerIndex(0);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };
  const lookupExplorer = async () => {
    if (!explorerQuery.trim()) {
      setExplorerMessage("Type a tag, alias, or concept first.");
      return;
    }
    const bridge = window.atelier as
      | (typeof window.atelier & {
          studioSourceSearch?: (source: StudioSource, mode: string, query: string) => Promise<SourceResult[]>;
        })
      | undefined;
    setExplorerMessage("Looking up canonical tags…");
    try {
      const results = (await bridge?.studioSourceSearch?.(source, "tags", explorerQuery) ?? []) as SourceResult[];
      setExplorerResults(results);
      setExplorerMessage(results.length ? `${results.length} canonical matches from ${source}.` : "No source matches.");
      setExplorerIndex(results.length ? 0 : -1);
    } catch (error) {
      setExplorerResults([]);
      setExplorerMessage(error instanceof Error ? error.message : "Source lookup failed.");
    }
  };
  const embedPreview = async (url: string) => {
    try {
      const preview = await window.atelier?.embedSourceAsset(url);
      if (!preview) return;
      setTag({ ...tag, preview });
      setStatus("Preview embedded in this DLC draft.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to embed preview.",
      );
    }
  };
  const embedLocalPreview = async () => {
    try {
      const preview = await window.atelier?.embedLocalPreview();
      if (!preview) return;
      setTag({ ...tag, preview });
      setStatus("Local preview embedded in this DLC draft.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to embed local preview.");
    }
  };
  const defaultSprite = (): SpriteLayer => ({
    image: tag.preview || "",
    slot: "accessory",
    layer: 50,
    anchor: "canvas",
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    blend: "normal",
    coverage: "none",
    view: "front",
  });
  const updateSprite = (patch: Partial<SpriteLayer>) =>
    setTag({ ...tag, sprite: { ...(tag.sprite ?? defaultSprite()), ...patch } });
  const applySpritePreset = (slot: SpriteLayer["slot"]) =>
    setTag({
      ...tag,
      sprite: { ...SPRITE_SLOT_PRESETS[slot], image: tag.sprite?.image ?? tag.preview ?? "" },
    });
  const resetSpritePlacement = () => {
    const current = tag.sprite ?? defaultSprite();
    setTag({ ...tag, sprite: { ...SPRITE_SLOT_PRESETS[current.slot], image: current.image, tint: current.tint } });
  };
  const discardCurrentSprite = () => {
    setTag({ ...tag, sprite: undefined });
    setStatus("Current unsaved layer discarded.");
  };
  const embedSprite = async () => {
    try {
      const image = await window.atelier?.embedLocalPreview();
      if (!image) return;
      updateSprite({ image });
      setTag((current) => ({
        ...current,
        preview: current.preview || image,
        sprite: { ...(current.sprite ?? defaultSprite()), image },
      }));
      setStatus("Sprite layer embedded. Adjust its anchor and draw order below.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to embed sprite layer.");
    }
  };
  const saveSpriteLayer = () => {
    if (!tag.sprite?.image) {
      setStatus("Embed a transparent sprite image before adding a layer.");
      return;
    }
    setTag({ ...tag, sprites: [...(tag.sprites ?? []), tag.sprite], sprite: undefined });
    setStatus("Layer saved. Embed the next part or select a saved layer to refine it.");
  };
  const editSpriteLayer = (index: number) => {
    const layers = tag.sprites ?? [];
    const selected = layers[index];
    if (!selected) return;
    const remaining = layers.filter((_, itemIndex) => itemIndex !== index);
    setTag({
      ...tag,
      sprite: selected,
      sprites: tag.sprite?.image ? [...remaining, tag.sprite] : remaining,
    });
  };
  const removeSpriteLayer = (index: number) => {
    setTag({ ...tag, sprites: (tag.sprites ?? []).filter((_, itemIndex) => itemIndex !== index) });
    setStatus("Saved sprite layer removed.");
  };
  return (
    <main className="studio">
      <header>
        <div className="brand">
          <Package size={18} />
          <span>Pack Studio</span>
          <small>{isOwnerEdition ? "OWNER DLC AUTHORING" : "PUBLIC DLC AUTHORING"}</small>
        </div>
        <button className="ghost" onClick={exportDraft}>
          <Download size={15} /> Export .atelier-dlc
        </button>
        {isOwnerEdition && <button className="ghost" disabled={!!validation.length || !!ownerAction} onClick={validateOwnerDraft} title="Run the same validation used before local installation and publishing">
          {ownerAction === "validate" ? "Checking…" : "Preflight"}
        </button>}
        {isOwnerEdition && <button className="ghost" disabled={!!validation.length || !!ownerAction} onClick={installOwnerDraft} title="Install or replace this DLC locally for testing">
          {ownerAction === "install" ? "Installing…" : "Install locally"}
        </button>}
        {isOwnerEdition && <button className="ghost secondary studio-publish-button" disabled={!!validation.length || !!ownerAction} onClick={publishOwnerDraft} title="Validate and publish this exact DLC to the configured GitHub release repository">
          <ExternalLink size={15} /> {ownerAction === "publish" ? "Publishing DLC…" : "PUBLISH DLC"}
        </button>}
        <button className="ghost" onClick={openDraft}>
          Open .atelier-dlc
        </button>
        <button className="ghost secondary" onClick={newDraft}>
          New draft
        </button>
      </header>
      <section className="studio-grid">
        <aside>
          <h2>Pack manifest</h2>
          <label>
            Identifier
            <input
              value={manifest.id}
              onChange={(e) =>
                setManifest({ ...manifest, id: clean(e.target.value) })
              }
            />
          </label>
          <label>
            Name
            <input
              value={manifest.name}
              onChange={(e) =>
                setManifest({ ...manifest, name: e.target.value })
              }
            />
          </label>
          <label>
            Version
            <input
              value={manifest.version}
              onChange={(e) =>
                setManifest({ ...manifest, version: e.target.value })
              }
            />
          </label>
          <label>
            Author
            <input
              value={manifest.author}
              onChange={(e) =>
                setManifest({ ...manifest, author: e.target.value })
              }
            />
          </label>
          <label>
            Description
            <textarea
              value={manifest.description}
              onChange={(e) =>
                setManifest({ ...manifest, description: e.target.value })
              }
            />
          </label>
          <label>
            Required pack IDs
            <input
              value={dependenciesText}
              onChange={(e) => setDependenciesText(e.target.value)}
              placeholder="fantasy-tools, shared-wardrobe"
            />
          </label>
          <label>
            Conflicting pack IDs
            <input
              value={conflictsText}
              onChange={(e) => setConflictsText(e.target.value)}
              placeholder="alternative-wardrobe"
            />
          </label>
          <p>
            {tags.length} tags · {rules.length} rules · {groups.length} groups
          </p>
          <div className={`pack-health ${validation.length ? "has-errors" : "ready"}`}>
            <b>{validation.length ? `${validation.length} item(s) to fix` : "Ready to export"}</b>
            {validation.length ? <ul>{validation.slice(0, 5).map((item) => <li key={item}>{item}</li>)}{validation.length > 5 && <li>+{validation.length - 5} more issues</li>}</ul> : <small>All tag records, taxonomy paths, previews, groups, and local rules are valid.</small>}
          </div>
        </aside>
        <section className="studio-main">
          <div className="studio-tabs" role="tablist">
            <button
              className={authorTab === "tag" ? "active" : ""}
              onClick={() => setAuthorTab("tag")}
            >
              Tag controls
            </button>
            <button
              className={authorTab === "sprite" ? "active" : ""}
              onClick={() => setAuthorTab("sprite")}
            >
              Preview slots
            </button>
            <button
              className={authorTab === "explorer" ? "active" : ""}
              onClick={() => setAuthorTab("explorer")}
            >
              Find & source
            </button>
            <button
              className={authorTab === "rules" ? "active" : ""}
              onClick={() => setAuthorTab("rules")}
            >
              Rules & groups
            </button>
            <button
              className={authorTab === "taxonomy" ? "active" : ""}
              onClick={() => setAuthorTab("taxonomy")}
            >
              Taxonomy
            </button>
          </div>
          {authorTab === "tag" && (
            <section className="tag-editor">
              <header>
                <div>
                  <small>{editingTagId ? "EDITING DRAFT TAG" : "NEW DRAFT TAG"}</small>
                  <h2>{editingTagId ? "Refine tag" : "Create canonical tag"}</h2>
                  <p>Define the canonical name, place it in your live taxonomy, then choose how it behaves in the selector.</p>
                </div>
                <div className="tag-editor-actions">
                  <button onClick={findCanonicalTag}><Search size={14} /> Find canonical</button>
                  <button onClick={resetTagEditor}>Reset form</button>
                </div>
              </header>
              <div className="tag-editor-core">
                <label className="tag-name-field">
                  Canonical tag name
                  <input
                    autoFocus
                    placeholder="e.g. moonlit_armor"
                    value={tag.name}
                    spellCheck={false}
                    onChange={(event) => setTag({ ...tag, name: clean(event.target.value) })}
                  />
                  <small>Underscores are used automatically; this is the name exported into the DLC.</small>
                </label>
                <div className="tag-placement">
                  <label>
                    1 · Category
                    <select
                      value={tag.category}
                      onChange={(event) => {
                        const category = event.target.value;
                        setTag({
                          ...tag,
                          category,
                          subcategory: taxonomy.find((item) => item.name === category)?.subcategories[0]?.name ?? "",
                        });
                      }}
                    >
                      <option value="">Choose category</option>
                      {taxonomy.map((category) => <option key={category.id} value={category.name}>{category.icon ? `${category.icon} ` : ""}{category.name}</option>)}
                    </select>
                  </label>
                  <label>
                    2 · Subcategory
                    <select
                      value={tag.subcategory}
                      disabled={!tag.category}
                      onChange={(event) => setTag({ ...tag, subcategory: event.target.value })}
                    >
                      <option value="">Choose subcategory</option>
                      {(taxonomy.find((item) => item.name === tag.category)?.subcategories ?? []).map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.icon ? `${subcategory.icon} ` : ""}{subcategory.name}</option>)}
                    </select>
                  </label>
                  <div className="tag-path-preview"><small>Placement</small><b>{tag.category && tag.subcategory ? `${tag.category} › ${tag.subcategory}` : "Choose a category path"}</b></div>
                </div>
              </div>
            </section>
          )}
          {authorTab === "sprite" && (
            <section className="sprite-workbench">
              <header>
                <div>
                  <small>PREVIEW INVENTORY · {tag.name || "UNNAMED TAG"}</small>
                  <h2>Place a preview in an inventory slot</h2>
                  <p>Attach a transparent preview to the tag, choose the inventory slot it represents, then check its fit. The asset stays embedded in this DLC.</p>
                </div>
                <div className="sprite-header-actions"><button disabled={!tag.sprite?.image} onClick={saveSpriteLayer}>Finish layer</button><button className="replace" onClick={embedSprite}><Image size={14} /> Import transparent asset</button></div>
              </header>
              <ol className="sprite-steps"><li className={tag.sprite?.image ? "done" : "active"}><b>1</b><span>Add preview<small>PNG or WebP</small></span></li><li className={tag.sprite?.image ? "active" : ""}><b>2</b><span>Choose slot<small>inventory placement</small></span></li><li className={tag.sprite?.image ? "active" : ""}><b>3</b><span>Check fit<small>anchor and nudges</small></span></li></ol>
              <div className="sprite-editor-grid">
                <div className="sprite-stage-wrap">
                  <div className="sprite-stage-toolbar"><span>FRONT · 2048 × 2048</span><button onClick={resetSpritePlacement} disabled={!tag.sprite?.image}>Reset to slot</button><button onClick={discardCurrentSprite} disabled={!tag.sprite?.image}>Discard</button></div>
                  <div className="sprite-stage" aria-label="Sprite placement preview">
                    <img className="sprite-body-guide" src={dollSilhouette} alt="Body alignment guide" />
                    <div className="sprite-stage-guides"><span>HEAD</span><span>TORSO</span><span>WAIST</span><span>FEET</span></div>
                    {tag.sprite?.image ? <img className="sprite-current" src={tag.sprite.image} alt="Current preview" style={{ left: `${50 + tag.sprite.x}%`, top: `${50 + tag.sprite.y}%`, transform: `translate(-50%, -50%) scale(${tag.sprite.scale})`, opacity: tag.sprite.opacity, mixBlendMode: tag.sprite.blend }} /> : <button className="sprite-stage-empty" onClick={embedSprite}><Image size={17} /><b>Add a transparent preview</b><small>Full 2048 × 2048 canvas · PNG/WebP</small></button>}
                  </div>
                  <div className="sprite-nudge"><span>Fine nudge</span><button disabled={!tag.sprite?.image} onClick={() => updateSprite({ y: (tag.sprite?.y ?? 0) - 1 })}>↑</button><button disabled={!tag.sprite?.image} onClick={() => updateSprite({ x: (tag.sprite?.x ?? 0) - 1 })}>←</button><button disabled={!tag.sprite?.image} onClick={() => updateSprite({ y: (tag.sprite?.y ?? 0) + 1 })}>↓</button><button disabled={!tag.sprite?.image} onClick={() => updateSprite({ x: (tag.sprite?.x ?? 0) + 1 })}>→</button></div>
                </div>
                <div className="sprite-controls">
                  <section className="sprite-slot-picker"><div><small>2 · INVENTORY SLOT</small><b>Where should this preview appear?</b></div><div className="sprite-slot-grid">{(Object.keys(SPRITE_SLOT_PRESETS) as SpriteLayer["slot"][]).map((slot) => <button key={slot} className={(tag.sprite?.slot ?? "") === slot ? "active" : ""} onClick={() => applySpritePreset(slot)}><b>{slot.replace("-", " ")}</b><small>display order {SPRITE_SLOT_PRESETS[slot].layer}</small></button>)}</div></section>
                  <section className="sprite-placement-controls"><div><small>3 · PLACEMENT</small><b>Fine-tune only after using the correct master canvas</b></div><div className="sprite-selects"><label>Anchor<select value={tag.sprite?.anchor ?? "canvas"} onChange={(event) => updateSprite({ anchor: event.target.value as SpriteLayer["anchor"] })}>{["canvas", "head", "torso", "waist", "feet", "left-hand", "right-hand"].map((value) => <option key={value}>{value}</option>)}</select></label><label>View<select value={tag.sprite?.view ?? "front"} onChange={(event) => updateSprite({ view: event.target.value as SpriteLayer["view"] })}><option value="front">Front</option><option value="back">Back</option><option value="side">Side</option></select></label><label>Coverage<select value={tag.sprite?.coverage ?? "none"} onChange={(event) => updateSprite({ coverage: event.target.value as SpriteLayer["coverage"] })}>{["none", "torso", "legs", "full-body"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Blend<select value={tag.sprite?.blend ?? "normal"} onChange={(event) => updateSprite({ blend: event.target.value as SpriteLayer["blend"] })}>{["normal", "multiply", "screen", "overlay"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="sprite-order"><label>Draw order<input type="number" value={tag.sprite?.layer ?? 50} onChange={(event) => updateSprite({ layer: Number(event.target.value) })} /></label><small>Higher numbers draw on top. Slot presets choose a safe starting position.</small></div><ParameterSlider label="Horizontal adjustment" value={tag.sprite?.x ?? 0} min={-12} max={12} step={1} onChange={(x) => updateSprite({ x })} reset={() => updateSprite({ x: 0 })} /><ParameterSlider label="Vertical adjustment" value={tag.sprite?.y ?? 0} min={-12} max={12} step={1} onChange={(y) => updateSprite({ y })} reset={() => updateSprite({ y: 0 })} /><ParameterSlider label="Scale" value={tag.sprite?.scale ?? 1} min={0.8} max={1.2} step={0.01} onChange={(scale) => updateSprite({ scale })} reset={() => updateSprite({ scale: 1 })} /><ParameterSlider label="Opacity" value={tag.sprite?.opacity ?? 1} min={0} max={1} step={0.05} onChange={(opacity) => updateSprite({ opacity })} reset={() => updateSprite({ opacity: 1 })} /></section>
                </div>
              </div>
              <div className="sprite-stack"><div><small>TAG PREVIEW INVENTORY</small><b>{(tag.sprites?.length ?? 0) + Number(!!tag.sprite?.image)} preview(s)</b></div>{tag.sprite?.image && <article className="current"><span>Editing</span><b>{tag.sprite.slot}</b><em>order {tag.sprite.layer} · {tag.sprite.anchor}</em></article>}{(tag.sprites ?? []).map((layer, index) => <article key={`${layer.slot}-${layer.layer}-${index}`}><button className="sprite-layer-edit" onClick={() => editSpriteLayer(index)}><span>{layer.slot}</span><b>Preview {index + 1}</b><em>{layer.anchor} · {layer.view}</em></button><button className="sprite-layer-remove" onClick={() => removeSpriteLayer(index)}>×</button></article>)}{!(tag.sprites?.length || tag.sprite?.image) && <p>No preview yet. This tag will still work in prompts.</p>}</div>
              <p className="sprite-note">The master canvas is the alignment system. Use adjustment only for a tiny correction; redraw a misaligned asset on 2048 × 2048 instead.</p>
            </section>
          )}
          {authorTab === "taxonomy" && (
            <section className="taxonomy-workbench">
              <header>
                <div>
                  <small>CATALOG STRUCTURE</small>
                  <h2>Categories and subcategories</h2>
                  <p>
                    Build the navigation used by this catalog. Changes are live:
                    tag controls and Prompt Atelier pick up the updated structure.
                  </p>
                </div>
                <div className="taxonomy-header-actions"><span>{taxonomy.length} categories</span><button onClick={async () => { await window.atelier?.restoreStarterTaxonomy(); await refreshTaxonomy(); setStatus("Basic starter taxonomy restored."); }}>Restore basic structure</button></div>
              </header>
              <div className="taxonomy-create">
                <label>
                  Category
                  <input
                    placeholder="e.g. Wardrobe"
                    value={taxonomyInput.category}
                    onChange={(event) =>
                      setTaxonomyInput({ ...taxonomyInput, category: event.target.value })
                    }
                  />
                </label>
                <label>
                  Subcategory
                  <input
                    placeholder="e.g. Outerwear"
                    value={taxonomyInput.subcategory}
                    onChange={(event) =>
                      setTaxonomyInput({ ...taxonomyInput, subcategory: event.target.value })
                    }
                  />
                </label>
                <label>
                  Workspace
                  <select
                    value={taxonomyInput.scope}
                    onChange={(event) =>
                      setTaxonomyInput({
                        ...taxonomyInput,
                        scope: event.target.value as "character" | "wardrobe" | "scene",
                      })
                    }
                  >
                    <option value="character">Character</option>
                    <option value="wardrobe">Wardrobe</option>
                    <option value="scene">Scene</option>
                  </select>
                </label>
                <button className="replace" onClick={addTaxonomy}>
                  <Plus size={15} /> Add to catalog
                </button>
              </div>
              <div className="taxonomy-cards">
                {taxonomy.map((entry) => (
                  <article key={entry.id}>
                    <div className="taxonomy-card-head">
                      <button
                        className="taxonomy-icon"
                        onClick={() =>
                          openIconLibrary({ id: entry.id, type: "category", label: entry.name })
                        }
                        title="Choose category icon"
                      >
                        {entry.icon || "◇"}
                      </button>
                      <span><b>{entry.name}</b><small>{entry.scope === "scene" ? "Scene" : entry.scope === "wardrobe" ? "Wardrobe" : "Character"}</small></span>
                      <button onClick={() => renameTaxonomy(entry.id, "category", entry.name)}>Rename</button>
                      <button className="danger" onClick={() => deleteTaxonomy(entry.id, "category")}>Delete</button>
                    </div>
                    <div className="taxonomy-subcards">
                      {entry.subcategories.map((sub) => (
                        <div key={sub.id}>
                          <button
                            className="taxonomy-icon small"
                            onClick={() => openIconLibrary({ id: sub.id, type: "subcategory", label: `${entry.name} › ${sub.name}` })}
                            title="Choose subcategory icon"
                          >
                            {sub.icon || "◌"}
                          </button>
                          <b>{sub.name}</b>
                          <button onClick={() => renameTaxonomy(sub.id, "subcategory", sub.name)}>Rename</button>
                          <button className="danger" onClick={() => deleteTaxonomy(sub.id, "subcategory")}>×</button>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              {iconTarget && (
                <aside className="icon-library">
                  <header>
                    <span><small>ICON LIBRARY</small><b>{iconTarget.label}</b></span>
                    <button onClick={() => setIconTarget(null)}>Close</button>
                  </header>
                  <label className="icon-search">
                    <Search size={13} />
                    <input
                      value={iconQuery}
                      onChange={(event) => setIconQuery(event.target.value)}
                      placeholder="Search icons…"
                      autoFocus
                    />
                  </label>
                  <div className="icon-families" aria-label="Icon family">
                    {ICON_FAMILIES.map((family) => (
                      <button
                        key={family}
                        className={iconFamily === family ? "active" : ""}
                        onClick={() => setIconFamily(family)}
                      >
                        {family}
                      </button>
                    ))}
                  </div>
                  <div className="icon-grid">
                    {visibleIcons.map(({ family, glyph, label }, index) => (
                      <button
                        key={`${family}-${glyph}-${index}`}
                        title={`${family}: ${label}`}
                        aria-label={`${family}: ${label}`}
                        onClick={() => setTaxonomyIcon(glyph)}
                      >
                        {glyph}
                      </button>
                    ))}
                    {!visibleIcons.length && <p>No matching icons.</p>}
                  </div>
                  <div className="custom-icon">
                    <input
                      value={customIcon}
                      onChange={(event) => setCustomIcon(event.target.value.slice(0, 8))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && customIcon.trim()) setTaxonomyIcon(customIcon.trim());
                      }}
                      placeholder="Paste a symbol or emoji"
                      aria-label="Custom icon"
                    />
                    <button disabled={!customIcon.trim()} onClick={() => setTaxonomyIcon(customIcon.trim())}>Use</button>
                    <button className="clear-icon" onClick={() => setTaxonomyIcon("")}>None</button>
                  </div>
                </aside>
              )}
            </section>
          )}
          {false && authorTab === "explorer" && (
            <section className="tag-explorer">
              <header>
                <div>
                  <small>CANONICAL TAG AUTOCOMPLETE</small>
                  <h2>Find, inspect, then add deliberately</h2>
                  <p>Local matches appear while you type. One click opens the inspector; double-click or “Load into tag form” prepares the tag for an explicit save.</p>
                </div>
              </header>
              <section className="studio-search">
                <label>
                  <Search size={14} />
                  <input
                    value={studioQuery}
                    onChange={(event) => setStudioQuery(event.target.value)}
                    placeholder="Search categories, subcategories, groups, or rules…"
                  />
                </label>
                {studioMatches.length > 0 && (
                  <div>
                    {studioMatches.map((match, index) => (
                      <button key={`${match.kind}-${match.title}-${index}`} onClick={() => applyStudioMatch(match)}>
                        <b>{match.title}</b><small>{match.kind} · {match.detail}</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <div className="explorer-input">
                <Search size={17} />
                <input
                  autoFocus
                  value={explorerQuery}
                  placeholder="Type canonical name, alias, or concept…"
                  onChange={(event) => { setExplorerQuery(event.target.value); setExplorerIndex(-1); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") { event.preventDefault(); setExplorerIndex((value) => Math.min(explorerItems.length - 1, value + 1)); }
                    if (event.key === "ArrowUp") { event.preventDefault(); setExplorerIndex((value) => Math.max(0, value - 1)); }
                    if (event.key === "Escape") { setExplorerIndex(-1); setExplorerResults([]); }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const current = explorerItems[explorerIndex];
                      if (current) loadExplorerTag(current);
                      else lookupExplorer();
                    }
                  }}
                />
                <kbd>↑ ↓</kbd><kbd>Enter</kbd>
                <button className="replace" onClick={lookupExplorer}>Lookup source</button>
              </div>
              <small className="explorer-help">Local results are immediate · source lookup adds canonical spelling, post count, wiki snippets, and previews · nothing is added until you save it.</small>
              <section className="tag-composer">
                <header>
                  <span><b>Tag composer</b><small>IDE-style scratchpad — draft prompt text without changing this DLC.</small></span>
                  <div><button onClick={() => window.atelier?.copy(composerText)}>Copy</button><button onClick={() => { setComposerText(""); setComposerCaret(0); }}>Clear</button></div>
                </header>
                <div className="composer-editor">
                  <span aria-hidden="true">1</span>
                  <textarea
                    ref={composerRef}
                    value={composerText}
                    placeholder="Start writing tags here…"
                    onClick={(event) => setComposerCaret(event.currentTarget.selectionStart)}
                    onKeyUp={(event) => setComposerCaret(event.currentTarget.selectionStart)}
                    onChange={(event) => { setComposerText(event.target.value); setComposerCaret(event.target.selectionStart); setComposerIndex(0); }}
                    onKeyDown={(event) => {
                      if (!composerSuggestions.length) return;
                      if (event.key === "ArrowDown") { event.preventDefault(); setComposerIndex((value) => Math.min(composerSuggestions.length - 1, value + 1)); }
                      if (event.key === "ArrowUp") { event.preventDefault(); setComposerIndex((value) => Math.max(0, value - 1)); }
                      if (event.key === "Tab" || (event.key === "Enter" && composerQuery)) { event.preventDefault(); insertComposerTag(composerSuggestions[composerIndex] ?? composerSuggestions[0]); }
                    }}
                  />
                  {composerQuery && composerSuggestions.length > 0 && <div className="composer-suggestions">{composerSuggestions.map((item, index) => <button key={`${item.id ?? item.name}-${index}`} className={index === composerIndex ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => insertComposerTag(item)}><b>{item.name}</b><small>{item.postCount ? `${item.postCount.toLocaleString()} posts` : item.type ?? "draft"}</small><kbd>{index + 1}</kbd></button>)}</div>}
                </div>
                <small className="composer-help">Tab or Enter accepts a suggestion · ↑/↓ moves through matches · commas start the next tag.</small>
              </section>
              <div className="explorer-layout">
                <div className="explorer-results" role="listbox" aria-label="Tag matches">
                  {explorerItems.length ? explorerItems.map((item, index) => (
                    <button key={`${item.id ?? item.name}-${index}`} className={index === explorerIndex ? "active" : ""} onMouseEnter={() => setExplorerIndex(index)} onClick={() => setExplorerIndex(index)} onDoubleClick={() => loadExplorerTag(item)}>
                      {item.preview ? <img src={item.preview} alt="" /> : <i><Tags size={15} /></i>}
                      <span><b>{item.name}</b><small>{item.postCount ? `${item.postCount.toLocaleString()} posts` : item.type ?? "local draft"}</small></span>
                      <Plus size={14} />
                    </button>
                  )) : <div className="explorer-empty">Start typing to filter this draft, or look up an exact source tag.</div>}
                </div>
                <aside className="explorer-inspector">
                  {explorerItems[explorerIndex] ? (() => {
                    const item = explorerItems[explorerIndex];
                    return <><div className="explorer-preview">{item.preview ? <img src={item.preview} alt="" /> : <Tags size={25} />}</div><small>TAG KNOWLEDGE</small><h3>{item.name}</h3><p>{item.body || "No local description or wiki excerpt is available yet."}</p><dl><div><dt>Source</dt><dd>{item.type ?? source}</dd></div><div><dt>Posts</dt><dd>{item.postCount?.toLocaleString() ?? "—"}</dd></div></dl><button className="replace" onClick={() => loadExplorerTag(item)}>Load into tag form</button>{item.url && <button onClick={() => window.atelier?.openExternal(item.url!)}><ExternalLink size={13} /> Open source page</button>}</>;
                  })() : <div className="explorer-empty">Select a result to study its available source information.</div>}
                </aside>
              </div>
              {explorerMessage && <small className="source-message">{explorerMessage}</small>}
            </section>
          )}
          {authorTab === "tag" && (
            <section className="tag-controls-panel">
              <label>
                Mini description
                <textarea
                  value={tag.description}
                  placeholder="Short local explanation for the tag card"
                  onChange={(e) =>
                    setTag({ ...tag, description: e.target.value })
                  }
                />
              </label>
              <div className="draft-preview">
                {tag.preview ? (
                  <img src={tag.preview} alt="Embedded tag preview" />
                ) : (
                  <span>
                    NO PREVIEW
                    <br />
                    Choose an art result below
                  </span>
                )}
                <button
                  onClick={() => setTag({ ...tag, preview: "" })}
                  disabled={!tag.preview}
                >
                  Clear
                </button>
                <button className="embed-local" onClick={embedLocalPreview}>
                  <Image size={12} /> Embed local image
                </button>
              </div>
              <PreviewChoiceGrid
                label="Grid representation"
                value={
                  tag.display === "chip" ? 0 : tag.display === "preview" ? 1 : 2
                }
                onChange={(value) =>
                  setTag({
                    ...tag,
                    display:
                      value === 0
                        ? "chip"
                        : value === 1
                          ? "preview"
                          : "checkbox",
                  })
                }
                choices={[
                  { value: 0, title: "Chip", preview: "—" },
                  { value: 1, title: "Preview", preview: "◈" },
                  { value: 2, title: "Toggle", preview: "✓" },
                ]}
              />
              <ParameterCheckbox
                label="Allow prompt emphasis"
                detail="Give this tag its own adjustable range after selection."
                checked={tag.slider}
                onChange={(checked) => setTag({ ...tag, slider: checked })}
              />
              {tag.slider && (
                <div className="weight-controls">
                  <div className="weight-range">
                    <label>Minimum<input type="number" step="0.05" value={tag.min} onChange={(event) => setTag({ ...tag, min: +event.target.value })} /></label>
                    <label>Maximum<input type="number" step="0.05" value={tag.max} onChange={(event) => setTag({ ...tag, max: +event.target.value })} /></label>
                  </div>
                  <ParameterSlider
                    label="Default weight"
                    value={tag.defaultWeight}
                    min={tag.min}
                    max={tag.max}
                    step={0.05}
                    onChange={(value) => setTag({ ...tag, defaultWeight: value })}
                    reset={() => setTag({ ...tag, defaultWeight: 1 })}
                  />
                </div>
              )}
              <div className="tag-save-row">
                <span>{tag.name && tag.category && tag.subcategory ? "Ready to add to this DLC" : "Name and category path are required"}</span>
                <button className="replace" onClick={add}>
                  <Plus size={15} /> {editingTagId ? "Save tag changes" : "Add tag to DLC"}
                </button>
              </div>
            </section>
          )}
          {authorTab === "tag" && (
            <div className="studio-list">
              <div className="draft-list-toolbar">
                <b>Draft tags</b>
                <input
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  placeholder="Filter tags, paths, descriptions…"
                />
                <small>{visibleDraftTags.length}/{tags.length}</small>
              </div>
              {tags.length ? (
                visibleDraftTags.map((item) => (
                  <article key={item.id}>
                    <code>{item.name}</code>
                    <span>
                      {item.category} › {item.subcategory}
                    </span>
                    <button onClick={() => editTag(item)}>Edit</button>
                    <button
                      onClick={() => removeTag(item.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty">
                  This DLC is empty. Create canonical tags here, then export and
                  import the pack into Prompt Atelier.
                </div>
              )}
            </div>
          )}
          {authorTab === "rules" && (
            <section className="studio-rules">
              <h2>
                <Link2 size={15} /> Connect tags
              </h2>
              <p className="section-lead">
                Create contextual behavior from one trigger tag to another tag or an authored group. Group targets expand into individual, portable DLC rules on export.
              </p>
              <div className="rule-mode">
                <button className={ruleTargetMode === "tag" ? "active" : ""} onClick={() => setRuleTargetMode("tag")}>One tag</button>
                <button className={ruleTargetMode === "group" ? "active" : ""} onClick={() => setRuleTargetMode("group")}>Tag group</button>
                <small>{ruleTargetMode === "group" ? "Every tag in the chosen group becomes a contextual target." : "Create one precise relationship."}</small>
              </div>
              <div className="rule-form">
                <select
                  value={rule.source}
                  onChange={(e) => setRule({ ...rule, source: e.target.value })}
                >
                  <option value="">Source tag</option>
                  {tags.map((item) => (
                    <option key={item.id}>{item.name}</option>
                  ))}
                </select>
                <select
                  value={rule.type}
                  onChange={(e) =>
                    setRule({
                      ...rule,
                      type: e.target.value as DraftRule["type"],
                    })
                  }
                >
                  <option value="suggests">Contextual addition — suggest it</option>
                  <option value="implies">Implies — add automatically</option>
                  <option value="requires">Requires — add dependency</option>
                  <option value="conflicts">Conflicts — prevent pairing</option>
                </select>
                {ruleTargetMode === "tag" ? (
                  <select
                    value={rule.target}
                    onChange={(e) => setRule({ ...rule, target: e.target.value })}
                  >
                    <option value="">Contextual tag</option>
                    {tags.map((item) => <option key={item.id}>{item.name}</option>)}
                  </select>
                ) : (
                  <select value={ruleGroupName} onChange={(e) => setRuleGroupName(e.target.value)}>
                    <option value="">Contextual group</option>
                    {groups.map((group) => <option key={group.name}>{group.name} · {group.tags.length} tags</option>)}
                  </select>
                )}
                <input
                  type="number"
                  min="0"
                  max="1"
                  step=".05"
                  value={rule.strength}
                  onChange={(e) =>
                    setRule({ ...rule, strength: +e.target.value })
                  }
                />
                <button className="replace" onClick={addRule}>
                  Create connection
                </button>
              </div>
              <div className="rule-chips">
                {rules.map((item, index) => (
                  <button
                    key={`${item.source}-${item.target}-${index}`}
                    onClick={() =>
                      setRules(rules.filter((_, i) => i !== index))
                    }
                  >
                    {item.source} {item.type} {item.target} <Trash2 size={12} />
                  </button>
                ))}
              </div>
              <div className="group-builder-head">
                <div><small>CONTEXTUAL ADDITIONS</small><h3>{editingGroupName ? `Edit ${editingGroupName}` : "Create a contextual addition set"}</h3><p>Group the additions a base tag may need: colors, materials, body details, accessories, patterns, or your own type.</p></div>
                {editingGroupName && <button onClick={() => { setEditingGroupName(null); setGroupName(""); setGroupTags([]); }}>Cancel edit</button>}
              </div>
              <div className="group-form">
                <input
                  placeholder="Set name, e.g. Fabric materials"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
                <select value={groupContext} onChange={(event) => setGroupContext(event.target.value as ContextKind)}>
                  <option value="color">Color</option>
                  <option value="material">Material</option>
                  <option value="body-detail">Body detail</option>
                  <option value="accessory">Accessory</option>
                  <option value="pattern">Pattern</option>
                  <option value="custom">Custom addition</option>
                </select>
                <button className="replace" onClick={addGroup}>{editingGroupName ? "Save group" : "Create group"}</button>
              </div>
              <div className="group-picker-toolbar"><input value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} placeholder="Filter tags for this group…"/><span>{groupTags.length} selected</span><button onClick={() => setGroupTags(tags.filter((item) => !groupFilter || item.name.includes(groupFilter.toLowerCase())).map((item) => item.name))}>Select visible</button><button onClick={() => setGroupTags([])}>Clear</button></div>
              <div className="group-tag-picker">
                {tags.filter((item) => !groupFilter || `${item.name} ${item.category} ${item.subcategory}`.toLowerCase().includes(groupFilter.toLowerCase())).map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={groupTags.includes(item.name)}
                      onChange={() =>
                        setGroupTags(
                          groupTags.includes(item.name)
                            ? groupTags.filter((name) => name !== item.name)
                            : [...groupTags, item.name],
                        )
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
              {groups.map((group) => (
                <div className="saved-group" key={group.name}>
                  <span>
                    <b>{group.name}</b> · {group.context.replace("-", " ")} · {group.tags.length} tags
                  </span>
                  <span className="group-actions"><button onClick={() => { setEditingGroupName(group.name); setGroupName(group.name); setGroupTags(group.tags); setGroupContext(group.context); }}>Edit</button><button onClick={() => { setRuleTargetMode("group"); setRuleGroupName(group.name); }}>Use in rule</button><button className="danger" onClick={() => setGroups(groups.filter((item) => item.name !== group.name))}>Remove</button></span>
                </div>
              ))}
            </section>
          )}
          {authorTab === "explorer" && (
            <section className="studio-sources">
              <header className="source-library-header"><div><small>CANONICAL TAGS &amp; SOURCE MATERIAL</small><h2><Search size={16} /> Source library</h2><p>One place for canonical tag lookup, post galleries, visible post tags, wiki pages, pools, and source groups. Nothing enters the DLC until you choose an action.</p></div><span>{source.toUpperCase()}</span></header>
              <div className="source-destination">
                <b>Current destination</b>
                <span>
                  {tag.category && tag.subcategory
                    ? `${tag.category} › ${tag.subcategory}`
                    : "Choose a category and subcategory in the tag bar above."}
                </span>
              </div>
              <div className="source-form">
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as StudioSource)}
                >
                  <option value="danbooru">Danbooru</option>
                  <option value="e621">e621</option>
                  <option value="gelbooru">Gelbooru</option>
                  <option value="aibooru">AIBooru</option>
                </select>
                <div className="source-mode-tabs">
                  {(
                    ["tags", "gallery", "wiki", "pools", "groups"] as const
                  ).map((mode) => (
                    <button
                      key={mode}
                      className={sourceMode === mode ? "active" : ""}
                      onClick={() => setSourceMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  placeholder={sourceMode === "tags" ? "Canonical tag, e.g. blue hair" : sourceMode === "gallery" ? "Tags for art gallery, e.g. school_uniform" : "Search source library"}
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchSource()}
                />
                <button className="replace" onClick={searchSource}>
                  <Search size={14} /> Search
                </button>
                <select
                  value={sourceSort}
                  onChange={(event) =>
                    setSourceSort(event.target.value as typeof sourceSort)
                  }
                  title="Sort source results"
                >
                  <option value="relevance">Best match</option>
                  <option value="posts">Most posts</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
              {sourceMessage && (
                <small className="source-message">{sourceMessage}</small>
              )}
              {sourceGroupTitle && (
                <div className="group-extract-bar">
                  <span><b>{sourceGroupTitle}</b><small>Extracted group entries are ready for the current destination.</small></span>
                  <button onClick={addExtractedGroupTags}><Plus size={14} /> Add all group tags</button>
                  <button onClick={() => { setSourceGroupTitle(""); setSourceResults([]); setSourceSelection(-1); }}>Close group</button>
                </div>
              )}
              <div className="source-browser">
                <div className={`source-results ${sourceMode === "gallery" ? "gallery-results" : ""}`} role="listbox" aria-label="Source results">
                  {sortedSourceResults.map((item, index) => (
                    <button
                      key={`${item.id ?? item.name}-${index}`}
                      className={index === sourceSelection ? "active" : ""}
                      onClick={() => setSourceSelection(index)}
                    >
                      {item.preview ? <img src={item.preview} alt="" /> : <i><Image size={17} /></i>}
                      <span><b>{item.name ?? `#${item.id}`}</b><small>{item.postCount ? `${item.postCount.toLocaleString()} posts` : (item.type ?? "source item")}</small>{sourceMode === "gallery" && item.tags?.length ? <em className="gallery-tag-count">{item.tags.length} tags</em> : null}</span>
                      <span className="source-kind">{sourceMode}</span>
                    </button>
                  ))}
                </div>
                <aside className="source-inspector">
                  {selectedSourceResult ? <>
                    {selectedSourceResult.preview ? <button className="source-inspector-preview source-art-open" onClick={() => setArtPreview(selectedSourceResult)} title="Open larger art preview"><img src={selectedSourceResult.preview} alt={`Preview for ${selectedSourceResult.name ?? "source result"}`} /><span>Open preview</span></button> : <div className="source-inspector-preview"><Image size={26} /></div>}
                    <small>{source.toUpperCase()} · {sourceMode.toUpperCase()}</small>
                    <h3>{selectedSourceResult.name ?? `#${selectedSourceResult.id}`}</h3>
                    <p>{selectedSourceResult.body || (sourceMode === "gallery" ? "Inspect the visible post tags below, open any tag canonically, or import the visible set to the current destination." : "No text excerpt is available for this source item.")}</p>
                    {selectedSourceResult.tags?.length ? <div className="source-post-tags"><div><b>Visible post tags</b><small>{selectedSourceResult.tags.length} extracted from this result</small></div><section>{selectedSourceResult.tags.slice(0, 80).map((name) => <button key={name} onClick={() => inspectCanonicalFromPost(name)} title="Open canonical tag lookup">{name}</button>)}</section>{selectedSourceResult.tags.length > 80 && <small>Showing the first 80 tags; use the source page for the full post metadata.</small>}</div> : null}
                    <div className="source-actions">
                      {selectedSourceResult.type?.includes("tag group") && <button className="replace" onClick={() => openSourceGroup(selectedSourceResult)}><ExternalLink size={14} /> Open group</button>}
                      {selectedSourceResult.name && (sourceMode === "tags" || selectedSourceResult.type === "group tag") && <button className="replace" onClick={() => bringTagIntoDraft(selectedSourceResult)}><Plus size={14} /> Add to draft</button>}
                      {sourceMode === "tags" && selectedSourceResult.name && <button onClick={() => { loadExplorerTag(selectedSourceResult); setAuthorTab("tag"); }}><Tags size={14} /> Open in tag controls</button>}
                      {sourceMode === "gallery" && selectedSourceResult.tags?.length ? <button className="replace" onClick={() => bringGalleryTagsIntoDraft(selectedSourceResult)}><Plus size={14} /> Add post tags</button> : null}
                      <button onClick={() => keepSourceRecord(selectedSourceResult)}>Keep reference</button>
                      {selectedSourceResult.preview && <button onClick={() => embedPreview(selectedSourceResult.preview!)}><Image size={14} /> Use as preview</button>}
                      {selectedSourceResult.preview && <button onClick={() => window.atelier?.downloadSourceAsset(selectedSourceResult.preview!, selectedSourceResult.name ?? "source-asset")}><Download size={14} /> Download</button>}
                      {selectedSourceResult.url && <button onClick={() => window.atelier?.openExternal(selectedSourceResult.url!)}><ExternalLink size={14} /> Open source</button>}
                    </div>
                  </> : <div className="explorer-empty">Run a search, then select a result to inspect or import it.</div>}
                </aside>
              </div>
              {sourceRecords.length > 0 && (
                <div className="source-records"><b>Saved source references · {sourceRecords.length}</b>{sourceRecords.map((record, index) => <span key={`${record.source}-${record.kind}-${record.item.id ?? index}`}>{record.source} · {record.item.name ?? record.item.id}<button onClick={() => setSourceRecords((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>
              )}
            </section>
          )}
          {status && <div className="toast">{status}</div>}
          {artPreview?.preview && <div className="art-lightbox" role="dialog" aria-modal="true" aria-label="Source art preview" onMouseDown={() => setArtPreview(null)}><section onMouseDown={(event) => event.stopPropagation()}><button className="art-lightbox-close" onClick={() => setArtPreview(null)}>×</button><img src={artPreview.preview} alt={artPreview.name ?? "Source artwork"}/><footer><b>{artPreview.name ?? `#${artPreview.id}`}</b><span>{source.toUpperCase()} · {artPreview.tags?.length ?? 0} visible tags</span>{artPreview.url && <button onClick={() => window.atelier?.openExternal(artPreview.url!)}><ExternalLink size={14}/> Open source</button>}</footer></section></div>}
        </section>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Studio />);
