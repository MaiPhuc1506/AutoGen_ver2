import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger.js";

export type LexiconMap = Record<string, string>;
/** Later maps win regardless of spelling/case, including explicit user overrides. */
export function mergePronunciationOverrides(...maps:(LexiconMap|undefined)[]):LexiconMap{
  const merged=new Map<string,[string,string]>();
  for(const map of maps)for(const [term,reading] of Object.entries(map||{}))merged.set(term.toLowerCase(),[term,reading]);
  return Object.fromEntries(merged.values());
}
export function validateLexicon(value: unknown): asserts value is LexiconMap {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).length>500)throw new Error("Từ điển cần là object, tối đa 500 mục.");
  for(const [term,reading] of Object.entries(value))if(!term.trim() || term.length>100 || typeof reading!=="string" || !reading.trim() || reading.length>200)throw new Error("Mỗi mục cần từ gốc 1–100 ký tự và cách đọc 1–200 ký tự.");
}

let cachedLexicon: LexiconMap | null = null;

/**
 * Loads the lexicon dictionary from config/lexicon.json (cached).
 */
export function loadLexicon(configPath?: string): LexiconMap {
  if (cachedLexicon && !configPath) return cachedLexicon;

  const p = configPath || join(process.cwd(), "config", "lexicon.json");
  if (existsSync(p)) {
    try {
      const data = JSON.parse(readFileSync(p, "utf8"));
      if (typeof data === "object" && data !== null) {
        validateLexicon(data);
        if (!configPath) cachedLexicon = data;
        return data;
      }
    } catch (err: unknown) {
      log.warn(`Failed to parse lexicon file ${p}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {};
}

/**
 * Resets the in-memory lexicon cache (used for unit tests).
 */
export function resetLexiconCache() {
  cachedLexicon = null;
}

/**
 * Applies lexicon pronunciation dictionary to voiceText before sending to TTS.
 * Case-insensitive match on whole word boundaries using a single-pass regex
 * to prevent cascading replacements (e.g. iPhone -> ai phôn -> ây ai phôn).
 */
export function applyLexicon(text: string, customLexicon?: LexiconMap): string {
  if (!text) return "";
  const dict = customLexicon || loadLexicon();
  const keys = Object.keys(dict).filter((k) => k.trim().length > 0);
  if (keys.length === 0) return text;

  // Sort keys by length descending so longer phrases match first (e.g. "OpenAI" before "AI")
  keys.sort((a, b) => b.length - a.length);

  // Build case-insensitive lookup map for fast normalized retrieval
  const lookup = new Map<string, string>();
  for (const k of keys) {
    lookup.set(k.toLowerCase(), dict[k]);
  }

  // Unicode-aware boundaries also handle Vietnamese neighbours and names like Node.js.
  const pattern = keys
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])`, "giu");

  return text.replace(regex, (matched) => {
    return lookup.get(matched.toLowerCase()) ?? matched;
  });
}

const LETTERS:Record<string,string>={A:'ây',B:'bi',C:'xi',D:'đi',E:'i',F:'ép',G:'gi',H:'âych',I:'ai',J:'giây',K:'cây',L:'eo',M:'em',N:'en',O:'âu',P:'pi',Q:'kiu',R:'a',S:'ét',T:'ti',U:'diu',V:'vi',W:'đắp bờ diu',X:'ích',Y:'oai',Z:'di'};
const DIGITS=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
function numberReading(s:string):string {
  const n=Number(s);if(s.length>2||s.startsWith('0')&&s.length>1)return [...s].map(c=>DIGITS[Number(c)]).join(' ');
  if(n<10)return DIGITS[n];if(n===10)return 'mười';
  const tens=Math.floor(n/10),unit=n%10;return (tens===1?'mười':DIGITS[tens]+' mươi')+(unit?' '+(unit===1&&tens>1?'mốt':unit===5?'lăm':DIGITS[unit]):'');
}
const VERSION='[vV]?\\d+(?:\\.\\d+){1,3}(?:\\.[xX])?';
const ACRONYM='[A-Z]{2,6}[0-9]?';
const escaped=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** One pass: replacements never cascade into dictionary entries again. */
export function speechText(text:string,pronunciation?:"original"|"lexicon",overrides?:LexiconMap):string {
  if(pronunciation==='original')return text;
  const dict={...loadLexicon(),...overrides};const lookup=new Map(Object.entries(dict).map(([k,v])=>[k.toLowerCase(),v]));
  const keys=Object.keys(dict).filter(k=>k.trim()).sort((a,b)=>b.length-a.length).map(escaped);
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])(${[...keys,VERSION,ACRONYM].join('|')})(?![\\p{L}\\p{N}_])`,'gu');
  // Dictionary lookup is case-insensitive; acronym fallback deliberately only handles uppercase.
  const insensitiveKeys=new RegExp(`(?<![\\p{L}\\p{N}_])(${keys.join('|')})(?![\\p{L}\\p{N}_])`,'giu');
  // Collect original-text ranges so case-insensitive names and generic tokens share one replacement pass.
  const ranges=[...text.matchAll(pattern),...(keys.length?[...text.matchAll(insensitiveKeys)]:[])].sort((a,b)=>a.index!-b.index!||b[0].length-a[0].length);
  let result='',cursor=0;
  for(const m of ranges){const i=m.index!;if(i<cursor)continue;const token=m[0];let reading=lookup.get(token.toLowerCase());
    if(!reading){if(/^v?\d/i.test(token))reading=token.replace(/^[vV]/,'').split('.').map(part=>/^[xX]$/.test(part)?'ích':numberReading(part)).join(' chấm ');
      else reading=[...token].map(c=>LETTERS[c]||DIGITS[Number(c)]||c).join(' ');}
    result+=text.slice(cursor,i)+reading;cursor=i+token.length;
  }
  return result+text.slice(cursor);
}
export function pronunciationReport(text:string,pronunciation?:"original"|"lexicon",overrides?:LexiconMap){
  const dict={...loadLexicon(),...overrides};const words=[...text.matchAll(/(?<![\p{L}\p{N}_])[A-Za-z][A-Za-z0-9.-]*(?![\p{L}\p{N}_])/gu)].map(m=>m[0].replace(/[.]+$/,''));
  const mappings=Object.entries(dict).filter(([term])=>new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(term)}(?![\\p{L}\\p{N}_])`,'iu').test(text));
  const known=new Set(Object.keys(dict).map(k=>k.toLowerCase()));
  const unreviewed=[...new Set(words.filter(w=>!known.has(w.toLowerCase())&&(/[a-z][A-Z]/.test(w)||/^[A-Z]{2,6}\d?$/.test(w)||/^[A-Za-z]+\.[A-Za-z]+$/.test(w))))];
  return {spoken:speechText(text,pronunciation,overrides),mappings,unreviewed};
}
