# Instalador de Sentra para Windows.
#
# Deja el motor de vision listo para funcionar en una maquina nueva: entorno
# de Python, dependencias, el modelo de pose y la configuracion minima. Al
# terminar arranca el motor y dice a donde conectarse.
#
#     .\instalar.ps1              instala y arranca
#     .\instalar.ps1 -SoloModelo  solo descarga el modelo
#     .\instalar.ps1 -NoArrancar  instala sin arrancar
#
# El modelo se descarga desde el repositorio oficial de Ultralytics, que es de
# donde lo saca la libreria de todos modos: aqui solo se adelanta para que la
# primera deteccion no se quede esperando una descarga de 6 MB.

param(
    [switch]$SoloModelo,
    [switch]$NoArrancar
)

$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot
$modelo = "yolo11n-pose.pt"
$urlModelo = "https://github.com/ultralytics/assets/releases/download/v8.3.0/$modelo"

function Paso($texto) { Write-Host "`n>> $texto" -ForegroundColor Cyan }
function Bien($texto) { Write-Host "   $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "   $texto" -ForegroundColor Yellow }

# --- Modelo de pose ------------------------------------------------------
Paso "Modelo de deteccion de pose"
$destinoModelo = Join-Path $raiz $modelo
if (Test-Path $destinoModelo) {
    $mb = [math]::Round((Get-Item $destinoModelo).Length / 1MB, 1)
    Bien "$modelo ya esta aqui ($mb MB)"
} else {
    Write-Host "   Descargando $modelo (~6 MB)..."
    Invoke-WebRequest -Uri $urlModelo -OutFile $destinoModelo -UseBasicParsing
    $mb = [math]::Round((Get-Item $destinoModelo).Length / 1MB, 1)
    Bien "descargado ($mb MB)"
}

if ($SoloModelo) {
    Write-Host "`nListo. El modelo esta en $destinoModelo" -ForegroundColor Green
    exit 0
}

# --- Python --------------------------------------------------------------
Paso "Entorno de Python"
$py = Join-Path $raiz ".venv\Scripts\python.exe"
if (Test-Path $py) {
    Bien "el entorno .venv ya existe"
} else {
    # Se busca un interprete disponible sin exigir una version concreta: la
    # 3.11 o superior sirve, y obligar a una exacta solo estorba.
    $lanzador = Get-Command py -ErrorAction SilentlyContinue
    if ($lanzador) {
        & py -3 -m venv (Join-Path $raiz ".venv")
    } else {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if (-not $python) {
            Write-Host "`nNo se encuentra Python. Instalalo desde https://python.org y vuelve a ejecutar esto." -ForegroundColor Red
            exit 1
        }
        & python -m venv (Join-Path $raiz ".venv")
    }
    Bien "entorno creado en .venv"
}

Paso "Dependencias"
Write-Host "   Esto tarda unos minutos la primera vez (torch pesa)."
& $py -m pip install --upgrade pip --quiet
& $py -m pip install -r (Join-Path $raiz "requirements.txt") --quiet
Bien "instaladas"

# --- Configuracion -------------------------------------------------------
Paso "Configuracion"
$env_ = Join-Path $raiz ".env"
if (Test-Path $env_) {
    Bien ".env ya existe, no se toca"
} else {
    # Plantilla con lo minimo. Sin clave de Gemini el motor sigue arrancando:
    # el filtro geometrico funciona y las detecciones quedan sin verificar,
    # que es suficiente para ver el sistema moverse.
    @"
# Clave de Gemini para el verificador. Sin ella el filtro geometrico funciona
# igual, pero nadie confirma las detecciones.
# Se saca en https://aistudio.google.com/apikey
GEMINI_API_KEY=

# Camara: 0 es la webcam del equipo. Tambien admite una URL rtsp:// o varias
# separadas por coma, con nombre:  Entrada=0,Almacen=rtsp://...
SOURCE=0

# Vertical activa al arrancar: violence, retail_theft, fall_detection o
# industrial_safety.
DOMAIN=violence

# Enviar los incidentes confirmados a Sentra en la nube. Opcional: sin esto
# el motor funciona solo, con su panel local.
# CONVEX_INTAKE_URL=https://adventurous-wolf-401.convex.site/intake
# CONVEX_INTAKE_TOKEN=
# CONVEX_WORKSPACE_ID=
# CONVEX_CAMERA_IDS={"Entrada":"<id de la camara en Sentra>"}
"@ | Out-File -FilePath $env_ -Encoding utf8
    Bien ".env creado"
    Aviso "Pon tu GEMINI_API_KEY en .env para que el verificador funcione."
}

# --- Comprobacion --------------------------------------------------------
Paso "Comprobacion"
& $py -m tools.selftest 2>&1 | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nLa comprobacion fallo. Revisa la salida de arriba." -ForegroundColor Red
    exit 1
}

if ($NoArrancar) {
    Write-Host "`nInstalado. Para arrancar:  .\dev.ps1" -ForegroundColor Green
    exit 0
}

# --- Arranque ------------------------------------------------------------
Paso "Arrancando el motor"
Start-Process -FilePath $py `
    -ArgumentList "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory $raiz -WindowStyle Minimized

$listo = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/state" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $listo = $true
        break
    } catch { }
}

Write-Host ""
if ($listo) {
    Write-Host "Sentra esta funcionando." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Motor local     http://localhost:8000" -ForegroundColor White
    Write-Host "  Panel Sentra    https://sentra-41vtdmx7s-juanmcanchalas-projects.vercel.app/app/live" -ForegroundColor White
    Write-Host ""
    Write-Host "  El panel se conecta solo al motor de esta maquina. Abre 'En vivo'" -ForegroundColor DarkGray
    Write-Host "  para ver la camara y probar con un clip de la carpeta prueba\." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Para parar:  Get-Process python | Stop-Process" -ForegroundColor DarkGray
} else {
    Write-Host "El motor no respondio a tiempo. Arrancalo a mano para ver el error:" -ForegroundColor Yellow
    Write-Host "  .venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000" -ForegroundColor White
}
