<#
  Programa la sincronización en el Programador de Tareas de Windows.
  Ejecutar UNA VEZ en la PC del súper, desde un PowerShell abierto "como administrador":

    powershell -ExecutionPolicy Bypass -File instalar_tarea.ps1          # instala
    powershell -ExecutionPolicy Bypass -File instalar_tarea.ps1 -Quitar  # desinstala

  Corre a las 8:15, 8:45, 17:15 y 17:45 (el sistema genera el CSV a las 8:00 y 17:00).
  Si el archivo no cambió, las corridas extra no hacen nada. Si la PC estaba apagada,
  la tarea corre apenas se prende.
#>
param([switch]$Quitar)

$ErrorActionPreference = 'Stop'
$nombre = 'Sync precios y stock - Gustavo 1'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Abrí PowerShell como administrador (clic derecho > Ejecutar como administrador) y volvé a correr este archivo.' }

if ($Quitar) {
  Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
  Write-Host "Tarea '$nombre' eliminada."
  exit 0
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $dir 'config.json'))) { throw 'Primero creá config.json (copiá config.ejemplo.json y completalo).' }

$script   = Join-Path $dir 'sync_csv.ps1'
$accion   = New-ScheduledTaskAction -Execute 'powershell.exe' `
              -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $script) -WorkingDirectory $dir
$triggers = '08:15', '08:45', '17:15', '17:45' | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$config   = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$usuario  = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $triggers -Settings $config -Principal $usuario -Force | Out-Null
Write-Host "Tarea '$nombre' instalada: 8:15, 8:45, 17:15 y 17:45 todos los días."
Write-Host "Para probarla ya: Start-ScheduledTask -TaskName '$nombre'   (después mirá sync_csv.log)"
