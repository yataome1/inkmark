; 安装程序钩子（specs/013 FR-1309）
; 0.6.0 及以前把示例文档作为资源放在安装目录的 samples 中；现已编进程序，
; 升级后删除这个旧文件夹，否则卸载时会残留。用户文件不会放在这里。
!macro NSIS_HOOK_POSTINSTALL
  RMDir /r "$INSTDIR\samples"
!macroend
