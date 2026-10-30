# ADR 0008 — Bộ cài Docker và hướng dẫn chuyển máy

Ngày: 2026-10-30. Trạng thái: chấp nhận thiết kế; trạng thái kiểm thử ghi riêng trong installation-validation.md.

Dùng Node 22 Debian bookworm, Chromium hệ thống, FFmpeg và Python venv chứa edge-tts 7.3.1. Giữ npm dev dependencies vì server chạy TypeScript qua tsx và HyperFrames cần toolchain runtime. Chromium được chỉ rõ cho cả browser manager và engine; dùng screenshot mode để không phụ thuộc HeadlessExperimental.beginFrame của headless-shell riêng. Không thêm dependency npm mới hoặc thay pipeline.

Compose chỉ bind localhost, dùng init để thu hồi process con và shm 1 GB. Named volumes giữ config/output/uploads/cache và runtime ZeroTTS. Cấu hình LLM giao diện có ưu tiên như native; không bake key, env, output hoặc venv host vào image. `.env.local` tùy chọn với Compose 2.24+, cho phép cấu hình qua UI ngay lần chạy đầu. ZeroTTS giữ bước cài riêng vì cần tải SDK/model lớn; không bật worker công khai hoặc tự đổi provider.

Đây là bộ cài local, chưa phải triển khai production nhiều người dùng. Named volumes không tự cập nhật config mặc định sau lần tạo đầu. Backup có thể chứa bí mật và không được đưa vào Git. Bản Linux container không sửa được các lỗi dịch vụ Edge, quota LLM hoặc nguồn tin bị chặn. Không bảo đảm SDK ZeroTTS trên mọi CPU khi chưa thử trực tiếp.
