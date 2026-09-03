const Database = require("better-sqlite3");
const path = require("node:path");
const { app } = require("electron");
const { classifyTag } = require("./sources.cjs");
let db;
function open() {
  if (db) return db;
  db = new Database(path.join(app.getPath("userData"), "prompt-atelier.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, author TEXT, description TEXT, enabled INTEGER NOT NULL DEFAULT 1, manifest TEXT NOT NULL, installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, scope TEXT NOT NULL DEFAULT 'appearance', sort_order INTEGER NOT NULL DEFAULT 0, pack_id TEXT REFERENCES packs(id));
    CREATE TABLE IF NOT EXISTS subcategories (id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), name TEXT NOT NULL, icon TEXT, sort_order INTEGER NOT NULL DEFAULT 0, pack_id TEXT REFERENCES packs(id), UNIQUE(category_id,name));
    CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, display_name TEXT, description TEXT, preview TEXT, sprite TEXT, category TEXT NOT NULL, subcategory TEXT NOT NULL, pack_id TEXT REFERENCES packs(id), is_nsfw INTEGER NOT NULL DEFAULT 0, aliases TEXT NOT NULL DEFAULT '[]', source_metadata TEXT NOT NULL DEFAULT '{}', weight_default REAL NOT NULL DEFAULT 1, weight_min REAL NOT NULL DEFAULT .5, weight_max REAL NOT NULL DEFAULT 2, slider_enabled INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS tags_name_idx ON tags(name); CREATE INDEX IF NOT EXISTS tags_category_idx ON tags(category, subcategory);
    CREATE TABLE IF NOT EXISTS tag_category_map (tag_id TEXT REFERENCES tags(id), category TEXT NOT NULL, subcategory TEXT NOT NULL, PRIMARY KEY(tag_id, category, subcategory));
    CREATE TABLE IF NOT EXISTS tag_relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, source_tag_id TEXT REFERENCES tags(id), target_tag_id TEXT REFERENCES tags(id), relation_type TEXT NOT NULL CHECK(relation_type IN ('implies','conflicts','suggests','requires')), strength REAL NOT NULL DEFAULT 1, pack_id TEXT REFERENCES packs(id));
    CREATE INDEX IF NOT EXISTS relationships_source_idx ON tag_relationships(source_tag_id); CREATE UNIQUE INDEX IF NOT EXISTS relationships_unique_idx ON tag_relationships(source_tag_id,target_tag_id,relation_type,pack_id);
    CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, thumbnail TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS selected_tags (character_id TEXT REFERENCES characters(id) ON DELETE CASCADE, tag_id TEXT NOT NULL, weight REAL NOT NULL, tag_order INTEGER NOT NULL, source TEXT NOT NULL, PRIMARY KEY(character_id, tag_id));
    CREATE INDEX IF NOT EXISTS selected_tags_order_idx ON selected_tags(character_id, tag_order);
    CREATE TABLE IF NOT EXISTS user_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS source_wikis (source TEXT NOT NULL, source_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT, PRIMARY KEY(source, source_id));
    CREATE INDEX IF NOT EXISTS source_wikis_title_idx ON source_wikis(source,title);
  `);
  try {
    db.exec(
      "ALTER TABLE tags ADD COLUMN source_metadata TEXT NOT NULL DEFAULT '{}'",
    );
  } catch {
    /* already migrated */
  }
  try {
    db.exec(
      "ALTER TABLE categories ADD COLUMN scope TEXT NOT NULL DEFAULT 'appearance'",
    );
  } catch {
    /* already migrated */
  }
  try {
    db.exec("ALTER TABLE tags ADD COLUMN preview TEXT");
  } catch {
    /* already migrated */
  }
  try {
    db.exec("ALTER TABLE tags ADD COLUMN sprite TEXT");
  } catch {
    /* already migrated */
  }
  const invalid = db
    .prepare("SELECT id,name FROM tags")
    .all()
    .filter((row) => !/^[a-z0-9][a-z0-9_()\'!+-]*$/.test(row.name));
  if (invalid.length) {
    const remove = db.transaction(() => {
      const ids = invalid.map((row) => row.id);
      const marks = ids.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM tag_relationships WHERE source_tag_id IN (${marks}) OR target_tag_id IN (${marks})`,
      ).run(...ids, ...ids);
      db.prepare(`DELETE FROM tag_category_map WHERE tag_id IN (${marks})`).run(
        ...ids,
      );
      db.prepare(`DELETE FROM tags WHERE id IN (${marks})`).run(...ids);
    });
    remove();
  }
  ensureStarterTaxonomy();
  return db;
}
function bootstrap(pack, tags, relationships) {
  const database = open();
  const existed = !!database
    .prepare("SELECT 1 FROM packs WHERE id = ?")
    .get(pack.id);
  const seed = database.transaction(() => {
    database
      .prepare(
        "INSERT INTO packs(id,name,version,author,description,manifest) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,author=excluded.author,description=excluded.description,manifest=excluded.manifest",
      )
      .run(
        pack.id,
        pack.name,
        pack.version,
        pack.author,
        pack.description,
        JSON.stringify(pack),
      );
    const put = database.prepare(
      "INSERT INTO tags(id,name,display_name,category,subcategory,pack_id,is_nsfw,aliases,weight_default,weight_min,weight_max,slider_enabled,enabled) VALUES(@id,@name,@displayName,@category,@subcategory,?,@nsfw,@aliases,@defaultWeight,@min,@max,@slider,@enabled) ON CONFLICT(id) DO UPDATE SET name=excluded.name,display_name=excluded.display_name,category=excluded.category,subcategory=excluded.subcategory,is_nsfw=excluded.is_nsfw,aliases=excluded.aliases,weight_default=excluded.weight_default,weight_min=excluded.weight_min,weight_max=excluded.weight_max,slider_enabled=excluded.slider_enabled",
    );
    for (const tag of tags)
      put.run(
        {
          ...tag,
          displayName: tag.displayName || null,
          nsfw: +!!tag.nsfw,
          aliases: JSON.stringify(tag.aliases || []),
          defaultWeight: tag.defaultWeight || 1,
          min: tag.min || 0.5,
          max: tag.max || 2,
          slider: +!!tag.slider,
          enabled: +(tag.enabled !== false),
        },
        pack.id,
      );
    const rel = database.prepare(
      "INSERT OR IGNORE INTO tag_relationships(source_tag_id,target_tag_id,relation_type,strength,pack_id) VALUES(?,?,?,?,?)",
    );
    for (const r of relationships)
      rel.run(r.source, r.target, r.type, r.strength || 1, pack.id);
  });
  seed();
  return { seeded: !existed };
}
function saveCharacter(snapshot) {
  const database = open();
  const id = snapshot.id || `character-${crypto.randomUUID()}`;
  database.transaction(() => {
    database
      .prepare(
        "INSERT INTO characters(id,name,thumbnail,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, thumbnail=excluded.thumbnail, data=excluded.data, updated_at=CURRENT_TIMESTAMP",
      )
      .run(
        id,
        snapshot.name,
        snapshot.thumbnail || null,
        JSON.stringify(snapshot),
      );
    database.prepare("DELETE FROM selected_tags WHERE character_id=?").run(id);
    const put = database.prepare(
      "INSERT INTO selected_tags(character_id,tag_id,weight,tag_order,source) VALUES(?,?,?,?,?)",
    );
    for (const tag of snapshot.selected)
      put.run(id, tag.id, tag.weight, tag.order, tag.source);
  })();
  return id;
}
function listCharacters() {
  return open()
    .prepare(
      "SELECT id,name,thumbnail,updated_at AS updatedAt,data FROM characters ORDER BY updated_at DESC",
    )
    .all()
    .map((row) => ({ ...row, ...JSON.parse(row.data) }));
}
function loadCharacter(id) {
  const row = open().prepare("SELECT data FROM characters WHERE id=?").get(id);
  return row ? JSON.parse(row.data) : null;
}
function deleteCharacter(id) {
  if (!id) throw new Error("A character id is required.");
  return open().prepare("DELETE FROM characters WHERE id=?").run(id).changes > 0;
}
function setting(key, value) {
  const database = open();
  if (value === undefined) {
    const row = database
      .prepare("SELECT value FROM user_settings WHERE key=?")
      .get(key);
    return row ? JSON.parse(row.value) : null;
  }
  database
    .prepare(
      "INSERT INTO user_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, JSON.stringify(value));
  return value;
}
const taxonomyId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
function ensureTaxonomy(
  category,
  subcategory,
  packId = "user",
  scope = "appearance",
) {
  const database = open();
  const categoryName = String(category || "").trim(),
    subcategoryName = String(subcategory || "").trim();
  if (!categoryName || !subcategoryName)
    throw new Error("A category and subcategory are required.");
  const categoryId = `${packId}:${taxonomyId(categoryName)}`;
  database
    .prepare(
      "INSERT OR IGNORE INTO categories(id,name,scope,sort_order,pack_id) VALUES(?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM categories),?)",
    )
    .run(
      categoryId,
      categoryName,
      ["character", "wardrobe", "scene"].includes(scope) ? scope : "character",
      packId,
    );
  const subcategoryId = `${categoryId}:${taxonomyId(subcategoryName)}`;
  database
    .prepare(
      "INSERT OR IGNORE INTO subcategories(id,category_id,name,sort_order,pack_id) VALUES(?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM subcategories WHERE category_id=?),?)",
    )
    .run(subcategoryId, categoryId, subcategoryName, categoryId, packId);
  return { category: categoryName, subcategory: subcategoryName };
}
const STARTER_TAXONOMY = [
  ["Character", "◇", "character", ["Identity", "Origin"]],
  ["Body", "◌", "character", ["Silhouette", "Hair", "Eyes", "Skin", "Face details", "Features"]],
  ["Wardrobe", "◈", "wardrobe", ["Outfit", "Tops", "Bottoms", "Outerwear", "Legwear", "Footwear", "Headwear", "Accessories", "Materials", "Patterns"]],
  ["Expression", "◉", "character", ["Emotion", "Eyes", "Mouth"]],
  ["Pose", "⌁", "character", ["Stance", "Hands", "Camera"]],
  ["Scene", "☾", "scene", ["Location", "Environment", "Lighting", "Time", "Objects", "Atmosphere"]],
];
function ensureStarterTaxonomy({ force = false } = {}) {
  const database = db || open();
  const seeded = database
    .prepare("SELECT 1 FROM user_settings WHERE key='starter-taxonomy-v1'")
    .get();
  if (seeded && !force) return false;
  database.transaction(() => {
    database
      .prepare(
        "INSERT OR IGNORE INTO packs(id,name,version,author,description,manifest) VALUES('user','User Pack','1.0.0','Local user','Personal tags and taxonomy additions','{}')",
      )
      .run();
    database.prepare("UPDATE packs SET enabled=1 WHERE id='user'").run();
    for (const [category, icon, scope, subcategories] of STARTER_TAXONOMY) {
      ensureTaxonomy(category, subcategories[0], "user", scope);
      const categoryId = `user:${taxonomyId(category)}`;
      database
        .prepare("UPDATE categories SET icon=COALESCE(icon,?) WHERE id=?")
        .run(icon, categoryId);
      for (const subcategory of subcategories) ensureTaxonomy(category, subcategory, "user", scope);
    }
    database
      .prepare("INSERT INTO user_settings(key,value) VALUES('starter-taxonomy-v1','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run();
  })();
  return true;
}
function listTaxonomy() {
  const database = open();
  return database
    .prepare(
      "SELECT c.id,c.name,c.icon,c.scope,c.sort_order AS sortOrder,COALESCE(json_group_array(json_object('id',s.id,'name',s.name,'icon',s.icon,'sortOrder',s.sort_order)) FILTER (WHERE s.id IS NOT NULL),'[]') AS subcategories FROM categories c LEFT JOIN subcategories s ON s.category_id=c.id LEFT JOIN packs p ON p.id=c.pack_id WHERE c.pack_id='user' OR p.enabled=1 GROUP BY c.id ORDER BY c.sort_order,c.name",
    )
    .all()
    .map((row) => ({ ...row, subcategories: JSON.parse(row.subcategories) }));
}
function createTaxonomy(input) {
  const category = String(input?.category || "").trim(),
    subcategory = String(input?.subcategory || "").trim(),
    scope = ["character", "wardrobe", "scene"].includes(input?.scope) ? input.scope : "character";
  const openDb = open();
  openDb
    .prepare(
      "INSERT OR IGNORE INTO packs(id,name,version,author,description,manifest) VALUES('user','User Pack','1.0.0','Local user','Personal tags and taxonomy additions','{}')",
    )
    .run();
  return { ...ensureTaxonomy(category, subcategory, "user", scope), scope };
}
function renameTaxonomy(input) {
  const database = open(),
    next = String(input?.name || "").trim(),
    type = input?.type;
  if (!next) throw new Error("A taxonomy name is required.");
  const row = database
    .prepare(
      type === "category"
        ? "SELECT id,name,pack_id FROM categories WHERE id=?"
        : "SELECT s.id,s.name,c.name AS category_name,s.pack_id FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.id=?",
    )
    .get(input?.id);
  if (!row) throw new Error("Taxonomy entry was not found.");
  if (row.pack_id !== "user")
    throw new Error(
      "Installed DLC taxonomy is read-only; edit and re-import that DLC.",
    );
  database.transaction(() => {
    if (type === "category") {
      database
        .prepare("UPDATE categories SET name=? WHERE id=?")
        .run(next, row.id);
      database
        .prepare(
          "UPDATE tags SET category=? WHERE category=? AND pack_id='user'",
        )
        .run(next, row.name);
    } else {
      database
        .prepare("UPDATE subcategories SET name=? WHERE id=?")
        .run(next, row.id);
      database
        .prepare(
          "UPDATE tags SET subcategory=? WHERE category=? AND subcategory=? AND pack_id='user'",
        )
        .run(next, row.category_name, row.name);
    }
  })();
  return true;
}
function setTaxonomyIcon(input) {
  const database = open();
  const type = input?.type;
  const icon = String(input?.icon || "").trim().slice(0, 32) || null;
  if (type !== "category" && type !== "subcategory")
    throw new Error("Choose a category or subcategory.");
  const table = type === "category" ? "categories" : "subcategories";
  const row = database
    .prepare(`SELECT id,pack_id FROM ${table} WHERE id=?`)
    .get(input?.id);
  if (!row) throw new Error("Taxonomy entry was not found.");
  if (row.pack_id !== "user")
    throw new Error("Installed DLC taxonomy is read-only; edit and re-import that DLC.");
  database.prepare(`UPDATE ${table} SET icon=? WHERE id=?`).run(icon, row.id);
  return true;
}
function deleteTaxonomy(input) {
  const database = open(),
    type = input?.type,
    row = database
      .prepare(
        type === "category"
          ? "SELECT id,name,scope,pack_id FROM categories WHERE id=?"
          : "SELECT s.id,s.name,c.name AS category_name,c.scope AS category_scope,s.pack_id FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.id=?",
      )
      .get(input?.id);
  if (!row) throw new Error("Taxonomy entry was not found.");
  if (row.pack_id !== "user")
    throw new Error(
      "Installed DLC taxonomy is read-only; edit and re-import that DLC.",
    );
  // Taxonomy is user-owned, so a category must be removable even when it has
  // tags.  Preserve the tags (including imported tags) in an editable inbox
  // instead of making the user hunt down every assignment first.
  return database.transaction(() => {
    let movedTags = 0;
    if (type === "category") {
      const fallback = ensureTaxonomy("Unsorted", "Inbox", "user", row.scope);
      movedTags = database
        .prepare("SELECT COUNT(*) AS total FROM tags WHERE category=?")
        .get(row.name).total;
      database
        .prepare("UPDATE tags SET category=?,subcategory=? WHERE category=?")
        .run(fallback.category, fallback.subcategory, row.name);
      database
        .prepare("UPDATE tag_category_map SET category=?,subcategory=? WHERE category=?")
        .run(fallback.category, fallback.subcategory, row.name);
      database.prepare("DELETE FROM subcategories WHERE category_id=?").run(row.id);
      database.prepare("DELETE FROM categories WHERE id=?").run(row.id);
    } else {
      const fallback = ensureTaxonomy(
        row.category_name,
        "Inbox",
        "user",
        row.category_scope,
      );
      movedTags = database
        .prepare("SELECT COUNT(*) AS total FROM tags WHERE category=? AND subcategory=?")
        .get(row.category_name, row.name).total;
      database
        .prepare("UPDATE tags SET subcategory=? WHERE category=? AND subcategory=?")
        .run(fallback.subcategory, row.category_name, row.name);
      database
        .prepare("UPDATE tag_category_map SET subcategory=? WHERE category=? AND subcategory=?")
        .run(fallback.subcategory, row.category_name, row.name);
      database.prepare("DELETE FROM subcategories WHERE id=?").run(row.id);
    }
    return { movedTags };
  })();
}
function validatePack(pack) {
  if (
    !pack ||
    typeof pack !== "object" ||
    !pack.manifest ||
    !Array.isArray(pack.tags) ||
    !Array.isArray(pack.relationships)
  )
    throw new Error(
      "Pack must contain manifest, tags, and relationships arrays.",
    );
  const { manifest } = pack;
  for (const key of ["id", "name", "version"])
    if (!manifest[key] || typeof manifest[key] !== "string")
      throw new Error(`Manifest requires ${key}.`);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(manifest.id))
    throw new Error("Pack id may contain only letters, digits, _ and -.");
  const seen = new Set();
  const names = new Set();
  for (const tag of pack.tags) {
    if (!tag.id || !tag.name || !tag.category || !tag.subcategory)
      throw new Error("Each tag requires id, name, category, and subcategory.");
    if (seen.has(tag.id)) throw new Error(`Duplicate tag id: ${tag.id}`);
    if (names.has(tag.name)) throw new Error(`Duplicate canonical tag: ${tag.name}`);
    if (!/^[^\s]+$/.test(tag.name))
      throw new Error(`Tag name must not contain spaces: ${tag.name}`);
    if (
      tag.slider &&
      (!Number.isFinite(tag.min) ||
        !Number.isFinite(tag.max) ||
        !Number.isFinite(tag.defaultWeight) ||
        tag.min >= tag.max ||
        tag.defaultWeight < tag.min ||
        tag.defaultWeight > tag.max)
    )
      throw new Error(`Invalid weight range for ${tag.name}.`);
    if (tag.sprites && !Array.isArray(tag.sprites))
      throw new Error(`Sprite layers for ${tag.name} must be an array.`);
    for (const sprite of tag.sprites || (tag.sprite ? [tag.sprite] : [])) {
      const slots = new Set(["base", "skin", "face", "hair-back", "hair-front", "top", "bottom", "dress", "outerwear", "legs", "shoes", "headwear", "accessory", "effect"]);
      const anchors = new Set(["canvas", "head", "torso", "waist", "feet", "left-hand", "right-hand"]);
      const blends = new Set(["normal", "multiply", "screen", "overlay"]);
      if (typeof sprite.image !== "string" || !sprite.image.startsWith("data:image/") || !slots.has(sprite.slot) || !anchors.has(sprite.anchor) || !blends.has(sprite.blend))
        throw new Error(`Invalid sprite layer for ${tag.name}.`);
      for (const key of ["layer", "x", "y", "scale", "opacity"])
        if (!Number.isFinite(sprite[key])) throw new Error(`Invalid sprite ${key} for ${tag.name}.`);
      if (sprite.scale <= 0 || sprite.opacity < 0 || sprite.opacity > 1)
        throw new Error(`Invalid sprite transform for ${tag.name}.`);
    }
    seen.add(tag.id);
    names.add(tag.name);
  }
  const dependencies = Array.isArray(manifest.dependencies)
    ? manifest.dependencies
    : [];
  const conflicts = Array.isArray(manifest.conflicts) ? manifest.conflicts : [];
  if (dependencies.includes(manifest.id) || conflicts.includes(manifest.id))
    throw new Error("A pack cannot reference itself as a dependency or conflict.");
  if (dependencies.some((id) => conflicts.includes(id)))
    throw new Error("A pack cannot require and conflict with the same DLC.");
  for (const rel of pack.relationships)
    if (
      !["implies", "conflicts", "suggests", "requires"].includes(rel.type) ||
      !rel.source ||
      !rel.target
    )
      throw new Error("Invalid relationship.");
  return pack;
}
function installPack(raw, { replace = false } = {}) {
  const pack = validatePack(raw);
  const database = open();
  const existing = database
    .prepare("SELECT id FROM packs WHERE id=?")
    .get(pack.manifest.id);
  if (existing && !replace)
    throw new Error(`Pack “${pack.manifest.id}” is already installed.`);
  let tags = [];
  database.transaction(() => {
    if (existing) {
      const oldTagIds = database
        .prepare("SELECT id FROM tags WHERE pack_id=?")
        .all(pack.manifest.id)
        .map((row) => row.id);
      if (oldTagIds.length) {
        const marks = oldTagIds.map(() => "?").join(",");
        database
          .prepare(
            `DELETE FROM tag_relationships WHERE pack_id=? OR source_tag_id IN (${marks}) OR target_tag_id IN (${marks})`,
          )
          .run(pack.manifest.id, ...oldTagIds, ...oldTagIds);
        database
          .prepare(`DELETE FROM tag_category_map WHERE tag_id IN (${marks})`)
          .run(...oldTagIds);
        database
          .prepare("DELETE FROM tags WHERE pack_id=?")
          .run(pack.manifest.id);
      }
      database
        .prepare("DELETE FROM subcategories WHERE pack_id=?")
        .run(pack.manifest.id);
      database
        .prepare("DELETE FROM categories WHERE pack_id=?")
        .run(pack.manifest.id);
      database.prepare("DELETE FROM packs WHERE id=?").run(pack.manifest.id);
    }
    const existingNames = new Set(
      database
        .prepare("SELECT name FROM tags")
        .all()
        .map((x) => x.name),
    );
    tags = pack.tags.filter((tag) => !existingNames.has(tag.name));
    database
      .prepare(
        "INSERT INTO packs(id,name,version,author,description,manifest) VALUES(?,?,?,?,?,?)",
      )
      .run(
        pack.manifest.id,
        pack.manifest.name,
        pack.manifest.version,
        pack.manifest.author || "Unknown",
        pack.manifest.description || "",
        JSON.stringify(pack.manifest),
      );
    const put = database.prepare(
      "INSERT INTO tags(id,name,display_name,description,preview,sprite,category,subcategory,pack_id,is_nsfw,aliases,weight_default,weight_min,weight_max,slider_enabled,enabled) VALUES(@id,@name,@displayName,@description,@preview,@sprite,@category,@subcategory,?,@nsfw,@aliases,@defaultWeight,@min,@max,@slider,@enabled)",
    );
    const scopes = new Map(
      (pack.manifest.taxonomy || []).map((entry) => [entry.name, entry.scope]),
    );
    for (const tag of tags)
      ensureTaxonomy(
        tag.category,
        tag.subcategory,
        pack.manifest.id,
        scopes.get(tag.category),
      );
    for (const tag of tags)
      put.run(
        {
          ...tag,
          displayName: tag.displayName || null,
          description: tag.description || null,
          preview: tag.preview || null,
          sprite: tag.sprites?.length ? JSON.stringify(tag.sprites) : tag.sprite ? JSON.stringify(tag.sprite) : null,
          nsfw: +!!tag.nsfw,
          aliases: JSON.stringify(tag.aliases || []),
          defaultWeight: tag.defaultWeight ?? 1,
          min: tag.min ?? 0.5,
          max: tag.max ?? 2,
          slider: +!!tag.slider,
          enabled: +(tag.enabled !== false),
        },
        pack.manifest.id,
      );
    const byPackId = new Map(pack.tags.map((tag) => [tag.id, tag.name]));
    const byName = new Map(
      database
        .prepare("SELECT id,name FROM tags")
        .all()
        .map((tag) => [tag.name, tag.id]),
    );
    const rel = database.prepare(
      "INSERT OR IGNORE INTO tag_relationships(source_tag_id,target_tag_id,relation_type,strength,pack_id) VALUES(?,?,?,?,?)",
    );
    for (const r of pack.relationships) {
      const source = byName.get(byPackId.get(r.source) || r.source) || r.source,
        target = byName.get(byPackId.get(r.target) || r.target) || r.target;
      if (
        database.prepare("SELECT 1 FROM tags WHERE id=?").get(source) &&
        database.prepare("SELECT 1 FROM tags WHERE id=?").get(target)
      )
        rel.run(source, target, r.type, r.strength || 1, pack.manifest.id);
    }
  })();
  return {
    id: pack.manifest.id,
    added: tags.length,
    skipped: pack.tags.length - tags.length,
  };
}
function listPacks() {
  const database = open();
  const countTags = database.prepare(
    "SELECT COUNT(*) AS count FROM tags WHERE pack_id=?",
  );
  return database
    .prepare(
      "SELECT id,name,version,author,description,enabled,manifest FROM packs ORDER BY installed_at",
    )
    .all()
    .map((x) => {
      let manifest = {};
      try {
        manifest = JSON.parse(x.manifest || "{}");
      } catch {
        manifest = {};
      }
      const actualTagCount = countTags.get(x.id).count;
      return {
        ...manifest,
        ...x,
        enabled: !!x.enabled,
        tagCount: Number.isFinite(manifest.tagCount)
          ? manifest.tagCount
          : actualTagCount,
        relationshipCount: Number.isFinite(manifest.relationshipCount)
          ? manifest.relationshipCount
          : 0,
        dependencies: Array.isArray(manifest.dependencies)
          ? manifest.dependencies
          : [],
        conflicts: Array.isArray(manifest.conflicts) ? manifest.conflicts : [],
        manifest,
      };
    });
}
function listTags() {
  return open()
    .prepare(
      "SELECT tags.id,tags.name,tags.display_name AS displayName,tags.description,tags.preview,tags.sprite,tags.category,tags.subcategory,tags.is_nsfw AS nsfw,tags.aliases,tags.weight_default AS defaultWeight,tags.weight_min AS min,tags.weight_max AS max,tags.slider_enabled AS slider,tags.enabled FROM tags JOIN packs ON packs.id=tags.pack_id WHERE tags.enabled=1 AND packs.enabled=1 ORDER BY tags.category,tags.subcategory,tags.name",
    )
    .all()
    .map((tag) => ({
      ...tag,
      nsfw: !!tag.nsfw,
      slider: !!tag.slider,
      enabled: !!tag.enabled,
      aliases: JSON.parse(tag.aliases || "[]"),
      ...(() => {
        const sprite = tag.sprite ? JSON.parse(tag.sprite) : undefined;
        return { sprite: Array.isArray(sprite) ? sprite[0] : sprite, sprites: Array.isArray(sprite) ? sprite : undefined };
      })(),
    }));
}
function togglePack(id, enabled) {
  if (id === "core" || id === "user")
    throw new Error("The User Pack is always enabled.");
  const database = open();
  if (enabled) {
    const pack = database
      .prepare("SELECT manifest FROM packs WHERE id=?")
      .get(id);
    if (!pack) throw new Error("Unknown pack.");
    const deps = JSON.parse(pack.manifest).dependencies || [];
    const inactive = deps.find(
      (dep) =>
        !database
          .prepare("SELECT 1 FROM packs WHERE id=? AND enabled=1")
          .get(dep),
    );
    if (inactive) throw new Error(`Requires enabled pack: ${inactive}`);
    const conflicts = JSON.parse(pack.manifest).conflicts || [];
    const activeConflict = conflicts.find((conflict) =>
      database.prepare("SELECT 1 FROM packs WHERE id=? AND enabled=1").get(conflict),
    );
    if (activeConflict) throw new Error(`Conflicts with enabled pack: ${activeConflict}`);
  }
  database.prepare("UPDATE packs SET enabled=? WHERE id=?").run(+enabled, id);
  return true;
}
function removePackRows(database, id) {
  const oldTagIds = database
    .prepare("SELECT id FROM tags WHERE pack_id=?")
    .all(id)
    .map((row) => row.id);
  if (oldTagIds.length) {
    const marks = oldTagIds.map(() => "?").join(",");
    database
      .prepare(
        `DELETE FROM tag_relationships WHERE pack_id=? OR source_tag_id IN (${marks}) OR target_tag_id IN (${marks})`,
      )
      .run(id, ...oldTagIds, ...oldTagIds);
    database
      .prepare(`DELETE FROM tag_category_map WHERE tag_id IN (${marks})`)
      .run(...oldTagIds);
    database.prepare("DELETE FROM tags WHERE pack_id=?").run(id);
  } else {
    database.prepare("DELETE FROM tag_relationships WHERE pack_id=?").run(id);
  }
  database.prepare("DELETE FROM subcategories WHERE pack_id=?").run(id);
  database.prepare("DELETE FROM categories WHERE pack_id=?").run(id);
  database.prepare("DELETE FROM packs WHERE id=?").run(id);
  return oldTagIds.length;
}
function uninstallPack(id) {
  if (!id || id === "user") throw new Error("The User Pack cannot be removed.");
  const database = open();
  const pack = database.prepare("SELECT id,name FROM packs WHERE id=?").get(id);
  if (!pack) throw new Error("Pack was not found.");
  const dependents = listPacks().filter(
    (item) => item.id !== id && item.dependencies.includes(id),
  );
  if (dependents.length)
    throw new Error(`Required by installed pack: ${dependents[0].name}`);
  const removedTags = database.transaction(() => removePackRows(database, id))();
  return { id, name: pack.name, removedTags };
}
function clearDlcPacks() {
  const database = open();
  const packs = database
    .prepare("SELECT id,name FROM packs WHERE id != 'user'")
    .all();
  const result = database.transaction(() => {
    let removedTags = 0;
    for (const pack of packs) removedTags += removePackRows(database, pack.id);
    database.prepare("UPDATE packs SET enabled=1 WHERE id='user'").run();
    return { removedPacks: packs.length, removedTags };
  })();
  return result;
}
function exportPack(id) {
  const database = open();
  const row = database.prepare("SELECT manifest FROM packs WHERE id=?").get(id);
  if (!row) throw new Error("Unknown pack.");
  return {
    format: "prompt-atelier.dlc",
    formatVersion: 1,
    manifest: JSON.parse(row.manifest),
    tags: database
      .prepare(
        "SELECT id,name,display_name AS displayName,description,preview,sprite,category,subcategory,is_nsfw AS nsfw,aliases,weight_default AS defaultWeight,weight_min AS min,weight_max AS max,slider_enabled AS slider,enabled FROM tags WHERE pack_id=?",
      )
      .all(id)
      .map((t) => ({
        ...t,
        nsfw: !!t.nsfw,
        slider: !!t.slider,
        enabled: !!t.enabled,
        aliases: JSON.parse(t.aliases),
        ...(() => {
          const sprite = t.sprite ? JSON.parse(t.sprite) : undefined;
          return { sprite: Array.isArray(sprite) ? sprite[0] : sprite, sprites: Array.isArray(sprite) ? sprite : undefined };
        })(),
      })),
    relationships: database
      .prepare(
        "SELECT source_tag_id AS source,target_tag_id AS target,relation_type AS type,strength FROM tag_relationships WHERE pack_id=?",
      )
      .all(id),
  };
}
function generateContextRules(database, candidates) {
  const byName = new Map(
    database
      .prepare("SELECT id,name,category,subcategory FROM tags")
      .all()
      .map((x) => [x.name, x]),
  );
  const add = database.prepare(
    "INSERT OR IGNORE INTO tag_relationships(source_tag_id,target_tag_id,relation_type,strength,pack_id) VALUES(?,?,?,?, 'canonical-merge')",
  );
  const put = (from, to, type = "suggests", strength = 0.55) => {
    const source = byName.get(from),
      target = byName.get(to);
    if (source && target && source.id !== target.id)
      add.run(source.id, target.id, type, strength);
  };
  for (const item of candidates) {
    const name = item.name;
    const row = byName.get(name);
    if (!row) continue;
    for (const metadata of Object.values(item.sourceMetadata || {})) {
      for (const related of metadata.related || [])
        put(name, related, "suggests", 0.42);
    } // Source-provided related tags are preferred contextual links.
    const anchors =
      {
        Body: ["portrait"],
        Clothing: ["full_body"],
        Expression: ["looking_at_viewer"],
        Action: ["full_body"],
        Background: ["scenery"],
        Character: ["solo"],
      }[row.category] || [];
    for (const target of anchors) put(name, target, "suggests", 0.25);
    const color = name.match(
      /^(blue|red|pink|black|white|blonde|green|brown|purple|silver)_(hair|eyes)$/,
    );
    if (color)
      put(
        name,
        `${color[1]}_${color[2] === "hair" ? "eyes" : "hair"}`,
        "suggests",
        0.48,
      );
    if (/_uniform$/.test(name)) {
      put(name, "classroom", "suggests", 0.72);
      put(name, "student", "suggests", 0.68);
    }
    if (/kimono|yukata/.test(name)) {
      put(name, "temple", "suggests", 0.55);
      put(name, "cherry_blossoms", "suggests", 0.5);
    }
    if (/armor|knight/.test(name)) {
      put(name, "castle", "suggests", 0.6);
      put(name, "holding_weapon", "suggests", 0.57);
    }
    if (/mage|witch|magic/.test(name)) {
      put(name, "magic_circle", "suggests", 0.58);
      put(name, "using_magic", "suggests", 0.62);
    }
    if (/rain/.test(name)) {
      put(name, "umbrella", "suggests", 0.58);
      put(name, "wet_clothes", "suggests", 0.31);
    }
    if (/night/.test(name)) {
      put(name, "stars", "suggests", 0.6);
      put(name, "moonlight", "suggests", 0.63);
    }
    if (/beach/.test(name)) {
      put(name, "outdoors", "suggests", 0.7);
      put(name, "day", "suggests", 0.45);
    }
    if (/forest/.test(name)) put(name, "outdoors", "suggests", 0.7);
    if (/twintails|ponytail/.test(name))
      put(name, "hair_ribbon", "suggests", 0.5);
    // Imported-name heuristics deliberately create suggestions only. Hard rules require curation or a user rule.
  }
}
function mergeCanonical(tags) {
  const database = open();
  database
    .prepare(
      "INSERT OR IGNORE INTO packs(id,name,version,author,description,manifest) VALUES('canonical-merge','Canonical Merge','1.0.0','Prompt Atelier','Merged tag results from supported booru sources and generated contextual rules','{}')",
    )
    .run();
  const insert = database.prepare(
    "INSERT OR IGNORE INTO tags(id,name,category,subcategory,pack_id,source_metadata) VALUES(@id,@name,@category,@subcategory,'canonical-merge',@metadata)",
  );
  const update = database.prepare(
    "UPDATE tags SET source_metadata=? WHERE name=?",
  );
  let added = 0;
  const transaction = database.transaction(() => {
    for (const tag of tags) {
      const metadata = JSON.stringify(tag.sourceMetadata);
      const result = insert.run({ ...tag, metadata });
      if (result.changes) added++;
      else {
        const previous = database
          .prepare("SELECT source_metadata FROM tags WHERE name=?")
          .get(tag.name);
        const combined = {
          ...JSON.parse(previous.source_metadata || "{}"),
          ...tag.sourceMetadata,
        };
        update.run(JSON.stringify(combined), tag.name);
      }
    }
    generateContextRules(database, tags);
  });
  transaction();
  return { added, skipped: tags.length - added, warnings: [] };
}
function reclassifyImported() {
  const database = open();
  const tags = database
    .prepare(
      "SELECT id,name,source_metadata AS sourceMetadata FROM tags WHERE pack_id='canonical-merge'",
    )
    .all();
  const update = database.prepare(
    "UPDATE tags SET category=?,subcategory=? WHERE id=?",
  );
  const clearMap = database.prepare(
    "DELETE FROM tag_category_map WHERE tag_id=?",
  );
  const putMap = database.prepare(
    "INSERT OR IGNORE INTO tag_category_map(tag_id,category,subcategory) VALUES(?,?,?)",
  );
  const rebuild = database.transaction(() => {
    for (const tag of tags) {
      const metadata = JSON.parse(tag.sourceMetadata || "{}");
      const nativeCategory = Object.values(metadata).find(
        (value) => value.category !== null,
      )?.category;
      const [category, subcategory] = classifyTag(tag.name, nativeCategory);
      update.run(category, subcategory, tag.id);
      clearMap.run(tag.id);
      putMap.run(tag.id, category, subcategory);
    }
    generateContextRules(
      database,
      tags.map((tag) => ({
        name: tag.name,
        sourceMetadata: JSON.parse(tag.sourceMetadata || "{}"),
      })),
    );
  });
  rebuild();
  return { reclassified: tags.length };
}
function ingestDanbooruKnowledge(batch) {
  const clean = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  const database = open();
  database
    .prepare(
      "INSERT OR IGNORE INTO packs(id,name,version,author,description,manifest) VALUES('danbooru-knowledge','Danbooru knowledge','1.0.0','Danbooru','Source aliases, implications, and offline wiki pages','{}')",
    )
    .run();
  const names = new Map(
    database
      .prepare("SELECT id,name,aliases FROM tags")
      .all()
      .map((row) => [row.name, row]),
  );
  const wiki = database.prepare(
    "INSERT INTO source_wikis(source,source_id,title,body,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(source,source_id) DO UPDATE SET title=excluded.title,body=excluded.body,updated_at=excluded.updated_at",
  );
  const relation = database.prepare(
    "INSERT OR IGNORE INTO tag_relationships(source_tag_id,target_tag_id,relation_type,strength,pack_id) VALUES(?,?, 'implies',1,'danbooru-knowledge')",
  );
  const aliasUpdate = database.prepare("UPDATE tags SET aliases=? WHERE id=?");
  const transaction = database.transaction(() => {
    for (const row of batch.rows) {
      if (batch.kind === "wikis") {
        if (row.title && typeof row.body === "string")
          wiki.run(
            "danbooru",
            row.id,
            clean(row.title),
            row.body,
            row.updated_at || null,
          );
        continue;
      }
      if (batch.kind === "implications") {
        if (row.status !== "active") continue;
        const from = names.get(clean(row.antecedent_name)),
          to = names.get(clean(row.consequent_name));
        if (from && to && from.id !== to.id) relation.run(from.id, to.id);
        continue;
      }
      if (batch.kind === "aliases") {
        if (row.status !== "active") continue;
        const target = names.get(clean(row.consequent_name));
        if (target) {
          const aliases = new Set(JSON.parse(target.aliases || "[]"));
          aliases.add(clean(row.antecedent_name));
          aliasUpdate.run(JSON.stringify([...aliases].sort()), target.id);
        }
      }
    }
  });
  transaction();
  return { processed: batch.rows.length };
}
function sourceCatalog(source, offset = 0, limit = 500) {
  const rows = open()
    .prepare(
      "SELECT id,name,display_name AS displayName,category,subcategory,is_nsfw AS nsfw,aliases,weight_default AS defaultWeight,weight_min AS min,weight_max AS max,slider_enabled AS slider,enabled,source_metadata AS sourceMetadata FROM tags WHERE source_metadata LIKE ? ORDER BY name LIMIT ? OFFSET ?",
    )
    .all(`%\"${source}\"%`, limit, offset);
  return rows.map((t) => ({
    ...t,
    nsfw: !!t.nsfw,
    slider: !!t.slider,
    enabled: !!t.enabled,
    aliases: JSON.parse(t.aliases),
    sourceMetadata: JSON.parse(t.sourceMetadata),
  }));
}
function createCustomTag(tag) {
  const database = open();
  const name = String(tag.name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!/^[a-z0-9_]+$/.test(name))
    throw new Error(
      "Use lowercase letters, numbers, and underscores for the tag name.",
    );
  if (!tag.category || !tag.subcategory)
    throw new Error("Choose a category and subcategory.");
  const id = `user-${crypto.randomUUID()}`;
  database
    .prepare(
      "INSERT OR IGNORE INTO packs(id,name,version,author,description,manifest) VALUES('user','User Pack','1.0.0','Local user','Personal tags and taxonomy additions','{}')",
    )
    .run();
  ensureTaxonomy(tag.category, tag.subcategory, "user");
  database
    .prepare(
      "INSERT INTO tags(id,name,display_name,description,category,subcategory,pack_id,weight_default,weight_min,weight_max,slider_enabled,enabled) VALUES(?,?,?,?,?,?,'user',1,.5,2,?,1)",
    )
    .run(
      id,
      name,
      tag.displayName || null,
      tag.description || null,
      tag.category,
      tag.subcategory,
      +!!tag.slider,
    );
  return {
    id,
    name,
    displayName: tag.displayName || undefined,
    description: tag.description || undefined,
    category: tag.category,
    subcategory: tag.subcategory,
    slider: !!tag.slider,
    min: 0.5,
    max: 2,
    defaultWeight: 1,
    enabled: true,
  };
}
function listRelationships() {
  return open()
    .prepare(
      "SELECT r.id,r.source_tag_id AS source,r.target_tag_id AS target,r.relation_type AS type,r.strength,r.pack_id AS packId FROM tag_relationships r JOIN packs p ON p.id=r.pack_id WHERE p.enabled=1",
    )
    .all();
}
function createRelationship(rule) {
  const database = open();
  if (!["implies", "requires", "conflicts", "suggests"].includes(rule.type))
    throw new Error("Choose a valid rule type.");
  const byName = database.prepare("SELECT id FROM tags WHERE name=?");
  const source = byName.get(rule.source),
    target = byName.get(rule.target);
  if (!source || !target)
    throw new Error("Both canonical tags must exist in the local catalog.");
  if (source.id === target.id)
    throw new Error("A tag cannot relate to itself.");
  database
    .prepare(
      "INSERT OR IGNORE INTO packs(id,name,version,author,description,manifest) VALUES('user','User Pack','1.0.0','Local user','Personal tags and taxonomy additions','{}')",
    )
    .run();
  const result = database
    .prepare(
      "INSERT INTO tag_relationships(source_tag_id,target_tag_id,relation_type,strength,pack_id) VALUES(?,?,?,?, 'user')",
    )
    .run(
      source.id,
      target.id,
      rule.type,
      Math.max(0, Math.min(1, Number(rule.strength) || 0.5)),
    );
  return {
    id: Number(result.lastInsertRowid),
    source: source.id,
    target: target.id,
    type: rule.type,
    strength: Number(rule.strength) || 0.5,
    packId: "user",
  };
}
function deleteRelationship(id) {
  const result = open()
    .prepare("DELETE FROM tag_relationships WHERE id=? AND pack_id='user'")
    .run(id);
  if (!result.changes)
    throw new Error("Only rules in your User Pack can be removed.");
  return true;
}
function syncCheckpoint(key, value) {
  return setting(`sync-checkpoint:${key}`, value);
}
function promoteDanbooruToCore() {
  const database = open();
  const result = database.transaction(() => {
    database
      .prepare(
        "UPDATE tags SET pack_id='core' WHERE pack_id='canonical-merge' AND source_metadata LIKE '%\"danbooru\"%'",
      )
      .run();
    const count = database
      .prepare("SELECT COUNT(*) AS count FROM tags WHERE pack_id='core'")
      .get().count;
    const row = database
      .prepare("SELECT manifest FROM packs WHERE id='core'")
      .get();
    if (row) {
      const manifest = JSON.parse(row.manifest);
      manifest.tagCount = count;
      manifest.version = "1.5.0";
      manifest.description =
        "Offline Core Pack including downloaded Danbooru canonical tags, aliases, implications, wiki data, and contextual indexing.";
      database
        .prepare(
          "UPDATE packs SET version=?,description=?,manifest=? WHERE id='core'",
        )
        .run(manifest.version, manifest.description, JSON.stringify(manifest));
    }
    return count;
  })();
  return { tagCount: result };
}
module.exports = {
  bootstrap,
  saveCharacter,
  listCharacters,
  loadCharacter,
  deleteCharacter,
  setting,
  listTaxonomy,
  createTaxonomy,
  restoreStarterTaxonomy: () => ensureStarterTaxonomy({ force: true }),
  renameTaxonomy,
  setTaxonomyIcon,
  deleteTaxonomy,
  syncCheckpoint,
  installPack,
  listPacks,
  listTags,
  togglePack,
  uninstallPack,
  clearDlcPacks,
  exportPack,
  mergeCanonical,
  sourceCatalog,
  createCustomTag,
  listRelationships,
  createRelationship,
  deleteRelationship,
  reclassifyImported,
  ingestDanbooruKnowledge,
  promoteDanbooruToCore,
  validatePack,
};
