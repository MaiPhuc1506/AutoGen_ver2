# Kiểm tra nâng cấp hook và Dynamic — 25/10/2026

## Đã thay đổi

- `src/script/hooks.ts`: phân tích câu từ nguồn, gợi ý mở đầu theo lợi ích/số liệu/giới hạn; giới hạn chữ trên hình.
- `src/utils/script-generator.ts`: thay placeholder quảng cáo và số giả bằng dữ liệu thực trong nguồn.
- `src/script/prompts/system-prompt.ts`, `src/server.ts`: yêu cầu hook cụ thể và payoff, dùng nội dung đã được người dùng duyệt, thông báo rõ AI/source-only/imported.
- `src/render/html-composer.ts`, `animations.js`, `styles.tech-editorial.css`: cụm chữ, chữ số, gạch nhấn, thẻ đánh số, grid/orb/particles, sweep, progress; render theo thời gian, không dựa timer/random.
- `src/assets/editorial-sfx.ts`, pipeline: hiệu ứng âm thanh ngắn tổng hợp cục bộ, bật/tắt; ưu tiên SFX ghi rõ từng cảnh.
- Web: Dynamic/Calm và âm thanh nhấn cảnh; lựa chọn hook ở bước duyệt. Script cũ không có motionPreset giữ animation cũ.

## Kết quả

- `npx tsc --noEmit`: exit 0.
- `npm test`: **32 test files passed; 177 tests passed**, exit 0.
- `node --check` cho studio.js, app.js, animations.js: exit 0.
- `git diff --check`: exit 0.
- Browser: không có lỗi JavaScript; tua 1,25 → 10 → 1,25 giây giữ đúng vị trí chữ. Đã xem ảnh hook, stat và feature-list.
- Browser chọn hook: 3 phương án; hook đầu “Một câu mô tả, ra cả design system?”; bấm phương án số liệu đổi lời thành “Có 161 bảng màu theo ngành.”. Có thông báo chế độ source-only.
- Mobile: viewport 390px, document width 390px.
- Video mới: `output/studio-dynamic-v2-7z9_0m0v/video.mp4`.
- ffprobe: **1080×1920, 30/1 fps, có audio, 19,466667 giây**.
- Pipeline tạo 5 SFX và render đủ 584 frame. Bản đầu 638 dòng HTML có cảnh báo chia nhỏ composition của HyperFrames nhưng render thành công, được xác minh bằng ffprobe trước khi xuất.

## Tiêu chí

| Tiêu chí | Trạng thái |
|---|---|
| Có lựa chọn hook và thao tác thay lời thật | Đạt: browser |
| Fallback không thêm tính năng/số liệu quảng cáo | Đạt: test nguồn có số/không số/nguồn phủ định |
| Dynamic khác Calm và vẫn tua đúng | Đạt: markup regression + browser |
| Có âm thanh nhấn cảnh bật/tắt | Đạt: tổng hợp FFmpeg + pipeline |
| Video dọc có audio, thời lượng hợp lý | Đạt: render thật và ffprobe |
| Hook do LLM thật tạo | Chưa kiểm tra: cấu hình web hiện `no_key` |
| Hiệu quả giữ chân hoặc đẹp ngang video tham chiếu | Chưa thể khẳng định; cần người dùng xem bản mẫu và nội dung thực |

## Cách thử

Tải lại http://localhost:3002 → Tech Editorial → Dynamic. Chuẩn bị kịch bản, chọn hook, duyệt rồi render. Bản video cũ không tự thay đổi hình. Có thể tắt âm nhấn cảnh hoặc chọn Calm để giảm chuyển động. Cấu hình LLM nếu muốn AI viết lại nội dung thay vì chỉ lấy câu trong nguồn.
