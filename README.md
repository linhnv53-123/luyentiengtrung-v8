# Luyện nhớ chữ Hán — V10: luyện viết, từ điển, bảng Pinyin và sổ tay đồng bộ

Website học chữ Hán tối ưu cho iPhone và máy tính. Dữ liệu bài học được đồng bộ tự động từ GitHub.

## Chức năng chính

### 1. Luyện viết và ôn tập

- Hiển thị đồng thời pinyin và nghĩa tiếng Việt.
- Mỗi chữ Hán có một ô viết riêng.
- Tự đưa từ khó vào vòng ôn lại.
- Lưu tiến độ trên từng thiết bị.

### 2. Từ điển theo dữ liệu bài học

Mở tab **Từ điển** và nhập một trong ba dạng:

- Chữ Hán: `喜欢`
- Pinyin có hoặc không có dấu: `xǐhuān`, `xihuan`
- Nghĩa tiếng Việt có hoặc không có dấu: `thích`, `thich`

Kết quả hiển thị chữ Hán, pinyin, nghĩa tiếng Việt, bài học và nút phát âm. Từ điển tra toàn bộ dữ liệu đang có trên thiết bị, bao gồm bài đồng bộ từ GitHub và bài tự thêm cục bộ.

### 3. Phân tích chữ Hán

Mở tab **Phân tích chữ**, nhập một chữ hoặc một từ. Với mỗi chữ, trang có thể hiển thị:

- Bộ thủ chính dùng để tra từ điển.
- Kiểu cấu trúc như trái–phải hoặc trên–dưới.
- Biểu thức IDS và các thành phần đồ họa.
- Loại cấu tạo, thành phần gợi nghĩa và gợi âm khi nguồn có dữ liệu.
- Các từ trong bài học có chứa chữ đang xem.

**Lưu ý:** thành phần đồ họa không phải lúc nào cũng là bộ thủ và không nên được hiểu như một lời giải thích từ nguyên tuyệt đối.

### 4. Bảng thanh mẫu và vận mẫu

Tab **Bảng Pinyin** có danh sách 23 thanh mẫu/ký hiệu âm đầu và 39 mục vận mẫu thực hành. Mỗi nhóm hiển thị sẵn các âm thuộc nhóm ngay dưới tiêu đề, ví dụ `(b, p, m, f)`. Mỗi mục có một ô trống để người học tự mô tả cách đọc bằng tiếng Việt.

### 5. Sổ tay công thức và lưu ý

Tab **Sổ tay** ưu tiên hiển thị danh sách ghi chú và ô tìm kiếm ngay đầu trang. Biểu mẫu thêm/sửa cùng phần sao lưu, đồng bộ được thu gọn phía dưới. Sổ tay cho phép:

- Lưu công thức ngữ pháp, quy tắc phát âm, thanh điệu và cách viết câu.
- Thêm ví dụ minh họa.
- Tìm lại ghi chú theo tiêu đề, nội dung hoặc phân loại.
- Chỉnh sửa và xóa ghi chú.
- Xuất/nhập một file JSON chứa cả ghi chú và mô tả Pinyin để chuyển sang thiết bị khác.

Dữ liệu sổ tay được lưu trong `localStorage` và có thể tự đồng bộ sang repository GitHub riêng nếu đã cấu hình V9. Nút **Xuất sổ tay JSON** vẫn dùng để sao lưu thủ công.

## Thêm bài mới trên GitHub

Ví dụ thêm Bài 16:

1. Mở repository trên GitHub.
2. Mở thư mục `data/lessons`.
3. Chọn **Add file → Upload files** hoặc **Create new file**.
4. Thêm đúng một file: `B16.json` hoặc `B16.txt`.
5. Bấm **Commit changes**.
6. Mở tab **Actions** và chờ tác vụ **Tự động cập nhật dữ liệu bài học** có dấu xanh.
7. Mở website. Trang tự kiểm tra bài mới; nếu đang mở sẵn, chọn **Quản lý dữ liệu → Kiểm tra bài mới**.

Bạn không cần tự sửa:

- `data/lessons.json`
- `data/default-data.js`
- `data/characters.json`
- `sw.js`
- `index.html`

Workflow tự gộp dữ liệu bài học và cập nhật dữ liệu phân tích cho những chữ xuất hiện trong bài.

## Mẫu TXT

```text
# id: B16
# title: Bài 16

学习 | xuéxí | học tập
汉字 | hànzì | chữ Hán
```

Mỗi dòng có định dạng:

```text
chữ Hán | pinyin | nghĩa tiếng Việt
```

## Mẫu JSON

```json
{
  "id": "B16",
  "title": "Bài 16",
  "words": [
    { "h": "学习", "p": "xuéxí", "m": "học tập" },
    { "h": "汉字", "p": "hànzì", "m": "chữ Hán" }
  ]
}
```

## Đồng bộ, cache và dữ liệu cá nhân

- Mỗi lần mở trang, ứng dụng yêu cầu dữ liệu bài học mới từ GitHub Pages.
- Service Worker dùng network-first cho `lessons.json` và `characters.json`.
- Nếu nguồn phân tích chữ tạm thời không tải được trong GitHub Actions, bài học mới vẫn được gộp; dữ liệu phân tích hiện có được giữ lại và chữ mới có thể tạm hiển thị “chưa có dữ liệu”.
- Tiến độ học nằm trong `localStorage`. Mô tả Pinyin và sổ tay nằm trong `localStorage` và có thể đồng bộ với repository GitHub riêng.
- Dữ liệu bài học đồng bộ từ GitHub không ghi đè sổ tay cá nhân.

## Chạy thử trên máy tính

```bash
python -m http.server 8000
```

Sau đó mở `http://localhost:8000`.

## Build thủ công

```bash
python tools/build-data.py
python tools/build-characters.py
```

Để kiểm thử offline bằng dữ liệu mẫu:

```bash
python tools/build-characters.py --source tests/fixtures/makemeahanzi-sample.txt
```

## Nguồn dữ liệu phân tích chữ

Xem `THIRD_PARTY_NOTICES.md`.

## V9 — Đồng bộ sổ tay lên GitHub

Bản V9 bổ sung đồng bộ mô tả Pinyin và ghi chú cá nhân qua GitHub REST API.

- Dữ liệu được gộp giữa nhiều thiết bị theo thời gian cập nhật.
- Tự đồng bộ sau khi ngừng chỉnh sửa khoảng 45 giây và theo chu kỳ khi ứng dụng đang mở.
- Fine-grained token được mã hóa bằng Web Crypto AES-GCM với khóa dẫn xuất PBKDF2.
- Mật khẩu mở khóa không được lưu; cần nhập lại sau khi đóng hoàn toàn ứng dụng.
- Khuyến nghị lưu dữ liệu trong một repository Private riêng.

Xem `README-CAP-NHAT-V9.txt` để thiết lập.
