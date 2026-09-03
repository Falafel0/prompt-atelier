/** Category names are authored by the user or by an installed DLC. */
export type Category = string;
export type RelationType = "implies" | "conflicts" | "suggests" | "requires";
export type PromptModel = "NAI" | "SDXL (NoobAI)" | "Anima (Cosmos)";
/**
 * A portable paper-doll layer. `image` is a data URI in v1 so an
 * .atelier-dlc remains a single shareable file; later pack formats may add
 * external asset archives without changing the renderer contract.
 */
export interface SpriteLayer {
  image: string;
  slot: "base" | "skin" | "face" | "hair-back" | "hair-front" | "top" | "bottom" | "dress" | "outerwear" | "legs" | "shoes" | "headwear" | "accessory" | "effect";
  layer: number;
  anchor: "canvas" | "head" | "torso" | "waist" | "feet" | "left-hand" | "right-hand";
  x: number;
  y: number;
  scale: number;
  opacity: number;
  blend: "normal" | "multiply" | "screen" | "overlay";
  tint?: string;
  coverage?: "none" | "torso" | "legs" | "full-body";
  view?: "front" | "back" | "side";
}
export interface Tag {
  id: string;
  name: string;
  displayName?: string;
  category: Category;
  subcategory: string;
  aliases?: string[];
  description?: string;
  preview?: string;
  nsfw?: boolean;
  slider?: boolean;
  min?: number;
  max?: number;
  defaultWeight?: number;
  enabled?: boolean;
  popularity?: number;
  /** Optional compositing record authored only in Pack Studio. */
  sprite?: SpriteLayer;
  /** Multiple ordered layers may be attached to one canonical tag. */
  sprites?: SpriteLayer[];
}
export interface TagRelationship {
  id?: number;
  source: string;
  target: string;
  type: RelationType;
  strength?: number;
  packId?: string;
}
export interface SelectedTag {
  id: string;
  weight: number;
  source: "user" | "auto-added" | "dependency";
  order: number;
  missing?: boolean;
}
export interface PackManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  dependencies: string[];
  conflicts: string[];
  tagCount: number;
  relationshipCount: number;
  tagGroups?: {
    name: string;
    tags: string[];
    context?: "color" | "material" | "body-detail" | "accessory" | "pattern" | "custom";
  }[];
}
export interface PromptTemplate {
  id: string;
  name: string;
  model: PromptModel;
  body: string;
}
export interface CharacterSnapshot {
  version: 1;
  name: string;
  savedAt: string;
  selected: SelectedTag[];
  model: PromptModel;
  /**
   * A reusable saved selection. Legacy snapshots without a kind are full
   * characters, so older libraries remain compatible.
   */
  kind?: "character" | "wardrobe" | "scene";
  /** A literal prompt authored in Prompt Atelier, kept alongside its parsed tags. */
  rawPrompt?: string;
  template?: string;
  scene?: {
    text: string;
    selected: SelectedTag[];
    macroFormat: "tags" | "natural" | "natural-and-tags" | "model-default";
  };
}
export interface ImportResult {
  added: number;
  skipped: number;
  warnings: string[];
}
export interface CanonicalTag extends Tag {
  sources: ("danbooru" | "gelbooru" | "e621" | "aibooru")[];
  sourceMetadata: Record<
    string,
    { id: number; postCount: number; category: number | string | null }
  >;
}
export interface CustomTagInput {
  name: string;
  displayName?: string;
  description?: string;
  category: Category;
  subcategory: string;
  slider: boolean;
}
export type CatalogSource = "danbooru" | "gelbooru" | "e621" | "aibooru";

