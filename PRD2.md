# PRD2 — Mở rộng Auto_GenVid thành tool video review/tin công nghệ cho TikTok

> **Quan hệ với `PRD.md`:** PRD2 **thay thế phần kỹ thuật** của `PRD.md` (stack Python + FFmpeg/ASS). Mục tiêu sản phẩm và user stories US-1…US-11 của `PRD.md` vẫn giữ nguyên.
> **Quyết định:** không viết lại từ đầu. Làm việc **trực tiếp trên repo** `https://github.com/MaiPhuc1506/Auto_GenVid` (TypeScript/Node, HyperFrames), thêm tính năng theo từng milestone.

Tài liệu gồm: **Phần A – PRD2** (cần làm gì) và **Phần B – Agent Kit** (rules, skills, prompts cho AI agent).

---

# PHẦN A — PRD2

## 1. Bối cảnh và quyết định

- Repo hiện tại là bản fork của `Cuongyd196/auto-video-gen`, vốn fork từ `hoquanghai/Auto-Create-Video`, giấy phép **MIT**.
- **Phải giữ nguyên** file `LICENSE`, phần lời cảm ơn/ghi công trong README, và không xoá thông tin tác giả gốc.
- Branding mặc định trong repo (tên kênh, handle, avatar của tác giả gốc) **không phải của bạn**: phải chuyển thành cấu hình riêng (xem E6).
- Lý do giữ repo: phần render HTML → video (HyperFrames + GSAP + FFmpeg) đã chạy được, cùng với pipeline TTS, 4 provider, SFX, Zod schema và test.

## 2. Hiện trạng (theo README; agent PHẢI xác minh trong code ở M0)

| Hạng mục | Theo tài liệu |
|---|---|
| Runtime | Node ≥ 22, TypeScript, ESM |
| Render | HyperFrames (^0.4.34): sinh `index.html` + GSAP timeline, Puppeteer chụp frame, FFmpeg encode |
| Kịch bản | `script.json`, validate bằng Zod (discriminated union 6 template: `hook`, `comparison`, `stat-hero`, `feature-list`, `callout`, `outro`) |
| TTS | `edge-tts-universal` (mặc định), LucyLab, Vbee, ElevenLabs; TTS không gọi lại nếu đã có file |
| Audio | FFmpeg/ffprobe: nối voice, mix SFX theo bộ chọn 3 tầng (`src/assets/sfx-selector.ts`) |
| Output | `output/<slug>-<timestamp>/` gồm `video.mp4`, `voice.mp3`, `script.txt`, `caption.txt` (caption + 4 hashtag), `voice/*.srt` (xem lưu ý) |
| Lệnh | `npm run pipeline -- <script.json>`, `npm run rerender -- <thư mục>`, `npm test` |
| Viết kịch bản | Qua skill `/create-news-video` (Claude Code: `.claude/skills/`, Antigravity: `.agents/skills/`), **không** có LLM call trong code |
| Theme | `dark-neon`, `light-pro` qua `VIDEO_THEME` |

**Điểm không nhất quán cần làm rõ ở M0:**
- Hai README liệt kê tên template khác nhau (`breaking-news`, `split-screen`, `quote-card`, `listicle`, `big-number` so với 6 tên ở trên).
- Một chỗ nói Edge TTS tự xuất SRT, chỗ khác nói chỉ LucyLab.
- Đường dẫn file schema khác nhau giữa các tài liệu (`src/schema.ts` và `src/render/script-schema.ts`).
- Số test ghi 54 ở chỗ này, 60 ở chỗ khác.
- Tài liệu top-level nhắc BGM, tài liệu chi tiết chỉ nói SFX.

## 3. Mục tiêu và non-goals

**Mục tiêu:** từ một URL/bài báo/chủ đề, tạo video 9:16 cho TikTok có hình thật, caption đốt vào video đồng bộ giọng, nhạc nền, chuyển cảnh, đúng phong cách review/tin công nghệ; cho phép duyệt kịch bản và chỉnh trên timeline trước khi render; xuất kèm `caption.txt`, SRT và ảnh bìa.

**Non-goals:**
- Không tự động đăng lên TikTok.
- Không dùng text-to-video AI.
- Không multi-user/cloud.
- Không phá tương thích ngược: `script.json` cũ (không có `schemaVersion`) phải tiếp tục chạy được.

## 4. Milestone tổng quan

| MS | Tên | Kết quả |
|---|---|---|
| **M0** | Audit và baseline | Chạy được pipeline mẫu, ghi nhận hiện trạng thật, sửa mâu thuẫn tài liệu |
| **M1** | Caption và SRT | Caption đốt vào video theo từng từ; xuất SRT chuẩn; nhập SRT |
| **M2** | Media thật | Ảnh/video/screenshot gắn vào từng cảnh, có credit/giấy phép |
| **M3** | Template review | Bảng thông số, ưu/nhược, điểm số, giá, gallery, mockup điện thoại |
| **M4** | LLM trong code + duyệt kịch bản | `npm run script`, kiểm tra số liệu so với nguồn, bước duyệt trước khi render |
| **M5** | Audio, motion, preset | BGM + ducking, từ điển phát âm, chuyển cảnh, preset độ dài, safe-zone, branding cấu hình |
| **M6** | Web UI + timeline editor | Xem trước, chỉnh, render từ trình duyệt |
| **M7** | Thu thập tin, hỗ trợ đăng, CI | RSS + hàng đợi, ảnh bìa, checklist đăng, CI |

Mỗi milestone làm trên **một nhánh riêng** (`feat/m1-captions`…), commit nhỏ, mở PR (hoặc merge sau khi người dùng đồng ý).

## 5. Yêu cầu chi tiết theo milestone

### M0 — Audit và baseline
- Cài, chạy `npm test`, `npx tsc --noEmit`, và `npm run pipeline -- tests/fixtures/sample-script-no-image.json` với Edge TTS; ghi lại thời gian, kết quả, lỗi.
- Viết `docs/audit.md`: sơ đồ luồng thật từ code (mermaid), danh sách module, schema hiện tại (đường dẫn file thật), tên template thật, TTS nào xuất SRT thật, có BGM hay không, và xử lý từng mâu thuẫn ở mục 2.
- Sửa tài liệu cho khớp thực tế (không đổi hành vi code ở bước này).
- **Chấp nhận:** audit đầy đủ, mọi mâu thuẫn ở mục 2 có kết luận kèm bằng chứng (đường dẫn file/dòng), baseline chạy xanh hoặc lỗi được ghi rõ.

