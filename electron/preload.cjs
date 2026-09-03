const { contextBridge, ipcRenderer } = require("electron");
// Sandboxed Electron preloads may only require Electron built-ins. The edition is
// supplied by the trusted main process instead of requiring package.json here.
const isOwnerEdition = !process.argv.includes("--atelier-edition=public");
contextBridge.exposeInMainWorld("atelier", {
  copy: (value) => ipcRenderer.invoke("clipboard:write", value),
  bootstrap: (pack, tags, rels) =>
    ipcRenderer.invoke("db:bootstrap", pack, tags, rels),
  ...(isOwnerEdition ? {
    openPackStudio: () => ipcRenderer.invoke("pack-studio:open"),
    exportDraftPack: (draft) => ipcRenderer.invoke("pack-studio:export-draft", draft),
    openDraftPack: () => ipcRenderer.invoke("pack-studio:open-draft"),
  } : {}),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  downloadSourceAsset: (url, name) =>
    ipcRenderer.invoke("source:download", url, name),
  embedSourceAsset: (url) => ipcRenderer.invoke("source:embed", url),
  embedLocalPreview: () => ipcRenderer.invoke("source:embed-local"),
  studioSourceSearch: (source, kind, query) =>
    ipcRenderer.invoke("studio:sources:search", source, kind, query),
  openSourceGroup: (source, title) =>
    ipcRenderer.invoke("studio:sources:open-group", source, title),
  saveCharacter: (snapshot) => ipcRenderer.invoke("characters:save", snapshot),
  listCharacters: () => ipcRenderer.invoke("characters:list"),
  loadCharacter: (id) => ipcRenderer.invoke("characters:load", id),
  deleteCharacter: (id) => ipcRenderer.invoke("characters:delete", id),
  exportCharacter: (snapshot) =>
    ipcRenderer.invoke("characters:export", snapshot),
  importCharacter: () => ipcRenderer.invoke("characters:import"),
  getSetting: (key) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  listTaxonomy: () => ipcRenderer.invoke("taxonomy:list"),
  createTaxonomy: (input) => ipcRenderer.invoke("taxonomy:create", input),
  restoreStarterTaxonomy: () => ipcRenderer.invoke("taxonomy:restore-starter"),
  renameTaxonomy: (input) => ipcRenderer.invoke("taxonomy:rename", input),
  setTaxonomyIcon: (input) => ipcRenderer.invoke("taxonomy:set-icon", input),
  deleteTaxonomy: (input) => ipcRenderer.invoke("taxonomy:delete", input),
  listPacks: () => ipcRenderer.invoke("packs:list"),
  listPackTags: () => ipcRenderer.invoke("packs:list-tags"),
  togglePack: (id, enabled) => ipcRenderer.invoke("packs:toggle", id, enabled),
  uninstallPack: (id) => ipcRenderer.invoke("packs:uninstall", id),
  clearDlcPacks: () => ipcRenderer.invoke("packs:clear-dlc"),
  checkPackUpdates: () => ipcRenderer.invoke("packs:check-updates"),
  installPackUpdate: (id) => ipcRenderer.invoke("packs:install-update", id),
  importPack: () => ipcRenderer.invoke("packs:import"),
  exportPack: (id) => ipcRenderer.invoke("packs:export", id),
  searchCanonical: (query) => ipcRenderer.invoke("sources:search", query),
  mergeCanonical: (query) => ipcRenderer.invoke("sources:merge", query),
  importSourceDump: (source) =>
    ipcRenderer.invoke("sources:import-dump", source),
  sourceCatalog: (source, offset) =>
    ipcRenderer.invoke("sources:catalog", source, offset),
  syncSource: (source) => ipcRenderer.invoke("sources:sync-all", source),
  onSyncProgress: (listener) => {
    const handler = (_, data) => listener(data);
    ipcRenderer.on("sources:sync-progress", handler);
    return () => ipcRenderer.removeListener("sources:sync-progress", handler);
  },
  createCustomTag: (tag) => ipcRenderer.invoke("tags:create-custom", tag),
  listRelationships: () => ipcRenderer.invoke("relationships:list"),
  createRelationship: (rule) =>
    ipcRenderer.invoke("relationships:create", rule),
  deleteRelationship: (id) => ipcRenderer.invoke("relationships:delete", id),
  ...(isOwnerEdition ? {
    githubReleaseStatus: () => ipcRenderer.invoke("github:release-status"),
    publishCoreDlc: () => ipcRenderer.invoke("github:publish-core-dlc"),
    validateDlcDraft: (draft) => ipcRenderer.invoke("owner:validate-dlc-draft", draft),
    publishDlcDraft: (draft) => ipcRenderer.invoke("owner:publish-dlc-draft", draft),
    installDlcDraft: (draft) => ipcRenderer.invoke("owner:install-dlc-draft", draft),
  } : {}),
});
