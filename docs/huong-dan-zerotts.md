# Dùng ZeroTTS trên Auto Gen

Máy hiện tại đã cài model và chạy thử thành công. Mở lại hoặc tải lại http://localhost:3002/ để nhận giao diện mới.

1. Chọn **ZeroTTS**, chọn giọng **Quang Minh** trước. Có thể đổi sang một trong tám giọng đã tích hợp.
2. Giữ chế độ từ điển phát âm. Nhập một đoạn có các tên riêng cần kiểm tra, rồi bấm **Nghe thử**.
3. Dán link GitHub, chọn thời lượng và template như workflow hiện tại, sau đó tạo kịch bản.
4. Ở phần kiểm tra phát âm, giữ chữ tiếng Anh nguyên bản trên màn hình, chỉ chỉnh cách đọc trong từ điển của video nếu cần. OpenDesign đã đặt là `ô bình đi zai`, Agent là `ây chình`, DevPeek36 là `đép bít ba sáu`.
5. Nghe thử rồi render. Bản video đã render từ trước không tự thay giọng; phải render bản mới.

ZeroTTS không cần API key. Gemini vẫn phụ trách kịch bản/hook theo cấu hình hiện có. Lần đầu khởi động model có thể phải chờ; các lần sau dùng lại worker đang chạy. Nếu engine lỗi, web báo lỗi thay vì tự đổi sang giọng khác.

Với máy mới, chạy trong thư mục project:

```sh
npm run zerotts:setup
```

Script tạo môi trường Python riêng và tải model một lần. Có thể đặt `ZEROTTS_BOOTSTRAP_PYTHON` nếu máy có Python ở đường dẫn khác. Cổng 7821 là worker nội bộ; giao diện vẫn dùng cổng 3002. CLI có thể dùng `TTS_PROVIDER=zerotts` và `ZEROTTS_VOICE=quangminh`; script có trường `voice` tiếp tục dùng lựa chọn đã lưu của nó.

Tên riêng tiếng Anh mới vẫn nên nghe thử và bổ sung từ điển khi cần; ZeroTTS không thay thế bước kiểm tra phát âm.
