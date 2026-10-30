import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cleanLlmJson, generateScript } from "./generator.js";
import { FakeLLMProvider } from "./llm-provider.js";

describe("Script Generator Pipeline (M4)", () => {
  const testOutputDir = "output/test-script-generator";

  const validScriptJson = JSON.stringify({
    schemaVersion: 2,
    metadata: {
      title: "Đánh giá siêu phẩm công nghệ",
      source: { url: "https://example.com/item", domain: "example.com", image: null },
      channel: "Tech Channel",
      useOgImage: false,
      safeZoneOverlay: true,
    },
    voice: { provider: "edge-tts", voiceId: "vi-VN-NamMinhNeural", speed: 1.0 },
    scenes: [
      {
        id: "hook",
        type: "hook",
        voiceText: "Liệu siêu phẩm mới có xứng đáng giá hai mươi triệu?",
        templateData: { template: "hook", headline: "SIÊU PHẨM MỚI", subhead: "Giá 20 triệu có đáng?" },
      },
      {
        id: "body-1",
        type: "body",
        voiceText: "Máy trang bị chip mạnh mẽ với 16GB RAM.",
        templateData: {
          template: "spec-table",
          productName: "Siêu phẩm",
          specs: [
            { label: "RAM", value: "16GB" },
            { label: "Bộ nhớ", value: "512GB" },
          ],
        },
      },
      {
        id: "body-2",
        type: "body",
        voiceText: "Ưu điểm là thiết kế mỏng nhẹ nhưng pin chỉ ở mức trung bình.",
        templateData: {
          template: "pros-cons",
          pros: ["Mỏng nhẹ", "Màn hình đẹp"],
          cons: ["Pin trung bình"],
        },
      },
      {
        id: "body-3",
        type: "body",
        voiceText: "Máy được chấm điểm tám phẩy năm trên mười điểm.",
        templateData: {
          template: "verdict-score",
          productName: "Siêu phẩm",
          score: 8.5,
          scale: "10",
          verdict: "Rất đáng mua",
          summary: "Thiết bị cân bằng tốt nhất.",
        },
      },
      {
        id: "outro",
        type: "outro",
        voiceText: "Theo dõi kênh để đón xem đánh giá mới nhất.",
        templateData: {
          template: "outro",
          ctaTop: "THEO DÕI",
          channelName: "Tech Channel",
          source: "example.com",
        },
      },
    ],
  });

  const sourceArticle = `
Ra mắt siêu phẩm công nghệ mới nhất.
Mẫu máy sở hữu 16GB RAM cùng 512GB bộ nhớ trong.
Giá bán dự kiến 20 triệu đồng.
Điểm đánh giá sơ bộ đạt 8.5 trên 10.
`;

  beforeEach(() => {
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe("cleanLlmJson", () => {
    it("strips ```json code fences", () => {
      const raw = "```json\n{\"foo\": \"bar\"}\n```";
      expect(cleanLlmJson(raw)).toBe('{"foo": "bar"}');
    });

    it("repairs trailing commas without changing code or punctuation inside strings",()=>{
      const raw='{"scenes":[{"voiceText":"Giữ ,} và ,] nguyên văn","code":"const a=[1,]",},],}';
      expect(JSON.parse(cleanLlmJson(raw))).toEqual({scenes:[{voiceText:'Giữ ,} và ,] nguyên văn',code:'const a=[1,]'}]});
    });

    it("leaves plain JSON intact", () => {
      const raw = '{"foo": "bar"}';
      expect(cleanLlmJson(raw)).toBe('{"foo": "bar"}');
    });
  });

  describe("generateScript", () => {
    it("successfully creates script.json, sources.json, and script.review.md with FakeLLMProvider", async () => {
      const fakeProvider = new FakeLLMProvider({
        responses: [`\`\`\`json\n${validScriptJson}\n\`\`\``],
      });

      const promptSpy = vi.spyOn(fakeProvider, "generate");
      const result = await generateScript({
        input: sourceArticle,
        preset: "news_short",
        outputDir: testOutputDir,
        llmProvider: fakeProvider,
      });

      expect(promptSpy.mock.calls[0][0]).toContain("JSON SCHEMA CHÍNH XÁC");
      expect(promptSpy.mock.calls[0][0]).toContain("channelName");
      expect(result.script.scenes).toHaveLength(5);
      expect(result.script.metadata.safeZoneOverlay).toBe(false);
      expect(existsSync(join(testOutputDir, "script.json"))).toBe(true);
      expect(existsSync(join(testOutputDir, "sources.json"))).toBe(true);
      expect(existsSync(join(testOutputDir, "script.review.md"))).toBe(true);

      const reviewMd = readFileSync(join(testOutputDir, "script.review.md"), "utf8");
      expect(reviewMd).toContain("Báo cáo Duyệt Kịch bản");
      expect(reviewMd.toLowerCase()).toContain("siêu phẩm");
    });

    it("retries up to 2 times when LLM outputs invalid JSON on first attempt", async () => {
      const invalidJson = '{"broken": json here';
      const fakeProvider = new FakeLLMProvider({
        responses: [invalidJson, validScriptJson],
      });

      const result = await generateScript({
        input: sourceArticle,
        preset: "news_short",
        outputDir: testOutputDir,
        llmProvider: fakeProvider,
      });

      expect(fakeProvider.callCount).toBe(2);
      expect(result.script.scenes).toHaveLength(5);
      expect(existsSync(join(testOutputDir, "script.json"))).toBe(true);
    });

    it("retries a five-scene review instead of silently accepting a short draft", async () => {
      const six = JSON.parse(validScriptJson);
      six.scenes.splice(4, 0, { id: "body-extra", type: "body", voiceText: "Kiểm tra điều kiện sử dụng trước khi bắt đầu.", templateData: { template: "callout", statement: "Kiểm tra điều kiện sử dụng" } });
      const fakeProvider = new FakeLLMProvider({ responses: [validScriptJson, JSON.stringify(six)] });
      const result = await generateScript({ input: sourceArticle, preset: "review_60", outputDir: testOutputDir, llmProvider: fakeProvider });
      expect(fakeProvider.callCount).toBe(2);
      expect(result.script.scenes).toHaveLength(6);
    });

    it("retries missing coverage and narration that is too short after removing repeated padding", async () => {
      const missing=JSON.parse(validScriptJson);
      const short=JSON.parse(validScriptJson);
      const coverage={items:['purpose','features','usage','requirements','limitations','examples'].map(topic=>({topic,status:'covered',summary:'Thông tin từ nguồn',evidence:'16GB RAM',sceneIds:['body-1']})),omittedTopics:[]};
      short.coverage=coverage;short.scenes.forEach((s:any)=>{s.voiceText=(s.voiceText+' ').repeat(8).trim();});
      const complete=JSON.parse(validScriptJson);complete.coverage=coverage;
      const details=['','Dung lượng bộ nhớ là thông tin cần xem khi chọn cấu hình phù hợp.','Phần tính năng cần được đối chiếu với nhu cầu sử dụng của bạn.','Hãy cân nhắc mức giá được công bố trong bài viết trước khi quyết định.',''];
      complete.scenes.forEach((s:any,i:number)=>{if(s.type==='body')s.voiceText+=' '+details[i];});
      const provider=new FakeLLMProvider({responses:[JSON.stringify(missing),JSON.stringify(short),JSON.stringify(complete)]});
      const result=await generateScript({input:'input is superseded by source',source:{title:'Full source',content:sourceArticle,url:'https://example.com/full',domain:'example.com',ogImage:null},contentMode:'overview',targetDurationSec:30,llmProvider:provider,outputDir:testOutputDir});
      expect(provider.callCount).toBe(3);expect(result.script.coverage?.items).toHaveLength(6);expect(result.sources.content).toBe(sourceArticle);
    });

    it.each([["quick",34],["standard",74],["detailed",104]] as const)("keeps natural measured duration in %s mode instead of enforcing approximate word counts",async(level,total)=>{
      const complete=JSON.parse(validScriptJson);
      complete.scenes.forEach((scene:any)=>scene.storyboard={intent:'Giải thích',visualBrief:'Thông tin nguồn',basis:'conceptual',evidence:'16GB RAM',transitionReason:'Tiếp ý'});
      complete.coverage={items:['purpose','features','usage','requirements','limitations','examples'].map(topic=>({topic,status:'covered',summary:'Thông tin từ nguồn',evidence:'16GB RAM',sceneIds:['body-1']})),omittedTopics:[]};
      const provider=new FakeLLMProvider({responses:[JSON.stringify(complete)]});
      const result=await generateScript({input:'source',source:{title:'Repo',content:sourceArticle,url:'https://example.com/full',domain:'example.com',ogImage:null},explanationLevel:level,targetDurationSec:90,llmProvider:provider,outputDir:testOutputDir,measureNarration:async()=>({sceneSeconds:[4,(total-10)/3,(total-10)/3,(total-10)/3,5],gapSec:.08,holdSec:.6})});
      expect(provider.callCount).toBe(1);expect(result.script.explanationLevel).toBe(level);expect(result.script.targetDurationSec).toBeCloseTo(total,6);expect(result.script.narrationTiming?.tempo).toBeCloseTo(1);
    });

    it('retains the preferred range budget for narration repair and stops rewriting during a voice outage',async()=>{
      const complete=JSON.parse(validScriptJson);
      complete.scenes.forEach((scene:any)=>scene.storyboard={intent:'Giải thích',visualBrief:'Thông tin nguồn',basis:'conceptual',evidence:'16GB RAM',transitionReason:'Tiếp ý'});
      complete.coverage={items:['purpose','features','usage','requirements','limitations','examples'].map(topic=>({topic,status:'covered',summary:'Thông tin từ nguồn',evidence:'16GB RAM',sceneIds:['body-1']})),omittedTopics:[]};
      let calls=0,measured=0,repair='';
      const provider={name:'fake',generate:async(_system:string,prompt:string)=>{calls++;if(calls===1)return JSON.stringify(complete);repair=prompt;return JSON.stringify({scenes:complete.scenes.map((s:any)=>({id:s.id,voiceText:s.voiceText}))});}};
      const opts={input:'source',source:{title:'Repo',content:sourceArticle,url:'https://example.com/full',domain:'example.com',ogImage:null},explanationLevel:'standard' as const,outputDir:testOutputDir,llmProvider:provider};
      const result=await generateScript({...opts,measureNarration:async()=>({sceneSeconds:++measured===1?[4,8,8,8,5]:[4,20,20,20,5],gapSec:.08,holdSec:.6})});
      expect(repair).toContain('Mục tiêu cân gần nhất 75 giây');expect(result.script.targetDurationSec).toBeCloseTo(70,6);
      calls=0;
      await expect(generateScript({...opts,measureNarration:async()=>{throw Error('EdgeTTS synthesize timeout');}})).rejects.toThrow(/Dịch vụ giọng đọc/);
      expect(calls).toBe(1);expect(existsSync(join(testOutputDir,'draft-unmeasured.json'))).toBe(true);
    });

    it("throws error when all attempts fail", async () => {
      const invalidJson = '{"broken": json';
      const fakeProvider = new FakeLLMProvider({
        responses: [invalidJson, invalidJson, invalidJson],
      });

      await expect(
        generateScript({
          input: sourceArticle,
          outputDir: testOutputDir,
          llmProvider: fakeProvider,
        }),
      ).rejects.toThrow("Failed to generate valid script after 3 attempts");
    });

    it.each([90,120])("automatically rewrites a measured short draft to %is and checks its hook", async (target)=>{
      const provider=new FakeLLMProvider({responses:[validScriptJson,validScriptJson]});
      let measured=0;
      const result=await generateScript({input:sourceArticle,outputDir:testOutputDir,llmProvider:provider,targetDurationSec:target,
        voice:target===120?{provider:"zerotts",voiceId:"quangminh",speed:1.2,settingsSource:"script",pronunciation:"smart"}:undefined,
        measureNarration:async(script)=>{
          measured++;
          expect(script.voice.speed).toBe(1.2);
          if(target===120)expect(script.voice.provider).toBe("zerotts");
          const available=target-.08*script.scenes.length-.6;
          return {sceneSeconds:measured===1?[3,4,4,4,3]:[4,(available-8)/3,(available-8)/3,(available-8)/3,4],gapSec:.08,holdSec:.6};
        }});
      expect(provider.callCount).toBe(2);
      if(target===120)expect(result.script.voice.voiceId).toBe("quangminh");
      expect(result.script.fitDuration).toBe(true);
      expect(result.script.targetDurationSec).toBe(target);
      expect(result.script.narrationTiming?.hookSec).toBeCloseTo(4);
      expect(result.script.narrationTiming?.tempo).toBeCloseTo(1);
      expect(result.script.narrationTiming?.attempts).toBe(2);
    });

    it("introduces the actual input repo without trusting AI names or star counts",async()=>{
      const draft=JSON.parse(validScriptJson);
      draft.metadata.source.url='https://github.com/invented/wrong-name';
      draft.metadata.githubStars={repoUrl:'https://github.com/owner/real-repo',count:999999,fetchedAt:'2026-10-29T00:00:00Z'};
      draft.scenes[0].voiceText='Gỡ quảng cáo không cần root.';
      const result=await generateScript({input:'README',outputDir:testOutputDir,llmProvider:new FakeLLMProvider({responses:[JSON.stringify({reading:'ri ồ ri pô'}),JSON.stringify(draft)]}),
        source:{title:'Actual repo',content:sourceArticle,url:'https://github.com/owner/real-repo',domain:'github.com',ogImage:null}});
      expect(result.script.scenes[0].voiceText).toBe('Repo real-repo trên GitHub. Gỡ quảng cáo không cần root.');
      expect(result.script.metadata.githubStars).toBeUndefined();
      expect(result.script.voice.pronunciationOverrides?.['real-repo']).toBe('ri ồ ri pô');
    });

    it('saves automatic repo pronunciation with the selected voice and empty user dictionary',async()=>{
      const provider=new FakeLLMProvider({responses:[JSON.stringify({reading:'niu bran'}),validScriptJson]});
      const result=await generateScript({input:'README',outputDir:testOutputDir,llmProvider:provider,
        source:{title:'NewBrand',content:sourceArticle,url:'https://github.com/owner/NewBrand',domain:'github.com',ogImage:null},
        voice:{provider:'zerotts',voiceId:'quangminh',speed:1.2,settingsSource:'script',pronunciation:'smart',pronunciationOverrides:{}}});
      expect(provider.callCount).toBe(2);
      expect(result.script.voice.provider).toBe('zerotts');expect(result.script.voice.speed).toBe(1.2);
      expect(result.script.voice.pronunciationOverrides).toEqual({NewBrand:'niu bran'});
      expect(result.script.scenes[0].voiceText).toContain('NewBrand');
      expect(result.script.scenes[0].voiceText).not.toContain('niu bran');
    });

    it("retries temporary provider outages without spending the automatic rewrite budget",async()=>{
      const prompts:string[]=[];
      const provider={name:'fake',generate:async(_system:string,prompt:string)=>{prompts.push(prompt);if(prompts.length<=3)throw new Error('Gemini API error (503): temporary outage');return validScriptJson;}};
      const result=await generateScript({input:sourceArticle,outputDir:testOutputDir,llmProvider:provider,targetDurationSec:90,measureNarration:async()=>({sceneSeconds:[4,27,27,26,5],gapSec:.08,holdSec:.6})});
      expect(prompts).toHaveLength(4);
      expect(new Set(prompts).size).toBe(1);
      expect(result.script.narrationTiming?.attempts).toBe(1);
    },15000);

    it("flags numbers absent from source in review markdown", async () => {
      // Modify script to include fabricated number 9999
      const modified = JSON.parse(validScriptJson);
      modified.scenes[1].voiceText = "Máy trang bị chip với 9999GB RAM cực khủng.";
      modified.scenes[1].templateData.specs[0].value = "9999GB";

      const fakeProvider = new FakeLLMProvider({
        responses: [JSON.stringify(modified)],
      });

      const result = await generateScript({
        input: sourceArticle, // source does NOT have 9999
        outputDir: testOutputDir,
        llmProvider: fakeProvider,
      });

      expect(result.factCheck.flaggedNumbers.some((f) => f.number === "9999")).toBe(true);
      const reviewMd = readFileSync(join(testOutputDir, "script.review.md"), "utf8");
      expect(reviewMd).toContain("CẢNH BÁO SỐ LIỆU CHƯA XÁC MINH");
      expect(reviewMd).toContain("9999");
    });
  });
});