### M1 — Caption và SRT
- **Nguồn thời gian:**
  - Edge TTS: dùng sự kiện word-boundary của `edge-tts-universal` (agent đọc mã/tài liệu của đúng phiên bản đã cài để biết API).
  - Provider có SRT (LucyLab): phân tích SRT.
  - Provider không có timestamp (ElevenLabs, Vbee): phương án dự phòng chia theo tỉ lệ độ dài ký tự trong thời lượng audio của cảnh; đánh dấu "độ chính xác thấp".
- **Hiển thị:** caption là một **lớp HTML/CSS/GSAP** trong composition (không dùng ASS), mỗi cue 2–6 từ, tối đa 2 dòng, highlight từ đang đọc, nằm trong safe-zone (E6). Chuẩn hoá Unicode NFC. Font hỗ trợ tiếng Việt (ví dụ Be Vietnam Pro hoặc Inter); nếu phải tải từ Google Fonts thì có phương án đóng gói font cục bộ để render không cần mạng.
- **Bật/tắt và style:** trường `captions` trong script (`enabled`, `style`), style mặc định `tiktok-bold`, có biến thể cho cả hai theme.
- **Xuất SRT:** `captions.srt` toàn video (UTF-8, `HH:MM:SS,mmm`), đúng cho mọi provider.
- **Nhập SRT:** `npm run captions:import -- <thư mục output> <file.srt>` ghi đè cue tự động bằng cue từ SRT (chịu BOM, CRLF, cue nhiều dòng; báo lỗi rõ khi sai định dạng).
- **Chấp nhận:**
  1. Video mẫu có caption nhìn thấy được, bật/tắt được.
  2. Với Edge TTS, độ lệch cue so với từ được đọc ≤ 150 ms (kiểm tra trên timestamp bằng test).
  3. Round-trip: cue → SRT → cue giữ nguyên số lượng và thời gian (dung sai 1 ms).
  4. SRT có dấu tiếng Việt, BOM, CRLF được parse đúng.
  5. Script cũ không có `captions` vẫn render như trước (hoặc theo mặc định đã ghi rõ).

### M2 — Media thật
- Trường `media` tuỳ chọn cho mỗi cảnh: `type` (`image` | `video` | `screenshot`), `src`, `fit` (`cover` | `contain`), `fx` (`none` | `kenburns`), `credit`, `license`.
- Nguồn: file cục bộ; `StockProvider` (Pexels/Pixabay, key trong `.env`, có `FakeStockProvider` cho test); **chụp màn hình URL** bằng Puppeteer (đã có sẵn qua HyperFrames) cho ảnh chụp bài báo/trang sản phẩm/trang thông số.
- Tải về `output/<slug>/media/`, lưu `media.json` (nguồn, tác giả, giấy phép, URL gốc). Cảnh không có media thì dùng nền hiện tại; không tìm thấy thì rơi về nền mặc định, không làm hỏng video.
- `og:image` của bài báo chỉ dùng khi có cờ bật rõ ràng và được ghi vào `media.json` kèm cảnh báo bản quyền.
- **Chấp nhận:** cảnh có media hiển thị đúng 9:16 (cover/contain), Ken Burns không giật; `media.json` đầy đủ; test với `FakeStockProvider` và `nock`; script cũ không đổi hành vi.

### M3 — Template review
Thêm biến thể mới vào discriminated union (không đổi biến thể cũ):

| Template | Nội dung |
|---|---|
| `spec-table` | Tên sản phẩm + tối đa 6 dòng thông số (nhãn/giá trị) |
| `pros-cons` | Hai cột ưu/nhược (mỗi cột tối đa 4 ý) |
| `verdict-score` | Điểm (0–10 hoặc 0–100), nhãn kết luận, 1 câu tóm tắt |
| `price-tag` | Giá, phiên bản/biến thể, ghi chú nơi bán |
| `image-gallery` | 1–3 ảnh sản phẩm, chú thích |
| `phone-mockup` | Ảnh/screenshot đặt trong khung điện thoại |

- Mỗi template có: Zod schema, hàm dựng HTML, animation vào cảnh, style cho **cả hai theme**, mẫu fixture trong `tests/fixtures/`, test composer, và cập nhật skill `create-news-video` để LLM biết khi nào chọn.
- Hiển thị tiếng Việt có dấu và chuỗi dài không tràn khung (cắt/co chữ có quy tắc).
- **Chấp nhận:** mỗi template render đúng với fixture ở cả hai theme (kiểm tra bằng ảnh chụp một frame); schema từ chối dữ liệu sai bằng thông báo rõ.

### M4 — LLM trong code và duyệt kịch bản
- `LLMProvider` (interface) với ít nhất một provider thật (Anthropic hoặc tương thích OpenAI, chọn bằng `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`) và `FakeLLMProvider` cho test.
- Lệnh `npm run script -- <url|file.md|"chủ đề"> --preset <news_short|review_60|top_list> --out <thư mục>`:
  1. Lấy nội dung nguồn (trích văn bản từ URL).
  2. Gọi LLM, parse JSON, validate Zod; nếu sai thì retry tối đa 2 lần kèm thông báo lỗi.
  3. Ghi `script.json` và `sources.json`.
- Prompt hệ thống (tiếng Việt, đặt trong `src/script/prompts/`): chỉ dùng thông tin có trong nguồn, không bịa thông số, hook trong 3 giây đầu, văn nói, số và đơn vị viết sẵn dạng đọc được trong `voiceText`.
- **Kiểm tra số liệu:** mọi con số trong `voiceText`/`templateData` phải xuất hiện trong văn bản nguồn (so khớp sau chuẩn hoá); số không tìm thấy bị gắn cờ trong `script.review.md`.
- **Bước duyệt:** `npm run script` **dừng** sau khi ghi `script.json` và `script.review.md` (danh sách cảnh, cờ cảnh báo). Chỉ `npm run pipeline` mới render. Có cờ `--yes` để bỏ qua dừng khi chạy tự động.
- Skill `create-news-video` được cập nhật để dùng luồng mới nhưng vẫn chạy được độc lập.
- **Chấp nhận:** chạy `npm run script` với `FakeLLMProvider` ra `script.json` hợp lệ; retry hoạt động khi JSON sai; số bịa bị gắn cờ trong test; không có API key trong log.

