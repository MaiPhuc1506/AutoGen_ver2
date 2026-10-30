import { spawn } from "node:child_process";
import { DEFAULT_HASHTAGS } from '../channel-defaults.js';
import { existsSync } from "node:fs";
import type { Script } from "../render/script-schema.js";
import type { PublishChecklistOptions } from "./types.js";

/**
 * Generate comprehensive publish checklist and description for TikTok/Reels/Shorts
 */
export function generatePublishChecklist(
  opts: PublishChecklistOptions,
  script?: Script
): string {
  const title = opts.suggestedTitle || script?.metadata?.title || "Video Tin Tức Công Nghệ";
  const channel = opts.channelName || script?.metadata?.channel || "DevPeek36";
  const sourceUrl = opts.sourceUrl || script?.metadata?.source?.url || "N/A";
  const sourceDomain = script?.metadata?.source?.domain || "Nguồn tin báo chí";

  const hashtags = opts.hashtags && opts.hashtags.length > 0
    ? opts.hashtags
    : DEFAULT_HASHTAGS;

  const hashtagsStr = hashtags.join(" ");

  return `# 🚀 Checklist & Hướng Dẫn Đăng Video TikTok / Reels / Shorts

---

## 1. Thông tin bài đăng (Copy dán nhanh)

### 📌 Tiêu đề & Caption gợi ý:
\`\`\`text
${title}! Xem ngay để không bỏ lỡ xu hướng công nghệ mới. 🔥

Nguồn: ${sourceDomain}
Kênh: ${channel}

${hashtagsStr}
\`\`\`

### 🏷️ Hashtag chính:
\`${hashtagsStr}\`

---

## 2. Quy định pháp lý & Chính sách nền tảng (Bắt buộc)

- [ ] **Gắn nhãn AI Content:** Theo chính sách hiện hành của TikTok và YouTube, bắt buộc phải bật tùy chọn **"Nội dung do AI tạo" (AI-generated content)** khi tải video lên để tránh bị bóp tương tác hoặc gắn cờ vi phạm.
- [ ] **Ghi công nguồn gốc:** Video được biên tập tự động từ nguồn: \`${sourceUrl}\`.
- [ ] **Bản quyền hình ảnh / âm thanh:**
  - Nhạc nền (BGM): Đã mix ducking tự động, sử dụng thư viện bản quyền miễn phí (CC0 / YouTube Audio Library).
  - Media / Ảnh minh họa: Lưu trữ tại \`media/media.json\`. Nếu có sử dụng ảnh từ báo gốc (\`og:image\`), hãy kiểm tra quyền tác giả hoặc chỉ dùng làm ảnh thumbnail trích dẫn.

---

## 3. Checklist kiểm tra kỹ thuật trước khi bấm Đăng (Pre-flight QA)

- [ ] **Khung hình chuẩn:** Video đúng tỷ lệ 9:16 (1080×1920), không bị viền đen lệch cạnh.
- [ ] **Âm thanh & Ducking:** Giọng đọc AI rõ chữ, phát âm chuẩn (đã qua từ điển Lexicon), BGM tự động nhỏ lại khi có giọng và nổi lên ở khoảng nghỉ.
- [ ] **Safe-Zone TikTok:** Phụ đề và số liệu quan trọng không bị che bởi cụm nút Thả tim / Bình luận ở cạnh phải và caption ở cạnh đáy.
- [ ] **Ảnh bìa (Cover Thumbnail):** Đã chọn khung hình ấn tượng từ file \`cover.png\`.
- [ ] **Chính xác số liệu:** Đã đối chiếu các con số (giá bán, cấu hình, ngày tháng) với nguồn gốc qua file \`script.review.md\`.

---
*Tạo tự động bởi Auto_GenVid v2.0 Studio.*
`;
}

/**
 * Extract a high-quality 1080x1920 cover frame from a rendered MP4 using ffmpeg
 */
export async function extractCoverFrame(
  videoPath: string,
  outCoverPath: string,
  timestampSec: number = 1.0
): Promise<string> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found for cover extraction: ${videoPath}`);
  }

  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss", timestampSec.toFixed(2),
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", "2",
      outCoverPath,
    ];

    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code === 0 && existsSync(outCoverPath)) {
        resolve(outCoverPath);
      } else {
        reject(new Error(`ffmpeg extractCoverFrame failed (exit ${code}): ${stderr}`));
      }
    });

    proc.on("error", reject);
  });
}
