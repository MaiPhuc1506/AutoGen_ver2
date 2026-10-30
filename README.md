# Auto Video Gen · DevPeek36

Studio chạy trên máy cá nhân để tạo video tiếng Việt dọc **1080×1920** từ link bài viết, GitHub repo hoặc tư liệu của bạn. Có AI News Radar để tìm nội dung, AI viết kịch bản, giọng đọc, phụ đề theo lời nói, storyboard và xuất MP4 bằng HyperFrames/FFmpeg.

Đây là bản mở rộng của Auto News Video. Luồng nên dùng hiện tại là **Radar/link → Studio → duyệt kịch bản → render → tải video**. Không cần Claude hoặc Codex để vận hành sau khi cài; việc sinh kịch bản vẫn cần dịch vụ LLM và khóa riêng của bạn.

## 1. Cần cài những gì?

| Cách chạy | Cần cài trên máy | Đã có trong bộ Docker |
| --- | --- | --- |
| Docker, khuyên dùng khi chuyển máy | Git, Docker Desktop hoặc Docker Engine + Compose **v2.24 trở lên** | Node 22, npm dependencies, Chromium, FFmpeg/ffprobe, Python 3 và Edge TTS |
| Chạy trực tiếp | Git, Node.js **22+**, npm, FFmpeg/ffprobe, Chromium/Chrome, Python **3.11+** và venv | Không áp dụng |

Cần Internet để lấy nguồn, gọi Gemini/LLM và Edge TTS. Nên có tối thiểu 8 GB RAM, khuyến nghị 16 GB khi render, và vài GB trống; ZeroTTS cần thêm dung lượng tải model. Đây là khuyến nghị vận hành, không phải cam kết tốc độ.

- **Bắt buộc khi dùng AI viết kịch bản:** API key của Gemini hoặc nhà cung cấp LLM đã chọn. Quyền dùng ChatGPT/Codex không thay cho API key của dịch vụ này.
- **Không cần key:** Edge TTS Nam Minh, nhiều nguồn RSS/API công khai của Radar. Dịch vụ miễn phí vẫn có thể giới hạn hoặc tạm ngừng.
- **Tùy chọn:** ZeroTTS local; key ElevenLabs/Vbee/LucyLab; GitHub/Reddit/X token nếu cần nguồn tương ứng. Không phải cài tất cả.

## 2. Clone và chạy bằng Docker

```bash
git clone https://github.com/MaiPhuc1506/AutoGen_ver2.git
cd AutoGen_ver2
cp .env.example .env.local
docker compose up -d --build
```

