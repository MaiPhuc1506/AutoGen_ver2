# Kết quả kiểm tra Voice Studio — 25/10/2026

## Thay đổi

- Web: `public/studio.js`, `public/index.html`, `public/app.js`, `public/styles.css`: voice upload/AI, tốc độ, nghe thử, preview phong cách, duyệt lời/chữ/mốc cảnh, hỗ trợ màn hình nhỏ.
- Core: `src/studio/*`, `src/config.ts`, `src/pipeline.ts`, `src/server.ts`: upload có kiểm tra, giọng theo từng video, cache theo nội dung/cấu hình, SRT, dữ liệu timeline.
- Render: `src/render/html-composer.ts`, `src/render/templates/animations.js`, `styles.tech-editorial.css`: preset mới; font Be Vietnam Pro và GSAP cục bộ. `hyperframes-runner.ts`: file tạm và ffprobe trước khi thay MP4 cũ.
- `src/tts/edge-tts-client.ts`: tham số âm dùng cú pháp CLI an toàn và giới hạn thời gian fallback Python.
- Schema, fixture, test và tài liệu tương ứng. Giữ phần thay đổi trước đó của người dùng trong app/index; phần runner mở rộng cơ chế chống CLI treo hiện có bằng kiểm tra file mới thực sự hoàn chỉnh.

## Kết quả thực tế

- `npx tsc --noEmit`: exit 0.
- `node --check public/studio.js`, `node --check public/app.js`: exit 0.
- `npm test`: **30 test files passed, 171 tests passed**, exit 0.
- `git diff --check`: exit 0.
- Edge thật qua `/api/studio/preview`: Nam Minh 1.10x, MP3 dài 4,176 giây; Hoài My 0.80x, MP3 dài 5,4 giây.
- Chrome headless: UI không có lỗi JavaScript; viewport 390 px có document width 390 px; chọn upload, upload MP3, phát audio (`readyState=4`), nhập SRT, duyệt 5 cảnh, chỉnh mốc, gọi render HTTP 200.
- Bản chia SRT cuối: cảnh đầu giữ trọn “Một câu mô tả. Một giao diện rõ ràng.”; mốc tự lấy 4,26 / 7,12 / 10,53 / 13,65 giây; player hiển thị trong hộp duyệt.

## Hai lần render thực

1. TTS Edge và Tech Editorial:
   `output/thiet-ke-theo-nhip-loi-doc-20261025151050-82431429/video.mp4`
   ffprobe: H.264, **1080×1920**, **30/1 fps**, AAC audio, **18,333333 giây**.
   Đã render lại tại cùng đường dẫn bằng runner mới: tạo MP4 tạm riêng, capture đủ 550 frame, ffprobe đạt rồi thay MP4 cũ. Exit 0; log `Rendered and verified`.
2. MP3 upload + SRT qua giao diện web:
   `output/voice-tai-len-kiem-tra-studio-20261025151630-f6cb7212/video.mp4`
   ffprobe: **1080×1920**, **30/1 fps**, có audio, **18,266667 giây**.
   Audio gốc dài 17,64805 giây; phần còn lại là hold cuối cảnh.

Đã xem ảnh cover/render và ảnh UI desktop/mobile. Runtime HyperFrames có cảnh báo HTML dài và một số request phụ 404 không chặn render. Không dùng cảnh báo đó làm bằng chứng chất lượng; xác minh video thật bằng ffprobe và ảnh render.

## Tiêu chí

| Tiêu chí | Trạng thái |
|---|---|
| Upload MP3/WAV, kiểm tra nội dung/giới hạn | Đạt: UI MP3 + test WAV/invalid payload |
| Tốc độ/giọng theo từng video, preview | Đạt với Edge thật, provider khác qua test/fake |
| Cache thay đổi khi sửa text/voice/speed | Đạt: regression test |
| Duyệt lời, chữ chính, mốc cảnh | Đạt: browser flow |
| Nhập SRT, không gắn nhãn word timing ước lượng thành chính xác | Đạt: test + output timing-quality.json |
| Một phong cách mới, kịch bản v1 tương thích | Đạt: render + fixture regression |
| Render mới và render lại có video/audio hợp lệ | Đạt: ffprobe + regression verifier |
| Giọng trả phí gọi API thật | Chưa kiểm tra: chưa có credential phục vụ nghiệm thu |
| Chất giọng đúng người trong video mẫu | Chưa xác định; không cam kết tương đồng tuyệt đối |

## Cách chạy và phần còn lại

Xem `docs/huong-dan-voice-studio.md`. Bản bàn giao chạy tại http://localhost:3002 . Bản đầu chỉ có Tech Editorial và Classic, chưa nhập toàn bộ 15 demo. Chưa có forced alignment; không SRT thì thời gian là ước lượng. Chưa tự tạo nhạc/SFX nếu thư viện không có file.
