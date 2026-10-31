---
name: lam-task
description: Cách làm một task trong hàng đợi "dự án tự động" của Claude GUI — đọc bức tranh tổng và bàn giao, làm đúng phạm vi, kiểm tra tiêu chí xong, rồi ghi bàn giao cho task sau. Dùng khi prompt có dòng "[Dự án tự động".
user-invocable: false
---

# Làm một task trong dự án tự động (Claude GUI)

Prompt bạn nhận có: thư mục chạy (RUN), bức tranh tổng (context.md), bàn giao của các task trước, nhiệm vụ, tiêu chí xong.

## Làm
- Coi **context.md** là nguồn sự thật: quyết định đã chốt, quy ước, design hiện hành. Không đổi API / mô hình dữ liệu / kiến trúc đã chốt.
- Chỉ làm đúng nhiệm vụ của task này. Thấy việc khác cần làm → ghi vào bàn giao, đừng tự làm.
- Làm xong thì tự kiểm tra theo **tiêu chí xong** (chạy lệnh, test, build… nếu có thể).
- Không commit / push trừ khi nhiệm vụ yêu cầu.

## Khi kế hoạch có vẻ sai
Nếu phát hiện điều làm kế hoạch không còn đúng (design mâu thuẫn với code, giả định sai, thiếu một bước bắt buộc phải làm trước, việc lớn hơn nhiều so với ước lượng) → **dùng skill `claude-gui:xin-doi-lich`** thay vì tự làm lệch kế hoạch.

## Bàn giao (bắt buộc, kể cả khi chưa xong)
Ghi `RUN/handoff/<id task>.md`, ngắn gọn (≤ 40 dòng):

```
# Bàn giao <id>: <tên task>
Đạt tiêu chí: có | một phần | không

## Đã làm
- …
## Tệp đã sửa / tạo
- …
## Lưu ý cho task sau
- (API, tên hàm, chỗ còn tạm, việc phát sinh…)
```

Dòng `Đạt tiêu chí:` phải đúng một trong ba giá trị — Claude GUI đọc dòng này để biết chạy tiếp hay dừng hỏi người dùng. Viết xong bàn giao thì kết thúc, trả lời ngắn trong chat.
