// Kept in the main process only. These values are deliberately never returned
// by source searches, pack export, character export, or renderer logging.
let sourceCredentials = {};
function setCredentials(value) {
  sourceCredentials = value && typeof value === "object" ? value : {};
}
function credentialsFor(source) {
  const value = sourceCredentials[source];
  return value && typeof value === "object" ? value : {};
}
function authenticatedUrl(source, rawUrl) {
  const url = new URL(rawUrl);
  const credentials = credentialsFor(source);
  if ((source === "danbooru" || source === "aibooru") && credentials.login && credentials.apiKey) {
    url.searchParams.set("login", credentials.login);
    url.searchParams.set("api_key", credentials.apiKey);
  }
  if (source === "gelbooru" && credentials.userId && credentials.apiKey) {
    url.searchParams.set("user_id", credentials.userId);
    url.searchParams.set("api_key", credentials.apiKey);
  }
  return url.toString();
}
function authHeaders(source) {
  const credentials = credentialsFor(source);
  const headers = { "User-Agent": "PromptAtelier/0.1 (local source workbench)" };
  if (source === "e621" && credentials.username && credentials.apiKey)
    headers.Authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.apiKey}`).toString("base64")}`;
  return headers;
}
function tagPrefix(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_()'!+-]/g, "");
}
const sourceUrls = {
  danbooru: (query) =>
    `https://danbooru.donmai.us/tags.json?search[name_matches]=${encodeURIComponent(`${tagPrefix(query)}*`)}&search[order]=count&limit=100`,
  e621: (query) =>
    `https://e621.net/tags.json?search[name_matches]=${encodeURIComponent(`${query}*`)}&limit=100`,
  gelbooru: (query) =>
    `https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&limit=100&name_pattern=${encodeURIComponent(`${query}%`)}`,
  aibooru: (query) =>
    `https://aibooru.online/tags.json?search[name_matches]=${encodeURIComponent(`${query}*`)}&limit=100`,
};
const categoryFor = (name, nativeCategory) => {
  // Classification is deliberately manual. A source query never invents a taxonomy.
  return ["", ""];
  // Editorial taxonomy: maps canonical source vocabulary into the app's one-character workflow.
  if (
    /(^|_)(girl|boy|woman|man|character|original|series|copyright|student|knight|mage|witch|idol|maid|princess)(_|$)/.test(
      name,
    )
  )
    return [
      "Character",
      /student|knight|mage|witch|idol|maid|princess/.test(name)
        ? "Role"
        : "Identity",
    ];
  if (/(long|short|medium|very_long)_hair/.test(name))
    return ["Body", "Hair length"];
  if (
    /(blue|red|pink|black|white|blonde|green|brown|purple|silver)_hair/.test(
      name,
    )
  )
    return ["Body", "Hair color"];
  if (/hair|ponytail|twintails|braid|bangs|ahoge|bob_cut/.test(name))
    return ["Body", "Hair style"];
  if (/_eyes|eyelash|eyebrow|pupil|sclera/.test(name))
    return ["Body", /eyelash|eyebrow/.test(name) ? "Brows & lashes" : "Eyes"];
  if (
    /skin|tan|freckles|tattoo|scar|beauty_mark|blush|sweat|makeup|fang/.test(
      name,
    )
  )
    return ["Body", /skin|tan/.test(name) ? "Complexion" : "Face details"];
  if (/ears|tail|horn|wings|animal_/.test(name))
    return ["Body", "Ears & features"];
  if (/petite|slender|curvy|muscular|tall|short|body_type|physique/.test(name))
    return ["Body", "Silhouette"];
  if (/uniform|dress|kimono|armor|swimsuit|suit|maid/.test(name))
    return ["Clothing", "Outfit"];
  if (/jacket|coat|cape|hoodie/.test(name)) return ["Clothing", "Outerwear"];
  if (/shirt|sweater|tank_top|blouse/.test(name)) return ["Clothing", "Tops"];
  if (/skirt|shorts|pants|jeans/.test(name)) return ["Clothing", "Bottoms"];
  if (/thighhigh|pantyhose|stocking|socks|leg_warmer/.test(name))
    return ["Clothing", "Legwear"];
  if (/boots|sneakers|heels|shoes|sandals|barefoot/.test(name))
    return ["Clothing", "Footwear"];
  if (/(^|_)(hat|hood|headband|ribbon)(_|$)/.test(name))
    return ["Clothing", "Headwear"];
  if (/glasses|necklace|earrings|bracelet|bag|accessor/.test(name))
    return ["Clothing", "Accessories"];
  if (
    /smile|frown|angry|sad|embarrassed|surprised|serious|happy|crying/.test(
      name,
    )
  )
    return ["Expression", "Mood"];
  if (/looking_|gaze/.test(name)) return ["Expression", "Gaze"];
  if (/wink|closed_eyes|wide_eyes|sleepy|tears/.test(name))
    return ["Expression", "Eyes"];
  if (/mouth|grin|pout|tongue/.test(name)) return ["Expression", "Mouth"];
  if (/standing|sitting|kneeling|lying|walking|running|pose|stance/.test(name))
    return ["Action", "Stance"];
  if (/hand|finger|arm|gesture|v_sign/.test(name))
    return ["Action", "Hands & gestures"];
  if (/holding|waving|reading|drinking|using_/.test(name))
    return ["Action", "Interaction"];
  if (/jumping|dancing|floating|wind|motion/.test(name))
    return ["Action", "Motion"];
  if (/classroom|bedroom|city|forest|beach|castle|cafe|street|stage/.test(name))
    return ["Background", "Location"];
  if (/indoors|outdoors|sky|water|flowers|mountain|cloud/.test(name))
    return ["Background", "Environment"];
  if (/sunlight|moonlight|backlight|rim_light|neon/.test(name))
    return ["Background", "Lighting"];
  if (/day|night|sunset|rain|snow|cloudy/.test(name))
    return ["Background", "Time & weather"];
  if (/star|fog|sparkle|smoke|cherry_blossom/.test(name))
    return ["Background", "Atmosphere"];
  if (/window|desk|book|umbrella|chair|weapon|staff/.test(name))
    return ["Background", "Props"];
  if (/portrait|upper_body|full_body|close-up|cowboy_shot/.test(name))
    return ["General", "Framing"];
  if (/from_above|from_below|from_side|dutch_angle/.test(name))
    return ["General", "Camera angle"];
  if (/quality|highres|masterpiece|detailed/.test(name))
    return ["General", "Quality"];
  // Danbooru-family category 4 is character; category 3 is copyright/series.
  // It is only used after semantic rules so visual tags retain their practical placement.
  if (Number(nativeCategory) === 4) return ["Character", "Identity"];
  if (Number(nativeCategory) === 3) return ["Character", "Origin"];
  return ["General", "Composition"];
};
const clean = (name) => {
  const value = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return /^[a-z0-9][a-z0-9_()'!+-]*$/.test(value) ? value : "";
};
const relatedNames = (value) =>
  typeof value === "string"
    ? value
        .trim()
        .split(/\s+/)
        .filter((_, index) => index % 2 === 0)
        .slice(1, 25)
        .map(clean)
        .filter(Boolean)
    : [];
function map(source, row) {
  const name = clean(row.name);
  if (!name) return null;
  const nativeCategory = row.category ?? row.type ?? null;
  const [category, subcategory] = categoryFor(name, nativeCategory);
  const booruGroup =
    { 0: "general", 1: "artist", 3: "copyright", 4: "character", 5: "meta" }[
      Number(nativeCategory)
    ] || "unknown";
  return {
    name,
    id: `canonical-${name}`,
    category,
    subcategory,
    sources: [source],
    sourceMetadata: {
      [source]: {
        id: row.id,
        postCount: row.post_count ?? row.count ?? 0,
        category: nativeCategory,
        group: booruGroup,
        related: relatedNames(row.related_tags),
      },
    },
  };
}
async function request(source, query) {
  const response = await fetch(authenticatedUrl(source, sourceUrls[source](query)), {
    headers: authHeaders(source),
  });
  if (!response.ok) throw new Error(`${source} returned ${response.status}`);
  const body = await response.json();
  const rows = Array.isArray(body) ? body : body.tags || body.tag || [];
  if (!Array.isArray(rows))
    throw new Error(`${source} returned an unsupported tag payload`);
  return rows.map((x) => map(source, x)).filter(Boolean);
}
async function searchCanonical(query) {
  const sources = ["danbooru", "gelbooru", "e621", "aibooru"];
  const settled = await Promise.allSettled(
    sources.map((source) => request(source, query)),
  );
  const merged = new Map(),
    errors = [];
  settled.forEach((result, index) => {
    const source = sources[index];
    if (result.status === "rejected") {
      errors.push(`${source}: ${result.reason.message}`);
      return;
    }
    for (const item of result.value) {
      const old = merged.get(item.name);
      if (old) {
        old.sources.push(source);
        old.sourceMetadata[source] = item.sourceMetadata[source];
      } else merged.set(item.name, item);
    }
  });
  return {
    tags: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)),
    errors,
  };
}
const encode = (value) => encodeURIComponent(String(value || "").trim());
const sourcePage = (source, kind, query) => {
  const q = encode(query);
  if (kind === "tags") return sourceUrls[source](query);
  if (source === "danbooru") {
    if (kind === "gallery")
      return `https://danbooru.donmai.us/posts.json?tags=${q}&limit=20`;
    if (kind === "wiki")
      return `https://danbooru.donmai.us/wiki_pages.json?search[title]=${q}&limit=20`;
    if (kind === "pools")
      return `https://danbooru.donmai.us/pools.json?search[name_matches]=${q}*&limit=20`;
  }
  if (source === "aibooru") {
    if (kind === "gallery")
      return `https://aibooru.online/posts.json?tags=${q}&limit=20`;
    if (kind === "wiki")
      return `https://aibooru.online/wiki_pages.json?search[title]=${q}&limit=20`;
    if (kind === "pools")
      return `https://aibooru.online/pools.json?search[name_matches]=${q}*&limit=20`;
  }
  if (source === "e621") {
    if (kind === "gallery")
      return `https://e621.net/posts.json?tags=${q}&limit=20`;
    if (kind === "wiki")
      return `https://e621.net/wiki_pages.json?search[title]=${q}&limit=20`;
    if (kind === "pools")
      return `https://e621.net/pools.json?search[name_matches]=${q}*&limit=20`;
  }
  if (source === "gelbooru") {
    if (kind === "gallery")
      return `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=20&tags=${q}`;
    if (kind === "pools")
      return `https://gelbooru.com/index.php?page=dapi&s=pool&q=index&json=1&limit=20&name_pattern=${q}%`;
  }
  return null;
};
const externalSearch = (source, kind, query) => {
  const q = encode(query);
  if (source === "gelbooru")
    return kind === "wiki" || kind === "groups"
      ? `https://gelbooru.com/index.php?page=wiki&s=list&search=${q}`
      : `https://gelbooru.com/index.php?page=post&s=list&tags=${q}`;
  if (source === "aibooru") return `https://aibooru.online/posts?tags=${q}`;
  return `https://${source}.net/`;
};
function sourceUrl(source, kind, item) {
  if (source === "danbooru")
    return kind === "tags"
      ? `https://danbooru.donmai.us/tags/${item.id}`
      : kind === "wiki" || kind === "groups"
        ? `https://danbooru.donmai.us/wiki_pages/${encode(item.title || item.name)}`
        : kind === "pools"
          ? `https://danbooru.donmai.us/pools/${item.id}`
          : `https://danbooru.donmai.us/posts/${item.id}`;
  if (source === "e621")
    return kind === "tags"
      ? `https://e621.net/tags/${item.id}`
      : kind === "wiki" || kind === "groups"
        ? `https://e621.net/wiki_pages/${encode(item.title || item.name)}`
        : kind === "pools"
          ? `https://e621.net/pools/${item.id}`
          : `https://e621.net/posts/${item.id}`;
  if (source === "aibooru")
    return kind === "tags"
      ? `https://aibooru.online/tags/${item.id}`
      : kind === "wiki" || kind === "groups"
        ? `https://aibooru.online/wiki_pages/${encode(item.title || item.name)}`
        : kind === "pools"
          ? `https://aibooru.online/pools/${item.id}`
          : `https://aibooru.online/posts/${item.id}`;
  return `https://gelbooru.com/index.php?page=post&s=view&id=${item.id}`;
}
async function searchDanbooruGroups(query) {
  const response = await fetch(
    authenticatedUrl("danbooru", "https://danbooru.donmai.us/wiki_pages/tag_groups.json"),
    { headers: authHeaders("danbooru") },
  );
  if (!response.ok) throw new Error(`danbooru returned ${response.status}`);
  const index = await response.json();
  const titles = [...String(index.body || "").matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter((title, position, all) => all.indexOf(title) === position);
  const needle = String(query || "").trim().toLowerCase();
  return titles
    .filter((title) => !needle || title.toLowerCase().includes(needle))
    .slice(0, 50)
    .map((title) => ({
      id: `danbooru-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: title,
      body: "Listed in Danbooru’s official Tag Groups index.",
      url: `https://danbooru.donmai.us/wiki_pages/${encode(title)}`,
      type: "official tag group",
    }));
}
async function openDanbooruGroup(title) {
  const response = await fetch(
    authenticatedUrl("danbooru", `https://danbooru.donmai.us/wiki_pages/${encode(title)}.json`),
    { headers: authHeaders("danbooru") },
  );
  if (!response.ok) throw new Error(`danbooru returned ${response.status}`);
  const page = await response.json();
  const links = [...String(page.body || "").matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter((name, position, all) => all.indexOf(name) === position);
  const items = links
    .filter((name) => !/^tag groups?$/i.test(name))
    .map((name) => {
      const nested = /^tag group:/i.test(name);
      return {
        id: `danbooru-${nested ? "group" : "tag"}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        body: nested
          ? "Nested Danbooru tag group. Open it to extract its tags."
          : `Listed in ${page.title}.`,
        url: `https://danbooru.donmai.us/wiki_pages/${encode(name)}`,
        type: nested ? "nested tag group" : "group tag",
      };
    });
  return { title: page.title, body: page.body || "", items };
}
function sourceItem(source, kind, row) {
  if (kind === "tags")
    return {
      name: row.name,
      id: row.id,
      postCount: Number(row.post_count ?? row.count ?? 0),
      category: row.category ?? row.type,
      url: sourceUrl(source, kind, row),
      type: "canonical tag",
    };
  if (kind === "gallery")
    return {
      id: row.id,
      name:
        row.tag_string?.split(/\s+/).slice(0, 4).join(", ") || `post_${row.id}`,
      preview:
        row.preview_file_url ||
        row.preview_url ||
        row.preview?.url ||
        row.file?.url ||
        row.file_url,
      url: sourceUrl(source, kind, row),
      tags: String(row.tag_string || row.tags || "")
        .split(/\s+/)
        .map(clean)
        .filter(Boolean),
      type: "art post",
    };
  if (kind === "pools")
    return {
      id: row.id,
      name: row.name,
      postCount: Number(row.post_count ?? row.post_ids?.length ?? 0),
      url: sourceUrl(source, kind, row),
      type: "pool",
    };
  return {
    id: row.id,
    name: row.title || row.name,
    body: row.body || row.other_names?.join(", ") || "",
    url: sourceUrl(source, kind, row),
    type: kind === "groups" ? "tag group / wiki page" : "wiki page",
  };
}
async function studioSearch(source, kind, query) {
  if (!["danbooru", "e621", "gelbooru", "aibooru"].includes(source))
    throw new Error("This source is opened only as an external reference.");
  if (kind === "groups") {
    if (source === "danbooru") return searchDanbooruGroups(query);
    return [
      {
        name: "Open source group index",
        url: externalSearch(source, kind, query),
        body: "This source does not expose a reliable tag-group index through its public API.",
        type: "web reference",
      },
    ];
  }
  const url = sourcePage(source, kind, query);
  if (!url)
    return [
      {
        name: "Open source search",
        url: externalSearch(source, kind, query),
        type: "web reference",
      },
    ];
  const response = await fetch(authenticatedUrl(source, url), {
    headers: authHeaders(source),
  });
  if (!response.ok) throw new Error(`${source} returned ${response.status}`);
  const body = await response.json();
  const candidate = Array.isArray(body)
    ? body
    : body.posts ||
      body.tags ||
      body.pools ||
      body.pool ||
      body.wiki_pages ||
      body.wiki_page ||
      body.post ||
      [];
  const rows = Array.isArray(candidate)
    ? candidate
    : candidate && typeof candidate === "object"
      ? [candidate]
      : [];
  if (!Array.isArray(rows))
    throw new Error(`${source} returned an unsupported ${kind} payload`);
  // The endpoint determines the page size (100 canonical tags for tag lookups).
  // Do not silently discard valid results in Pack Studio.
  return rows.map((row) => sourceItem(source, kind, row));
}
function csvRows(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  if (!lines.length) return [];
  const split = (line) => {
    const out = [];
    let value = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === "," && !quoted) {
        out.push(value);
        value = "";
      } else value += c;
    }
    out.push(value);
    return out;
  };
  const headers = split(lines.shift()).map((x) => x.trim());
  return lines.map((line) => {
    const values = split(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}
function inferSource(filePath, rows) {
  const name = filePath.toLowerCase();
  if (name.includes("aibooru")) return "aibooru";
  if (name.includes("e621")) return "e621";
  if (name.includes("gelbooru")) return "gelbooru";
  if (name.includes("danbooru")) return "danbooru";
  if (rows[0]?.type !== undefined && rows[0]?.count !== undefined)
    return "gelbooru";
  return "danbooru";
}
function mergeDump(filePath, text, explicitSource) {
  let records;
  try {
    const parsed = JSON.parse(text);
    records = Array.isArray(parsed) ? parsed : parsed.tags || parsed.tag || [];
  } catch {
    records = csvRows(text);
  }
  if (!Array.isArray(records) || !records.length)
    throw new Error("No supported tag records were found in this file.");
  const source =
    explicitSource === "auto" || !explicitSource
      ? inferSource(filePath, records)
      : explicitSource;
  const merged = new Map();
  for (const row of records) {
    if (!row.name) continue;
    const item = map(source, row);
    if (!item) continue;
    const old = merged.get(item.name);
    if (old) {
      old.sources.push(source);
      Object.assign(old.sourceMetadata, item.sourceMetadata);
    } else merged.set(item.name, item);
  }
  return {
    source,
    tags: [...merged.values()],
    skipped: records.length - merged.size,
  };
}
function fullPageUrl(source, after) {
  if (source === "gelbooru")
    return `https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&limit=100&after_id=${after}`;
  const base =
    source === "e621"
      ? "https://e621.net"
      : source === "aibooru"
        ? "https://aibooru.online"
        : "https://danbooru.donmai.us";
  if (source === "danbooru")
    return `${base}/tags.json?search[id_lt]=${after}&limit=100`;
  return `${base}/tags.json?search[id_gt]=${after}&search[order]=id&limit=100`;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function syncAll(source, onBatch, startAfter = 0) {
  const descending = source === "danbooru";
  let after = Number(startAfter) || (descending ? 999999999 : 0),
    total = 0,
    pages = 0;
  while (true) {
    const response = await fetch(authenticatedUrl(source, fullPageUrl(source, after)), {
      headers: authHeaders(source),
    });
    if (!response.ok)
      throw new Error(`${source} returned ${response.status} during full sync`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : body.tags || body.tag || [];
    if (!Array.isArray(rows))
      throw new Error(
        `${source} returned an unsupported tag payload during full sync`,
      );
    if (!rows.length) break;
    const tags = rows.map((row) => map(source, row)).filter(Boolean);
    const next = descending
      ? Math.min(...rows.map((row) => Number(row.id) || 0))
      : Math.max(...rows.map((row) => Number(row.id) || 0));
    await onBatch(tags, next);
    total += tags.length;
    pages++;
    if (!next || (descending ? next >= after : next <= after)) break;
    after = next;
    if (rows.length < 100) break;
    await pause(source === "gelbooru" ? 1000 : 300);
  }
  return { source, total, pages, lastId: after };
}
async function syncDanbooruKnowledge(onBatch, starts = {}) {
  const endpoints = [
    ["aliases", "tag_aliases.json"],
    ["implications", "tag_implications.json"],
    ["wikis", "wiki_pages.json"],
  ];
  let total = 0,
    pages = 0;
  for (const [kind, path] of endpoints) {
    let after = Number(starts[kind]) || 999999999;
    while (true) {
      const url = `https://danbooru.donmai.us/${path}?search[id_lt]=${after}&limit=100`;
      const response = await fetch(authenticatedUrl("danbooru", url), {
        headers: authHeaders("danbooru"),
      });
      if (!response.ok)
        throw new Error(`danbooru ${kind} returned ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows))
        throw new Error(`danbooru ${kind} returned an unsupported payload`);
      if (!rows.length) break;
      const next = Math.min(...rows.map((row) => Number(row.id) || 0));
      await onBatch({ kind, rows, next });
      total += rows.length;
      pages++;
      if (!next || next >= after || rows.length < 100) break;
      after = next;
      await pause(300);
    }
  }
  return { total, pages };
}
module.exports = {
  setCredentials,
  searchCanonical,
  studioSearch,
  openGroup: (source, title) => {
    if (source !== "danbooru")
      throw new Error("Only Danbooru tag groups can be extracted through this public API.");
    return openDanbooruGroup(title);
  },
  mergeDump,
  syncAll,
  syncDanbooruKnowledge,
  classifyTag: (name, nativeCategory) =>
    categoryFor(clean(name), nativeCategory),
};
