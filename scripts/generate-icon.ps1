Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

function New-RoundedRectanglePath {
  param(
    [double]$X,
    [double]$Y,
    [double]$Width,
    [double]$Height,
    [double]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [float]($Radius * 2)
  $path.AddArc([float]$X, [float]$Y, $diameter, $diameter, 180, 90)
  $path.AddArc([float]($X + $Width - $diameter), [float]$Y, $diameter, $diameter, 270, 90)
  $path.AddArc([float]($X + $Width - $diameter), [float]($Y + $Height - $diameter), $diameter, $diameter, 0, 90)
  $path.AddArc([float]$X, [float]($Y + $Height - $diameter), $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Write-PngFrame {
  param(
    [int]$Size,
    [string]$OutputPath
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $canvasMargin = [math]::Round($Size * 0.06)
  $panelSize = $Size - ($canvasMargin * 2)
  $cornerRadius = $panelSize * 0.22

  $panelPath = New-RoundedRectanglePath $canvasMargin $canvasMargin $panelSize $panelSize $cornerRadius
  $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new([float]$canvasMargin, [float]$canvasMargin),
    [System.Drawing.PointF]::new([float]($canvasMargin + $panelSize), [float]($canvasMargin + $panelSize)),
    [System.Drawing.Color]::FromArgb(255, 8, 22, 47),
    [System.Drawing.Color]::FromArgb(255, 18, 98, 255)
  )
  $graphics.FillPath($bgBrush, $panelPath)

  $highlightPath = New-RoundedRectanglePath ($Size * 0.52) ($Size * 0.04) ($Size * 0.42) ($Size * 0.42) ($Size * 0.18)
  $highlightBrush = [System.Drawing.Drawing2D.PathGradientBrush]::new($highlightPath)
  $highlightBrush.CenterColor = [System.Drawing.Color]::FromArgb(92, 255, 120, 78)
  $highlightBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 120, 78))
  $graphics.FillRectangle($highlightBrush, [float]($Size * 0.5), [float]0, [float]($Size * 0.5), [float]($Size * 0.5))

  $shineBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(0, 0),
    [System.Drawing.PointF]::new(0, [float]($Size * 0.48)),
    [System.Drawing.Color]::FromArgb(84, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255)
  )
  $shinePath = New-RoundedRectanglePath ($canvasMargin + 2) ($canvasMargin + 2) ($panelSize - 4) ($panelSize * 0.46) ($cornerRadius * 0.9)
  $graphics.FillPath($shineBrush, $shinePath)

  $panelBorder = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(72, 255, 255, 255), [float]([math]::Max(1, $Size * 0.01)))
  $graphics.DrawPath($panelBorder, $panelPath)

  $gridCols = 4
  $gap = $Size * 0.035
  $cellSize = $Size * 0.13
  $gridWidth = ($cellSize * $gridCols) + ($gap * ($gridCols - 1))
  $gridLeft = $Size * 0.18
  $gridTop = $Size * 0.23
  $cellRadius = $cellSize * 0.24

  for ($row = 0; $row -lt $gridCols; $row += 1) {
    for ($col = 0; $col -lt $gridCols; $col += 1) {
      $x = $gridLeft + ($col * ($cellSize + $gap))
      $y = $gridTop + ($row * ($cellSize + $gap))
      $cellPath = New-RoundedRectanglePath $x $y $cellSize $cellSize $cellRadius

      $isHot = ($row -eq 1 -and $col -eq 3) -or ($row -eq 2 -and $col -eq 2)
      if ($isHot) {
        $cellBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
          [System.Drawing.PointF]::new([float]$x, [float]$y),
          [System.Drawing.PointF]::new([float]($x + $cellSize), [float]($y + $cellSize)),
          [System.Drawing.Color]::FromArgb(255, 255, 94, 72),
          [System.Drawing.Color]::FromArgb(255, 255, 53, 31)
        )
        $cellPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(210, 255, 255, 255), [float]([math]::Max(1, $Size * 0.01)))
      }
      else {
        $cellBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
          [System.Drawing.PointF]::new([float]$x, [float]$y),
          [System.Drawing.PointF]::new([float]($x + $cellSize), [float]($y + $cellSize)),
          [System.Drawing.Color]::FromArgb(245, 243, 249, 255),
          [System.Drawing.Color]::FromArgb(228, 228, 239, 255)
        )
        $cellPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(108, 151, 192, 255), [float]([math]::Max(1, $Size * 0.008)))
      }

      $graphics.FillPath($cellBrush, $cellPath)
      $graphics.DrawPath($cellPen, $cellPath)
      $cellBrush.Dispose()
      $cellPen.Dispose()
      $cellPath.Dispose()
    }
  }

  $scanCenterX = $gridLeft + ($gridWidth * 0.52)
  $scanCenterY = $gridTop + ($gridWidth * 0.52)
  $scanRadius = $gridWidth * 0.68
  $scanPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(188, 91, 225, 255), [float]([math]::Max(2, $Size * 0.034)))
  $scanPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $scanPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawArc(
    $scanPen,
    [float]($scanCenterX - $scanRadius),
    [float]($scanCenterY - $scanRadius),
    [float]($scanRadius * 2),
    [float]($scanRadius * 2),
    -38,
    244
  )

  $sweepPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(212, 170, 244, 255), [float]([math]::Max(2, $Size * 0.02)))
  $sweepPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $sweepPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $sweepEndX = $scanCenterX + ($scanRadius * 0.72)
  $sweepEndY = $scanCenterY - ($scanRadius * 0.54)
  $graphics.DrawLine($sweepPen, [float]$scanCenterX, [float]$scanCenterY, [float]$sweepEndX, [float]$sweepEndY)

  $dotRadius = [math]::Max(2, $Size * 0.04)
  $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 118, 241, 255))
  $graphics.FillEllipse($dotBrush, [float]($sweepEndX - $dotRadius), [float]($sweepEndY - $dotRadius), [float]($dotRadius * 2), [float]($dotRadius * 2))

  $outputDirectory = Split-Path -Parent $OutputPath
  if (-not (Test-Path $outputDirectory)) {
    New-Item -Path $outputDirectory -ItemType Directory | Out-Null
  }

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $dotBrush.Dispose()
  $sweepPen.Dispose()
  $scanPen.Dispose()
  $panelBorder.Dispose()
  $shineBrush.Dispose()
  $shinePath.Dispose()
  $highlightBrush.Dispose()
  $highlightPath.Dispose()
  $panelPath.Dispose()
  $bgBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

