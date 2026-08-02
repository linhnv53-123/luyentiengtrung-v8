NÂNG CẤP V9 — TỰ ĐỘNG ĐỒNG BỘ SỔ TAY LÊN GITHUB

Tính năng:
- Đồng bộ mô tả thanh mẫu/vận mẫu và sổ tay qua GitHub REST API.
- Tự gộp dữ liệu giữa nhiều thiết bị dựa trên thời gian cập nhật.
- Tự đồng bộ sau khoảng 45 giây không chỉnh sửa và theo chu kỳ 5/15/30/60 phút khi ứng dụng đang mở.
- Token GitHub được mã hóa bằng AES-GCM; khóa được dẫn xuất từ mật khẩu bằng PBKDF2.
- Token không được ghi vào repository hoặc source code.

Giới hạn iPhone:
- Safari/Chrome không cho website chạy định kỳ khi ứng dụng đã đóng.
- Sau khi mở lại ứng dụng, cần nhập mật khẩu để mở khóa token. Sau đó ứng dụng tự đồng bộ.

Khuyến nghị bảo mật:
- Tạo một repository Private riêng, ví dụ hanzi-notes-backup.
- Tạo fine-grained personal access token chỉ được truy cập repository đó.
- Cấp duy nhất quyền Repository permissions → Contents → Read and write.
- Đặt ngày hết hạn cho token.
- Không dùng repository Public nếu ghi chú có nội dung riêng tư.

Cập nhật GitHub Pages:
1. Sao chép toàn bộ nội dung gói nâng cấp vào thư mục gốc repository website.
2. Commit và Push.
3. Chờ pages build and deployment thành công.
4. Mở website với ?v=9 một lần để tránh cache cũ.

Thiết lập trong ứng dụng:
1. Mở tab Sổ tay.
2. Mở “Thiết lập kết nối GitHub”.
3. Nhập tài khoản, repository, branch, đường dẫn file và token.
4. Nhập mật khẩu mã hóa tối thiểu 6 ký tự.
5. Bấm Lưu thiết lập, sau đó Đồng bộ ngay.
