import {applyReferenceDefaults} from '../render/reference-design.js';
import {channelOutroVoice} from "../script/channel-outro.js";
import {DEFAULT_VOICE_SPEED,DEFAULT_BGM,DEFAULT_VOICE} from '../channel-defaults.js';
import { buildHookSuggestions, sourceFacts, compactText } from "../script/hooks.js";
import type { Script } from "../render/script-schema.js";

/**
 * Normalizes numbers and technical terms into spoken Vietnamese phonetics for TTS.
 */
export function normalizeVietnameseForTts(text: string): string {
  let res = text;

  // Decimal versions: e.g. GPT 5.5 -> GPT năm chấm năm, iOS 18.2 -> iOS mười tám chấm hai
  res = res.replace(/(\d+)\.(\d+)/g, "$1 chấm $2");

  // Percentages: 82.7% -> 82 chấm 7 phần trăm
  res = res.replace(/(\d+)(?:\s*(?:phẩy|chấm)\s*(\d+))?%/g, (_, intPart, decPart) => {
    return decPart ? `${intPart} phẩy ${decPart} phần trăm` : `${intPart} phần trăm`;
  });

  // Multipliers: 10x -> gấp mười lần, 2x -> gấp đôi
  res = res.replace(/\b2x\b/gi, "gấp đôi");
  res = res.replace(/\b(\d+)x\b/gi, "gấp $1 lần");

  // Common units
  res = res.replace(/\b(\d+)\s*MP\b/gi, "$1 megapixel");
  res = res.replace(/\b(\d+)\s*mAh\b/gi, "$1 miliampe giờ");
  res = res.replace(/\b(\d+)\s*GB\b/gi, "$1 gigabyte");
  res = res.replace(/\b(\d+)\s*TB\b/gi, "$1 terabyte");
  res = res.replace(/\$(\d+)/g, "$1 đô la");
  res = res.replace(/\b(\d+)\s*tr(?:iệu)?\s*đ(?:ồng)?\b/gi, "$1 triệu đồng");

  // Keep English terms and product names in their original spelling.
  // Remove unsupported punctuation & symbols
  res = res.replace(/[#@$%^&*_+=\\~<>[\]{}|]/g, " ");
  res = res.replace(/\s+/g, " ").trim();

  return res;
}

export interface GenerateScriptOptions {
  title: string;
  content: string;
  url?: string;
  domain?: string;
  image?: string | null;
  channel?: string;
  voiceProvider?: string;
  voiceId?: string;
  speed?: number;
}

/**
 * Generates a valid Script JSON compliant with ScriptSchema.
 */
export async function generateScriptFromContent(opts: GenerateScriptOptions): Promise<Script> {
  const {
    title,
    content,
    url = "local",
    domain = "local",
    image = null,
    channel = "DevPeek36",
    voiceProvider = "edge-tts",
    voiceId = "vi-VN-NamMinhNeural",
    speed = DEFAULT_VOICE_SPEED,
  } = opts;

  const facts = sourceFacts(content, title);
  const hook = buildHookSuggestions(title, content)[0];
  const evidence = facts.find(f => /\d/.test(f)) || facts[0];
  const detailFacts = facts.filter(f => f !== evidence).slice(0, 3);
  const details = detailFacts.length ? detailFacts : [facts[0]];
  const lastFact = facts[facts.length - 1];
  const number = evidence.match(/\d[\d.,]*(?:\s*(?:%|GB|TB|MP|mAh|triệu|nghìn|bảng màu|phong cách))?/iu)?.[0];
  const hookHeadline = hook.headline;
  const hookSubhead = hook.subhead;
  const hookVoice = normalizeVietnameseForTts(hook.voiceText);
  const body1Voice = normalizeVietnameseForTts(evidence);
  const body2Voice = normalizeVietnameseForTts(details.join(' '));
  const body3Voice = normalizeVietnameseForTts(lastFact);

  const script: Script = {
    bgm: {...DEFAULT_BGM},
    version: "1.0",
    metadata: {
      title,
      source: {
        url,
        domain: domain.slice(0, 40),
        image: image && image.startsWith("http") ? image : null,
      },
      channel: channel.slice(0, 30),
    },
    voice: {
      provider: voiceProvider,
      voiceId,
      speed,
    },
    scenes: [
      {
        id: "hook",
        type: "hook",
        voiceText: hookVoice,
        templateData: {
          template: "hook",
          headline: hookHeadline.slice(0, 40),
          hero:{name:compactText(title,40),category:"TECH EXPLAINER"},
          subhead: hookSubhead.slice(0, 40),
          kenBurns: "zoom-in",
        },
      },
      {
        id: "body-1",
        type: "body",
        voiceText: body1Voice,
        templateData: number ? {
          template: "stat-hero",
          value: compactText(number, 20),
          label: compactText(evidence.replace(number, '').replace(/^[\s,.:;-]+/, ''), 40) || compactText(title,40),
          context: compactText(title,50),
        } : { template: "callout", statement: compactText(evidence,80), tag: "ĐIỂM CHÍNH" },
      },
      {
        id: "body-2",
        type: "body",
        voiceText: body2Voice,
        templateData: {
          template: "feature-list",
          title: "Những điểm cần biết",
          bullets: details.map(f => compactText(f,50)),
          icon: "spark",
        },
      },
      {
        id: "body-3",
        type: "body",
        voiceText: body3Voice,
        templateData: {
          template: "callout",
          statement: compactText(lastFact,80),
          tag: "CHI TIẾT",
        },
      },
      {
        id: "outro",
        type: "outro",
        voiceText: channelOutroVoice(channel),
        templateData: {
          template: "outro",
          ctaTop: "Hẹn gặp lại!",
          channelName: channel.slice(0, 30),
          source: `Nguồn: ${domain}`.slice(0, 40),
        },
      },
    ],
  };

  if(!opts.voiceProvider&&!opts.voiceId)script.voice={...script.voice,...DEFAULT_VOICE};
  return applyReferenceDefaults(script);
}
