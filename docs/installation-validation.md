# Kiểm tra bộ cài và tài liệu

Ngày: 2026-10-30. Phạm vi: README, Dockerfile, Compose, dependencies Python Edge và quy tắc bỏ qua dữ liệu riêng. Không thay workflow tạo nội dung trong lần cập nhật này.

## Kết quả đã xác minh

- `npx tsc --noEmit`: exit 0.
- `npm test -- --testTimeout=30000 --maxWorkers=1`: **63 test files, 334 tests passed**, 61.52 giây. Cần quyền socket/IPC local để chạy các test server/CLI; lần chạy bị giới hạn sandbox trước đó không dùng làm kết quả chấp nhận.
- `docker compose config -q`: exit 0, Compose 2.40.3-desktop.1. Kiểm tra cấu hình này không cần daemon và không chứng minh image chạy được.
- `git diff --check -- README.md .env.example .gitignore`: exit 0.
- TypeScript/tests chạy trên macOS, Node 25.8.2 có sẵn. Image khai báo Node 22; chưa dùng kết quả host để suy ra container đã được kiểm thử.

## Giới hạn Docker

Docker CLI có sẵn, nhưng Docker Engine không trả lời `docker info` trong 15 giây, kể cả sau khi mở Docker Desktop. `docker compose build` cũng không phản hồi trong giới hạn thử 35 giây. Không có build log thành công, không có container HTTP/renderer test thành công trong lần kiểm tra này. Chưa thể xác nhận image trên Linux amd64/arm64 hoặc ZeroTTS trong container.

Cần chạy lại trên máy có engine hoạt động: `docker info`, `docker compose up -d --build`, `docker compose ps`, mở Studio, cấu hình key rồi tạo một video ngắn. Kiểm tra MP4 bằng ffprobe. Không thay mạng/quyền truy cập hoặc reset dữ liệu Docker để xử lý daemon trong phạm vi cập nhật này.

## Render thực tế

Render thật qua HyperFrames đã hoàn tất (exit 0), 258 frames trong khoảng 1 phút 48 giây trên máy kiểm tra. ffprobe xác nhận **1080×1920, H.264, 24 fps, audio AAC, 10.750 giây**. Đây là render lại composition và audio đã có, không phải phép thử tạo nội dung/giọng mới hoặc kiểm thử container. Có các cảnh báo lint/font mapping và 404 không chặn; kết quả này không xác nhận mọi tư liệu/kiểu chữ giống nhau trên mọi máy. Log local nằm trong `.cache/installation-validation/` và không đưa vào Git. Một lần thử chạy lại toàn pipeline từ fixture cũ đã gọi đo giọng lại và gặp Edge TTS timeout; không tính đó là render thành công hay hứa dịch vụ Edge đã ổn định. Phép thử renderer sau đó dùng composition cùng audio đã có, tách khỏi các dịch vụ ngoài.

## Bảo vệ dữ liệu

Không đọc/in/chuyển API key hiện tại vào tài liệu/image. `.env.example` để trống credential. `.dockerignore` loại env, config/llm.json, output, cache, upload, venv/model host và backup. `.gitignore` bổ sung cache/backup. LICENSE và credit gốc giữ nguyên. Backup có thể chứa key, phải giữ riêng.