### M5 — Audio, motion, preset
- **BGM:** trường `bgm` (`src`, `volume`, `duck`); nhạc tự lặp/cắt theo độ dài video, fade in/out, **ducking** khi có giọng (FFmpeg `sidechaincompress` hoặc tương đương). Thư mục `assets/bgm/` kèm hướng dẫn giấy phép; không đóng gói nhạc có bản quyền.
- **Từ điển phát âm:** `config/lexicon.json` (ví dụ `"iPhone": "ai phôn"`), áp vào `voiceText` trước khi gọi TTS, có test. Không thay đổi chữ hiển thị trên màn hình.
- **Chuyển cảnh:** trường `transition` mỗi cảnh (`cut` mặc định | `fade` | `slide` | `zoom`, kèm `duration`); mặc định giữ hard cut để tương thích ngược. Cho phép ghi đè kiểu animation vào cảnh qua script (mặc định giữ như hiện tại).
- **Preset độ dài:** `short_30`, `news_45`, `review_60` (số cảnh, số từ mục tiêu, khoảng thời lượng cảnh báo); cảnh báo thay vì lỗi khi ngoài khoảng.
- **Safe-zone TikTok:** cấu hình lề an toàn (đáy ~20%, cạnh phải) áp cho caption và các thành phần quan trọng; có chế độ vẽ lưới safe-zone khi render preview.
- **Branding cấu hình:** `config/brand.json` (tên kênh, handle, avatar, màu, theme) thay cho giá trị mặc định của tác giả gốc; thiếu cấu hình thì không hiển thị thẻ follow hoặc dùng placeholder trung tính.
- **Chấp nhận:** video có BGM nghe được với ducking (kiểm tra mức âm bằng `ffmpeg`/`ffprobe` trong test tích hợp ngắn); lexicon có test; preset chọn được; script cũ không đổi hành vi.

### M6 — Web UI và timeline editor
- **Bước 1:** viết `docs/adr-ui.md` chốt công nghệ (đề xuất: Vite + React + TypeScript, server Node/Express hoặc Fastify chạy local, dùng chung mã core). Nêu lý do nếu chọn khác.
- **Nguồn sự thật:** `script.json` (schema v2, có `schemaVersion: 2`) cộng khối `timeline` tuỳ chọn (ghi đè thời lượng/vị trí cảnh, cue caption, BGM). Có hàm migrate v1 → v2.
- **Preview:** xem trước ngay trong trình duyệt bằng chính HTML composition (iframe) và tua GSAP timeline; dùng audio thật để đồng bộ. (Agent phải kiểm chứng cách HyperFrames hỗ trợ xem/tua trong trình duyệt; nếu không khả thi thì dùng render proxy độ phân giải thấp và ghi lại trong ADR.)
- **Timeline:** các track — cảnh (clip), giọng, BGM, caption. Thao tác: kéo, trim, split, xoá, ripple delete, snap vào đầu/cuối cảnh và cue caption, zoom timeline, undo/redo (command pattern). Mọi thao tác chỉ sửa mô hình, UI vẽ lại từ mô hình.
- **Chức năng khác:** sửa `voiceText`/`templateData` từng cảnh, chọn template, chọn media, chỉnh caption, chọn theme/preset; nút **Tạo lại giọng** cho từng cảnh; nút **Render** có tiến độ và huỷ; mở lại project có sẵn trong `output/`.
- **Chấp nhận:** mô hình + thao tác + undo/redo có test đơn vị (không cần UI); sửa trên UI rồi render ra video khớp với preview; mở project v1 cũ được qua migrate; không có logic sửa dữ liệu trong component UI.

### M7 — Thu thập tin, hỗ trợ đăng, CI
- **Thu thập tin:** `config/feeds.yaml` (RSS), lệnh liệt kê/chọn bài, lọc trùng theo URL/tiêu đề; hàng đợi tạo video nhiều bài (chạy tuần tự, ghi log, tiếp tục khi một bài lỗi).
- **Hỗ trợ đăng (không tự đăng):** xuất `cover.png` (frame bìa chọn được), `caption.txt` (đã có), checklist `publish.md` gồm: ghi nguồn, nhãn nội dung AI, kiểm tra bản quyền media, kiểm tra thông tin chính.
- **CI:** GitHub Actions chạy `npx tsc --noEmit` và `npm test` trên mỗi push/PR.
- **Chấp nhận:** CI xanh; hàng đợi 3 bài (dùng fake provider) chạy xong, bài lỗi không làm dừng cả hàng.

## 6. Mô hình dữ liệu (định hướng — agent mở rộng schema hiện có, không định nghĩa lại)

Schema v2 là **mở rộng tương thích ngược** của schema hiện tại (đọc file schema thật ở M0 rồi thêm trường tuỳ chọn):

```ts
// Chỉ minh hoạ phần THÊM; giữ nguyên các trường và biến thể hiện có
Script {
  schemaVersion?: 1 | 2,            // thiếu = v1
  preset?: 'short_30' | 'news_45' | 'review_60',
  sources?: { name: string; url: string }[],
  captions?: { enabled: boolean; style: string },
  bgm?: { src: string; volume: number; duck: boolean },
  timeline?: {                       // M6, tuỳ chọn
    scenes?: Record<sceneId, { start?: number; duration?: number }>,
    captionCues?: { start: number; end: number; text: string }[],
  },
  scenes: Scene[]
}
Scene {
  /* các trường hiện có */
  media?: { type: 'image'|'video'|'screenshot'; src: string;
            fit: 'cover'|'contain'; fx?: 'none'|'kenburns';
            credit?: string; license?: string },
  transition?: { type: 'cut'|'fade'|'slide'|'zoom'; duration?: number },
}
```

## 7. Yêu cầu phi chức năng

