# Background Music (BGM) Library

Thư mục này chứa nhạc nền cho video.

## Quy tắc bản quyền
- Không đưa nhạc có bản quyền vào repository.
- Sử dụng nhạc Creative Commons (CC0 / CC-BY) hoặc nhạc từ các kho miễn phí bản quyền:
  * YouTube Audio Library (miễn phí sử dụng)
  * Free Music Archive
  * Pixabay Music
  * Incompetech (Kevin MacLeod)

## File mẫu đi kèm
- `devpeek36-soft-tech.mp3`: Nhạc mặc định DevPeek36, instrumental 80 BPM, dài 24 giây để lặp. Pad, pluck, bass và nhịp gõ được tổng hợp nguyên bản bằng `node scripts/create-soft-tech-bgm.mjs`; không lấy sample, vocal hay nhạc từ TikTok. Âm thanh tạo ra được cung cấp theo CC0; mã tạo nhạc theo giấy phép MIT của repo.
- `ambient-tech.mp3`: Đoạn âm thanh nền ambient 220Hz tổng hợp bằng FFmpeg (CC0 / Public Domain), dùng cho kiểm thử và làm nhạc nền nhẹ nhàng.

Mọi template dùng nền mặc định khi script chưa khai báo `bgm`. Bật/tắt trên web bằng “Nhạc nền nhẹ · tự giảm khi có giọng nói”, hoặc đặt `bgm: {"enabled": false}` trong script. Âm thanh nguồn được cân mức theo narration; gain mặc định 0.16, giảm dần về floor 0.06 khi có tiếng nói, fade đầu/cuối và limiter tránh quá đỉnh. File giọng/SFX trước nhạc được giữ tại `voice-before-bgm.mp3` để không chồng nhạc hai lần khi sửa bản dựng.