Mở [Studio trên máy](http://localhost:3000). Trong trang, chọn **Đổi Model / API Key**, cấu hình nhà cung cấp/model/key và kiểm tra kết nối. Có thể điền key trong `.env.local` trước khi khởi động thay vì dùng giao diện.

Lần build đầu tải Linux packages và npm/Python dependencies nên lâu hơn các lần chạy sau. Chưa có image phát hành sẵn; lệnh trên build từ mã nguồn hiện tại. Kiểm tra tình trạng:

```bash
docker compose ps
docker compose logs --tail=100 -f app
# Dừng, giữ dữ liệu:
docker compose down
# Chạy lại:
docker compose up -d
# Sau khi cập nhật source:
git pull
docker compose up -d --build
```

Nếu cổng 3000 đang được dùng, tạo file `.env` cạnh `compose.yaml` với `WEB_PORT=3005`, rồi chạy lại và mở `http://localhost:3005`. `.env` trong ví dụ này phục vụ Compose; cấu hình ứng dụng đặt trong `.env.local` hoặc giao diện.

Docker chỉ mở cổng trên **127.0.0.1**, dành cho sử dụng cá nhân. Studio có chức năng lưu API key và đọc/ghi file; chưa có lớp xác thực để đưa thẳng lên Internet.

### Dữ liệu và chuyển máy

Compose dùng named volumes cho `config`, `output`, file upload, cache giọng và ZeroTTS. Chúng tồn tại sau `docker compose down`; **`docker compose down -v` xóa các volumes này**. Không mount `node_modules`/venv từ macOS hoặc Windows sang container Linux.

- Clone source trên máy mới **không mang theo API key, video, upload hoặc thiết lập trình duyệt**. Thiết lập giọng/độ dài lưu ở trình duyệt cũng cần chọn lại.
- Các file mặc định trong `config/` được chép vào volume ở lần tạo đầu. Rebuild image không ghi đè cấu hình đã lưu trong volume.
- Sao lưu dữ liệu ra một thư mục riêng trước khi chuyển máy:

```bash
mkdir -p backup/config backup/output backup/uploads
docker compose cp app:/app/config/. backup/config/
docker compose cp app:/app/output/. backup/output/
docker compose cp app:/app/.uploads/. backup/uploads/
```

Thư mục backup có thể chứa key trong `config/llm.json` và tư liệu cá nhân: giữ riêng, không commit. Trên máy mới khởi động container rồi dừng dịch vụ ứng dụng để phục hồi bằng container tạm dùng cùng volumes:

```bash
docker compose stop app
docker compose run --rm --no-deps -v "$PWD/backup:/backup:ro" app \
  sh -c 'cp -R /backup/config/. /app/config/ && cp -R /backup/output/. /app/output/ && cp -R /backup/uploads/. /app/.uploads/'
docker compose up -d
```

Các lệnh backup trên dùng shell macOS/Linux/WSL. Cache có thể tạo lại; không cần chuyển venv/model giữa hai hệ điều hành.

### ZeroTTS trong Docker — tùy chọn

Giọng mặc định vẫn là **Edge TTS · Nam Minh · 1.2×**. ZeroTTS không bị bỏ đi. Nếu muốn dùng local, sau khi app khởi động:

```bash
docker compose exec app npm run zerotts:setup
```

Lệnh cài SDK ZeroTTS 0.1.5 vào venv riêng và tải model thật, có thể khá lâu. Sau đó chọn ZeroTTS trong Studio. Model/runtime được giữ trong volumes riêng, không mở cổng worker ra ngoài. Khả năng cài SDK/hiệu năng ONNX phụ thuộc CPU và nền tảng; xem [hướng dẫn ZeroTTS](docs/huong-dan-zerotts.md). Sau khi nâng phiên bản Python/base image có thể cần tạo lại **riêng volume venv**; không xóa toàn bộ volumes dữ liệu để sửa môi trường Python.

## 3. Chạy trực tiếp, không dùng Docker

Trên macOS có Homebrew:

```bash
brew install node@22 ffmpeg python@3.12
export PATH="$(brew --prefix node@22)/bin:$(brew --prefix python@3.12)/libexec/bin:$PATH"
# Cài Google Chrome/Chromium nếu máy chưa có trình duyệt này.
```

Đảm bảo `node --version` là 22 trở lên và `ffmpeg`, `ffprobe`, `python3` có trong PATH. Trên Linux cài các gói tương đương bằng package manager. Windows nên dùng Docker Desktop/WSL2; một số script bash/Python không được kiểm thử trên Windows native.

Sau khi clone:

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-edge.txt
cp .env.example .env.local
npm start
```

Giữ venv được kích hoạt trong terminal chạy server để helper Python đọc giọng/căn từ dùng đúng dependencies. Mỗi lần mở terminal mới: `source .venv/bin/activate` rồi `npm start`. Mở [localhost:3000](http://localhost:3000).

HyperFrames có thể tìm Chrome trên máy hoặc tải browser ở lần chạy đầu. Nếu không tìm được, chỉ rõ executable:

```bash
# Ví dụ Linux; macOS trỏ tới executable thực tế trong Chrome.app.
export HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium
npm start
```

ZeroTTS native: `npm run zerotts:setup`, sau đó chọn giọng trong Studio. Không bắt buộc cài để dùng Edge.

## 4. Cấu hình một lần

1. **LLM:** chọn Gemini, nhập key/model có quyền truy cập; cấu hình đang dùng là `gemini-flash-lite-latest`. Model/quota có thể thay đổi theo tài khoản. Có thể chọn OpenAI, Anthropic hoặc endpoint tương thích OpenAI trong phần cấu hình hiện có.
2. **Kênh:** sửa tên hiển thị, handle và logo nếu cần. Giá trị hiện tại của bản dựng là DevPeek36.
3. **Giọng:** nguồn giọng AI → Edge TTS → Nam Minh → **1.20×**, xử lý phát âm thông minh. ZeroTTS vẫn là lựa chọn riêng, không tự chuyển khi Edge lỗi.
4. **Xuất:** `Nhanh · 1080p, 24 fps` phù hợp để thử. Đây là tốc độ khung hình xuất, không phải độ dài nội dung.
5. Bật tự dựng theo nội dung, tự viết/đo giọng/căn thời gian, phụ đề theo lời đọc; nhạc nền nhẹ tự giảm khi nói và SFX có thể tắt tùy nhu cầu.

**Ưu tiên cấu hình:** LLM đã lưu qua giao diện nằm trong `config/llm.json`, có ưu tiên hơn biến LLM trong `.env.local`. Với Docker, file này nằm trong volume `app-config`. Thay key trong env nhưng vẫn dùng key cũ thì kiểm tra cấu hình trên giao diện. Không đưa key vào Git hoặc Dockerfile; `.dockerignore` loại các file bí mật khỏi build context.

`.env.example` để trống các key. Chỉ điền dịch vụ cần dùng. `EDGE_TTS_RATE=+0%` là cấu hình CLI cũ; Studio tự áp dụng 1.2× theo video, không cần cộng thêm +20% ở env.

## 5. Workflow tạo video đang dùng

### A. Video giới thiệu GitHub repo

1. Dán URL repo công khai → **Quét Dữ Liệu**. Kiểm tra đúng repo và nguồn README đã lấy được.
2. Chọn template/phong cách mong muốn; bật tự lấy ảnh khi tạo video từ GitHub. Ảnh/logo dự án được ưu tiên khi xác định được; avatar tác giả không mặc định là logo repo. Có thể tải/chọn logo riêng nếu repo không cung cấp ảnh phù hợp.
3. Chọn mức nội dung:

   | Mức | Khoảng lời đọc mục tiêu |
   | --- | --- |
   | Giải thích nhanh / Tin nhanh | **Không quá 60 giây**, nội dung ngắn có thể ít hơn |
   | Giải thích vừa | **Trên 60 đến 90 giây** |
   | Giải thích kĩ | **90 đến 120 giây** |

   Hệ thống chọn độ dài theo nội dung và đo giọng thực tế để sửa lời/căn cảnh. Khi chọn mức này, preset cũ 30/45/60 không quyết định thời lượng. Không cần tự đếm chữ hay ép mỗi video đúng 90/120 giây.
4. Giữ Nam Minh 1.2× và các thiết lập ở trên → **Chuẩn Bị & Duyệt Kịch Bản**. AI viết hook giới thiệu tên repo/số sao có bằng chứng, giải thích cách hoạt động và ví dụ phù hợp nguồn. Ví dụ minh họa không có nghĩa app đã chạy code repo.
5. Xem bản duyệt: tên repo/số sao, ý chính, ví dụ, cảnh/ảnh, cảnh báo nguồn. Nếu tên tiếng Anh đọc chưa đúng, thêm cách đọc trong **Từ điển phát âm** hoặc override của video; chữ trên màn hình vẫn giữ tên gốc.
6. Bấm **Duyệt & Render Video**. Đợi trạng thái hoàn tất → xem video → tải MP4/caption trong kết quả hoặc thư viện.

Thông thường chỉ cần chọn một lần rồi đi tiếp qua các bước, nhưng bước duyệt vẫn cần để phát hiện nguồn thiếu, số liệu hoặc phát âm chưa đúng. Không cần tự viết lại toàn bộ kịch bản. Audio MP3/WAV có sẵn có thể tải lên, kèm SRT nếu có; app không tự viết lại lời đã nằm trong file audio của bạn.

### B. Video tin AI từ Radar

1. Mở **AI News Radar**, lọc nguồn/chuyên mục, tìm kiếm và chọn mới nhất hoặc trending.
2. Xem tiêu đề, ngày, tóm tắt và link gốc → **Import** để đưa URL vào chính luồng Studio đang có.
3. Quét nguồn, chọn **Tin nhanh** cho video ≤60 giây; hoặc chọn mức vừa/kĩ khi nguồn đủ thông tin.
4. Chuẩn bị → duyệt → render như video repo. Nếu chỉ lấy được mô tả RSS, nội dung quá ngắn hoặc nguồn bị chặn, đổi nguồn công khai đầy đủ hơn; không coi phần tóm tắt Radar là toàn bộ bài.

Radar lấy dữ liệu qua RSS/API, **không dùng Gemini cho mỗi lần tải danh sách**. Gemini được gọi lúc viết/sửa kịch bản và có thể gọi nhiều lượt khi cân thời gian. Render dùng CPU máy; không có thời gian cố định cho mọi repo/video. Bản 90–120 giây và nhiều animation sẽ tốn hơn bản ngắn.

### File đầu ra

Trong `output/<tên-bản-dựng>/`, tùy giai đoạn có `script.json`, `sources.json`, `script.review.md`, audio, `captions.srt`, dữ liệu timing, `video.mp4`, `cover.png`, caption và publish kit. Thư mục giọng/cảnh/cache được giữ để tận dụng khi chạy lại. Với Docker, tải qua giao diện hoặc dùng `docker compose cp` để lấy file ra máy.

## 6. Tính năng và giới hạn hiện tại

| Phần | Có gì | Còn cần lưu ý |
| --- | --- | --- |
| URL bài báo | VnExpress, Dân Trí, GenK, TechCrunch và HTML công khai | Có trang 403/500, chống bot/JS/paywall hoặc parser lấy thiếu nội dung; **luồng tin tức vẫn cần kiểm tra kỹ hơn repo** |
| GitHub | README và tối đa 4 tài liệu liên quan, tên/sao, tư liệu ảnh | Không phân tích hết code, không chạy repo, không đảm bảo repo nào cũng có logo/demo phù hợp |
| Radar | RSS/API thật; nguồn, nhóm nội dung, mới/trending, tìm kiếm, khử trùng URL/tiêu đề | Không phải phân tích ngữ nghĩa; có thể sót/trùng tin dịch lại. Trending dựa trên tín hiệu sẵn có, không phải bảng GitHub Trending chính thức |
| Nguồn mở rộng | Hacker News, Reddit, Product Hunt, Hugging Face, arXiv, blog AI công khai | Reddit/PH có thể chỉ là excerpt. HF lấy model card/README; arXiv lấy abstract/metadata, chưa đọc toàn bộ PDF |
| X / Telegram | X qua API được cấp quyền; Telegram bài text ở kênh công khai cấu hình sẵn | Không có token/quyền/nguồn công khai thì không hoạt động; không đọc nhóm riêng hoặc vượt khóa nội dung |
| Kịch bản và hook | Tên repo, sao có nguồn; cơ chế, ví dụ, kiểm tra số và giảm lặp | AI vẫn có thể diễn đạt chưa hay, lặp nghĩa hoặc hiểu sai nguồn; không cam kết kiểm chứng mọi phát biểu |
| Giọng và phụ đề | Edge mặc định, ZeroTTS tùy chọn, nhà cung cấp khác, từ điển và căn lời | Edge đôi lúc `NoAudioReceived`/timeout; tên tiếng Anh chưa luôn tự đọc đúng. Có fallback timing khi nguồn giọng thiếu boundary |
| Template/hiệu ứng | Hook, so sánh, thống kê, workflow, code-window, data-flow, worked-example và các layout khác; phong cách tham chiếu, ảnh, nhạc ducking/SFX | Chất lượng phụ thuộc nội dung/tư liệu. Không hứa sao chép mọi video tham chiếu tự động |
| Render và thư viện | MP4 dọc có audio; chọn 24/30 fps, xem/tải và dựng lại | CPU/RAM, số cảnh và Chromium ảnh hưởng tốc độ; chưa có hàng đợi render phân tán/GPU cloud |
| Chi phí/quota | Dùng key LLM của người dùng; nhiều nguồn miễn phí | Chưa có dashboard tổng token/quota Gemini. X/TTS trả phí cần quyền/gói riêng |

RSS Batch cũ vẫn giữ để tương thích, có thể dùng mô tả feed thay vì toàn bài. Ưu tiên **Radar → Import → Studio** cho workflow mới.

## 7. Khi gặp lỗi

- **Edge không trả audio / lỗi đo giọng:** kiểm tra mạng và thử lại sau. Hệ thống dừng với lỗi giọng thay vì tiếp tục viết lại vô ích. `draft-unmeasured.json` nếu có chỉ là nháp, chưa phải kịch bản đã căn thời gian thành công. Không tự đổi sang ZeroTTS; bạn chủ động chọn nếu muốn.
- **Gemini 429/quota:** kiểm tra hạn mức/key/model ở nhà cung cấp, giảm số lần tạo hoặc đổi cấu hình hợp lệ. Đây khác với lỗi TTS.
- **Nguồn 403/500 hoặc nội dung thiếu:** mở link gốc để kiểm tra, dùng nguồn công khai khác hoặc tư liệu của bạn; app không vượt CAPTCHA/paywall. RSS lấy được không bảo đảm bài đầy đủ đọc được.
- **Render lâu:** thử Tin nhanh, xuất 24 fps, chạy một video mỗi lần và theo dõi log CPU/RAM; không bấm tạo lại liên tục khi job vẫn chạy.
- **Thiếu browser/ffmpeg:** Docker đã khai báo các gói; native kiểm tra `ffmpeg -version`, `ffprobe -version`, Chrome/PATH. Không dùng venv/node_modules copy từ hệ điều hành khác.
- **Docker không kết nối daemon:** mở Docker Desktop và đợi engine sẵn sàng; kiểm tra `docker info`. `docker compose config -q` chỉ kiểm tra Compose, không chứng minh container render được.
- **Đổi máy mất key/cấu hình:** nhập lại hoặc phục hồi backup; Git cố ý không lưu các dữ liệu riêng này.

## 8. Kiểm tra và CLI dành cho phát triển

```bash
npm run typecheck
npm test -- --testTimeout=30000 --maxWorkers=1
docker compose config -q
# Tạo kịch bản qua CLI cũ:
npm run script -- https://github.com/owner/repo --preset review_60
# Render kịch bản đã duyệt:
npm run pipeline -- output/ten-ban-dung/script.json
ffprobe -v error -show_streams -show_format -of json output/ten-ban-dung/video.mp4
```

CLI giữ preset cũ để tương thích; ba mức thời lượng ở trên là workflow Studio mới. `--yes` của CLI tạo kịch bản không tự gọi render. Unit tests dùng mock dịch vụ ngoài; kiểm tra render thật riêng mới xác nhận browser/codec trên máy đó hoạt động. Xem [bằng chứng bộ cài](docs/installation-validation.md) để phân biệt phần đã thử và phần chưa xác minh.

## 9. Tài liệu và ghi công

- [Voice Studio](docs/huong-dan-voice-studio.md), [ZeroTTS](docs/huong-dan-zerotts.md), [storyboard](docs/huong-dan-storyboard.md), [chọn template](docs/huong-dan-chon-template.md).
- [Kiến trúc Radar](docs/adr-0007-ai-news-radar.md), [quyết định đóng gói Docker](docs/adr-0008-portable-installation.md).
- [README đầy đủ cũ](README.full.md) và [English README cũ](README.en.md) giữ để tham khảo lịch sử; một số preset/giao diện khác bản Studio hiện tại.

Mã nguồn theo [MIT License](LICENSE). Ghi công tác giả gốc **Cuongyd196** và **hoquanghai**; bản này bổ sung workflow Studio, giọng đọc, template và AI News Radar. Xem giấy phép riêng đi kèm font/nhạc và tài nguyên bên thứ ba trong `assets/` trước khi tái phân phối.