- **Tương thích ngược:** fixture và `script.json` hiện có luôn chạy được; mọi trường mới là tuỳ chọn với mặc định giữ hành vi cũ.
- **Xác định (deterministic):** cùng input → cùng frame (giữ tinh thần HyperFrames); không dùng `Math.random()`/thời gian thực trong template mà không có seed.
- **Hiệu năng:** video 60 giây render full trong khoảng 5 phút trên laptop thông thường (mức hiện tại theo README là 3–5 phút); có chế độ draft nhanh hơn.
- **Độ tin cậy:** lỗi một provider (TTS/LLM/stock) báo rõ, không làm hỏng thư mục output; có thể chạy lại từng bước.
- **Bảo mật:** API key chỉ trong `.env.local`, không in ra log, `.env.example` luôn cập nhật.
- **Chất lượng mã:** TypeScript strict, `tsc --noEmit` sạch, test Vitest cho mọi module mới (HTTP mock bằng `nock`, không gọi API thật).
- **Pháp lý/nội dung:** chỉ dùng media có giấy phép phù hợp, lưu nguồn và giấy phép; nhắc gắn nhãn nội dung AI theo chính sách TikTok hiện hành; giữ ghi công MIT.

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `edge-tts-universal` là API không chính thức, có thể đổi/ngưng | giữ nguyên các provider khác; interface TTS không đổi; test bằng mock |
| Timestamp từ bị thiếu hoặc không chính xác ở provider khác | phương án dự phòng chia theo ký tự, đánh dấu độ chính xác thấp; cho phép nhập SRT |
| Font Google Fonts cần mạng khi render | đóng gói font cục bộ |
| HyperFrames đổi API giữa các phiên bản | ghim phiên bản, đọc tài liệu đúng phiên bản, test render tối thiểu |
| LLM bịa thông số | kiểm tra số so với nguồn, bước duyệt bắt buộc |
| Bản quyền ảnh/nhạc | lưu `credit`/`license`, mặc định không dùng `og:image`, cảnh báo trong checklist |
| Timeline UI tốn công | làm mô hình + thao tác + test trước, UI sau; chốt ADR |
| Phá tương thích với script cũ | fixture v1 trong test hồi quy cho mọi milestone |

---

# PHẦN B — AGENT KIT (cho repo TypeScript/Node)

## B1. Cách dùng

1. Đặt `PRD.md` và `PRD2.md` ở thư mục gốc repo (PRD2 ưu tiên hơn khi mâu thuẫn).
2. Tạo/ghi `AGENTS.md` (và `CLAUDE.md` nếu dùng Claude Code) từ mục **B2**.
3. Tạo các skill ở **B3**. Repo đã dùng hai thư mục skill — đặt cùng nội dung vào **cả** `.claude/skills/<tên>/SKILL.md` và `.agents/skills/<tên>/SKILL.md`.
4. Dán prompt **B4** (bắt đầu bằng P-START), làm từng milestone, chạy thử video thật sau mỗi milestone.

## B2. `AGENTS.md`

````markdown
# Quy tắc cho agent — Auto_GenVid (mở rộng)

Yêu cầu: đọc `PRD2.md` (ưu tiên) và `PRD.md` trước khi làm. Khi hai file mâu thuẫn về kỹ thuật, theo `PRD2.md`.

## Nguyên tắc
- Mở rộng repo hiện có (TypeScript/Node ≥ 22, ESM, Zod, Vitest, HyperFrames). KHÔNG viết lại bằng ngôn ngữ khác, KHÔNG đổi stack.
- Làm theo milestone M0…M7, mỗi milestone một nhánh `feat/<mX-tên>`, commit nhỏ. Không push thẳng `main`.
- Tương thích ngược: mọi trường/tính năng mới là tuỳ chọn, mặc định giữ hành vi cũ; `script.json` cũ phải chạy được. Mỗi milestone giữ fixture v1 trong test hồi quy.
- Đọc code trước khi sửa. Không đoán đường dẫn/tên hàm: xác minh bằng cách mở file. Không bịa API của thư viện (`hyperframes`, `edge-tts-universal`, `zod`…): đọc tài liệu hoặc mã nguồn của đúng phiên bản trong `node_modules`.
- Mọi dịch vụ ngoài (TTS, LLM, stock) nằm sau interface và có bản fake/mock cho test; test không gọi API thật (dùng `nock`).
- Không commit API key; dùng `.env.local`, cập nhật `.env.example`. Không in key ra log.
- Giữ nguyên `LICENSE` và phần ghi công tác giả gốc. Không đưa branding của người khác vào mặc định mới.
- Không thêm dependency nặng khi chưa cần; nêu lý do khi thêm.
- Quyết định lớn ghi vào `docs/adr-XXXX.md`. Điểm mơ hồ: chọn phương án đơn giản nhất, ghi vào `docs/assumptions.md`, tiếp tục; chỉ dừng hỏi khi không thể tiến tiếp.

## Trước khi báo hoàn thành (bắt buộc)
Chạy và dán kết quả THẬT: `npx tsc --noEmit`, `npm test`, và một lần render mẫu (kiểm tra bằng `ffprobe`: 1080×1920, có luồng audio, thời lượng hợp lý). Không tuyên bố xong nếu còn tiêu chí chấp nhận chưa đạt.

## Mẫu báo cáo
1. Đã làm gì (file tạo/sửa) 2. Cách chạy thử 3. Output tsc/test/ffprobe 4. Tiêu chí chấp nhận: đạt / chưa đạt / chưa kiểm tra (kèm bằng chứng) 5. Giả định và việc còn lại
````

## B3. Skills

Mỗi skill đặt tại `.claude/skills/<tên>/SKILL.md` và `.agents/skills/<tên>/SKILL.md`. Skill `create-news-video` đã có trong repo — **cập nhật** nó ở M3/M4 thay vì tạo mới.

### Skill 1 — `repo-audit`

````markdown
---
name: repo-audit
description: Kiểm tra hiện trạng thật của repo Auto_GenVid (luồng, schema, template, TTS, tài liệu mâu thuẫn) trước khi mở rộng. Dùng ở M0 hoặc khi cần hiểu lại mã.
---

# Audit repo

1. Chạy `npm install`, `npx tsc --noEmit`, `npm test`; ghi kết quả và thời gian.
2. Lập cây `src/` và đọc: `pipeline.ts`, `config.ts`, `rerender.ts`, thư mục `render/`, `tts/`, `audio/`, `assets/`, file schema Zod, `.claude/skills/create-news-video/SKILL.md`.
3. Theo dõi một lần chạy: `npm run pipeline -- tests/fixtures/sample-script-no-image.json` (Edge TTS). Ghi từng bước, file đầu ra, thời gian.
4. Đối chiếu từng khẳng định trong README với mã (template thật là gì, TTS nào xuất SRT, có BGM không, đường dẫn schema, số test).
5. Viết `docs/audit.md`: sơ đồ luồng (mermaid), bảng module, schema hiện tại, kết luận cho từng mâu thuẫn kèm đường dẫn file/dòng.

