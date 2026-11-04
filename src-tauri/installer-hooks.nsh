; Kore NSIS 安装钩子（由 tauri.conf.json 的 bundle.windows.nsis.installerHooks 引入）
;
; 为什么需要：应用升级后 exe 内嵌图标已更新，但 Windows 资源管理器会把
; 桌面快捷方式 / 任务栏的图标缓存在壳层（IconCache），短期仍显示旧图。
; 业界安装包（Chrome / VS Code 等）的标准做法是在安装结束时主动刷新图标缓存，
; 而不是让用户手动「改图标 / 取消固定重钉 / 重启资源管理器」。
!macro NSIS_HOOK_POSTINSTALL
  ; ie4uinit -show：通知 Explorer 重建图标缓存，立即反映新图标
  ExecWait '"$SYSDIR\ie4uinit.exe" -show'
!macroend
