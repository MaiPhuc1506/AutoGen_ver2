# Giả định khi tích hợp Voice Studio

- Phạm vi đã duyệt là bản đầu: import voice, chọn giọng/tốc độ, một phong cách gần video mẫu; chưa chuyển toàn bộ 15 phim mẫu.
- Dùng MP3/WAV cả bài, SRT tùy chọn, mốc cảnh người dùng có thể chỉnh. Chưa bổ sung mô hình nhận dạng/căn lời nặng.
- Chọn giọng bằng nghe thử, không tự xác nhận giọng trong video mẫu thuộc provider cụ thể.
- Các server hiện có ở 3000/3001 được giữ nguyên; bản thử dùng 3002.
- Chưa có credential trả phí được cấp riêng cho việc nghiệm thu nên kiểm thử Vbee/ElevenLabs/LucyLab qua fake/mock; Edge đã gọi thật.


### Gemini draft and Edge timeout repair (2026-10-25)
- Send the actual Zod JSON schema with every LLM generation; reject review_60 drafts with fewer than six scenes. Do not silently fall back when a configured AI fails validation.
- Prefer the installed Python Edge client in production after the JavaScript websocket timed out. Word timing stays low accuracy for Python, with existing SRT/estimated timing handling.
- Validation: TypeScript passes; 32 test files / 178 tests pass. Live Gemini draft returned generation.mode=ai; review retry produced six scenes. Real pipeline render after Python-first fix: output/muoi-lam-phong-cach-do-hoa-chuyen-dong-20261025163555-57ef3eeb/video.mp4, ffprobe 1080x1920 + audio, 28.0s. This smoke render used the earlier five-scene draft and does not validate final 60s duration; the later prompt requests 190–220 Vietnamese syllables, actual length still depends on TTS.

## 2026-10-26 · Auto storyboard
- “Không gò sáu phần hook” được hiểu là số cảnh linh hoạt theo thời lượng; giữ một opening và một ending, coverage chỉ là checklist.
- “Đúng số giây” áp dụng khi bật cân thời lượng với TTS; audio tải lên giữ nguyên. Mục tiêu MP4 trong sai số một frame, không chèn dài hoặc cắt mất câu khi lời lệch quá xa.
- Minh họa dựa trên source bằng native layouts trước; chưa quay demo hay chạy code GitHub.

## 2026-10-26 · Outro Follow
- Yêu cầu animation đăng ký được dựng thành thẻ Follow trong video, không kết nối tài khoản hay tự follow thật.
- Tên hiển thị và handle theo kênh của bản dựng; DevPeek36 là mặc định. Dùng monogram DP thay vì gắn ảnh tác giả gốc cho kênh của người dùng.

## 2026-10-30 · Ví dụ cách repo hoạt động
- Bản GitHub mới dùng ba mức giải thích: giữ hook tên/sao ngắn, đưa worked-example đầu tiên lên ngay sau hook trước khi đo TTS; scene ID và coverage giữ nguyên. JSON cũ/import không bị ép cấu trúc mới.
- Ưu tiên 1/2/3 ví dụ ở mức nhanh/vừa/kỹ khi nguồn và thời lượng cho phép. Không bắt buộc đủ số lượng bằng ví dụ bịa; ít nhất một tình huống minh họa có bằng chứng chức năng từ nguồn, trừ nguồn hoàn toàn không mô tả chức năng.
- Nhãn conceptual là ví dụ giải thích, không phải chạy repo. Kiểm tra trích dẫn chỉ xác nhận chuỗi có trong nguồn, không thay thế kiểm chứng ngữ nghĩa hay chạy demo thật.

## 2026-10-30 · Edge outage and duration repair
- A failed range measurement must retain the preferred writing budget (75s for standard) for the next narration repair. Only an accepted measurement replaces targetDurationSec with the natural duration.
- Audio-service failures are separate from script/schema failures: keep draft-unmeasured.json, return a retryable voice-stage 503, and do not ask Gemini to rewrite the script due to an Edge outage.
- Edge retries are bounded: two Python attempts (20s each), then two JavaScript attempts (12s each). All scene requests settle before a new measurement; successful content-addressed audio stays cached. Never silently switch the user's voice or provider.
- Studio clears its ongoing-generation status when the request fails. Diagnostic check observed NoAudioReceived initially, then a successful real Nam Minh +20% sample with high-accuracy word boundaries in 5.261s.
- “Tin nhanh” is an explicit one-click selection of creative news + quick explanation level (≤60s, no minimum filler target). Save depth/structure locally so a page reload cannot silently switch it back to standard 75s. Existing longer levels remain selectable.
