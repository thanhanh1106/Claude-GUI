# Robot ngoài desktop: liệt kê cửa sổ đang hiện (theo thứ tự trên → dưới) để robot đứng / leo lên thanh tiêu đề.
# Mỗi ~350ms in một dòng JSON: {"w":[[hwnd,trái,trên,phải,dưới],...],"fg":[...]|null} (toạ độ pixel thật).
# Chỉ đọc vị trí cửa sổ, không đọc nội dung, không điều khiển gì. Tham số 1: hwnd cửa sổ robot (bỏ qua).
param([long]$Skip = 0)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CgWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] static extern int DwmInt(IntPtr h, int a, out int v, int s);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public static string Scan(long skip) {
    var sb = new StringBuilder("{\"w\":[");
    bool first = true; IntPtr fg = GetForegroundWindow(); string fgr = "null";
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if ((long)h == skip || !IsWindowVisible(h) || IsIconic(h)) return true;
      if ((GetWindowLong(h, -20) & 0x080000A0) != 0) return true;    // cửa sổ công cụ / lớp phủ cho chuột xuyên qua / không nhận focus
      int cl; if (DwmInt(h, 14, out cl, 4) == 0 && cl != 0) return true; // bị ẩn (cloaked)
      if (GetWindowTextLength(h) == 0) return true;
      var c = new StringBuilder(64); GetClassName(h, c, 64); string cn = c.ToString();
      if (cn == "Progman" || cn == "WorkerW" || cn == "Shell_TrayWnd" || cn == "Shell_SecondaryTrayWnd") return true;
      RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r);
      if (r.R - r.L < 120 || r.B - r.T < 50) return true;
      sb.Append(first ? "" : ",").Append('[').Append((long)h).Append(',').Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R).Append(',').Append(r.B).Append(']');
      first = false;
      if (h == fg) fgr = "[" + r.L + "," + r.T + "," + r.R + "," + r.B + "]";
      return true;
    }, IntPtr.Zero);
    return sb.Append("],\"fg\":").Append(fgr).Append('}').ToString();
  }
}
'@
[CgWin]::SetProcessDPIAware() | Out-Null
while ($true) {
  [Console]::Out.WriteLine([CgWin]::Scan($Skip))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 350
}
