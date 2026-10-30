import axios from "axios";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FeedSource, FeedItem } from "./types.js";

/** Decode basic XML / HTML entities */
export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Strip CDATA and HTML tags */
export function cleanText(input: string): string {
  let text = input;
  // CDATA unwrapping
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode entities
  text = decodeXmlEntities(text);
  // Normalize whitespace
  return text.replace(/\s+/g, " ").trim();
}

/** Parse XML tag value using regex */
export function extractTag(xml: string, tagName: string): string {
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const standardRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(standardRegex);
  return match ? match[1].trim() : "";
}

/**
 * Parse an RSS 2.0 or Atom XML string into a structured list of FeedItems
 */
export function parseRssFeed(xmlText: string, defaultSourceName?: string): FeedItem[] {
  const items: FeedItem[] = [];

  // Match all <item> (RSS) or <entry> (Atom) blocks
  const itemBlocks = xmlText.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];

  for (const block of itemBlocks) {
    const rawTitle = extractTag(block, "title");
    let rawLink = extractTag(block, "link");

    // Atom style <link href="..." />
    if (!rawLink) {
      const links=block.match(/<link\b[^>]*>/gi)||[];
      const alternate=links.find(link=>!/\brel=["'](?:self|enclosure)["']/i.test(link));
      const hrefMatch=alternate?.match(/\bhref=["']([^"']+)["']/i);
      if(hrefMatch)rawLink=hrefMatch[1];
    }

    const rawGuid = extractTag(block, "guid") || extractTag(block, "id") || rawLink;
    const rawPubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    const rawDesc = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");

    const title = cleanText(rawTitle);
    const link = decodeXmlEntities(rawLink.trim());
    if (!/^https?:\/\//i.test(link)) continue;
    if (!title || !link) continue;

    let domain = "";
    try {
      domain = new URL(link).hostname.replace("www.", "");
    } catch {}

    items.push({
      guid: rawGuid.trim() || link,
      title,
      link,
      pubDate: rawPubDate || undefined,
      description: cleanText(rawDesc) || undefined,
      sourceName: defaultSourceName || domain || undefined,
      domain,
    });
  }

  return items;
}

/**
 * Clean URL parameters (strip tracking tokens like utm_*)
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const urlObj = new URL(rawUrl);
    const paramsToDelete: string[] = [];
    urlObj.searchParams.forEach((_, key) => {
      if (key.startsWith("utm_") || key === "ref" || key === "fbclid") {
        paramsToDelete.push(key);
      }
    });
    paramsToDelete.forEach((key) => urlObj.searchParams.delete(key));
    urlObj.hash="";
    urlObj.searchParams.sort();
    urlObj.pathname=urlObj.pathname.replace(/\/$/, "")||"/";
    return urlObj.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Filter duplicates by URL or normalized Title
 */
export function filterDuplicateItems(items: FeedItem[]): FeedItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: FeedItem[] = [];

  for (const item of items) {
    const normUrl = normalizeUrl(item.link);
    const normTitle = item.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

    if (seenUrls.has(normUrl) || seenTitles.has(normTitle)) {
      continue;
    }

    seenUrls.add(normUrl);
    seenTitles.add(normTitle);
    result.push(item);
  }

  return result;
}

/**
 * Load feeds configuration from file (supports json or yaml fallback)
 */
export function loadFeedsConfig(customPath?: string): FeedSource[] {
  const searchPaths = [
    customPath,
    resolve("config/feeds.json"),
    resolve("config/feeds.yaml"),
  ].filter(Boolean) as string[];

  for (const p of searchPaths) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf-8");
        if (p.endsWith(".json")) {
          const parsed = JSON.parse(content);
          return parsed.feeds || [];
        } else {
          // Simple YAML parsing for feeds list
          return parseSimpleYamlFeeds(content);
        }
      } catch (err) {
        console.warn(`[WARN] Failed to read feed config from ${p}:`, err);
      }
    }
  }

  // Fallback defaults
  return [
    {
      id: "vnexpress-sohoa",
      name: "VnExpress Số Hóa",
      url: "https://vnexpress.net/rss/so-hoa.rss",
      enabled: true,
    },
    {
      id: "tuoitre-nhipsongso",
      name: "Tuổi Trẻ Nhịp Sống Số",
      url: "https://tuoitre.vn/rss/nhip-song-so.rss",
      enabled: true,
    },
  ];
}

/** Helper to parse simple feeds YAML format */
function parseSimpleYamlFeeds(yamlText: string): FeedSource[] {
  const feeds: FeedSource[] = [];
  const blocks = yamlText.split(/- id:/g).slice(1);

  for (const block of blocks) {
    const idMatch = block.match(/^\s*([^\n\r]+)/);
    const nameMatch = block.match(/name:\s*([^\n\r]+)/);
    const urlMatch = block.match(/url:\s*([^\n\r]+)/);
    const catMatch = block.match(/category:\s*([^\n\r]+)/);
    const enabledMatch = block.match(/enabled:\s*([^\n\r]+)/);

    if (idMatch && urlMatch) {
      feeds.push({
        id: idMatch[1].trim(),
        name: nameMatch ? nameMatch[1].trim() : idMatch[1].trim(),
        url: urlMatch[1].trim(),
        category: catMatch ? catMatch[1].trim() : undefined,
        enabled: enabledMatch ? enabledMatch[1].trim() === "true" : true,
      });
    }
  }

  return feeds;
}

/**
 * Fetch feed items from all enabled sources
 */
export async function fetchFeedItems(sources: FeedSource[]): Promise<FeedItem[]> {
  const activeSources = sources.filter((s) => s.enabled);
  const allItems: FeedItem[] = [];

  const promises = activeSources.map(async (src) => {
    try {
      const res = await axios.get(src.url, {
        timeout: 10000,
        headers: {
          "User-Agent": "AutoGenVid-FeedCollector/1.0",
        },
      });
      const xml = typeof res.data === "string" ? res.data : String(res.data);
      const parsed = parseRssFeed(xml, src.name);
      return parsed;
    } catch (err: any) {
      console.warn(`[WARN] Failed to fetch feed '${src.name}' (${src.url}): ${err.message}`);
      return [];
    }
  });

  const results = await Promise.all(promises);
  for (const list of results) {
    allItems.push(...list);
  }

  return filterDuplicateItems(allItems);
}
