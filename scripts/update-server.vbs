' Chạy máy chủ cập nhật ẩn (không hiện cửa sổ). Bản sao nằm trong thư mục Startup để tự chạy khi đăng nhập.
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\WSP\ClaudeGUI\scripts\update-server.js""", 0, False