Chỉ nêu điều đã xác minh; suy đoán phải ghi rõ là suy đoán. Không đổi hành vi code trong bước audit.
````

### Skill 2 — `schema-evolution`

````markdown
---
name: schema-evolution
description: Thêm trường/template mới vào schema Zod của script.json mà không phá tương thích ngược, có migrate và fixture hồi quy. Dùng khi sửa schema.
---

# Mở rộng schema an toàn

- Mọi trường mới là `optional()` với mặc định tương đương hành vi cũ. Template mới là biến thể mới trong discriminated union, không đổi biến thể cũ.
- `schemaVersion` thiếu = v1. Viết hàm `migrate(v1 → v2)` thuần, có test.
- Giữ nguyên fixture cũ trong `tests/fixtures/`; thêm fixture mới cho từng tính năng. Test hồi quy: fixture cũ vẫn parse và render như trước.
- Thông báo lỗi Zod phải đủ rõ để LLM/người dùng sửa được (đường dẫn trường + lý do).
- Kiểu TypeScript suy từ Zod (`z.infer`), không khai báo trùng.
- Sau khi đổi schema: cập nhật skill `create-news-video` (để LLM biết trường mới), tài liệu README liên quan và `.env.example` nếu có.
````

### Skill 3 — `hyperframes-templates`

````markdown
---
name: hyperframes-templates
description: Thêm hoặc sửa template HTML/CSS/GSAP trong lớp render HyperFrames, đảm bảo deterministic, đúng 9:16, đúng cả hai theme. Dùng ở M3, M5.
---

# Template HyperFrames

- Đọc tài liệu HyperFrames đúng phiên bản trong `package.json` và code `src/render/` (composer, templates, `animations.js`, hai file CSS theme) trước khi viết.
- Mỗi template mới gồm: Zod schema, hàm dựng HTML trong composer, hàm animation vào cảnh, CSS cho CẢ `dark-neon` và `light-pro` (dùng chung tên class), fixture, test composer.
- Deterministic: không `Math.random()`, không dùng thời gian thực; hiệu ứng dựa trên timeline GSAP.
- Văn bản tiếng Việt: kiểm tra dấu, chuỗi dài, co chữ/cắt có quy tắc; không để tràn khung.
- Kiểm tra bằng cách render một frame (hoặc video 3 giây) và xem ảnh chụp; ghi lại trong báo cáo.
- Tôn trọng safe-zone TikTok (cấu hình ở M5): không đặt nội dung quan trọng vào ~20% đáy và cạnh phải.
- Không đổi hành vi template cũ trừ khi có yêu cầu rõ.
````

### Skill 4 — `captions-timing`

````markdown
---
name: captions-timing
description: Tạo caption đồng bộ từng từ từ timestamp TTS, lớp caption HTML trong composition, xuất/nhập SRT. Dùng ở M1.
---

# Caption và SRT

- Nguồn thời gian: word-boundary của `edge-tts-universal` (đọc API của đúng phiên bản đã cài; đơn vị thời gian có thể là 100 ns); SRT của provider nếu có (LucyLab); dự phòng chia theo ký tự cho provider không có timestamp, gắn nhãn "độ chính xác thấp".
- Gom 2–6 từ/cue, tối đa 2 dòng, chuẩn hoá Unicode NFC, cue ngắn nhất ~0.4 s. Offset theo thời điểm bắt đầu của từng cảnh trong video (cộng khoảng nghỉ giữa cảnh).
- Hiển thị bằng lớp HTML/CSS/GSAP trong composition: highlight từ đang đọc, nằm trong safe-zone, font hỗ trợ tiếng Việt (đóng gói cục bộ nếu có thể).
- SRT: UTF-8, đánh số từ 1, `HH:MM:SS,mmm --> HH:MM:SS,mmm`. Parser chịu BOM, CRLF, cue nhiều dòng, báo lỗi rõ khi sai.
- Test: round-trip cue → SRT → cue (dung sai 1 ms); độ lệch cue ≤ 150 ms trên dữ liệu timestamp giả; cue không chồng lấn và không vượt tổng thời lượng.
````

### Skill 5 — `media-assets`

````markdown
---
name: media-assets
description: Tải/gắn ảnh, video, screenshot vào cảnh, lưu credit và giấy phép, có provider giả để test. Dùng ở M2.
---

# Media cho cảnh

- Interface `StockProvider` + `PexelsProvider`/`PixabayProvider` (key trong `.env.local`) + `FakeStockProvider`. Test bằng `nock`, không gọi API thật.
- Screenshot URL bằng Puppeteer (đã có qua HyperFrames); đặt timeout, chờ tải xong, viewport hợp lý, xử lý lỗi.
- Tải về `output/<slug>/media/`, ghi `media.json` (nguồn, tác giả, giấy phép, URL gốc). Không có media/lỗi tải → nền mặc định, video vẫn render.
- `og:image` chỉ dùng khi có cờ bật rõ ràng; ghi cảnh báo bản quyền vào `media.json`.
- Crop/scale về 9:16 (`cover`/`contain`); ảnh tĩnh có Ken Burns nhẹ, không giật, deterministic.
- Giới hạn kích thước/định dạng tải về; kiểm tra tệp hợp lệ trước khi dùng.
````

### Skill 6 — `llm-script`

````markdown
---
name: llm-script
description: Sinh script.json bằng LLM ngay trong code (interface provider, validate Zod, retry), kiểm tra số liệu so với nguồn, bước duyệt. Dùng ở M4.
---

# LLM tạo kịch bản

- `LLMProvider.generate(system, user) → string`; provider thật chọn bằng `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`; `FakeLLMProvider` cho test.
- Prompt hệ thống (tiếng Việt, đặt trong `src/script/prompts/`): chỉ dùng thông tin trong nguồn, không bịa thông số, hook 3 giây đầu, văn nói, số/đơn vị viết dạng đọc được trong `voiceText`, chọn template theo nội dung.
- Quy trình: lấy nguồn → gọi LLM → bỏ code fence → `JSON.parse` → Zod validate → nếu lỗi thì retry tối đa 2 lần kèm thông báo lỗi.
- Kiểm tra số liệu: mọi con số trong `voiceText`/`templateData` phải có trong văn bản nguồn (so khớp sau chuẩn hoá); số lạ bị gắn cờ trong `script.review.md`.
- Lệnh `npm run script` dừng sau khi ghi `script.json`, `sources.json`, `script.review.md`; chỉ `npm run pipeline` mới render; cờ `--yes` bỏ qua dừng.
- Không in key; không ghi toàn bộ nội dung nguồn vào log.
````

