# ============================================
# BUILD-EXE.ps1
# Compila DiscordDJ.ps1 -> DiscordDJ.exe
# Ejecutar UNA vez para generar el ejecutable.
# ============================================

$Host.UI.RawUI.WindowTitle = "Discord DJ Bot - Build"
$scriptDir = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   Discord DJ Bot - Generando .exe     " -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# ============================================
# 1. INSTALAR PS2EXE SI NO ESTA
# ============================================

Write-Host "[1/4] Verificando ps2exe..." -ForegroundColor Cyan

if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Write-Host "       Instalando modulo ps2exe desde PSGallery..." -ForegroundColor Yellow
    Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
    if (-not (Get-Module -ListAvailable -Name ps2exe)) {
        Write-Host "  [X] No se pudo instalar ps2exe." -ForegroundColor Red
        Write-Host "       Ejecuta manualmente: Install-Module ps2exe -Scope CurrentUser" -ForegroundColor White
        Read-Host "`nPresiona Enter para salir"
        exit 1
    }
}

Import-Module ps2exe -Force
Write-Host "  [OK] ps2exe disponible" -ForegroundColor Green

# ============================================
# 2. VERIFICAR FUENTE
# ============================================

Write-Host "[2/4] Verificando fuente..." -ForegroundColor Cyan

$inputFile  = "$scriptDir\DiscordDJ.ps1"
$outputFile = "$scriptDir\DiscordDJ.exe"

if (-not (Test-Path $inputFile)) {
    Write-Host "  [X] No se encontro DiscordDJ.ps1 en $scriptDir" -ForegroundColor Red
    Read-Host "`nPresiona Enter para salir"
    exit 1
}

Write-Host "  [OK] Fuente: $inputFile" -ForegroundColor Green

# ============================================
# 3. CONVERTIR ICONO JPG -> ICO
# ============================================

Write-Host "[3/4] Procesando icono..." -ForegroundColor Cyan

$jpgPath = "$scriptDir\brokIcon.jpg"
$icoPath = "$scriptDir\brokIcon.ico"
$iconArg = $null

if (Test-Path $jpgPath) {
    try {
        Add-Type -AssemblyName System.Drawing

        # Cargar el JPG y redimensionar a 256x256
        $srcImg = [System.Drawing.Image]::FromFile($jpgPath)
        $bmp = New-Object System.Drawing.Bitmap(256, 256)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($srcImg, 0, 0, 256, 256)
        $g.Dispose()
        $srcImg.Dispose()

        # Guardar la imagen como PNG en memoria
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $pngData = $ms.ToArray()
        $ms.Dispose()

        # Escribir el archivo .ico manualmente (formato ICO con PNG embebido)
        # Estructura: Header (6 bytes) + DirectoryEntry (16 bytes) + PngData
        $icoStream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
        $writer    = New-Object System.IO.BinaryWriter($icoStream)

        # ICO Header
        $writer.Write([uint16]0)                    # Reserved = 0
        $writer.Write([uint16]1)                    # Type = 1 (ICO)
        $writer.Write([uint16]1)                    # Numero de imagenes = 1

        # Directory Entry
        $writer.Write([byte]0)                      # Ancho  (0 = 256px)
        $writer.Write([byte]0)                      # Alto   (0 = 256px)
        $writer.Write([byte]0)                      # Colores en paleta (0 = ninguna)
        $writer.Write([byte]0)                      # Reserved = 0
        $writer.Write([uint16]1)                    # Planos de color
        $writer.Write([uint16]32)                   # Bits por pixel
        $writer.Write([uint32]$pngData.Length)      # Tamaño de los datos
        $writer.Write([uint32]22)                   # Offset de los datos (6 + 16 = 22)

        # Datos PNG
        $writer.Write($pngData)
        $writer.Close()
        $icoStream.Close()

        $iconArg = $icoPath
        Write-Host "  [OK] Icono convertido: brokIcon.jpg -> brokIcon.ico (256x256)" -ForegroundColor Green
    } catch {
        Write-Host "  [!]  Error convirtiendo icono: $_" -ForegroundColor Yellow
        Write-Host "       El exe se generara sin icono personalizado." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [!]  brokIcon.jpg no encontrado. El exe se generara sin icono." -ForegroundColor Yellow
}

# ============================================
# 4. COMPILAR
# ============================================

Write-Host "[4/4] Compilando..." -ForegroundColor Cyan
Write-Host ""

$ps2exeParams = @{
    InputFile   = $inputFile
    OutputFile  = $outputFile
    Title       = "Discord DJ Bot"
    Description = "Discord DJ Bot - Install + Start"
    Company     = "DJ Bot"
    Version     = "1.0.0"
    RequireAdmin = $true
}

if ($iconArg) {
    $ps2exeParams["IconFile"] = $iconArg
}

Invoke-PS2EXE @ps2exeParams

# ============================================
# RESULTADO
# ============================================

Write-Host ""
if (Test-Path $outputFile) {
    $size = [math]::Round((Get-Item $outputFile).Length / 1KB, 1)
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD COMPLETADO                     " -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Ejecutable: $outputFile" -ForegroundColor White
    Write-Host "  Tamaño:     $size KB"    -ForegroundColor White
    if ($iconArg) {
        Write-Host "  Icono:      brokIcon.jpg aplicado"  -ForegroundColor White
    }
    Write-Host ""
    Write-Host "  Haz doble clic en DiscordDJ.exe para usar el bot." -ForegroundColor Cyan
    Write-Host "  (Pedira permisos de administrador la primera vez)" -ForegroundColor Gray
} else {
    Write-Host "  [X] El build fallo. Revisa los errores de arriba." -ForegroundColor Red
}

Write-Host ""
Read-Host "Presiona Enter para salir"