declare global {
  interface Window {
    atelier?: {
      copy(text: string): Promise<void>;
      bootstrap(
        pack: PackManifest,
        tags: Tag[],
        rels: TagRelationship[],
      ): Promise<{ seeded: boolean }>;
      saveCharacter(
        snapshot: CharacterSnapshot & { id?: string; thumbnail?: string },
      ): Promise<string>;
      listCharacters(): Promise<
        (CharacterSnapshot & { id: string; updatedAt: string; thumbnail?: string })[]
      >;
      loadCharacter(id: string): Promise<CharacterSnapshot | null>;
      deleteCharacter(id: string): Promise<boolean>;
      exportCharacter(snapshot: CharacterSnapshot): Promise<boolean>;
      importCharacter(): Promise<CharacterSnapshot | null>;
      getSetting(key: string): Promise<unknown>;
      setSetting(key: string, value: unknown): Promise<unknown>;
      listTaxonomy(): Promise<
        {
          id: string;
          name: string;
          scope: "appearance" | "character" | "wardrobe" | "scene";
          sortOrder: number;
          subcategories: { id: string; name: string; sortOrder: number }[];
        }[]
      >;
      createTaxonomy(input: {
        category: string;
        subcategory: string;
        scope?: "character" | "wardrobe" | "scene";
      }): Promise<{
        category: string;
        subcategory: string;
        scope: "character" | "wardrobe" | "scene";
      }>;
      restoreStarterTaxonomy(): Promise<boolean>;
      renameTaxonomy(input: {
        id: string;
        type: "category" | "subcategory";
        name: string;
      }): Promise<boolean>;
      setTaxonomyIcon(input: {
        id: string;
        type: "category" | "subcategory";
        icon: string;
      }): Promise<boolean>;
      deleteTaxonomy(input: {
        id: string;
        type: "category" | "subcategory";
      }): Promise<{ movedTags: number }>;
      listPacks(): Promise<(PackManifest & { enabled: boolean })[]>;
      listPackTags(): Promise<Tag[]>;
      togglePack(id: string, enabled: boolean): Promise<boolean>;
      uninstallPack(id: string): Promise<{ id: string; name: string; removedTags: number }>;
      clearDlcPacks(): Promise<{ removedPacks: number; removedTags: number }>;
      checkPackUpdates(): Promise<{ repo: string; updates: { id: string; version: string; url: string }[] }>;
      installPackUpdate(id: string): Promise<ImportResult>;
      importPack(): Promise<ImportResult | null>;
      exportPack(id: string): Promise<boolean>;
      openPackStudio(): Promise<boolean>;
      exportDraftPack(value: unknown): Promise<boolean>;
      openDraftPack(): Promise<unknown | null>;
      openExternal(url: string): Promise<void>;
      downloadSourceAsset(url: string, name: string): Promise<boolean>;
      embedSourceAsset(url: string): Promise<string>;
      embedLocalPreview(): Promise<string | null>;
      studioSourceSearch(
        source: string,
        kind: string,
        query: string,
      ): Promise<unknown[]>;
      openSourceGroup(
        source: string,
        title: string,
      ): Promise<{ title: string; body: string; items: unknown[] }>;
      searchCanonical(
        query: string,
      ): Promise<{ tags: CanonicalTag[]; errors: string[] }>;
      mergeCanonical(
        query: string,
      ): Promise<ImportResult & { tags: CanonicalTag[] }>;
      importSourceDump(
        source: "auto" | CatalogSource,
      ): Promise<
        (ImportResult & { tags: CanonicalTag[]; source: string }) | null
      >;
      sourceCatalog(
        source: CatalogSource,
        offset: number,
      ): Promise<CanonicalTag[]>;
      syncSource(
        source: CatalogSource,
      ): Promise<{ source: CatalogSource; total: number; pages: number }>;
      onSyncProgress(
        listener: (data: {
          source: CatalogSource;
          added: number;
          processed: number;
        }) => void,
      ): () => void;
      createCustomTag(tag: CustomTagInput): Promise<Tag>;
      listRelationships(): Promise<TagRelationship[]>;
      createRelationship(rule: {
        source: string;
        target: string;
        type: RelationType;
        strength: number;
      }): Promise<TagRelationship>;
      deleteRelationship(id: number): Promise<boolean>;
      githubReleaseStatus?(): Promise<{
        owner: boolean;
        login: string;
        repo: string;
        corePackId: string;
        enabled: boolean;
      }>;
      publishCoreDlc?(): Promise<{ tag: string; url: string }>;
    };
  }
}
