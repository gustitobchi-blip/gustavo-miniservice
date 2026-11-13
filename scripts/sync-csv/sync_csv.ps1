<#
  Sincroniza precio y stock desde PRODUCTO.csv hacia la tienda online (Supabase).

  Uso (el Programador de Tareas lo ejecuta solo, ver instalar_tarea.ps1):
    powershell -ExecutionPolicy Bypass -File sync_csv.ps1            # sincroniza
    powershell -ExecutionPolicy Bypass -File sync_csv.ps1 -Simular   # prueba, no cambia nada
    powershell -ExecutionPolicy Bypass -File sync_csv.ps1 -Forzar    # ignora "archivo sin cambios" y antigüedad

  Solo actualiza precio y stock de productos que YA están en la tienda (por código).
  Termina con código 1 si algo falla, para que el Programador de Tareas lo registre.
#>
param(
  [switch]$Simular,
  [switch]$Forzar
)

$ErrorActionPreference = 'Stop'
$dir        = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile    = Join-Path $dir 'sync_csv.log'
$estadoFile = Join-Path $dir 'sync_csv.estado.json'
$inv        = [Globalization.CultureInfo]::InvariantCulture

function Log([string]$msg) {
  $linea = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $linea
  Add-Content -Path $logFile -Value $linea -Encoding UTF8
}

function Leer-ErrorHttp($err) {
  try {
    $stream = $err.Exception.Response.GetResponseStream()
    $reader = New-Object IO.StreamReader($stream)
    return $reader.ReadToEnd()
  } catch { return $err.Exception.Message }
}

$codigoSalida = 0
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $cfgPath = Join-Path $dir 'config.json'
  if (-not (Test-Path $cfgPath)) { throw 'Falta config.json (copiá config.ejemplo.json como config.json y completalo).' }
  $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $maxHoras = if ($cfg.maxHorasAntiguedad) { [double]$cfg.maxHorasAntiguedad } else { 12 }

  $csvPath = Join-Path $cfg.carpeta $cfg.archivo
  if (-not (Test-Path $csvPath)) { throw "No se encontró el archivo: $csvPath" }

  $item = Get-Item $csvPath
  $horas = ((Get-Date) - $item.LastWriteTime).TotalHours
  if ($horas -gt $maxHoras -and -not $Forzar) {
    throw ('El archivo tiene {0:N1} horas (máximo {1}). Parece que el sistema no lo generó hoy; no se sincroniza.' -f $horas, $maxHoras)
  }

  $hash = (Get-FileHash $csvPath -Algorithm SHA256).Hash
  if (-not $Forzar -and -not $Simular -and (Test-Path $estadoFile)) {
    $estado = Get-Content $estadoFile -Raw | ConvertFrom-Json
    if ($estado.hash -eq $hash) {
      Log 'El archivo no cambió desde la última sincronización exitosa. Nada que hacer.'
      exit 0
    }
  }

  # El sistema del súper guarda el CSV en Windows-1252 (las Ñ y tildes se rompen como UTF-8).
  $bytes  = [IO.File]::ReadAllBytes($csvPath)
  $texto  = [Text.Encoding]::GetEncoding(1252).GetString($bytes)
  $filas  = @($texto -split "`r?`n" | Where-Object { $_.Trim() } | ConvertFrom-Csv -Delimiter ',')
  if ($filas.Count -eq 0) { throw 'El archivo está vacío.' }

  $cols = $filas[0].PSObject.Properties.Name
  foreach ($c in 'cod_ab', 'lista1', 'exi_act1') {
    if ($cols -notcontains $c) { throw "Falta la columna '$c' en el CSV (columnas: $($cols -join ', '))." }
  }

  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('[')
  $primero = $true
  $validas = 0
  $omitidas = 0
  foreach ($f in $filas) {
    $cod = ([string]$f.cod_ab).Trim()
    $precio = 0.0
    $stock = 0.0
    if ($cod -notmatch '^\d+$' `
        -or -not [double]::TryParse(([string]$f.lista1).Trim(), 'Float', $inv, [ref]$precio) `
        -or -not [double]::TryParse(([string]$f.exi_act1).Trim(), 'Float', $inv, [ref]$stock)) {
      $omitidas++
      continue
    }
    if (-not $primero) { [void]$sb.Append(',') }
    $primero = $false
    [void]$sb.Append('{"codigo":"' + $cod + '","precio":' + $precio.ToString('0.###', $inv) + ',"stock":' + $stock.ToString('0.###', $inv) + '}')
    $validas++
  }
  [void]$sb.Append(']')
  Log ("CSV leído: {0} filas válidas, {1} omitidas ({2:N1} h de antigüedad)." -f $validas, $omitidas, $horas)

  $simularTxt = if ($Simular) { 'true' } else { 'false' }
  $body = '{"p_token":"' + $cfg.token + '","p_simular":' + $simularTxt + ',"p_datos":' + $sb.ToString() + '}'

  $headers = @{ apikey = $cfg.anonKey; Authorization = "Bearer $($cfg.anonKey)" }
  $url = ($cfg.supabaseUrl.TrimEnd('/')) + '/rest/v1/rpc/sync_precios_stock'

  try {
    $resp = Invoke-RestMethod -Method Post -Uri $url -Headers $headers `
              -ContentType 'application/json; charset=utf-8' `
              -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 180
  } catch {
    throw ('Error al llamar a Supabase: ' + (Leer-ErrorHttp $_))
  }

  if ($resp.ok) {
    Log ("OK{0}: {1}" -f $(if ($Simular) { ' (simulación)' } else { '' }), $resp.mensaje)
    if (-not $Simular) {
      @{ hash = $hash; fecha = (Get-Date -Format 'o') } | ConvertTo-Json | Set-Content -Path $estadoFile -Encoding UTF8
    }
  } else {
    throw ('Supabase rechazó el archivo: ' + $resp.mensaje)
  }
}
catch {
  Log ('ERROR: ' + $_.Exception.Message)
  $codigoSalida = 1
}
exit $codigoSalida
