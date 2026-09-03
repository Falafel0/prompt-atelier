import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clipboard,
  Download,
  FolderUp,
  Package,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { formatPrompt, type PromptFormat, type PromptFormatOptions } from "./prompt";
import { analyzePromptText } from "./promptAnalysis";
import "./promptIde.css";
import { useStore } from "./store";
import {
  ParameterCheckbox,
  ParameterSlider,
  PreviewChoiceGrid,
} from "./components/ParameterControls";
import type { CatalogSource, Tag } from "./types";

type DisplayMode = "compact" | "details" | "preview" | "path";
type WorkspaceMode = "character" | "wardrobe" | "scene";
type UiPreferences = {
  scale: "90" | "100" | "110";
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  rightPanel: boolean;
};
type SourceCredentials = {
  danbooru: { login: string; apiKey: string };
  e621: { username: string; apiKey: string };
  gelbooru: { userId: string; apiKey: string };
  aibooru: { login: string; apiKey: string };
};
type LayoutPreferences = { previewWidth: number; inspectorWidth: number };
type GitHubReleaseSettings = { enabled: boolean; repo: string; corePackId: string };
const defaultUiPreferences: UiPreferences = {
  scale: "100", density: "comfortable", reduceMotion: false, rightPanel: true,
};
const defaultSourceCredentials: SourceCredentials = {
  danbooru: { login: "", apiKey: "" }, e621: { username: "", apiKey: "" },
  gelbooru: { userId: "", apiKey: "" }, aibooru: { login: "", apiKey: "" },
};
const defaultLayoutPreferences: LayoutPreferences = { previewWidth: 390, inspectorWidth: 250 };
const defaultGitHubReleaseSettings: GitHubReleaseSettings = { enabled: false, repo: "", corePackId: "core-dlc" };
const defaultPromptOptions: Required<Pick<PromptFormatOptions, "weightMode" | "separator" | "template">> = { weightMode: "non-default", separator: ", ", template: "" };
const isOwnerEdition = __ATELIER_EDITION__ === "owner";

const tagPostCount = (tag: Tag) =>
  tag.popularity ??
  Object.values(
    (tag as import("./types").CanonicalTag).sourceMetadata ?? {},
  ).reduce((sum, meta) => sum + meta.postCount, 0);
