# Theo dõi nhạc đang phát cho linh vật của Claude GUI (chỉ đọc, không điều khiển gì):
#  - "L <0..1>"  mức âm lượng đỉnh của loa mặc định, ~16 lần/giây (để nhún theo nhịp)
#  - "M <json>"  trạng thái phát từ Windows Media (Spotify, trình duyệt, trình phát nhạc…) khi có thay đổi
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int dataFlow, int mask, out IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation { [PreserveSig] int GetPeakValue(out float peak); }
public static class CgPeak {
  static IAudioMeterInformation meter;
  public static float Get() {
    try {
      if (meter == null) {
        var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCo());
        IMMDevice dev; if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0) return -1;
        var iid = typeof(IAudioMeterInformation).GUID; object o;
        if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return -1;
        meter = (IAudioMeterInformation)o;
      }
      float p; if (meter.GetPeakValue(out p) != 0) { meter = null; return -1; }
      return p;
    } catch { meter = null; return -1; }
  }
  public static void Reset() { meter = null; }
}
'@

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); if ($t.Wait(1500)) { $t.Result } else { $null } }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$MP = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$out = [Console]::Out
$inv = [Globalization.CultureInfo]::InvariantCulture
$last = ''; $n = 0
while ($true) {
  $p = [CgPeak]::Get()
  $out.WriteLine('L ' + $p.ToString('0.000', $inv)); $out.Flush()
  if ($n % 24 -eq 0) {
    $st = @{ playing = $false }
    if ($mgr) {
      $pick = $null
      foreach ($s in $mgr.GetSessions()) { $pi = $s.GetPlaybackInfo(); if ($pi.PlaybackStatus -eq 4) { $pick = $s; break } }
      if ($pick) {
        $pi = $pick.GetPlaybackInfo()
        $pr = Await ($pick.TryGetMediaPropertiesAsync()) $MP
        $type = if ($pi.PlaybackType -ne $null) { [int]$pi.PlaybackType } elseif ($pr -and $pr.PlaybackType -ne $null) { [int]$pr.PlaybackType } else { 0 }
        $st = @{ playing = $true; app = $pick.SourceAppUserModelId; type = $type; title = if ($pr) { $pr.Title } else { '' }; artist = if ($pr) { $pr.Artist } else { '' } }
      }
    }
    # chỉ xuất ASCII: ký tự có dấu → \uXXXX (stdout của PowerShell theo bảng mã OEM, app đọc UTF-8 sẽ vỡ chữ)
    $j = [regex]::Replace(($st | ConvertTo-Json -Compress), '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
    if ($j -ne $last) { $out.WriteLine('M ' + $j); $out.Flush(); $last = $j }
  }
  $n++
  Start-Sleep -Milliseconds 60
}
