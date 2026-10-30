import { existsSync, readFileSync } from "node:fs";
import {publicGet,accessMessage,publicUrl} from '../ingest/public-http.js';
import {fetchPlatformSource,SourceAccessError} from './platform-source.js';
import {fetchGithubContext} from "./github-context.js";
import type { SourceContent } from "./types.js";
import { log } from "../utils/logger.js";

/**
 * Strips HTML tags and script/style tags from an HTML string.
 */
export function extractCleanTextFromHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Normalize whitespace
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Extracts title and og:image from HTML.
 */
export function extractMetaFromHtml(html: string): { title: string; ogImage: string | null } {
  let title = "";
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    title = ogTitleMatch[1].trim();
  } else {
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTagMatch) {
      title = titleTagMatch[1].trim();
    }
  }

  let ogImage: string | null = null;
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    ogImage = ogImageMatch[1].trim();
  }

  return { title, ogImage };
}

/**
 * Fetches content from an input string (URL, local file, or raw topic).
 */
export async function fetchSourceContent(input: string, depth=0): Promise<SourceContent> {
  const trimmed = input.trim();

  // 1. URL mode
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const urlObj = new URL(publicUrl(trimmed));
    log.info(`Fetching source content from URL: ${urlObj.origin}${urlObj.pathname}`);
    const domain = urlObj.hostname.replace(/^www\./, "");

    if(domain === "github.com")return fetchGithubContext(trimmed);

    try {
    if(depth>2)throw new SourceAccessError('Quá nhiều liên kết chuyển tiếp giữa các nguồn.');
    const platform=await fetchPlatformSource(trimmed,{readArticle:url=>fetchSourceContent(url,depth+1)});
    if(platform)return platform;
    const html=String(await publicGet(trimmed));
    const { title: metaTitle, ogImage } = extractMetaFromHtml(html);
    const body=html.match(/<article\b[^>]*>([\s\S]*)<\/article>/i)?.[1]||html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i)?.[1]||html;
    const cleanContent = extractCleanTextFromHtml(body.replace(/<(?:nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/(?:nav|footer|header|aside)>/gi,' '));
    if(cleanContent.length<120||/^(?:just a moment|access denied|verify you are human)/i.test(metaTitle))throw new SourceAccessError('Trang không cung cấp đủ văn bản công khai, cần đăng nhập hoặc chỉ tải nội dung qua JavaScript. Hãy nhập bài gốc hoặc văn bản bạn có quyền sử dụng.');
    const title = metaTitle || cleanContent.slice(0, 80) || "Tin tức công nghệ";

    return {
      title,
      content: cleanContent.slice(0,80000),
      url: trimmed,
      domain,
      ogImage,
    };
    } catch(error){if(error instanceof SourceAccessError)throw error;throw new SourceAccessError(accessMessage(error));}
  }

  // 2. Local file mode
  if (existsSync(trimmed)) {
    log.info(`Reading source content from local file: ${trimmed}`);
    const raw = readFileSync(trimmed, "utf8");
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const title = lines[0] ? lines[0].slice(0, 80) : "Tài liệu kịch bản";
    const content = lines.slice(1).join("\n") || lines[0] || "";

    return {
      title,
      content,
      url: trimmed,
      domain: "local",
      ogImage: null,
    };
  }

  // 3. Raw topic / prompt mode
  log.info(`Using raw topic as source: ${trimmed.slice(0, 50)}...`);
  return {
    title: trimmed.slice(0, 80),
    content: trimmed,
    url: "manual",
    domain: "manual",
    ogImage: null,
  };
}