### Skill 7 — `audio-polish`

````markdown
---
name: audio-polish
description: BGM với ducking, từ điển phát âm, chuyển cảnh, preset độ dài, safe-zone và cấu hình branding. Dùng ở M5.
---

# Âm thanh, motion, preset

- BGM: lặp/cắt theo độ dài video, fade in/out, ducking khi có giọng (FFmpeg `sidechaincompress` hoặc tương đương). Không đóng gói nhạc có bản quyền; hướng dẫn nguồn nhạc miễn phí và ghi giấy phép.
- Lexicon: `config/lexicon.json` áp vào `voiceText` trước TTS (không đổi chữ hiển thị); có test; so khớp theo từ nguyên, không phân biệt hoa thường.
- Transition: mặc định `cut` để tương thích ngược; `fade`/`slide`/`zoom` có `duration`; cảnh vẫn tính thời lượng = audio + khoảng nghỉ đã có.
- Preset (`short_30`, `news_45`, `review_60`): số cảnh/số từ mục tiêu; ngoài khoảng chỉ cảnh báo.
- Safe-zone TikTok: cấu hình lề; chế độ vẽ lưới khi preview.
- Branding: `config/brand.json` thay cho giá trị mặc định của tác giả gốc; thiếu cấu hình thì không hiển thị thẻ follow hoặc dùng placeholder trung tính.
- Kiểm tra mức âm bằng `ffmpeg`/`ffprobe` trong một test tích hợp ngắn.
````

### Skill 8 — `web-timeline-editor`

````markdown
---
name: web-timeline-editor
description: Xây web UI và timeline editor (mô hình + thao tác + undo/redo tách khỏi UI, preview bằng HTML composition). Dùng ở M6.
---

# Web UI và timeline

1. Viết `docs/adr-ui.md` chốt công nghệ (đề xuất Vite + React + TS và server Node local dùng chung mã core). Kiểm chứng cách preview bằng HTML composition/tua GSAP với phiên bản HyperFrames đang dùng; nếu không khả thi, dùng render proxy độ phân giải thấp và ghi vào ADR.
2. Mô hình timeline thuần dữ liệu (không phụ thuộc UI/FFmpeg), thao tác là `Command` có `do/undo`: `addScene`, `removeScene`, `moveScene`, `trimScene`, `splitScene`, `rippleDelete`, `editCue`, `moveCue`, `setBgm`, `undo`, `redo`. Test từng thao tác và `undo`.
3. Quy tắc: các cảnh không chồng lấn trên cùng track; `trim` không làm thời lượng ≤ 0; snap vào đầu/cuối cảnh, cue, playhead (ngưỡng ~0.1 s); thời gian làm tròn theo khung hình.
4. `script.json` v2 (+ khối `timeline`) là nguồn sự thật; có `migrate` v1 → v2 và test. UI chỉ gọi `Command`, không tự sửa dữ liệu.
5. Chức năng: preview đồng bộ audio, sửa `voiceText`/`templateData`, chọn template/media/theme/preset, tạo lại giọng từng cảnh, render có tiến độ và huỷ, mở project trong `output/`.
6. Giữ CLI (`npm run pipeline`, `rerender`) hoạt động như cũ.
````

### Skill 9 — `qa-verify`

````markdown
---
name: qa-verify
description: Kiểm tra trước khi báo hoàn thành một milestone (tsc, test, hồi quy script cũ, render mẫu, ffprobe, tiêu chí chấp nhận). Dùng cuối mỗi nhiệm vụ.
---

# Kiểm tra hoàn thành

1. Chạy `npx tsc --noEmit` và `npm test`; dán output thật.
2. Hồi quy: chạy fixture v1 cũ, xác nhận render như trước (hoặc khác ở điểm nào và vì sao được chấp nhận).
3. Render mẫu cho tính năng mới; `ffprobe` kiểm tra 1080×1920, có luồng audio, thời lượng; xem một frame ảnh chụp khi liên quan đến hiển thị.
4. Đối chiếu từng tiêu chí chấp nhận của milestone trong `PRD2.md`: đạt / chưa đạt / chưa kiểm tra, kèm lệnh và đường dẫn tệp làm bằng chứng.
5. Kiểm tra: không có API key trong mã/log; `.env.example` đã cập nhật; README/`docs` cập nhật; `LICENSE` nguyên vẹn.
6. Liệt kê rõ việc còn lại và giả định. Không tuyên bố "xong" nếu còn tiêu chí chưa đạt.
````

## B4. Prompts

### P-START — Prompt khởi động (dán đầu tiên)

````text
Bạn là kỹ sư phần mềm chính của dự án này. Repo hiện tại là Auto_GenVid (TypeScript/Node, HyperFrames). Chúng ta MỞ RỘNG repo này, không viết lại.

BƯỚC 1 — ĐỌC VÀ CHUẨN BỊ
- Đọc `PRD.md` và `PRD2.md` (PRD2 ưu tiên khi mâu thuẫn).
- Tạo/ghi `AGENTS.md` (và `CLAUDE.md` nếu bạn là Claude Code) bằng đúng nội dung mục B2 của PRD2.
- Tạo 9 skill ở mục B3 vào CẢ `.claude/skills/<tên>/SKILL.md` và `.agents/skills/<tên>/SKILL.md` (skill `create-news-video` đã có: không ghi đè, để cập nhật ở M3/M4).
- Commit phần chuẩn bị trên nhánh `chore/agent-kit`.

BƯỚC 2 — TÓM TẮT
Trả lời dưới 15 dòng: bạn hiểu sản phẩm là gì, 8 milestone M0–M7, và tối đa 3 điểm mơ hồ/rủi ro kèm phương án mặc định bạn sẽ chọn.

BƯỚC 3 — LÀM M0 (Audit và baseline)
Dùng skill `repo-audit` và `qa-verify`. Làm đúng yêu cầu M0 trong PRD2, nhánh `feat/m0-audit`. Chưa thêm tính năng mới.

Sau M0, báo cáo theo mẫu trong `AGENTS.md` rồi DỪNG chờ tôi.

QUY TẮC: tương thích ngược với script.json cũ; không bịa API thư viện (đọc mã/tài liệu đúng phiên bản trong node_modules); test không gọi API thật; không commit API key; giữ nguyên LICENSE và ghi công tác giả gốc. Nếu không chắc về một điểm trong code, mở file kiểm tra thay vì đoán.
````

