# Hướng dẫn phát hành & cập nhật Claude GUI

## Thông tin cố định

| Mục | Giá trị |
|---|---|
| Mã nguồn | `C:\WSP\ClaudeGUI` |
| Thư mục phát hành (trên máy này) | `C:\ClaudeGUI-Release` |
| **Nguồn cập nhật (HTTP, không cần tài khoản)** | `http://192.168.1.35:8765` — có sẵn trong app từ 1.5.1 |
| **Trang tải (mở bằng trình duyệt)** | `http://192.168.1.35:8765` — hoặc tải thẳng bản mới nhất: `http://192.168.1.35:8765/download` |
| Thư mục chia sẻ (máy khác bị hỏi tài khoản — không dùng nữa) | `\\192.168.1.35\ClaudeGUI` |
| Máy phát hành | `ADMIN` — IP `192.168.1.35` |
| Phiên bản hiện tại | 1.22.1 |

---

## 1. Phát hành bản mới (làm trên máy này)

1. Sửa code trong `C:\WSP\ClaudeGUI`, chạy thử:
   ```
   cd C:\WSP\ClaudeGUI
   npm start
   ```
2. Mở `C:\WSP\ClaudeGUI\package.json`, **tăng `"version"`** (vd `1.3.0` → `1.3.1`).
   Không tăng thì các máy khác sẽ không thấy bản mới.
3. Build và phát hành (mất vài phút, để chạy đến khi xong):
   ```
   cd C:\WSP\ClaudeGUI
   npm run release -- "Ghi chú: thay đổi gì" --publish "C:\ClaudeGUI-Release"
   ```
4. Kiểm tra `C:\ClaudeGUI-Release` có đủ 2 file:
   - `ClaudeGUI-<version mới>-portable.exe`
   - `latest.json`
5. (Tuỳ chọn) Xoá file exe bản cũ trong `C:\ClaudeGUI-Release` cho gọn.

> Nếu build bị ngắt giữa chừng nhưng `dist\ClaudeGUI-<version>-portable.exe` đã có,
> chỉ cần chạy bước phát hành:
> ```
> node scripts/release.js "Ghi chú" --publish "C:\ClaudeGUI-Release"
> ```

---

## 2. Cài cho máy mới trong team (làm 1 lần mỗi máy)

1. Cài Claude CLI (PowerShell):
   ```
   irm https://claude.ai/install.ps1 | iex
   ```
2. Đăng nhập: chạy `claude` và làm theo hướng dẫn.
3. Mở trình duyệt vào `http://192.168.1.35:8765` → bấm nút **Tải** (hoặc mở thẳng `http://192.168.1.35:8765/download`) → chạy exe vừa tải.
   - Windows cảnh báo "Windows protected your PC" → **More info → Run anyway**.
4. Không cần cấu hình: từ bản 1.5.1 app tự lấy cập nhật từ `http://192.168.1.35:8765`.
   Bản cũ hơn 1.5.1: **Cài đặt → Cập nhật → Nguồn cập nhật**, dán `http://192.168.1.35:8765` (một lần).
5. (Nên có) Cài Git — để dùng tab Git, nhánh, Worktree.
6. Theo dõi sử dụng của công ty: xin bộ `sync_agent` **riêng cho máy đó** từ người quản lý hub,
   chạy `install_sync_agent.bat`. **Không chép `C:\WSP\anhnvt` sang máy khác** (danh tính máy gắn sẵn trong exe).

---

## 3. Các máy nhận bản cập nhật

- GUI tự kiểm tra khi mở và mỗi 6 giờ.
- Có bản mới → **Cài đặt → Cập nhật → "Cập nhật lên x.y.z & khởi động lại"**: tự tải, thay exe, mở lại.
- Kiểm tra ngay: bấm avatar góc dưới trái → **Kiểm tra cập nhật…**
- Nếu tự cập nhật lỗi: đóng GUI, tải exe mới ở `http://192.168.1.35:8765/download` đè lên file cũ.
- Icon thanh tác vụ vẫn trắng sau khi cập nhật: bỏ ghim app cũ khỏi thanh tác vụ, mở app rồi ghim lại.
- Bản giải nén từ zip (cả thư mục, không phải 1 file exe portable): bấm cập nhật sẽ tải exe portable mới đặt cạnh app rồi mở nó — từ đó dùng exe đó.

### Cập nhật Claude CLI

**Cài đặt → Cập nhật → Claude CLI → Cập nhật** (chạy `claude update`). Có thể bật "Tự cập nhật CLI".

---

## 4. Lưu ý

- Máy chủ cập nhật: `scripts\update-server.js` (chỉ phục vụ `latest.json` và các `.exe` trong `C:\ClaudeGUI-Release`, chỉ đọc).
  Tự chạy ẩn khi đăng nhập Windows nhờ `ClaudeGUI-UpdateServer.vbs` trong thư mục Startup (`shell:startup`).
  Chạy tay nếu cần: nhấp đúp `C:\WSP\ClaudeGUI\scripts\update-server.vbs`. Kiểm tra: mở `http://192.168.1.35:8765/latest.json`.
- Tường lửa: rule "Claude GUI Update Server (8765)" (chỉ mạng LAN). Xoá (admin): `Remove-NetFirewallRule -DisplayName 'Claude GUI Update Server (8765)'`
- Máy `192.168.1.35` phải **đang bật và đã đăng nhập Windows** thì máy khác mới thấy bản mới (tắt máy chỉ làm máy khác không cập nhật được, GUI vẫn dùng bình thường).
- Từ bản 1.16.0, máy khách tự thử lần lượt: nguồn tự đặt trong Cài đặt → `http://ADMIN:8765` (tên máy chủ, không đổi khi đổi mạng) → `http://192.168.1.66:8765` → `http://192.168.1.35:8765` (danh sách `defaultUpdateSources` trong `package.json`). Đổi IP thì thường không phải làm gì; nếu đổi cả tên máy → thêm nguồn mới vào danh sách đó và phát hành bản mới.
- Máy đang chạy bản cũ hơn 1.16.0 chỉ biết `192.168.1.35` → vào Cài đặt › Cập nhật, dán `http://ADMIN:8765` (hoặc IP mới) vào ô Nguồn cập nhật một lần.
- Bản cài đặt (`npm run dist:setup`) phải cài lại thủ công.
- Tắt chia sẻ (PowerShell quyền admin): `Remove-SmbShare -Name ClaudeGUI`
- Bật lại chia sẻ (PowerShell quyền admin):
  ```
  New-SmbShare -Name ClaudeGUI -Path C:\ClaudeGUI-Release -ReadAccess Everyone
  ```

---

## 5. Build lại từ đầu (máy mới dùng để phát triển)

```
cd C:\WSP\ClaudeGUI
npm install
node node_modules/electron/install.js   # nếu Electron chưa được tải
npm run dist          # → dist\ClaudeGUI-<version>-portable.exe
npm run dist:setup    # (tuỳ chọn) bộ cài có shortcut Start Menu
```
