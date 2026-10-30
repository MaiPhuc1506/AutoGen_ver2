# Nam Minh mặc định + chuẩn hóa phát âm tiếng Việt

Cập nhật theo yêu cầu tiếp theo của người dùng: mặc định hiện tại là **Nam Minh 1,20×**. ZeroTTS và các giọng/tùy chọn khác giữ nguyên. Các đoạn kiểm chứng 1,10× bên dưới là lịch sử của lượt tối ưu phát âm; mẫu tốc độ mới ở `output/nam-minh-1_2-validation`.

Người dùng chọn chất giọng của clip hook sao làm giọng chính. Giọng đó là Edge TTS `vi-VN-NamMinhNeural`, tốc độ1,10×, pronunciation=original ở clip trước.

## Quyết định

- Video mới từ Studio, generator AI và source-only mặc định Nam Minh 1,10× với `voice.pronunciation: smart`, `settingsSource: script`. Không sửa .env.local, không đổi voice của dự án cũ đã chọn rõ provider/mode hoặc audio tải lên. ZeroTTS vẫn là lựa chọn.
- Tận dụng đúng bộ chuẩn hóa text của zerotts **package0.1.5**, tách khỏi việc tổng hợp giọng. Module stdlib và dữ liệu từ viết tắt được đóng gói tại `assets/third-party/zerotts-text-norm/`, có manifest SHA256, MIT license ZeroWeight và soe-vinorm, cùng NOTICE upstream. Không nhầm package version với commit của model trên Hugging Face.
- Helper Python3 chỉ nạp file chuẩn hóa qua importlib; không import package zerotts, ONNX, torch, model, không gọi mạng. Không cần cài ZeroTTS hoặc tải model để dùng Nam Minh smart. Python3 vốn đã dùng ở Edge fallback; lỗi helper được báo, không âm thầm đọc raw.
- `src/tts/smart-pronunciation.ts`: bảo vệ URL/email/code, các cách đọc từ điển và override của người dùng; nhận diện version theo ngữ cảnh; mở rộng một số đơn vị công nghệ, K sao, tiền tệ, kích thước; chuẩn hóa số/ngày/giờ/phần trăm theo Zero rules; fallback đánh vần acronym chưa có. Số thập phân dấu chấm được đổi thành cách đọc “phẩy”, version giữ “chấm”. Không dùng LLM để đoán/sửa dữ kiện.
- Từ điển cá nhân ưu tiên hơn cách đọc bổ sung. Không thay `config/lexicon.json` của người dùng. Thuật ngữ/tên repo chưa có vẫn cần nghe và chỉnh qua từ điển, không hứa mọi tên riêng đều đúng.
- Nghe thử, báo cáo phát âm và cached TTS dùng chung `prepareSpeechText`; report hiển thị đúng chuỗi gửi TTS. Cache hash có chuỗi đã chuẩn hóa và revision; đổi mode/cách đọc sẽ tạo lại audio.
- Captions và template giữ văn bản gốc. Khi chuẩn hóa thay đổi số lượng từ, timestamp provider không được dùng giả làm high cho chữ gốc; cache trả timing ước lượng low. Cải thiện alignment giữa chữ gốc và audio nằm ngoài lượt này.

## Ví dụ đã chạy

| Văn bản gốc | Cách gửi TTS trong smart |
| --- | --- |
| 29.9K sao | hai mươi chín phẩy chín nghìn sao |
| RAM 16GB | ram mười sáu gi ga bai |
| 120ms | một trăm hai mươi mi li giây |
| Node.js 22.10 | nốt chấm gi ét hai mươi hai chấm mười |
| 29/10/2026 | hai mươi chín tháng mười năm hai nghìn không trăm hai mươi sáu |
| 1.250.000đ | một triệu hai trăm năm mươi nghìn đồng |
| 12,5% | mười hai phẩy năm phần trăm |

## Artifacts

`output/nam-minh-smart-validation/before-original.mp3`: cùng câu, Nam Minh 1,10× nguyên bản.
`voice/scene-hook.mp3`: cùng câu, Nam Minh 1,10× chuẩn hóa smart.
`pronunciation-review.json`: cặp original/spoken, duration và accuracy thực tế.
`video.mp4`: render hai cảnh giữ caption nguyên văn; dữ kiện chỉ là câu kiểm tra phát âm, không phải số liệu sản phẩm.

Câu thử: “29.9K sao trên GitHub. RAM 16GB, phiên bản v1.2.3.” Cảnh sau thử ngày tháng và phần trăm. Không sao chép audio/model/giọng ZeroTTS. Chưa nghe hoặc chứng minh chất lượng bằng chấm điểm ASR/MOS; người dùng cần nghe cặp audio để đánh giá tên riêng/chất giọng.

Kết quả kiểm chứng cuối sẽ ghi dưới đây. Không commit; diff riêng của lượt này tại `docs/smart-nam-minh-changes.patch`.


## Kết quả cuối thực tế

```text
npx tsc --noEmit: exit 0
npm test: 49 files passed, 238 tests passed; exit 0; 25,10 giây
node --check public/studio.js / public/app.js: exit 0
git diff --check: exit 0
ffprobe MP4: 1080×1920, 30/1 fps, có audio; 12,833333 giây
```

Có kiểm thử số/ngày/giờ/phần trăm/version/đơn vị; bảo vệ link/email/code và collision placeholder; ưu tiên override; giữ original/lexicon; báo lỗi khi helper không chạy; API review trả đúng text gửi TTS; cache thay đổi khi đổi mode hoặc override; captions giữ chữ gốc và timing low khi có biến đổi. Xem log cạnh MP4. Bộ test không gọi TTS/LLM thật.

Đã tạo TTS thật cho cặp before-original.mp3 / after-smart.mp3 với cùng đầu vào và cùng voice/rate. Render hai cảnh bằng voice smart; xem frame caption-original.png xác nhận chữ 29.9K/GitHub không đổi thành phiên âm. Browser QA xác nhận Edge Nam Minh,1,10× và smart được chọn mặc định; ảnh studio-defaults.png. Không sửa API key hoặc .env.local. Server QA riêng cổng3004 được dừng sau khi kiểm tra.

Bổ sung tùy chọn `--workers=1` cho rerender để có thể giảm tiến trình Chrome khi cần; lần kiểm chứng này hoàn thành với hai worker,117,1 giây. Chưa kiểm chứng riêng lượt mới bằng một worker; mặc định vẫn là hai.


Kiểm chứng mặc định 1,20×: voiceConfig trả `vi-VN-NamMinhNeural`, speed1.2, rate+20%; tsc exit0, 49 files/238 tests pass. Mẫu `output/nam-minh-1_2-validation/video.mp4` render thật một worker thành công54,6 giây; ffprobe1080×1920, có audio,5,10 giây. Không đổi ZeroTTS hoặc giọng đã lưu trong dự án cũ.