### P-M1 — Caption và SRT

````text
Đọc `PRD2.md` (M1), `AGENTS.md` và skill `captions-timing`, `schema-evolution`, `hyperframes-templates`, `qa-verify`. Nhánh `feat/m1-captions`.

Làm hết yêu cầu M1:
1. Lấy timestamp: word-boundary của Edge TTS (đọc API đúng phiên bản `edge-tts-universal` đã cài); SRT của LucyLab; dự phòng chia theo ký tự cho provider khác, đánh dấu "độ chính xác thấp".
2. Lớp caption HTML/CSS/GSAP trong composition, highlight từ đang đọc, safe-zone, font hỗ trợ tiếng Việt, cả hai theme.
3. Trường `captions` tuỳ chọn trong schema (tương thích ngược).
4. Xuất `captions.srt`; lệnh `npm run captions:import -- <thư mục output> <file.srt>`.
5. Test: độ lệch ≤ 150 ms, round-trip SRT, BOM/CRLF/tiếng Việt, fixture cũ hồi quy.

Xong thì chạy `qa-verify`, render một video mẫu và báo cáo theo mẫu. Rồi DỪNG.
````

### P-M2 — Media thật

````text
Đọc `PRD2.md` (M2), `AGENTS.md` và skill `media-assets`, `schema-evolution`, `qa-verify`. Nhánh `feat/m2-media`.

Làm hết yêu cầu M2: trường `media` tuỳ chọn mỗi cảnh; `StockProvider` (Pexels/Pixabay) + `FakeStockProvider`; screenshot URL bằng Puppeteer; tải vào `output/<slug>/media/` kèm `media.json` (nguồn, giấy phép); Ken Burns; mặc định không dùng og:image trừ khi bật cờ. Test bằng nock/fake; script cũ không đổi.

Xong thì `qa-verify`, render mẫu có media, báo cáo theo mẫu. Rồi DỪNG.
````

### P-M3 — Template review

````text
Đọc `PRD2.md` (M3), `AGENTS.md` và skill `hyperframes-templates`, `schema-evolution`, `qa-verify`. Nhánh `feat/m3-review-templates`.

Thêm 6 template: spec-table, pros-cons, verdict-score, price-tag, image-gallery, phone-mockup. Mỗi cái: Zod schema (biến thể mới), HTML composer, animation, CSS cho cả hai theme, fixture, test. Cập nhật skill `create-news-video` để LLM biết khi nào dùng. Chụp một frame mỗi template ở cả hai theme để kiểm tra bằng mắt. Không đổi hành vi template cũ.

Xong thì `qa-verify` và báo cáo theo mẫu. Rồi DỪNG.
````

### P-M4 — LLM trong code và duyệt kịch bản

````text
Đọc `PRD2.md` (M4), `AGENTS.md` và skill `llm-script`, `schema-evolution`, `qa-verify`. Nhánh `feat/m4-llm-script`.

Làm: `LLMProvider` + provider thật (Anthropic hoặc tương thích OpenAI) + `FakeLLMProvider`; `npm run script -- <url|file|"chủ đề"> --preset ... --out ...` ghi `script.json`, `sources.json`, `script.review.md` rồi DỪNG (cờ `--yes` để bỏ qua); prompt tiếng Việt trong `src/script/prompts/`; validate Zod + retry tối đa 2 lần; kiểm tra mọi con số so với văn bản nguồn và gắn cờ số lạ; cập nhật skill `create-news-video` dùng luồng mới. Test bằng Fake provider, không gọi API thật.

Xong thì `qa-verify` và báo cáo theo mẫu. Rồi DỪNG.
````

### P-M5 — Audio, motion, preset

````text
Đọc `PRD2.md` (M5), `AGENTS.md` và skill `audio-polish`, `schema-evolution`, `hyperframes-templates`, `qa-verify`. Nhánh `feat/m5-audio-motion`.

Làm: BGM + ducking + fade; `config/lexicon.json` áp vào voiceText trước TTS; chuyển cảnh (mặc định cut) và ghi đè animation vào cảnh qua script; preset short_30/news_45/review_60; cấu hình safe-zone và chế độ vẽ lưới; `config/brand.json` thay mặc định của tác giả gốc. Kiểm tra mức âm BGM/giọng bằng ffmpeg trong một test tích hợp ngắn. Script cũ không đổi hành vi.

Xong thì `qa-verify` và báo cáo theo mẫu. Rồi DỪNG.
````

### P-M6 — Web UI và timeline editor

````text
Đọc `PRD2.md` (M6), `AGENTS.md` và skill `web-timeline-editor`, `schema-evolution`, `qa-verify`. Nhánh `feat/m6-web-ui`.

Làm theo thứ tự:
1. Viết `docs/adr-ui.md` chốt công nghệ, sau khi kiểm chứng cách preview bằng HTML composition/GSAP với phiên bản HyperFrames đang dùng.
2. Mô hình timeline + Command + undo/redo + `migrate` v1→v2 trong lõi, test từng thao tác (CHƯA làm UI).
3. Server local + UI: nhiều track, kéo/trim/split/ripple delete/snap/zoom, sửa voiceText/templateData/caption/BGM, chọn template/media/theme/preset, tạo lại giọng từng cảnh, nút Render có tiến độ và huỷ, mở project trong `output/`.
4. UI chỉ gọi Command; CLI cũ vẫn chạy như trước.
Quay GIF ngắn thao tác UI để vào README.

Xong thì `qa-verify` và báo cáo theo mẫu. Rồi DỪNG.
````

### P-M7 — Thu thập tin, hỗ trợ đăng, CI

````text
Đọc `PRD2.md` (M7), `AGENTS.md` và skill `qa-verify`. Nhánh `feat/m7-ingest-ci`.

Làm: `config/feeds.yaml` + lệnh liệt kê/chọn bài + lọc trùng; hàng đợi tạo video nhiều bài (tuần tự, ghi log, bài lỗi không làm dừng cả hàng); xuất `cover.png` (frame bìa chọn được) và checklist `publish.md` (ghi nguồn, nhãn nội dung AI, bản quyền media, kiểm tra thông tin); GitHub Actions chạy `tsc --noEmit` và `npm test`. Test hàng đợi với fake provider.

Xong thì `qa-verify` và báo cáo theo mẫu. Rồi DỪNG.
````