export default function App() {
  const s = useStore();
  const [packsOpen, setPacksOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [librarySelectedId, setLibrarySelectedId] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [rawPrompt, setRawPrompt] = useState("");
  const [promptHistory, setPromptHistory] = useState<string[]>([""]);
  const [promptHistoryIndex, setPromptHistoryIndex] = useState(0);
  const setPromptText = (value: string) => {
    setRawPrompt(value);
    setPromptHistory((current) => {
      if (current[promptHistoryIndex] === value) return current;
      const next = [...current.slice(0, promptHistoryIndex + 1), value].slice(-80);
      setPromptHistoryIndex(next.length - 1);
      return next;
    });
  };
  const resetPromptText = (value: string) => {
    setRawPrompt(value);
    setPromptHistory([value]);
    setPromptHistoryIndex(0);
  };
  const undoPrompt = () => {
    if (promptHistoryIndex > 0) {
      const nextIndex = promptHistoryIndex - 1;
      setRawPrompt(promptHistory[nextIndex]);
      setPromptHistoryIndex(nextIndex);
      return true;
    }
    return false;
  };
  const redoPrompt = () => {
    if (promptHistoryIndex < promptHistory.length - 1) {
      const nextIndex = promptHistoryIndex + 1;
      setRawPrompt(promptHistory[nextIndex]);
      setPromptHistoryIndex(nextIndex);
      return true;
    }
    return false;
  };
  const promptSyncOrigin = useRef<"text" | null>(null);
  const [promptAnalysis, setPromptAnalysis] = useState<{
    sentences: string[];
    recognized: Tag[];
    unknown: string[];
    weights: Record<string, number>;
  }>({ sentences: [], recognized: [], unknown: [], weights: {} });
  const [toast, setToast] = useState("");
  const [packs, setPacks] = useState<
    (import("./types").PackManifest & { enabled: boolean })[]
  >([]);
  const [taxonomy, setTaxonomy] = useState<
    {
      id: string;
      name: string;
      scope: "appearance" | "character" | "wardrobe" | "scene";
      icon?: string | null;
      subcategories: { id: string; name: string; icon?: string | null }[];
    }[]
  >([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("character");
  const categories = taxonomy.filter((item) => {
    const scope = item.scope === "scene" ? "scene" : item.scope === "wardrobe" || /wardrobe|clothing|outfit/i.test(item.name) ? "wardrobe" : "character";
    return scope === workspaceMode;
  });
  const [characters, setCharacters] = useState<
    (import("./types").CharacterSnapshot & { id: string; updatedAt: string; thumbnail?: string })[]
  >([]);
  const [source, setSource] = useState<"all" | CatalogSource>("all");
  const [sourceTags, setSourceTags] = useState<Tag[]>([]);
  const [sortMode, setSortMode] = useState<"logical" | "alpha" | "popularity">(
    "logical",
  );
  const [displayModes, setDisplayModes] = useState<Record<string, DisplayMode>>(
    {},
  );
  const [outputFormat, setOutputFormat] =
    useState<PromptFormat>("model-default");
  const [formatOpen, setFormatOpen] = useState(false);
  const [promptOptions, setPromptOptions] = useState(defaultPromptOptions);
  const [focusedTag, setFocusedTag] = useState<Tag | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(defaultUiPreferences);
  const [sourceCredentials, setSourceCredentials] = useState<SourceCredentials>(defaultSourceCredentials);
  const [githubReleaseSettings, setGithubReleaseSettings] = useState<GitHubReleaseSettings>(defaultGitHubReleaseSettings);
  const [githubOwner, setGithubOwner] = useState(false);
  const [githubLogin, setGithubLogin] = useState("");
  const [packUpdates, setPackUpdates] = useState<Record<string, string>>({});
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(defaultLayoutPreferences);
  const [tagMenu, setTagMenu] = useState<{ tag: Tag; x: number; y: number } | null>(null);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 1800);
  };
  const refreshPacks = () =>
    window.atelier
      ?.listPacks()
      .then((rows) =>
        setPacks((rows as typeof packs).filter((pack) => pack.id !== "user")),
      )
      .catch(() => undefined);
  const refreshCatalog = () =>
    (
      window.atelier as
        | (typeof window.atelier & { listPackTags?: () => Promise<Tag[]> })
        | undefined
    )
      ?.listPackTags?.()
      .then((tags) => s.replaceTags(tags))
      .catch(() => undefined);
  const refreshCharacters = () =>
    window.atelier
      ?.listCharacters()
      .then(setCharacters)
      .catch(() => undefined);
  useEffect(() => {
    refreshPacks();
    window.atelier
      ?.listTaxonomy()
      .then(setTaxonomy)
      .catch(() => undefined);
    refreshCatalog();
    window.atelier?.listRelationships().then(s.setRelationships);
    window.atelier?.getSetting("catalog-display-modes").then((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const allowed = new Set<DisplayMode>([
        "compact",
        "details",
        "preview",
        "path",
      ]);
      setDisplayModes(
        Object.fromEntries(
          Object.entries(value).filter(
            ([, mode]) =>
              typeof mode === "string" && allowed.has(mode as DisplayMode),
          ),
        ) as Record<string, DisplayMode>,
      );
    });
    window.atelier?.getSetting("ui-preferences").then((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const next = { ...defaultUiPreferences, ...(value as Partial<UiPreferences>) };
      if (!["90", "100", "110"].includes(next.scale)) next.scale = "100";
      if (!["comfortable", "compact"].includes(next.density)) next.density = "comfortable";
      setUiPreferences(next);
      setRightPanelOpen(next.rightPanel);
    });
    window.atelier?.getSetting("source-credentials").then((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const saved = value as Partial<SourceCredentials>;
      setSourceCredentials({
        danbooru: { ...defaultSourceCredentials.danbooru, ...saved.danbooru },
        e621: { ...defaultSourceCredentials.e621, ...saved.e621 },
        gelbooru: { ...defaultSourceCredentials.gelbooru, ...saved.gelbooru },
        aibooru: { ...defaultSourceCredentials.aibooru, ...saved.aibooru },
      });
    });
    if (isOwnerEdition) window.atelier?.getSetting("github-release-settings").then((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const saved = value as Partial<GitHubReleaseSettings>;
      setGithubReleaseSettings({ enabled: !!saved.enabled, repo: typeof saved.repo === "string" ? saved.repo : "", corePackId: typeof saved.corePackId === "string" ? saved.corePackId : "core-dlc" });
    });
    if (isOwnerEdition) window.atelier?.githubReleaseStatus?.().then((status) => { setGithubOwner(status.owner); setGithubLogin(status.login); }).catch(() => undefined);
    window.atelier?.getSetting("layout-preferences").then((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const saved = value as Partial<LayoutPreferences>;
      setLayoutPreferences({
        previewWidth: Math.max(250, Math.min(620, Number(saved.previewWidth) || defaultLayoutPreferences.previewWidth)),
        inspectorWidth: Math.max(190, Math.min(440, Number(saved.inspectorWidth) || defaultLayoutPreferences.inspectorWidth)),
      });
    });
    window.atelier?.getSetting("prompt-format-options").then((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const saved = value as Partial<typeof defaultPromptOptions>;
      setPromptOptions({
        weightMode: saved.weightMode === "always" || saved.weightMode === "off" ? saved.weightMode : "non-default",
        separator: saved.separator === "\n" ? "\n" : ", ",
        template: typeof saved.template === "string" ? saved.template : "",
      });
    });
    refreshCharacters();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.density = uiPreferences.density;
    document.documentElement.dataset.motion = uiPreferences.reduceMotion ? "reduced" : "full";
    document.documentElement.style.setProperty("--atelier-scale", `${Number(uiPreferences.scale) / 100}`);
  }, [uiPreferences]);
  useEffect(() => {
    const closeTransientUi = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPacksOpen(false);
      setLibraryOpen(false);
      setPromptOpen(false);
      setSettingsOpen(false);
      setFormatOpen(false);
      setFocusedTag(null);
      setTagMenu(null);
    };
    window.addEventListener("keydown", closeTransientUi);
    return () => window.removeEventListener("keydown", closeTransientUi);
  }, []);
  useEffect(() => {
    if (!rawPrompt.trim()) return;
    const timer = window.setTimeout(() => {
      const analysis = analyzePromptText(rawPrompt, s.tags);
      setPromptAnalysis(analysis);
      if (!analysis.recognized.length) return;
      const next = analysis.recognized.map((tag, order) => ({
        id: tag.id,
        weight: analysis.weights[tag.id] ?? tag.defaultWeight ?? 1,
        order,
        source: "user" as const,
      }));
      const current = s.selected;
      if (JSON.stringify(current.map(({ id, weight }) => ({ id, weight }))) !== JSON.stringify(next.map(({ id, weight }) => ({ id, weight })))) {
        promptSyncOrigin.current = "text";
        s.replaceSelection(next, s.model);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [rawPrompt, s.tags]);
  useEffect(() => {
    if (!rawPrompt.trim()) return;
    if (promptSyncOrigin.current === "text") { promptSyncOrigin.current = null; return; }
    const byName = new Map(s.tags.map((tag) => [tag.name.toLowerCase(), tag]));
    const kept = rawPrompt.split(/(,|\n)/).filter((part) => {
      if (part === "," || part === "\n") return true;
      const normalized = part.trim().replace(/^\((.+?):[\d.]+\)$/, "$1").toLowerCase();
      const tag = byName.get(normalized);
      return !tag || s.selected.some((item) => item.id === tag.id);
    }).join("").replace(/(?:,\s*){2,}/g, ", ").replace(/^\s*,\s*|\s*,\s*$/g, "").trim();
    const present = new Set([...kept.matchAll(/[\w-]+(?:_[\w-]+)*/g)].map((match) => match[0].toLowerCase()));
    const additions = s.selected.map((item) => tagsById.get(item.id)).filter((tag): tag is Tag => !!tag && !present.has(tag.name.toLowerCase())).map((tag) => tag.name);
    const next = [kept, ...additions].filter(Boolean).join(kept && additions.length ? ", " : "");
    if (next !== rawPrompt) setRawPrompt(next);
  }, [s.selected]);
  const displayKey = `${s.category}/${s.subcategory}`;
  const displayMode = displayModes[displayKey] ?? "details";
  const setDisplayMode = (mode: DisplayMode) => {
    const next = { ...displayModes, [displayKey]: mode };
    setDisplayModes(next);
    window.atelier?.setSetting("catalog-display-modes", next);
  };
  const updateUiPreference = <K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) => {
    const next = { ...uiPreferences, [key]: value };
    setUiPreferences(next);
    if (key === "rightPanel") setRightPanelOpen(value as boolean);
    window.atelier?.setSetting("ui-preferences", next);
  };
  const updateCredential = (sourceName: keyof SourceCredentials, key: string, value: string) =>
    setSourceCredentials((current) => ({ ...current, [sourceName]: { ...current[sourceName], [key]: value } }));
  const saveCredentials = () => {
    window.atelier?.setSetting("source-credentials", sourceCredentials);
    notify("Source credentials saved locally");
  };
  const saveGitHubReleaseSettings = () => {
    if (!isOwnerEdition) return;
    window.atelier?.setSetting("github-release-settings", githubReleaseSettings);
    notify("GitHub release target saved locally");
  };
  const publishCoreDlc = async () => {
    if (!isOwnerEdition) return;
    try {
      const result = await window.atelier?.publishCoreDlc?.();
      if (result) notify(`Published ${result.tag}`);
    } catch (error) { notify(error instanceof Error ? error.message : "Core DLC release failed"); }
  };
  const updateLayoutPreference = <K extends keyof LayoutPreferences>(key: K, value: number) => {
    const next = { ...layoutPreferences, [key]: value };
    setLayoutPreferences(next);
    window.atelier?.setSetting("layout-preferences", next);
  };
  const startResize = (target: keyof LayoutPreferences, startX: number) => {
    const initial = layoutPreferences[target];
    const direction = target === "inspectorWidth" ? -1 : 1;
    const move = (event: PointerEvent) => {
      const min = target === "previewWidth" ? 250 : 190;
      const max = target === "previewWidth" ? Math.min(620, window.innerWidth * .46) : Math.min(440, window.innerWidth * .38);
      setLayoutPreferences((current) => ({ ...current, [target]: Math.round(Math.max(min, Math.min(max, initial + (event.clientX - startX) * direction))) }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      setLayoutPreferences((current) => {
        window.atelier?.setSetting("layout-preferences", current);
        return current;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };
  const updatePromptOption = <K extends keyof typeof promptOptions>(key: K, value: typeof promptOptions[K]) => {
    const next = { ...promptOptions, [key]: value };
    setPromptOptions(next);
    window.atelier?.setSetting("prompt-format-options", next);
  };
  const activeTags = source === "all" ? s.tags : sourceTags;
  const filteredCharacters = useMemo(
    () =>
      characters.filter((character) =>
        `${character.name} ${character.kind ?? "character"} ${character.model} ${character.rawPrompt ?? ""} ${character.selected.map((item) => s.tags.find((tag) => tag.id === item.id)?.name ?? item.id).join(" ")}`
          .toLowerCase()
          .includes(libraryQuery.trim().toLowerCase()),
      ),
    [characters, libraryQuery, s.tags],
  );
  const inspectedCharacter =
    filteredCharacters.find((character) => character.id === librarySelectedId) ??
    filteredCharacters[0] ??
    null;
  const tagsById = useMemo(
    () => new Map([...s.tags, ...sourceTags].map((t) => [t.id, t])),
    [s.tags, sourceTags],
  );
  const categoryWorkspace = (category: string) => {
    const entry = taxonomy.find((item) => item.name === category);
    if (entry?.scope === "scene") return "scene" as const;
    if (entry?.scope === "wardrobe" || /wardrobe|clothing|outfit/i.test(category)) return "wardrobe" as const;
    return "character" as const;
  };
  const macroCategory = `__saved_${workspaceMode}__`;
  const isMacroView = s.category === macroCategory;
  const workspaceSelected = s.selected.filter((item) => {
    const tag = tagsById.get(item.id);
    return tag && categoryWorkspace(tag.category) === workspaceMode;
  });
  const savedMacros = characters.filter((character) => character.kind === workspaceMode);
  const subcategories = useMemo(
    () =>
      [
        ...new Set(
          activeTags
            .filter((t) => t.category === s.category)
            .map((t) => t.subcategory),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [activeTags, s.category],
  );
  const visible = useMemo(
    () =>
      (isMacroView ? [] : activeTags)
        .filter(
          (t) =>
            t.enabled &&
            (s.query
              ? categoryWorkspace(t.category) === workspaceMode && `${t.name} ${t.displayName ?? ""} ${(t.aliases ?? []).join(" ")}`
                  .toLowerCase().includes(s.query.toLowerCase())
              : t.category === s.category && t.subcategory === s.subcategory),
        )
        .sort((a, b) => {
          const score = tagPostCount;
          if (sortMode === "popularity") {
            const diff = score(b) - score(a);
            if (diff) return diff;
          }
          if (sortMode === "logical") {
            const curated = Number(!a.popularity) - Number(!b.popularity);
            if (curated) return -curated;
            const diff = score(b) - score(a);
            if (diff) return diff;
          }
          return a.name.localeCompare(b.name);
        }),
    [activeTags, isMacroView, s.category, s.subcategory, s.query, sortMode, taxonomy, workspaceMode],
  );
  const selectedIds = new Set(s.selected.map((x) => x.id));
  const suggestions = useMemo(() => {
    const scored = new Map<string, { score: number; reason: string }>();
    const active = new Set(selectedIds);
    for (const relation of s.relations) {
      if (
        !active.has(relation.source) ||
        active.has(relation.target) ||
        relation.type === "conflicts"
      )
        continue;
      const base =
        relation.type === "suggests"
          ? (relation.strength ?? 0.5)
          : relation.type === "implies"
            ? 1
            : 0.8;
      const prior = scored.get(relation.target);
      scored.set(relation.target, {
        score: (prior?.score ?? 0) + base,
        reason: relation.source.replaceAll("_", " "),
      });
    }
    return [...scored.entries()]
      .map(([id, meta]) => ({ t: tagsById.get(id), ...meta }))
      .filter((x): x is { t: Tag; score: number; reason: string } => !!x.t)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [s.selected, tagsById, s.relations]);
  const generatedPrompt = formatPrompt(
    outputFormat,
    s.model,
    s.selected,
    tagsById,
    promptOptions,
  );
  const prompt = rawPrompt.trim() || generatedPrompt;
  const copy = async () => {
    await (window.atelier?.copy(prompt) ??
      navigator.clipboard.writeText(prompt));
    notify("Prompt copied");
  };
  const workspaceLabel = workspaceMode === "character" ? "character" : workspaceMode === "wardrobe" ? "wardrobe set" : "scene set";
  const save = async () => {
    const name = window.prompt(`Save ${workspaceLabel} macro as`, `Untitled ${workspaceLabel}`);
    if (!name) return;
    const snapshot = {
      version: 1 as const,
      name,
      savedAt: new Date().toISOString(),
      kind: workspaceMode,
      selected: workspaceSelected,
      model: s.model,
      rawPrompt: workspaceSelected.length ? "" : rawPrompt,
    };
    if (window.atelier) {
      await window.atelier.saveCharacter(snapshot);
      refreshCharacters();
    } else localStorage.setItem("atelier.character", JSON.stringify(snapshot));
    notify(`Saved ${workspaceLabel} “${name}”`);
  };
  const applyMacro = (macro: (typeof characters)[number], replace = false) => {
    const incoming = macro.selected.map((item, order) => ({ ...item, order }));
    if (replace) {
      s.commitSelection(incoming, macro.model);
      resetPromptText(macro.rawPrompt ?? "");
      notify(`Loaded ${macro.kind ?? "character"} “${macro.name}”`);
      return;
    }
    const incomingIds = new Set(incoming.map((item) => item.id));
    const retained = s.selected.filter((item) => !incomingIds.has(item.id));
    s.commitSelection([...retained, ...incoming].map((item, order) => ({ ...item, order })), s.model);
    notify(`Inserted ${macro.name} (${incoming.length} tags)`);
  };
  const importPack = async () => {
    try {
      const result = await window.atelier?.importPack();
      if (result) {
        notify(`Imported ${result.added} tags`);
        refreshPacks();
        refreshCatalog();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Pack import failed");
    }
  };
  const openPackStudio = async () => {
    try {
      const opened = await window.atelier?.openPackStudio();
      if (!opened) throw new Error("Pack Studio is unavailable in this application build.");
      notify("Pack Studio opened");
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to open Pack Studio"); }
  };
  const checkPackUpdates = async () => {
    try {
      const result = await window.atelier?.checkPackUpdates();
      const next = Object.fromEntries((result?.updates ?? []).map((update) => [update.id, update.version]));
      setPackUpdates(next);
      notify(Object.keys(next).length ? `${Object.keys(next).length} DLC update(s) available` : "All installed DLC is up to date");
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to check DLC updates"); }
  };
  const installPackUpdate = async (id: string) => {
    try {
      const result = await window.atelier?.installPackUpdate(id);
      if (!result) return;
      setPackUpdates((current) => { const next = { ...current }; delete next[id]; return next; });
      await Promise.all([refreshPacks(), refreshCatalog(), window.atelier?.listRelationships().then(s.setRelationships)]);
      notify(`Updated DLC (${result.added} tags)`);
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to install DLC update"); }
  };
  useEffect(() => {
    if (packsOpen) void checkPackUpdates();
  }, [packsOpen]);
  const uninstallPack = async (pack: (typeof packs)[number]) => {
    if (
      !window.confirm(
        `Remove “${pack.name}” from this device? Characters keep their saved references as missing tags.`,
      )
    )
      return;
    try {
      const result = await window.atelier?.uninstallPack(pack.id);
      if (!result) return;
      await Promise.all([
        refreshPacks(),
        refreshCatalog(),
        window.atelier?.listRelationships().then(s.setRelationships),
      ]);
      notify(`Removed ${result.name} (${result.removedTags} tags)`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to remove pack");
    }
  };
  const clearDlcPacks = async () => {
    if (
      !window.confirm(
        "Remove every installed DLC? User Pack, taxonomy, and saved characters will stay.",
      )
    )
      return;
    try {
      const result = await window.atelier?.clearDlcPacks();
      if (!result) return;
      await Promise.all([
        refreshPacks(),
        refreshCatalog(),
        window.atelier?.listRelationships().then(s.setRelationships),
      ]);
      notify(`Cleared ${result.removedPacks} DLC packs and ${result.removedTags} tags`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to reset DLC packs");
    }
  };
  const openSource = async (next: typeof source) => {
    setSource(next);
    if (next === "all") {
      setSourceTags([]);
      return;
    }
    try {
      const page = await window.atelier?.sourceCatalog(next, 0);
      if (!page) {
        notify("Source catalog is available in Electron only");
        return;
      }
      setSourceTags(page);
      s.mergeTags(page);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to load source catalog");
    }
  };
  const mergeCanonical = async () => {
    if (!s.query.trim()) {
      notify("Enter a tag search first");
      return;
    }
    try {
      const result = await window.atelier?.mergeCanonical(s.query.trim());
      if (!result) {
        notify("Canonical sources are available in Electron only");
        return;
      }
      s.mergeTags(result.tags);
      notify(
        `Merged ${result.added} canonical tags${result.warnings.length ? "; some sources unavailable" : ""}`,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Canonical merge failed");
    }
  };
  const exportCurrent = async () => {
    const snapshot = {
      version: 1 as const,
      name: "portable-character",
      savedAt: new Date().toISOString(),
      kind: workspaceMode,
      selected: workspaceSelected,
      model: s.model,
      rawPrompt,
    };
    const ok = await window.atelier?.exportCharacter(snapshot);
    if (ok) notify("Character exported");
  };
  const importCharacter = async () => {
    try {
      const snapshot = await window.atelier?.importCharacter();
      if (!snapshot) return;
      s.replaceSelection(snapshot.selected, snapshot.model);
      resetPromptText(snapshot.rawPrompt ?? "");
      setLibraryOpen(false);
      notify(`Imported “${snapshot.name}”`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Character import failed");
    }
  };
  const restore = async (id: string) => {
    const snap = await window.atelier?.loadCharacter(id);
    if (snap) {
      s.replaceSelection(snap.selected, snap.model);
      resetPromptText(snap.rawPrompt ?? "");
      setLibraryOpen(false);
      notify(`Loaded “${snap.name}”`);
    }
  };
  const deleteSavedCharacter = async (character: (typeof characters)[number]) => {
    if (!window.confirm(`Delete “${character.name}” from this library? This cannot be undone.`)) return;
    try {
      const deleted = await window.atelier?.deleteCharacter(character.id);
      if (!deleted) return;
      const remaining = characters.filter((item) => item.id !== character.id);
      setCharacters(remaining);
      setLibrarySelectedId(remaining[0]?.id ?? null);
      notify(`Deleted “${character.name}”`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete character");
    }
  };
  const duplicateSavedCharacter = async (character: (typeof characters)[number]) => {
    const snapshot = await window.atelier?.loadCharacter(character.id);
    if (!snapshot) return;
    const name = window.prompt("Duplicate character as", `${snapshot.name} copy`);
    if (!name) return;
    await window.atelier?.saveCharacter({ ...snapshot, name, savedAt: new Date().toISOString() });
    refreshCharacters();
    notify(`Created “${name}”`);
  };
  const renameSavedMacro = async (macro: (typeof characters)[number]) => {
    const name = window.prompt("Rename saved macro", macro.name)?.trim();
    if (!name || name === macro.name) return;
    await window.atelier?.saveCharacter({ ...macro, name, savedAt: new Date().toISOString() });
    await refreshCharacters();
    setLibrarySelectedId(macro.id);
    notify(`Renamed to “${name}”`);
  };
  const moveSavedMacro = async (macro: (typeof characters)[number]) => {
    const kind = window.prompt("Move macro to: character, wardrobe, or scene", macro.kind ?? "character")?.trim().toLowerCase();
    if (!kind || !["character", "wardrobe", "scene"].includes(kind)) {
      if (kind) notify("Choose character, wardrobe, or scene");
      return;
    }
    await window.atelier?.saveCharacter({ ...macro, kind: kind as WorkspaceMode, savedAt: new Date().toISOString() });
    await refreshCharacters();
    setLibrarySelectedId(macro.id);
    notify(`Moved “${macro.name}” to ${kind}`);
  };
  const analyzeRawPrompt = () => {
    setPromptAnalysis(analyzePromptText(rawPrompt, s.tags));
  };
  const rawPromptStats = useMemo(() => {
    const text = rawPrompt.trim();
    return {
      characters: rawPrompt.length,
      phrases: text ? text.split(/[,.\n;]+/).filter(Boolean).length : 0,
      tokens: text ? text.split(/[\s,]+/).filter(Boolean).length : 0,
    };
  }, [rawPrompt]);
  const copyRawPrompt = async () => {
    if (!rawPrompt.trim()) return;
    await (window.atelier?.copy(rawPrompt) ?? navigator.clipboard.writeText(rawPrompt));
    notify("Prompt text copied");
  };
  const addRecognizedPromptTags = () => {
    const selected = new Set(s.selected.map((item) => item.id));
    const additions = promptAnalysis.recognized
      .filter((tag) => !selected.has(tag.id))
      .map((tag, index) => ({
        id: tag.id,
        weight: tag.defaultWeight ?? 1,
        order: s.selected.length + index,
        source: "user" as const,
      }));
    if (!additions.length) {
      notify("All recognized tags are already in this character");
      return;
    }
    s.replaceSelection([...s.selected, ...additions], s.model);
    notify(`${additions.length} recognized tags added`);
  };
  return (
    <main className="app-shell">
      <header>
        <div className="brand">
          <Sparkles size={17} />
          <span>Prompt Atelier</span>
          <small>MODULAR PROMPT BUILDER</small>
        </div>
        <nav className="workspace-tabs" aria-label="Atelier workspace">
          {(["character", "wardrobe", "scene"] as const).map((mode) => <button key={mode} className={workspaceMode === mode ? "selected" : ""} onClick={() => { setWorkspaceMode(mode); const first = taxonomy.find((item) => (item.scope === "scene" ? "scene" : item.scope === "wardrobe" || /wardrobe|clothing|outfit/i.test(item.name) ? "wardrobe" : "character") === mode); if (first) s.setCategory(first.name); }}>{mode === "character" ? "Character" : mode === "wardrobe" ? "Wardrobe" : "Scene"}</button>)}
        </nav>
        <div className="top-actions">
          <button onClick={() => setSettingsOpen(true)} title="Global interface settings">
            <SlidersHorizontal size={15} /> Settings
          </button>
          <button onClick={() => setPromptOpen(true)}>
            <Clipboard size={15} /> Prompt editor
          </button>
          <button
            onClick={() => {
              setPacksOpen(!packsOpen);
              refreshPacks();
            }}
          >
            <Package size={15} /> Packs
          </button>
          <button onClick={openPackStudio}>
            <Package size={15} /> Pack Studio
          </button>
          {isOwnerEdition && githubOwner && githubReleaseSettings.enabled && <button className="owner-release" onClick={publishCoreDlc} title={`Publish ${githubReleaseSettings.corePackId} to ${githubReleaseSettings.repo}`}>
            <Package size={15} /> Publish Core DLC
          </button>}
          <button
            onClick={() => {
              setLibraryQuery("");
              setLibrarySelectedId(null);
              setLibraryOpen(true);
              refreshCharacters();
            }}
          >
            <Users size={15} /> Library
          </button>
          <button className="ghost" onClick={save}>
            <Save size={15} /> Save {workspaceMode === "character" ? "character" : workspaceMode === "wardrobe" ? "wardrobe" : "scene"}
          </button>
        </div>
      </header>
      <section className="workspace" style={{ "--preview-width": `${layoutPreferences.previewWidth}px` } as import("react").CSSProperties}>
        <>
            <aside className="preview">
              <div className="checker">
                <DollSlots selected={s.selected} tagsById={tagsById} />
              </div>
              <div className="preview-footer">
                <span>1 : 1</span>
                <span>{s.selected.length ? `${s.selected.length} ACTIVE TAGS` : "READY FOR LAYERS"}</span>
              </div>
            </aside>
            <div className="splitter workspace-splitter" role="separator" aria-label="Resize preview" aria-orientation="vertical" onPointerDown={(event) => startResize("previewWidth", event.clientX)} />
            <nav className="categories">
              <button
                className={isMacroView ? "active saved-category" : "saved-category"}
                onClick={() => { s.setQuery(""); s.setCategory(macroCategory); }}
                title={`Saved ${workspaceLabel} macros`}
              >
                <b>★</b><span>Saved</span>
              </button>
              {categories.map((entry) => (
                <button
                  key={entry.id}
                  className={
                    s.category === entry.name
                      ? "active"
                      : entry.name === "NSFW"
                        ? "nsfw"
                        : ""
                  }
                  onClick={() => s.setCategory(entry.name)}
                >
                  <b>{entry.icon || "◇"}</b>
                  <span>{entry.name}</span>
                </button>
              ))}
            </nav>
            <section className="editor">
              <div className="editor-top">
                <label className="search">
                  <Search size={16} />
                  <input
                    placeholder="Search local or canonical tags…"
                    value={s.query}
                    onChange={(e) => s.setQuery(e.target.value)}
                  />
                  {s.query && <X size={15} onClick={() => s.setQuery("")} />}
                </label>
                <button
                  className="canonical-search"
                  onClick={mergeCanonical}
                  title="Merge matching canonical tags from Danbooru, Gelbooru, e621, and AIBooru"
                >
                  <Tags size={14} /> Merge sources
                </button>
                <select
                  className="sort-select"
                  value={sortMode}
                  onChange={(e) =>
                    setSortMode(e.target.value as typeof sortMode)
                  }
                  title="Sort tags"
                >
                  <option value="logical">Logical order</option>
                  <option value="alpha">A–Z</option>
                  <option value="popularity">Source popularity</option>
                </select>
                <button
                  className="panel-toggle"
                  onClick={() => setRightPanelOpen(!rightPanelOpen)}
                >
                  {rightPanelOpen ? "Hide info" : "Show info"}
                </button>
                <select
                  className="sort-select"
                  value={displayMode}
                  onChange={(e) =>
                    setDisplayMode(e.target.value as typeof displayMode)
                  }
                  title="Tag display"
                >
                  <option value="compact">Compact tags</option>
                  <option value="details">Tag + description</option>
                  <option value="preview">Preview grid</option>
                  <option value="path">Category path</option>
                </select>
                <span className="tag-count">
                  {visible.length.toLocaleString()}{" "}
                  {s.query ? "results" : "tags"}
                </span>
              </div>
              <div className="source-switch">
                <span>Catalog source</span>
                <button
                  className={source === "all" ? "selected" : ""}
                  onClick={() => openSource("all")}
                >
                  All local
                </button>
                <button
                  className={source === "danbooru" ? "selected" : ""}
                  onClick={() => openSource("danbooru")}
                >
                  Danbooru
                </button>
                <button
                  className={source === "gelbooru" ? "selected" : ""}
                  onClick={() => openSource("gelbooru")}
                >
                  Gelbooru
                </button>
                <button
                  className={source === "e621" ? "selected" : ""}
                  onClick={() => openSource("e621")}
                >
                  e621
                </button>
                <button
                  className={source === "aibooru" ? "selected" : ""}
                  onClick={() => openSource("aibooru")}
                >
                  AIBooru
                </button>
              </div>
              <div className="tabs">
                {subcategories.map((tab) => (
                  <button
                    key={tab}
                    className={
                      tab === s.subcategory && !s.query ? "selected" : ""
                    }
                    onClick={() => {
                      s.setQuery("");
                      s.setSubcategory(tab);
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div
                className={`content ${rightPanelOpen ? "" : "right-closed"}`}
                style={{ "--inspector-width": `${layoutPreferences.inspectorWidth}px` } as import("react").CSSProperties}
              >
                <div className="grid-wrap">
                  {isMacroView ? (
                    <MacroTagGrid macros={savedMacros} kind={workspaceMode} onInsert={(macro) => applyMacro(macro)} onLoad={(macro) => applyMacro(macro, true)} />
                  ) : <><div className="tag-grid">
                    {visible.map((tag) => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        selected={selectedIds.has(tag.id)}
                        displayMode={displayMode}
                        onClick={() => setFocusedTag(tag)}
                        onDoubleClick={() => s.toggle(tag)}
                        onContextMenu={(event) => { event.preventDefault(); setFocusedTag(tag); setTagMenu({ tag, x: event.clientX, y: event.clientY }); }}
                      />
                    ))}
                  </div>
                  {visible.length === 0 && (
                    <div className="empty">
                      {source === "all"
                        ? "No tags match this view."
                        : "No imported tags from this source in this category."}
                    </div>
                  )}</>}
                </div>
                {rightPanelOpen && <div className="splitter context-splitter" role="separator" aria-label="Resize tag inspector" aria-orientation="vertical" onPointerDown={(event) => startResize("inspectorWidth", event.clientX)} />}
                <aside className="context">
                  {focusedTag ? (
                    <section className="tag-inspector">
                      <div className="inspector-preview">
                        {focusedTag.preview ? (
                          <img src={focusedTag.preview} alt="" />
                        ) : (
                          focusedTag.name.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div>
                        <small>TAG INSPECTOR</small>
                        <h3>{focusedTag.displayName ?? focusedTag.name}</h3>
                        <p>
                          {focusedTag.description ||
                            `${focusedTag.category} › ${focusedTag.subcategory}`}
                        </p>
                      </div>
                      <button
                        className="replace"
                        onClick={() => s.toggle(focusedTag)}
                      >
                        Add to prompt
                      </button>
                    </section>
                  ) : (
                    <p className="context-instruction">
                      Select once to inspect a tag. Double-click to add it.
                    </p>
                  )}
                  <h3 className="context-heading">Contextual tags</h3>
                  <p>Curated pairings and active dependency hints.</p>
                  {suggestions.length ? (
                    suggestions.map(({ t, score, reason }) => (
                      <button
                        className="suggestion"
                        key={t.id}
                        onClick={() => setFocusedTag(t)}
                        onDoubleClick={() => s.toggle(t)}
                      >
                        <span>
                          <b>{t.name.replaceAll("_", " ")}</b>
                          <small>because {reason}</small>
                        </span>
                        <em>{Math.round(score * 100)}%</em>
                        <ChevronRight size={14} />
                      </button>
                    ))
                  ) : (
                    <div className="context-empty">
                      Select a tag to surface intelligent pairings.
                    </div>
                  )}
                </aside>
              </div>
              <section className="selection">
                <div className="selection-head">
                  <div>
                    <h2>
                      Selected tags <span>{s.selected.length}</span>
                    </h2>
                    <small>
                      Drag chips to set prompt order. Auto-added tags are
                      marked.
                    </small>
                  </div>
                  <div className="selection-actions">
                    <button onClick={() => { if (!undoPrompt()) s.undo(); }} title="Undo prompt text or tag selection">
                      <Undo2 size={15} />
                    </button>
                    <button onClick={() => { if (!redoPrompt()) s.redo(); }} title="Redo prompt text or tag selection">
                      <Undo2 size={15} style={{ transform: "scaleX(-1)" }} />
                    </button>
                    <button onClick={s.clear} className="danger">
                      <Trash2 size={15} /> Clear
                    </button>
                  </div>
                </div>
                <div className="selected-list">
                  {s.selected.length === 0 ? (
                    <div className="empty-selection">
                      Build your prompt from the tag library above.
                    </div>
                  ) : (
                    s.selected.map((item) => (
                      <SelectedChip
                        key={item.id}
                        item={item}
                        tag={tagsById.get(item.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            </section>
          </>
      </section>
      <footer
        className="prompt-bar"
        style={{ gridTemplateColumns: "172px 164px 1fr auto auto" }}
      >
        <div className="model-select">
          <label>Target model</label>
          <select
            value={s.model}
            onChange={(e) => s.setModel(e.target.value as typeof s.model)}
          >
            <option>NAI</option>
            <option>SDXL (NoobAI)</option>
            <option>Anima (Cosmos)</option>
          </select>
        </div>
        <div className="model-select">
          <label>Auto-format</label>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as PromptFormat)}
          >
            <option value="model-default">Model default</option>
            <option value="tags">Just tags</option>
            <option value="natural">Natural language</option>
            <option value="natural-and-tags">Natural + tags</option>
          </select>
        </div>
        <div className="prompt-output">
          <PromptTextBox
            value={rawPrompt || generatedPrompt}
            generated={!rawPrompt.trim()}
            onChange={setPromptText}
            tags={s.tags}
            analysis={promptAnalysis}
            contextualIds={new Set(suggestions.map(({ t }) => t.id))}
            selected={s.selected}
            relations={s.relations}
            onOpenFormat={() => setFormatOpen(true)}
            onBatchDefaultWeights={() => s.commitSelection(s.selected.map((item) => ({ ...item, weight: tagsById.get(item.id)?.defaultWeight ?? 1 })), s.model)}
          />
        </div>
        <button className="prompt-format-button" onClick={() => setFormatOpen(true)} title="Prompt formatting"><SlidersHorizontal size={15} /> Format</button>
        <button className="copy" onClick={copy}>
          <Clipboard size={16} /> Copy
        </button>
      </footer>
      {s.conflict && (
        <div className="modal-backdrop">
          <div className="modal">
            <AlertTriangle color="#ff8d78" />
            <h2>Conflicting tag</h2>
            <p>
              <b>{s.conflict.name}</b> conflicts with a selected tag. Would you
              like to replace it?
            </p>
            <div>
              <button onClick={() => s.resolveConflict(false)}>Cancel</button>
              <button
                className="replace"
                onClick={() => s.resolveConflict(true)}
              >
                Replace selection
              </button>
            </div>
          </div>
        </div>
      )}
      {packsOpen && (
        <div className="packs-layer" onMouseDown={() => setPacksOpen(false)}>
          <section
            className="packs-popover"
            role="dialog"
            aria-label="Pack Manager"
            onMouseDown={(event) => event.stopPropagation()}
          >
          <div className="packs-head">
            <span><Package size={16} /><b>Pack Manager</b></span>
            <button className="export-small" onClick={checkPackUpdates} title="Check the public release channel for newer installed DLC">Check updates</button>
            <button className="packs-clear" onClick={clearDlcPacks} disabled={!packs.length}>
              <Trash2 size={13} /> Reset DLC
            </button>
            <button onClick={() => setPacksOpen(false)} aria-label="Close pack manager">
              <X size={15} />
            </button>
          </div>
          {packs.map((pack) => (
            <article key={pack.id}>
              <strong>{pack.name}</strong>
              <span>
                v{pack.version || "—"} · {Number(pack.tagCount || 0).toLocaleString()} tags
              </span>
              <p>{pack.description}</p>
              <label>
                <input
                  type="checkbox"
                  checked={pack.enabled}
                  onChange={async (e) => {
                    try {
                      await window.atelier?.togglePack(
                        pack.id,
                        e.target.checked,
                      );
                      refreshPacks();
                    } catch (err) {
                      notify(
                        err instanceof Error
                          ? err.message
                          : "Unable to change pack",
                      );
                    }
                  }}
                />{" "}
                Enabled
              </label>
              <button
                className="export-small"
                onClick={() =>
                  window.atelier
                    ?.exportPack(pack.id)
                    .then((ok) => ok && notify("Pack exported"))
                }
              >
                <Download size={12} /> Export
              </button>
              {packUpdates[pack.id] && <button className="export-small" onClick={() => installPackUpdate(pack.id)} title={`Install version ${packUpdates[pack.id]} from the public release channel`}>
                <Download size={12} /> Update v{packUpdates[pack.id]}
              </button>}
              <button className="pack-remove" onClick={() => uninstallPack(pack)}>
                <Trash2 size={12} /> Remove
              </button>
            </article>
          ))}
          {!packs.length && (
            <p>No DLC packs installed. Open Pack Studio to create one.</p>
          )}
            <button className="import-pack" onClick={importPack}>
              <FolderUp size={14} /> Import .atelier-dlc
            </button>
            <button
              className="open-studio"
              onClick={openPackStudio}
            >
              <Package size={14} /> Open Pack Studio
            </button>
          </section>
        </div>
      )}
      {libraryOpen && (
        <div className="modal-backdrop">
          <section className="library modal" aria-label="Character library">
            <button
              className="library-close"
              onClick={() => setLibraryOpen(false)}
            >
              <X size={16} />
            </button>
            <header className="library-header">
              <span><Users color="#85b1ff" /><span><small>REUSABLE SNAPSHOTS</small><h2>Macro library</h2></span></span>
              <div className="library-tools"><button onClick={exportCurrent}><Download size={13} /> Export current</button><button onClick={importCharacter}><FolderUp size={13} /> Import file</button></div>
            </header>
            <label className="library-search"><Search size={14} /><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search saved characters, wardrobes, scenes…" autoFocus /><span>{filteredCharacters.length}/{characters.length}</span></label>
            {characters.length ? (
              <div className="library-layout">
                <div className="character-list" role="listbox" aria-label="Saved characters">
                  {filteredCharacters.map((character) => (
                    <button key={character.id} className={inspectedCharacter?.id === character.id ? "active" : ""} onClick={() => setLibrarySelectedId(character.id)} onDoubleClick={() => restore(character.id)}>
                      <i>{character.thumbnail ? <img src={character.thumbnail} alt="" /> : character.name.slice(0, 1).toUpperCase()}</i>
                      <span><b>{character.name}</b><small>{character.kind ?? "character"} · {new Date(character.updatedAt).toLocaleDateString()} · {character.selected.length} tags</small></span><ChevronRight size={15} />
                    </button>
                  ))}
                  {!filteredCharacters.length && <p className="library-empty">No saved character matches this search.</p>}
                </div>
                <aside className="character-inspector">
                  {inspectedCharacter ? <><div className="character-inspector-preview">{inspectedCharacter.thumbnail ? <img src={inspectedCharacter.thumbnail} alt="" /> : <Users size={30} />}</div><small>SELECTED {inspectedCharacter.kind?.toUpperCase() ?? "CHARACTER"} MACRO</small><h3>{inspectedCharacter.name}</h3><p>{inspectedCharacter.rawPrompt?.trim() ? "Contains a custom prompt." : "Uses the generated prompt and selected tags."}</p><dl><div><dt>Saved</dt><dd>{new Date(inspectedCharacter.updatedAt).toLocaleString()}</dd></div><div><dt>Content</dt><dd>{inspectedCharacter.selected.length} tags</dd></div></dl><div className="macro-tag-names">{inspectedCharacter.selected.map((item) => <code key={item.id}>{tagsById.get(item.id)?.name ?? item.id}</code>)}</div><div className="character-inspector-actions"><button className="replace" onClick={() => restore(inspectedCharacter.id)}>Load macro</button><button onClick={() => applyMacro(inspectedCharacter)}>Insert</button><button onClick={() => renameSavedMacro(inspectedCharacter)}>Rename</button><button onClick={() => moveSavedMacro(inspectedCharacter)}>Move</button><button onClick={() => duplicateSavedCharacter(inspectedCharacter)}>Duplicate</button><button className="danger" onClick={() => deleteSavedCharacter(inspectedCharacter)}>Delete</button></div></> : <p className="library-empty">Choose a saved macro to inspect it.</p>}
                </aside>
              </div>
            ) : (
              <div className="library-blank"><Users size={25} /><b>Your macro library is empty</b><p>Save a Character, Wardrobe, or Scene selection to reuse it from its Saved category.</p><button className="replace" onClick={save}><Save size={14} /> Save current selection</button></div>
            )}
          </section>
        </div>
      )}
      {promptOpen && (
        <div className="modal-backdrop">
          <section className="custom-modal modal prompt-modal" aria-label="Prompt editor">
            <button className="library-close" onClick={() => setPromptOpen(false)}><X size={16} /></button>
            <header className="prompt-editor-header"><span><Clipboard color="#85b1ff" /><span><small>RAW PROMPT WORKSPACE</small><h2>Full prompt editor</h2></span></span><p>Paste or write a complete prompt. The catalog is never changed until you explicitly add recognized tags.</p></header>
            <label className="prompt-textarea-label"><span>Prompt text <small>{rawPromptStats.characters.toLocaleString()} characters · {rawPromptStats.tokens} tokens · {rawPromptStats.phrases} phrases</small></span><textarea autoFocus value={rawPrompt} placeholder="A girl with long hair, blue eyes, school_uniform..." onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); analyzeRawPrompt(); } }} onChange={(event) => setPromptText(event.target.value)} /></label>
            <div className="form-actions prompt-actions"><button className="replace" disabled={!rawPrompt.trim()} onClick={analyzeRawPrompt}>Analyze · Ctrl+Enter</button><button disabled={!rawPrompt.trim()} onClick={copyRawPrompt}><Clipboard size={13} /> Copy text</button><button onClick={() => { resetPromptText(""); setPromptAnalysis({ sentences: [], recognized: [], unknown: [], weights: {} }); }}>Use generated prompt</button><button disabled={!promptAnalysis.recognized.length} onClick={addRecognizedPromptTags}>Add {promptAnalysis.recognized.length || ""} recognized tags</button></div>
            {(promptAnalysis.sentences.length > 0 || promptAnalysis.recognized.length > 0 || promptAnalysis.unknown.length > 0) && (
              <div className="prompt-analysis">
                <section><h3>Sentences <span>{promptAnalysis.sentences.length}</span></h3><ol>{promptAnalysis.sentences.map((sentence, index) => <li key={`${sentence}-${index}`}>{sentence}</li>)}</ol></section>
                <section><h3>Known canonical tags <span>{promptAnalysis.recognized.length}</span></h3><p className="analysis-help">Click one to toggle it in the character; use the button above to add all.</p><div className="analysis-tags">{promptAnalysis.recognized.map((tag) => <button key={tag.id} onClick={() => s.toggle(tag)}>{tag.name}</button>)}</div></section>
                <section><h3>Unrecognized fragments <span>{promptAnalysis.unknown.length}</span></h3><p className="analysis-help">Kept intact in your text. They are never silently turned into catalog tags.</p><div className="analysis-tags muted">{promptAnalysis.unknown.map((fragment) => <span key={fragment}>{fragment}</span>)}</div></section>
              </div>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast">
          {" "}
          <Check size={15} />
          {toast}
        </div>
      )}
      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="modal global-settings" role="dialog" aria-label="Global settings" onMouseDown={(event) => event.stopPropagation()}>
            <button className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={16} /></button>
            <SlidersHorizontal color="#85b1ff" />
            <h2>Global settings</h2>
            <p>These preferences apply across Prompt Atelier and are saved locally.</p>
            <label>Interface scale
              <select value={uiPreferences.scale} onChange={(event) => updateUiPreference("scale", event.target.value as UiPreferences["scale"])}>
                <option value="90">Compact · 90%</option><option value="100">Default · 100%</option><option value="110">Large · 110%</option>
              </select>
            </label>
            <label>Catalog density
              <select value={uiPreferences.density} onChange={(event) => updateUiPreference("density", event.target.value as UiPreferences["density"])}>
                <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
              </select>
            </label>
            <label className="settings-check"><input type="checkbox" checked={uiPreferences.rightPanel} onChange={(event) => updateUiPreference("rightPanel", event.target.checked)} /> Show contextual panel by default</label>
            <label className="settings-check"><input type="checkbox" checked={uiPreferences.reduceMotion} onChange={(event) => updateUiPreference("reduceMotion", event.target.checked)} /> Reduce interface animation</label>
            <section className="layout-settings"><h3>Workspace layout</h3><label>Preview width <output>{layoutPreferences.previewWidth}px</output><input type="range" min="250" max="620" value={layoutPreferences.previewWidth} onChange={(event) => updateLayoutPreference("previewWidth", Number(event.target.value))} /></label><label>Inspector width <output>{layoutPreferences.inspectorWidth}px</output><input type="range" min="190" max="440" value={layoutPreferences.inspectorWidth} onChange={(event) => updateLayoutPreference("inspectorWidth", Number(event.target.value))} /></label></section>
            <section className="credentials-settings">
              <h3>Source credentials</h3><p>Optional. Credentials unlock authenticated source requests and are never included in packs or character files.</p>
              <CredentialFields title="Danbooru" identityLabel="Login" identity={sourceCredentials.danbooru.login} apiKey={sourceCredentials.danbooru.apiKey} onIdentity={(value) => updateCredential("danbooru", "login", value)} onKey={(value) => updateCredential("danbooru", "apiKey", value)} />
              <CredentialFields title="e621" identityLabel="Username" identity={sourceCredentials.e621.username} apiKey={sourceCredentials.e621.apiKey} onIdentity={(value) => updateCredential("e621", "username", value)} onKey={(value) => updateCredential("e621", "apiKey", value)} />
              <CredentialFields title="Gelbooru" identityLabel="User ID" identity={sourceCredentials.gelbooru.userId} apiKey={sourceCredentials.gelbooru.apiKey} onIdentity={(value) => updateCredential("gelbooru", "userId", value)} onKey={(value) => updateCredential("gelbooru", "apiKey", value)} />
              <CredentialFields title="AIBooru" identityLabel="Login" identity={sourceCredentials.aibooru.login} apiKey={sourceCredentials.aibooru.apiKey} onIdentity={(value) => updateCredential("aibooru", "login", value)} onKey={(value) => updateCredential("aibooru", "apiKey", value)} />
              <button type="button" className="credentials-save" onClick={saveCredentials}>Save source credentials</button>
            </section>
            {isOwnerEdition && githubOwner && <section className="credentials-settings owner-publisher"><h3>Owner release publisher</h3><p>Authenticated as {githubLogin}. Uses your existing GitHub CLI keychain session; no token is stored by Prompt Atelier or included in DLC files.</p><label className="settings-check"><input type="checkbox" checked={githubReleaseSettings.enabled} onChange={(event) => setGithubReleaseSettings({ ...githubReleaseSettings, enabled: event.target.checked })} /> Enable Core DLC publishing</label><label>GitHub repository <input value={githubReleaseSettings.repo} placeholder="Falafel0/prompt-atelier" onChange={(event) => setGithubReleaseSettings({ ...githubReleaseSettings, repo: event.target.value.trim() })} /></label><label>Core DLC pack ID <input value={githubReleaseSettings.corePackId} placeholder="core-dlc" onChange={(event) => setGithubReleaseSettings({ ...githubReleaseSettings, corePackId: event.target.value.trim() })} /></label><button type="button" className="credentials-save" onClick={saveGitHubReleaseSettings}>Save release target</button></section>}
            <div><button className="replace" onClick={() => setSettingsOpen(false)}>Done</button></div>
          </section>
        </div>
      )}
      {formatOpen && <div className="modal-backdrop" onMouseDown={() => setFormatOpen(false)}><section className="modal prompt-format-modal" role="dialog" aria-label="Prompt formatting" onMouseDown={(event) => event.stopPropagation()}><button className="settings-close" onClick={() => setFormatOpen(false)} aria-label="Close prompt formatting"><X size={16}/></button><SlidersHorizontal color="#85b1ff"/><h2>Prompt formatting</h2><p>Formatting only changes generated output. Your literal Full prompt text remains untouched until you choose to use it.</p><label>Weight syntax<select value={promptOptions.weightMode} onChange={(event) => updatePromptOption("weightMode", event.target.value as typeof promptOptions.weightMode)}><option value="non-default">Only adjusted weights</option><option value="always">Every tag, including 1.0</option><option value="off">Canonical tags only</option></select></label><label>Tag separator<select value={promptOptions.separator} onChange={(event) => updatePromptOption("separator", event.target.value as typeof promptOptions.separator)}><option value=", ">Comma and space</option><option value="\n">One tag per line</option></select></label><label>Output template <small>Optional: {'{positive}'}, {'{tags}'}, {'{natural}'}, {'{model}'}, {'{category:body}'}</small><textarea value={promptOptions.template} placeholder="{positive}" onChange={(event) => updatePromptOption("template", event.target.value)} /></label><section className="format-preview"><small>LIVE PREVIEW</small><output>{generatedPrompt || "Choose tags to preview the generated prompt."}</output></section><div><button onClick={() => updatePromptOption("template", "")}>Reset template</button><button className="replace" onClick={() => setFormatOpen(false)}>Done</button></div></section></div>}
      {tagMenu && <div className="tag-menu" role="menu" style={{ left: Math.min(tagMenu.x, window.innerWidth - 214), top: Math.min(tagMenu.y, window.innerHeight - 190) }} onMouseLeave={() => setTagMenu(null)}><b>{tagMenu.tag.displayName ?? tagMenu.tag.name}</b><button onClick={() => { setFocusedTag(tagMenu.tag); setTagMenu(null); }}>Inspect</button><button onClick={() => { s.toggle(tagMenu.tag); setTagMenu(null); }}>{selectedIds.has(tagMenu.tag.id) ? "Remove from prompt" : "Add to prompt"}</button><button onClick={() => { window.atelier?.copy(tagMenu.tag.name); notify("Canonical tag copied"); setTagMenu(null); }}>Copy canonical tag</button><button onClick={() => { void openPackStudio(); setTagMenu(null); }}>Open Pack Studio</button></div>}
    </main>
  );
}
function CredentialFields({ title, identityLabel, identity, apiKey, onIdentity, onKey }: { title: string; identityLabel: string; identity: string; apiKey: string; onIdentity(value: string): void; onKey(value: string): void }) {
  return <fieldset className="credential-fields"><legend>{title}</legend><label>{identityLabel}<input value={identity} autoComplete="off" onChange={(event) => onIdentity(event.target.value)} /></label><label>API key<input type="password" value={apiKey} autoComplete="off" placeholder="Optional API key" onChange={(event) => onKey(event.target.value)} /></label></fieldset>;
}
function PromptTextBox({ value, generated, onChange, tags, analysis, contextualIds, selected, relations, onOpenFormat, onBatchDefaultWeights }: { value: string; generated: boolean; onChange(value: string): void; tags: Tag[]; analysis: { sentences: string[]; recognized: Tag[]; unknown: string[]; weights: Record<string, number>; }; contextualIds: Set<string>; selected: import("./types").SelectedTag[]; relations: import("./types").TagRelationship[]; onOpenFormat(): void; onBatchDefaultWeights(): void }) {
  const [scrollTop, setScrollTop] = useState(0); const [caret, setCaret] = useState(0); const [suggestionIndex, setSuggestionIndex] = useState(0); const [palette, setPalette] = useState(false); const [minimap, setMinimap] = useState(true); const textareaRef = useRef<HTMLTextAreaElement>(null);
  const known = useMemo(() => new Map(tags.flatMap((tag) => [tag.name, tag.displayName ?? "", ...(tag.aliases ?? [])].filter(Boolean).map((name) => [name.toLowerCase().replaceAll("-", "_"), tag] as const))), [tags]);
  const lines = value.split("\n"); const beforeCaret = value.slice(0, caret); const token = (beforeCaret.match(/[\w-]+(?:_[\w-]+)*$/)?.[0] ?? "").toLowerCase().replaceAll("-", "_");
  const suggestions = useMemo(() => token.length < 2 ? [] : tags.filter((tag) => `${tag.name} ${tag.displayName ?? ""} ${(tag.aliases ?? []).join(" ")}`.toLowerCase().includes(token)).slice(0, 7), [tags, token]);
  const diagnostics = useMemo(() => { const messages: { key: string; text: string; fix?: () => void }[] = []; const names = analysis.recognized.map((tag) => tag.name); const duplicate = names.find((name, index) => names.indexOf(name) !== index); if (duplicate) messages.push({ key: `duplicate-${duplicate}`, text: `Duplicate: ${duplicate}`, fix: () => onChange(value.split(/,\s*/).filter((part, index, all) => part.trim() !== duplicate || all.findIndex((entry) => entry.trim() === duplicate) === index).join(", ")) }); for (const tag of analysis.recognized) { const weight = analysis.weights[tag.id]; const escapedName = tag.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); if (weight !== undefined && (weight < (tag.min ?? .5) || weight > (tag.max ?? 2))) messages.push({ key: `weight-${tag.id}`, text: `${tag.name}: weight outside allowed range`, fix: () => onChange(value.replace(new RegExp(`\\(${escapedName}:\\s*[\\d.]+\\)`, "g"), `(${tag.name}:${tag.defaultWeight ?? 1})`)) }); } for (const fragment of analysis.unknown) { const alias = [...known.entries()].find(([name]) => name.replaceAll("_", " ") === fragment.toLowerCase().replaceAll("_", " ")); if (alias) messages.push({ key: `alias-${fragment}`, text: `Use canonical ${alias[1].name}`, fix: () => onChange(value.replace(fragment, alias[1].name)) }); } const selectedIds = new Set(selected.map((item) => item.id)); for (const relation of relations) { if (relation.type === "requires" && selectedIds.has(relation.source) && !selectedIds.has(relation.target)) { const target = tags.find((tag) => tag.id === relation.target); if (target) messages.push({ key: `require-${target.id}`, text: `Missing required tag: ${target.name}`, fix: () => onChange(`${value}${value.trim() ? ", " : ""}${target.name}`) }); } } return messages.slice(0, 5); }, [analysis, known, onChange, relations, selected, tags, value]);
  const insertSuggestion = (tag: Tag) => { const start = caret - token.length; const next = `${value.slice(0, start)}${tag.name}${value.slice(caret)}`; onChange(next); requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(start + tag.name.length, start + tag.name.length); }); };
  const normalize = () => onChange(value.split(/[\n,]+/).map((part) => part.trim().replace(/\s+/g, " ")).filter(Boolean).join(", "));
  const removeDuplicates = () => { const seen = new Set<string>(); onChange(value.split(/,\s*/).filter((part) => { const key = part.trim().toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }).join(", ")); };
  const runPalette = (command: string) => { if (command === "Format canonical prompt") normalize(); if (command === "Remove duplicate tags") removeDuplicates(); if (command === "Open formatting") onOpenFormat(); if (command === "Toggle minimap") setMinimap((current) => !current); if (command === "Reset selected tag weights") onBatchDefaultWeights(); if (command.startsWith("Insert ")) { const snippet = command === "Insert character snippet" ? "{character}" : command === "Insert wardrobe snippet" ? "{wardrobe}" : "{scene}"; onChange(`${value}${value.trim() ? ", " : ""}${snippet}`); } setPalette(false); };
  return <div className="prompt-ide"><div className="prompt-ide-gutter" aria-hidden="true">{lines.map((_, index) => <span key={index}>{index + 1}</span>)}</div><pre className="prompt-ide-highlight" aria-hidden="true" style={{ transform: `translateY(${-scrollTop}px)` }}>{lines.map((line, lineIndex) => <span key={lineIndex} className="prompt-ide-line">{line.split(/(\([^)]*?\)|[\w-]+(?:_[\w-]+)*)/g).map((part, index) => { const normalized = part.replace(/^\((.+?):[\d.]+\)$/, "$1").replaceAll("-", "_").toLowerCase(); const tag = known.get(normalized); const weighted = /^\(.+?:[\d.]+\)$/.test(part); const category = tag?.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"); return <span key={index} className={["prompt-token", weighted && "weight", tag && "known", category && `category-${category}`, tag && contextualIds.has(tag.id) && "contextual"].filter(Boolean).join(" ")}>{part}</span>; })}{"\n"}</span>)}</pre><textarea ref={textareaRef} aria-label="Prompt workspace" spellCheck={false} value={value} placeholder="Paste or write a complete prompt…" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} onClick={(event) => setCaret(event.currentTarget.selectionStart)} onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") { event.preventDefault(); setPalette(true); } else if (suggestions.length && (event.key === "Tab" || event.key === "Enter")) { event.preventDefault(); insertSuggestion(suggestions[suggestionIndex] ?? suggestions[0]); } else if (suggestions.length && event.key === "ArrowDown") { event.preventDefault(); setSuggestionIndex((current) => Math.min(current + 1, suggestions.length - 1)); } else if (suggestions.length && event.key === "ArrowUp") { event.preventDefault(); setSuggestionIndex((current) => Math.max(current - 1, 0)); } }} onChange={(event) => { setCaret(event.currentTarget.selectionStart); setSuggestionIndex(0); onChange(event.target.value); }} />{suggestions.length > 0 && <div className="prompt-autocomplete">{suggestions.map((tag, index) => <button key={tag.id} className={index === suggestionIndex ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); insertSuggestion(tag); }}><b>{tag.name}</b><small>{tag.category} › {tag.subcategory}</small><kbd>{index === suggestionIndex ? "Tab" : ""}</kbd></button>)}</div>}{diagnostics.length > 0 && <div className="prompt-diagnostics">{diagnostics.map((diagnostic) => <div key={diagnostic.key}><span>⚠ {diagnostic.text}</span>{diagnostic.fix && <button onClick={diagnostic.fix}>Fix</button>}</div>)}</div>}{minimap && <div className="prompt-minimap" aria-label="Prompt minimap">{lines.map((line, index) => <i key={index} className={line.includes("_") ? "known" : ""} />)}</div>}{palette && <div className="prompt-palette" role="dialog"><b>COMMAND PALETTE</b>{["Format canonical prompt", "Remove duplicate tags", "Reset selected tag weights", "Open formatting", "Toggle minimap", "Insert character snippet", "Insert wardrobe snippet", "Insert scene snippet"].map((command) => <button key={command} onClick={() => runPalette(command)}>{command}</button>)}</div>}<div className="prompt-ide-status"><span>{generated ? "GENERATED · EDIT TO OVERRIDE" : "EDITING · TWO-WAY SYNC"}</span><span>{analysis.recognized.length} known · {analysis.sentences.length} sentence{analysis.sentences.length === 1 ? "" : "s"} · {analysis.unknown.length} unresolved · Ctrl+Shift+P</span></div></div>;
}
function MacroTagGrid({ macros, kind, onInsert, onLoad }: {
  macros: (import("./types").CharacterSnapshot & { id: string; updatedAt: string; thumbnail?: string })[];
  kind: WorkspaceMode;
  onInsert(macro: import("./types").CharacterSnapshot & { id: string; updatedAt: string; thumbnail?: string }): void;
  onLoad(macro: import("./types").CharacterSnapshot & { id: string; updatedAt: string; thumbnail?: string }): void;
}) {
  const title = kind === "character" ? "characters" : kind === "wardrobe" ? "wardrobes" : "scenes";
  return <section className="macro-tag-grid" aria-label={`Saved ${title}`}>
    <header><div><small>SAVED {kind.toUpperCase()} MACROS</small><h3>Reusable {title}</h3><p>These saved sets behave like tag collections. Insert combines their tags with the current prompt; Load replaces it.</p></div></header>
    {macros.length ? <div className="macro-tag-list">{macros.map((macro) => <article key={macro.id} className="macro-tag-card">
      <i>{macro.thumbnail ? <img src={macro.thumbnail} alt="" /> : <Tags size={18} />}</i>
      <div><b>{macro.name}</b><small>{macro.selected.length} tags · {new Date(macro.updatedAt).toLocaleDateString()}</small><span>{macro.rawPrompt?.trim() || "Saved canonical selection"}</span></div>
      <footer><button type="button" onClick={() => onInsert(macro)}>Insert</button><button type="button" className="replace" onClick={() => onLoad(macro)}>Load</button></footer>
    </article>)}</div> : <div className="macro-empty"><Tags size={24}/><b>No saved {title} yet</b><p>Build a selection in this tab, then use Save {kind === "character" ? "character" : kind === "wardrobe" ? "wardrobe" : "scene"}. It will appear here as a reusable macro tag.</p></div>}
  </section>;
}
function DollSlots({
  selected,
  tagsById,
}: {
  selected: import("./types").SelectedTag[];
  tagsById: Map<string, Tag>;
}) {
  const [compact, setCompact] = useState(false);
  const slots = useMemo(() => {
    const groups = new Map<string, Tag[]>();
    for (const item of selected) {
      const tag = tagsById.get(item.id);
      if (!tag) continue;
      const label = `${tag.category} › ${tag.subcategory}`;
      groups.set(label, [...(groups.get(label) ?? []), tag]);
    }
    return [...groups.entries()].map(([label, tags]) => ({ label, tags })).sort((a, b) => a.label.localeCompare(b.label));
  }, [selected, tagsById]);
  return <div className={`visual-inventory ${compact ? "compact" : ""}`}>
    <header><span>VISUAL TAG INVENTORY</span><small>{selected.length} selected</small><button type="button" className={compact ? "active" : ""} onClick={() => setCompact((value) => !value)}>{compact ? "Expand" : "Compact"}</button></header>
    {slots.length ? <div className="inventory-groups">{slots.map((group) => <section key={group.label}><h3>{group.label}<small>{group.tags.length}</small></h3><div>{group.tags.map((tag) => <article key={tag.id} title={`${tag.name} · ${tag.category} › ${tag.subcategory}`}>{tag.preview ? <img src={tag.preview} alt="" /> : <i>{tag.name.slice(0, 1).toUpperCase()}</i>}<span><b>{tag.displayName ?? tag.name.replaceAll("_", " ")}</b><small>{tag.subcategory}</small></span></article>)}</div></section>)}</div> : <div className="inventory-empty"><b>No tag previews selected</b><small>Choose tags in the catalog. Tags with an embedded preview will appear here as visual inventory slots.</small></div>}
  </div>;
}

function TagChip({
  tag,
  selected,
  displayMode,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  tag: Tag;
  selected: boolean;
  displayMode: "compact" | "details" | "preview" | "path";
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (event: import("react").MouseEvent<HTMLButtonElement>) => void;
}) {
  const s = useStore();
  const conflict = s.relations.some(
    (r) =>
      r.type === "conflicts" &&
      ((r.source === tag.id && s.selected.some((x) => x.id === r.target)) ||
        (r.target === tag.id && s.selected.some((x) => x.id === r.source))),
  );
  const description =
    displayMode === "path"
      ? `${tag.category} › ${tag.subcategory}`
      : (tag.description ?? `${tag.category} › ${tag.subcategory}`);
  return (
    <button
      className={`tag tag-mode-${displayMode} ${selected ? "tag-selected" : ""} ${conflict && !selected ? "tag-conflict" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <span className="tag-info">
        <i className={`tag-preview preview-${tag.category.toLowerCase()}`}>
          {tag.preview ? (
            <img src={tag.preview} alt="" />
          ) : (
            tag.name.slice(0, 1).toUpperCase()
          )}
        </i>
        <span>
          <b>{tag.displayName ?? tag.name}</b>
          <small>{description}</small>
        </span>
      </span>
      {selected ? (
        <Check size={13} />
      ) : tag.slider ? (
        <span className="dot" />
      ) : null}
    </button>
  );
}
function SelectedChip({
  item,
  tag,
}: {
  item: ReturnType<typeof useStore.getState>["selected"][number];
  tag?: Tag;
}) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const name = tag?.name ?? item.id;
  return (
    <div
      className="selected-chip"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        s.reorder(e.dataTransfer.getData("text/plain"), item.id);
      }}
    >
      <div className="chip-name">
        <span>{name}</span>
        {item.source !== "user" && <small>AUTO</small>}
      </div>
      {tag?.slider && (
        <button className="slider-toggle" onClick={() => setOpen(!open)}>
          <SlidersHorizontal size={14} />
        </button>
      )}
      {open && tag && (
        <div className="weight parameter-popover">
          <ParameterSlider
            label="Intensity"
            value={item.weight}
            min={tag.min ?? 0.5}
            max={tag.max ?? 2}
            onChange={(value) => s.weight(item.id, value)}
            reset={() => s.weight(item.id, tag.defaultWeight ?? 1)}
          />
          <PreviewChoiceGrid
            label="Emphasis preview"
            value={item.weight}
            onChange={(value) => s.weight(item.id, value)}
            choices={[
              { value: tag.min ?? 0.5, title: "Soft", preview: "○" },
              { value: tag.defaultWeight ?? 1, title: "Natural", preview: "●" },
              { value: tag.max ?? 2, title: "Strong", preview: "✦" },
            ]}
          />
          <ParameterCheckbox
            label="Use emphasis"
            detail="Enable a strong weighted form in generated prompts."
            checked={item.weight !== tag.defaultWeight}
            onChange={(checked) =>
              s.weight(
                item.id,
                checked ? (tag.max ?? 2) : (tag.defaultWeight ?? 1),
              )
            }
          />
        </div>
      )}
      <button className="remove" onClick={() => s.remove(item.id)}>
        <X size={14} />
      </button>
    </div>
  );
}
