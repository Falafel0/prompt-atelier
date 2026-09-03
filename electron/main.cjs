const {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  dialog,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const database = require("./database.cjs");
const sources = require("./sources.cjs");
const BUILD_EDITION = require("../package.json").atelierEdition === "public" ? "public" : "owner";
const RELEASE_CHANNEL = String(require("../package.json").githubReleaseRepo || "");
const DLC_MAGIC = "PROMPT-ATELIER-DLC/1\n";
const CHARACTER_MAGIC = "PROMPT-ATELIER-CHARACTER/1\n";
function encodeAtelierFile(magic, value) {
  return `${magic}${JSON.stringify(value)}`;
}
function decodeAtelierFile(text, magic) {
  return JSON.parse(text.startsWith(magic) ? text.slice(magic.length) : text);
}
const RELEASE_OWNER = "Falafel0";
let mainWindow = null;
let packStudioWindow = null;
function observeWindowLoad(window, label) {
  if (process.env.PROMPT_ATELIER_DEBUG !== "1") return;
  window.webContents.on("did-fail-load", (_, code, description, url) =>
    console.error(`[${label}] failed to load ${url}: ${code} ${description}`),
  );
  window.webContents.on("render-process-gone", (_, details) =>
    console.error(`[${label}] renderer exited: ${details.reason}`),
  );
  window.webContents.on("console-message", (_, level, message, line, sourceId) =>
    console.error(`[${label}] renderer console ${level} at ${sourceId}:${line}: ${message}`),
  );
  window.webContents.once("did-finish-load", async () => {
    try {
      const bridge = await window.webContents.executeJavaScript("typeof window.atelier");
      console.error(`[${label}] preload bridge: ${bridge}`);
    } catch (error) { console.error(`[${label}] bridge check failed: ${error.message}`); }
  });
}
const runGh = (args) => new Promise((resolve, reject) => {
  execFile("gh", args, { windowsHide: true }, (error, stdout, stderr) => {
    if (error) reject(new Error((stderr || error.message).trim()));
    else resolve(String(stdout).trim());
  });
});
const releaseSettings = () => ({ enabled: false, repo: "", corePackId: "core-dlc", ...(database.setting("github-release-settings") || {}) });
const compareVersions = (left, right) => {
  const toParts = (value) => String(value || "0").replace(/^v/i, "").split(/[^0-9]+/).filter(Boolean).map(Number);
  const a = toParts(left); const b = toParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
};
async function releaseAssets() {
  if (!RELEASE_CHANNEL) return [];
  const response = await fetch(`https://api.github.com/repos/${RELEASE_CHANNEL}/releases?per_page=100`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Prompt-Atelier" },
  });
  if (!response.ok) throw new Error(`Unable to check public DLC updates (${response.status}).`);
  const releases = await response.json();
  return Array.isArray(releases) ? releases.flatMap((release) => Array.isArray(release.assets) ? release.assets : []) : [];
}
async function checkPackUpdates() {
  const assets = await releaseAssets();
  const updates = database.listPacks().flatMap((pack) => {
    const prefix = `${pack.id}-`;
    const matches = assets.filter((asset) => typeof asset.name === "string" && asset.name.startsWith(prefix) && asset.name.endsWith(".atelier-dlc"));
    const candidate = matches.sort((a, b) => compareVersions(String(b.name).slice(prefix.length, -12), String(a.name).slice(prefix.length, -12)))[0];
    if (!candidate) return [];
    const version = String(candidate.name).slice(prefix.length, -12);
    return compareVersions(version, pack.version) > 0 ? [{ id: pack.id, version, url: candidate.browser_download_url }] : [];
  });
  return { repo: RELEASE_CHANNEL, updates };
}
async function installPackUpdate(id) {
  const update = (await checkPackUpdates()).updates.find((item) => item.id === id);
  if (!update) throw new Error("No newer public DLC is available for this pack.");
  const response = await fetch(update.url, { headers: { "User-Agent": "Prompt-Atelier" } });
  if (!response.ok) throw new Error(`Unable to download DLC update (${response.status}).`);
  const pack = decodeAtelierFile(await response.text(), DLC_MAGIC);
  if (pack?.manifest?.id !== id) throw new Error("The downloaded update does not match this DLC.");
  return database.installPack(pack, { replace: true });
}
async function githubReleaseStatus() {
  if (BUILD_EDITION !== "owner") return { owner: false, login: "", repo: "", corePackId: "", enabled: false };
  const settings = releaseSettings();
  let login = "";
  try { login = await runGh(["api", "user", "--jq", ".login"]); } catch { /* unavailable until GitHub CLI is authenticated */ }
  return { owner: login === RELEASE_OWNER, login, repo: settings.repo, corePackId: settings.corePackId, enabled: !!settings.enabled };
}
async function publishCoreDlc() {
  const settings = releaseSettings();
  const pack = database.listPacks().find((item) => item.id === settings.corePackId);
  if (!pack) throw new Error(`Installed pack “${settings.corePackId}” was not found.`);
  return publishDlcDraft(database.exportPack(settings.corePackId));
}
function validateDlcDraft(draft) {
  try {
    const pack = database.validatePack(draft);
    return { valid: true, issues: [], summary: { id: pack.manifest.id, name: pack.manifest.name, version: pack.manifest.version, tags: pack.tags.length, relationships: pack.relationships.length } };
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : "Invalid DLC draft."], summary: null };
  }
}
async function publishDlcDraft(draft) {
  if (BUILD_EDITION !== "owner") throw new Error("DLC publishing is available only in Prompt Atelier Owner.");
  const preflight = validateDlcDraft(draft);
  if (!preflight.valid) throw new Error(preflight.issues[0]);
  const status = await githubReleaseStatus(); const settings = releaseSettings();
  if (!status.owner) throw new Error("DLC publishing is restricted to the configured owner account.");
  if (!settings.enabled || !/^[\w.-]+\/[\w.-]+$/.test(settings.repo)) throw new Error("Set an enabled GitHub release repository in Global settings first.");
  const { id, name, version } = preflight.summary;
  const safeVersion = String(version || "0.0.0").replace(/[^0-9A-Za-z._-]/g, "-"); const tag = `${id}-v${safeVersion}`;
  const file = path.join(app.getPath("temp"), `${id}-${safeVersion}.atelier-dlc`);
  fs.writeFileSync(file, encodeAtelierFile(DLC_MAGIC, draft));
  try {
    let url;
    try { url = await runGh(["release", "create", tag, file, "--repo", settings.repo, "--title", `${name} ${version}`, "--notes", `Prompt Atelier DLC ${id} ${version}`]); }
    catch (error) { await runGh(["release", "upload", tag, file, "--clobber", "--repo", settings.repo]); url = await runGh(["release", "view", tag, "--repo", settings.repo, "--json", "url", "--jq", ".url"]); }
    return { tag, url, pack: id, version };
  } finally { try { fs.unlinkSync(file); } catch { /* temp cleanup only */ } }
}
async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return true;
  }
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#101319",
    icon: path.join(__dirname, "../assets/prompt-atelier-icon.png"),
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      additionalArguments: [`--atelier-edition=${BUILD_EDITION}`],
    },
  });
  mainWindow = window;
  window.once("closed", () => { mainWindow = null; });
  observeWindowLoad(window, "Atelier");
  try {
    if (process.env.VITE_DEV_SERVER_URL)
      await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    else await window.loadFile(path.join(__dirname, "../dist/index.html"));
    if (!window.isDestroyed()) window.show();
    return true;
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    mainWindow = null;
    throw new Error(`Prompt Atelier could not be opened: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function openPackStudioWindow() {
  if (packStudioWindow && !packStudioWindow.isDestroyed()) {
    if (packStudioWindow.isMinimized()) packStudioWindow.restore();
    packStudioWindow.focus();
    return true;
  }
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 540,
    backgroundColor: "#101319",
    title: "Pack Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      additionalArguments: [`--atelier-edition=${BUILD_EDITION}`],
    },
  });
  observeWindowLoad(window, "Pack Studio");
  packStudioWindow = window;
  window.once("closed", () => { packStudioWindow = null; });
  try {
    if (process.env.VITE_DEV_SERVER_URL)
      await window.loadURL(`${process.env.VITE_DEV_SERVER_URL}/pack-studio.html`);
    else await window.loadFile(path.join(__dirname, "../dist/pack-studio.html"));
    if (!window.isDestroyed()) window.show();
    return true;
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    packStudioWindow = null;
    throw new Error(`Pack Studio could not be opened: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function runDanbooruCore(send = () => {}) {
  const checkpoint = database.syncCheckpoint("danbooru:tags") || 0;
  const synced = await sources.syncAll(
    "danbooru",
    async (tags, next) => {
      const result = database.mergeCanonical(tags);
      database.syncCheckpoint("danbooru:tags", next);
      send({
        source: "danbooru",
        added: result.added,
        processed: tags.length,
        phase: "tags",
      });
    },
    checkpoint,
  );
  const knowledge = await sources.syncDanbooruKnowledge(
    async (batch) => {
      database.ingestDanbooruKnowledge(batch);
      database.syncCheckpoint(`danbooru:${batch.kind}`, batch.next);
      send({
        source: "danbooru",
        added: 0,
        processed: batch.rows.length,
        phase: batch.kind,
      });
    },
    {
      aliases: database.syncCheckpoint("danbooru:aliases"),
      implications: database.syncCheckpoint("danbooru:implications"),
      wikis: database.syncCheckpoint("danbooru:wikis"),
    },
  );
  const classified = database.reclassifyImported();
  const core = database.promoteDanbooruToCore();
  return { ...synced, knowledge, ...classified, core };
}
app.whenReady().then(() => {
  sources.setCredentials(database.setting("source-credentials") || {});
  // Maintenance switch used by the desktop build to reset installed DLC without
  // touching the User Pack, editable taxonomy, or character snapshots.
  if (process.argv.includes("--reset-dlc")) {
    const result = database.clearDlcPacks();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    app.quit();
    return;
  }
  ipcMain.handle("clipboard:write", (_, value) => clipboard.writeText(value));
  if (BUILD_EDITION === "owner") ipcMain.handle("pack-studio:open", () => openPackStudioWindow());
  ipcMain.handle("pack-studio:export-draft", async (_, draft) => {
    const id = String(draft?.manifest?.id || "untitled-pack").replace(
      /[^a-z0-9_-]/gi,
      "_",
    );
    const chosen = await dialog.showSaveDialog({
      defaultPath: `${id}.atelier-dlc`,
      filters: [{ name: "Prompt Atelier DLC", extensions: ["atelier-dlc"] }],
    });
    if (chosen.canceled) return false;
    database.validatePack ? database.validatePack(draft) : null;
    fs.writeFileSync(chosen.filePath, encodeAtelierFile(DLC_MAGIC, draft));
    return true;
  });
  ipcMain.handle("pack-studio:open-draft", async () => {
    const chosen = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Prompt Atelier DLC", extensions: ["atelier-dlc", "json"] },
      ],
    });
    if (chosen.canceled) return null;
    const draft = decodeAtelierFile(
      fs.readFileSync(chosen.filePaths[0], "utf8"),
      DLC_MAGIC,
    );
    database.validatePack(draft);
    return draft;
  });
  ipcMain.handle("shell:open-external", (_, value) => {
    const url = String(value || "");
    if (!/^https:\/\//i.test(url))
      throw new Error("Only secure web URLs can be opened.");
    return shell.openExternal(url);
  });
  ipcMain.handle(
    "source:download",
    async (_, url, fallback = "source-asset") => {
      const value = String(url || "");
      if (!/^https:\/\//i.test(value))
        throw new Error("Only secure image URLs can be downloaded.");
      const extension =
        new URL(value).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "jpg";
      const chosen = await dialog.showSaveDialog({
        defaultPath: `${String(fallback).replace(/[^a-z0-9_-]/gi, "_")}.${extension}`,
        filters: [{ name: "Image", extensions: [extension] }],
      });
      if (chosen.canceled) return false;
      const response = await fetch(value, {
        headers: {
          "User-Agent":
            "PromptAtelier/0.1 (user initiated source asset download)",
        },
      });
      if (!response.ok) throw new Error(`Download returned ${response.status}`);
      fs.writeFileSync(
        chosen.filePath,
        Buffer.from(await response.arrayBuffer()),
      );
      return true;
    },
  );
  ipcMain.handle("source:embed", async (_, url) => {
    const value = String(url || "");
    if (!/^https:\/\//i.test(value))
      throw new Error("Only secure image URLs can be embedded.");
    const response = await fetch(value, {
      headers: {
        "User-Agent": "PromptAtelier/0.1 (user initiated DLC preview embed)",
      },
    });
    if (!response.ok) throw new Error(`Preview returned ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 5 * 1024 * 1024)
      throw new Error("Preview is larger than 5 MB.");
    const mime =
      response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (!mime.startsWith("image/"))
      throw new Error("The selected asset is not an image.");
    return `data:${mime};base64,${data.toString("base64")}`;
  });
  ipcMain.handle("source:embed-local", async () => {
    const chosen = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (chosen.canceled || !chosen.filePaths[0]) return null;
    const filePath = chosen.filePaths[0];
    const data = fs.readFileSync(filePath);
    if (data.length > 5 * 1024 * 1024) throw new Error("Preview is larger than 5 MB.");
    const extension = path.extname(filePath).slice(1).toLowerCase();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[extension];
    if (!mime) throw new Error("Unsupported preview format.");
    return `data:${mime};base64,${data.toString("base64")}`;
  });
  ipcMain.handle("db:bootstrap", (_, pack, tags, rels) =>
    database.bootstrap(pack, tags, rels),
  );
  ipcMain.handle("taxonomy:list", () => database.listTaxonomy());
  ipcMain.handle("taxonomy:create", (_, input) =>
    database.createTaxonomy(input),
  );
  ipcMain.handle("taxonomy:restore-starter", () =>
    database.restoreStarterTaxonomy(),
  );
  ipcMain.handle("taxonomy:rename", (_, input) =>
    database.renameTaxonomy(input),
  );
  ipcMain.handle("taxonomy:set-icon", (_, input) =>
    database.setTaxonomyIcon(input),
  );
  ipcMain.handle("taxonomy:delete", (_, input) =>
    database.deleteTaxonomy(input),
  );
  ipcMain.handle("characters:save", (_, snapshot) =>
    database.saveCharacter(snapshot),
  );
  ipcMain.handle("characters:list", () => database.listCharacters());
  ipcMain.handle("characters:load", (_, id) => database.loadCharacter(id));
  ipcMain.handle("characters:delete", (_, id) => database.deleteCharacter(id));
  ipcMain.handle("characters:export", async (_, snapshot) => {
    const chosen = await dialog.showSaveDialog({
      defaultPath: `${String(snapshot.name || "character").replace(/[^a-z0-9_-]/gi, "_")}.atelier-character`,
      filters: [
        { name: "Prompt Atelier character", extensions: ["atelier-character"] },
      ],
    });
    if (chosen.canceled) return false;
    fs.writeFileSync(
      chosen.filePath,
      encodeAtelierFile(CHARACTER_MAGIC, {
        format: "prompt-atelier.character",
        formatVersion: 1,
        snapshot,
      }),
    );
    return true;
  });
  ipcMain.handle("characters:import", async () => {
    const chosen = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Prompt Atelier character",
          extensions: ["atelier-character", "json"],
        },
      ],
    });
    if (chosen.canceled) return null;
    const parsed = decodeAtelierFile(
      fs.readFileSync(chosen.filePaths[0], "utf8"),
      CHARACTER_MAGIC,
    );
    const snapshot =
      parsed?.format === "prompt-atelier.character" ? parsed.snapshot : parsed;
    if (
      snapshot?.version !== 1 ||
      !Array.isArray(snapshot.selected) ||
      typeof snapshot.model !== "string"
    )
      throw new Error(
        "This is not a compatible Prompt Atelier character file.",
      );
    return snapshot;
  });
  ipcMain.handle("settings:get", (_, key) => database.setting(key));
  ipcMain.handle("settings:set", (_, key, value) => {
    const saved = database.setting(key, value);
    if (key === "source-credentials") sources.setCredentials(value);
    return saved;
  });
  ipcMain.handle("packs:list", () => database.listPacks());
  ipcMain.handle("packs:list-tags", () => database.listTags());
  ipcMain.handle("packs:toggle", (_, id, enabled) =>
    database.togglePack(id, enabled),
  );
  ipcMain.handle("packs:uninstall", (_, id) => database.uninstallPack(id));
  ipcMain.handle("packs:clear-dlc", () => database.clearDlcPacks());
  ipcMain.handle("packs:check-updates", () => checkPackUpdates());
  ipcMain.handle("packs:install-update", (_, id) => installPackUpdate(id));
  ipcMain.handle("packs:import", async () => {
    const chosen = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Prompt Atelier DLC", extensions: ["atelier-dlc", "json"] },
      ],
    });
    if (chosen.canceled) return null;
    const pack = decodeAtelierFile(
      fs.readFileSync(chosen.filePaths[0], "utf8"),
      DLC_MAGIC,
    );
    const existing = database
      .listPacks()
      .find((item) => item.id === pack?.manifest?.id);
    if (existing) {
      const response = await dialog.showMessageBox({
        type: "question",
        buttons: ["Update installed DLC", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        message: `Update “${existing.name}”?`,
        detail:
          "Tags and rules supplied by this DLC will be replaced. Saved characters keep their tag references and may show missing tags if the updated DLC removes them.",
      });
      if (response.response !== 0) return null;
    }
    return database.installPack(pack, { replace: !!existing });
  });
  ipcMain.handle("packs:export", async (_, id) => {
    const chosen = await dialog.showSaveDialog({
      defaultPath: `${id}.atelier-dlc`,
      filters: [{ name: "Prompt Atelier DLC", extensions: ["atelier-dlc"] }],
    });
    if (chosen.canceled) return false;
    fs.writeFileSync(
      chosen.filePath,
      encodeAtelierFile(DLC_MAGIC, database.exportPack(id)),
    );
    return true;
  });
  ipcMain.handle("sources:search", (_, query) =>
    sources.searchCanonical(query),
  );
  ipcMain.handle("studio:sources:search", (_, source, kind, query) =>
    sources.studioSearch(source, kind, query),
  );
  ipcMain.handle("studio:sources:open-group", (_, source, title) =>
    sources.openGroup(source, title),
  );
  ipcMain.handle("sources:merge", async (_, query) => {
    const result = await sources.searchCanonical(query);
    return {
      ...database.mergeCanonical(result.tags),
      warnings: result.errors,
      tags: result.tags,
    };
  });
  ipcMain.handle("sources:import-dump", async (_, source = "auto") => {
    const chosen = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Tag dump", extensions: ["csv", "json"] }],
    });
    if (chosen.canceled) return null;
    const parsed = sources.mergeDump(
      chosen.filePaths[0],
      fs.readFileSync(chosen.filePaths[0], "utf8"),
      source,
    );
    return {
      ...database.mergeCanonical(parsed.tags),
      tags: parsed.tags,
      source: parsed.source,
      warnings: [],
    };
  });
  ipcMain.handle("sources:catalog", (_, source, offset) =>
    database.sourceCatalog(source, offset),
  );
  ipcMain.handle("sources:sync-all", async (event, source) => {
    if (source === "danbooru")
      return runDanbooruCore((data) =>
        event.sender.send("sources:sync-progress", data),
      );
    const checkpoint = database.syncCheckpoint(`${source}:tags`);
    const synced = await sources.syncAll(
      source,
      async (tags, next) => {
        const result = database.mergeCanonical(tags);
        database.syncCheckpoint(`${source}:tags`, next);
        event.sender.send("sources:sync-progress", {
          source,
          added: result.added,
          processed: tags.length,
          phase: "tags",
        });
      },
      checkpoint || 0,
    );
    return { ...synced, ...database.reclassifyImported() };
  });
  ipcMain.handle("tags:create-custom", (_, tag) =>
    database.createCustomTag(tag),
  );
  ipcMain.handle("relationships:list", () => database.listRelationships());
  ipcMain.handle("relationships:create", (_, rule) =>
    database.createRelationship(rule),
  );
  ipcMain.handle("relationships:delete", (_, id) =>
    database.deleteRelationship(id),
  );
  if (BUILD_EDITION === "owner") {
    ipcMain.handle("github:release-status", () => githubReleaseStatus());
    ipcMain.handle("github:publish-core-dlc", () => publishCoreDlc());
    ipcMain.handle("owner:validate-dlc-draft", (_, draft) => validateDlcDraft(draft));
    ipcMain.handle("owner:publish-dlc-draft", (_, draft) => publishDlcDraft(draft));
    ipcMain.handle("owner:install-dlc-draft", (_, draft) => {
      const preflight = validateDlcDraft(draft);
      if (!preflight.valid) throw new Error(preflight.issues[0]);
      const existing = database.listPacks().some((pack) => pack.id === draft.manifest.id);
      return database.installPack(draft, { replace: existing });
    });
  }
  if (process.env.PROMPT_ATELIER_SYNC_DANBOORU === "1") {
    runDanbooruCore((data) => process.stdout.write(`${JSON.stringify(data)}\n`))
      .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      })
      .finally(() => app.quit());
  } else if (process.argv.includes("--pack-studio")) void openPackStudioWindow();
  else void createWindow();
  app.on("activate", () => {
    if (
      !BrowserWindow.getAllWindows().length &&
      process.env.PROMPT_ATELIER_SYNC_DANBOORU !== "1"
    )
      void createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