### P-ALL — Chạy liền nhiều milestone có chốt chặn

````text
Làm tuần tự M1 → M2 → M3 → M4 → M5 (CHƯA làm M6, M7), mỗi milestone theo prompt tương ứng ở mục B4 của PRD2. Sau mỗi milestone phải chạy `qa-verify` và chỉ được sang milestone sau khi toàn bộ tiêu chí chấp nhận của milestone đó đạt. Nếu một milestone không đạt sau 3 lần thử, dừng và báo nguyên nhân. Ghi nhật ký vào `docs/progress.md` sau mỗi milestone (đã làm gì, kết quả tsc/test, giả định). Mỗi milestone một nhánh riêng, không push thẳng main.
````

### P-UPGRADE — Nâng cấp một tính năng

````text
Đọc `PRD2.md`, `AGENTS.md`, mã hiện tại và skill liên quan.

Tôi muốn thêm/nâng cấp: [mô tả tính năng].

Làm theo thứ tự: (1) cập nhật `PRD2.md` (user story, yêu cầu, tiêu chí chấp nhận); (2) nêu ngắn gọn thiết kế và tác động lên schema (dùng skill `schema-evolution`, tương thích ngược); (3) cài đặt kèm test, không làm hỏng test cũ; (4) `qa-verify` và báo cáo theo mẫu. Điểm mơ hồ: chọn phương án đơn giản nhất và ghi vào `docs/assumptions.md`.
````

### P-BUGFIX — Sửa lỗi

````text
Đọc `AGENTS.md`. Lỗi gặp phải:

[dán log / mô tả / các bước tái hiện]

Làm theo thứ tự: (1) viết test thất bại tái hiện lỗi; (2) tìm nguyên nhân gốc, giải thích ngắn; (3) sửa tối thiểu, test mới pass và không phá test cũ; (4) `qa-verify` và báo cáo theo mẫu.
````

### P-REVIEW — Review và refactor

````text
Đọc `PRD2.md`, `AGENTS.md` và toàn bộ mã trong `src/`. Đóng vai reviewer khó tính: kiểm tra đúng PRD2, tương thích ngược, ranh giới module (không có logic nghiệp vụ trong UI), xử lý lỗi, bảo mật (API key, chạy lệnh shell/FFmpeg an toàn), hiệu năng render, độ phủ test, tài liệu khớp mã. Ghi vấn đề theo mức độ (cao/trung bình/thấp) kèm file và dòng vào `docs/review.md`; sửa mức cao và trung bình, mỗi vấn đề một commit nhỏ có test; chạy `qa-verify`. Không đổi hành vi công khai (CLI, định dạng script.json) trừ khi có migrate và ghi rõ.
````

---

**Gợi ý khi giao việc:** làm tuần tự, mở video thật sau mỗi milestone và xem bằng mắt (caption lệch, chữ tràn khung, âm lượng BGM) — test tự động không bắt được hết các lỗi hiển thị. Nếu agent báo một thông tin trong README không đúng với code, ưu tiên code và để M0 ghi lại.

## Bổ sung đã thống nhất — Voice Studio (25/10/2026)

Bản đầu mở rộng M5/M6: nhập voice MP3/WAV trên web; chọn provider/voice/speed và nghe thử; duyệt lời và chữ từng cảnh; một phong cách Tech Editorial 9:16 gần định hướng video mẫu. Không chuyển cả 15 demo trong giai đoạn này.

Tiêu chí: upload được kiểm tra nội dung và giới hạn; giữ audio liên tục; mốc cảnh sửa được; có thể nhập SRT; timing ước lượng được thể hiện rõ; tốc độ tác động thật và không dùng cache cũ; JSON v1 vẫn chạy; TypeScript/test pass; render mới có video 1080×1920 và audio. Chi tiết quyết định ở docs/adr-voice-studio.md, hướng dẫn ở docs/huong-dan-voice-studio.md.

### Bổ sung sau phản hồi hook/template

Thêm lựa chọn hook trong bước duyệt và `motionPreset` tùy chọn Dynamic/Calm; hiệu ứng động seekable, sound design cục bộ bật/tắt. Fallback phải bám nguồn, không tự điền số liệu/tính năng quảng cáo; phân biệt AI với chế độ ghép nguồn. Script cũ không có trường mới giữ cách dựng trước đó. Nghiệm thu bằng test hồi quy, kiểm tra chọn hook trên browser và video render thật.


### M5 bổ sung — tư liệu GitHub và bố cục chỉnh sửa (2026-10-26)
- Tùy chọn voice.pronunciation original/lexicon, giữ nguyên thuật ngữ trong bản mới.
- Thư viện raster/screenshot GitHub có provenance, logo người dùng chọn; đóng gói asset theo output.
- Scene media presentation background/card/logo, workflow/code-window, palette midnight, catalogue và JSON editor từng bố cục, preview bố cục 3 giây/cảnh không voice.
- Giữ HyperFrames; không tuyên bố nhập mọi repo Remotion. Xem docs/adr-visual-assets-and-templates.md.


### M5 bổ sung — gallery phong cách và độ bao phủ kiến thức (2026-10-26)
- Gallery 15 phong cách thích ứng từ mg-styles-15 + 2 native, poster nhẹ và một live preview renderer thực. Đổi pack giữ nguyên kịch bản.
- Đọc README đầy đủ trong giới hạn, không cắt còn bốn câu, không bịa khi fetch thất bại.
- Optional contentMode/targetDurationSec/coverage/templatePack; deep-dive tối đa 16 cảnh, legacy/overview vẫn tối đa 8.
- Một hook chính, lựa chọn thay thế không bắt buộc số lượng. Coverage sáu khía cạnh và cảnh báo đối chiếu; không tuyên bố đã audit toàn bộ code.
- Xem docs/adr-style-gallery.md và docs/huong-dan-chon-template.md.

### Cập nhật theo yêu cầu chủ dự án — 2026-10-26

Chế độ optional `directingMode: auto` cho 2–24 cảnh thay vì số cảnh cố định; checklist coverage không quyết định số cảnh. Thêm storyboard theo nguồn, native data-flow/worked-example/code highlight, đọc chọn lọc tài liệu repo, và `fitDuration` cân audio thật theo target. Mặc định Studio dùng từ điển, giữ nguyên chữ hiển thị, kênh DevPeek36 đọc “đép bít ba sáu”. Chi tiết: `docs/adr-repo-storyboard.md`.