function New-IcoFromPngFrames {
  param(
    [string]$OutputPath,
    [int[]]$Sizes
  )

  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ip-tool-icon-" + [guid]::NewGuid().ToString('N'))
  New-Item -Path $tempDir -ItemType Directory | Out-Null

  try {
    $frames = foreach ($size in $Sizes) {
      $pngPath = Join-Path $tempDir ("icon-$size.png")
      Write-PngFrame -Size $size -OutputPath $pngPath
      [pscustomobject]@{
        Size = $size
        Bytes = [System.IO.File]::ReadAllBytes($pngPath)
      }
    }

    $stream = [System.IO.MemoryStream]::new()
    $writer = [System.IO.BinaryWriter]::new($stream)

    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$frames.Count)

    $offset = 6 + (16 * $frames.Count)
    foreach ($frame in $frames) {
      $dimensionByte = if ($frame.Size -ge 256) { [byte]0 } else { [byte]$frame.Size }
      $writer.Write($dimensionByte)
      $writer.Write($dimensionByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$frame.Bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $frame.Bytes.Length
    }

    foreach ($frame in $frames) {
      $writer.Write($frame.Bytes)
    }

    [System.IO.File]::WriteAllBytes($OutputPath, $stream.ToArray())
    $writer.Dispose()
    $stream.Dispose()
  }
  finally {
    if (Test-Path $tempDir) {
      Remove-Item -Path $tempDir -Recurse -Force
    }
  }
}

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root 'src-tauri\icons'
$publicDir = Join-Path $root 'public'

Write-PngFrame -Size 256 -OutputPath (Join-Path $publicDir 'app-icon-256.png')
New-IcoFromPngFrames -OutputPath (Join-Path $iconDir 'icon.ico') -Sizes @(16, 32, 48, 64, 128, 256)

Write-Output "Generated icon assets:"
Write-Output (Join-Path $iconDir 'icon.ico')
Write-Output (Join-Path $publicDir 'app-icon-256.png')
