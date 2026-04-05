Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;

public static class IconImageProcessor
{
    public static Bitmap PrepareIcon(Bitmap input)
    {
        Bitmap working = CloneArgb(input);
        Bitmap reference = CloneArgb(input);

        try
        {
            RemoveEdgeBackground(working);
            RemoveEdgeBackground(reference);
            KeepPurpleSubjectOnly(working);
            RestoreSubjectGaps(working, reference);
            KeepLargestOpaqueComponent(working);

            Rectangle symbolBounds = GetPrimarySymbolBounds(working, 8);
            int padding = Math.Max(Math.Max(symbolBounds.Width, symbolBounds.Height) / 36, 16);

            Bitmap cropped = CropToSquare(working, symbolBounds, padding);
            working.Dispose();
            return cropped;
        }
        finally
        {
            reference.Dispose();
        }
    }

    private static Bitmap CloneArgb(Bitmap input)
    {
        Bitmap clone = new Bitmap(input.Width, input.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(clone))
        {
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            graphics.DrawImage(input, 0, 0, input.Width, input.Height);
        }

        return clone;
    }

    private static bool IsBackground(byte r, byte g, byte b, byte a)
    {
        if (a < 24)
        {
            return true;
        }

        int max = Math.Max(r, Math.Max(g, b));
        int min = Math.Min(r, Math.Min(g, b));
        int avg = (r + g + b) / 3;

        return avg >= 214 && (max - min) <= 44;
    }

    private static void RemoveEdgeBackground(Bitmap bitmap)
    {
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        System.Drawing.Imaging.BitmapData data = bitmap.LockBits(
            rect,
            System.Drawing.Imaging.ImageLockMode.ReadWrite,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb
        );

        try
        {
            int width = bitmap.Width;
            int height = bitmap.Height;
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] pixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);

            bool[] visited = new bool[width * height];
            Queue<int> queue = new Queue<int>();

            Action<int, int> enqueue = (x, y) =>
            {
                if (x < 0 || y < 0 || x >= width || y >= height)
                {
                    return;
                }

                int index = (y * width) + x;
                if (visited[index])
                {
                    return;
                }

                int offset = (y * stride) + (x * 4);
                byte b = pixels[offset];
                byte g = pixels[offset + 1];
                byte r = pixels[offset + 2];
                byte a = pixels[offset + 3];

                if (!IsBackground(r, g, b, a))
                {
                    return;
                }

                visited[index] = true;
                queue.Enqueue(index);
            };

            for (int x = 0; x < width; x++)
            {
                enqueue(x, 0);
                enqueue(x, height - 1);
            }

            for (int y = 0; y < height; y++)
            {
                enqueue(0, y);
                enqueue(width - 1, y);
            }

            while (queue.Count > 0)
            {
                int index = queue.Dequeue();
                int x = index % width;
                int y = index / width;

                enqueue(x - 1, y);
                enqueue(x + 1, y);
                enqueue(x, y - 1);
                enqueue(x, y + 1);
            }

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int index = (y * width) + x;
                    if (!visited[index])
                    {
                        continue;
                    }

                    int offset = (y * stride) + (x * 4);
                    pixels[offset] = 0;
                    pixels[offset + 1] = 0;
                    pixels[offset + 2] = 0;
                    pixels[offset + 3] = 0;
                }
            }

            Marshal.Copy(pixels, 0, data.Scan0, byteCount);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static void KeepPurpleSubjectOnly(Bitmap bitmap)
    {
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        System.Drawing.Imaging.BitmapData data = bitmap.LockBits(
            rect,
            System.Drawing.Imaging.ImageLockMode.ReadWrite,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb
        );

        try
        {
            int width = bitmap.Width;
            int height = bitmap.Height;
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] pixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int offset = (y * stride) + (x * 4);
                    byte b = pixels[offset];
                    byte g = pixels[offset + 1];
                    byte r = pixels[offset + 2];
                    byte a = pixels[offset + 3];

                    if (!IsPurpleIconPixel(r, g, b, a))
                    {
                        pixels[offset] = 0;
                        pixels[offset + 1] = 0;
                        pixels[offset + 2] = 0;
                        pixels[offset + 3] = 0;
                    }
                }
            }

            Marshal.Copy(pixels, 0, data.Scan0, byteCount);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static bool IsPurpleIconPixel(byte r, byte g, byte b, byte a)
    {
        if (a < 48)
        {
            return false;
        }

        double rf = r / 255.0;
        double gf = g / 255.0;
        double bf = b / 255.0;

        double max = Math.Max(rf, Math.Max(gf, bf));
        double min = Math.Min(rf, Math.Min(gf, bf));
        double delta = max - min;
        if (delta <= 0.0 || max < 0.18)
        {
            return false;
        }

        double saturation = max <= 0.0 ? 0.0 : delta / max;
        if (saturation < 0.20)
        {
            return false;
        }

        double hue;
        if (Math.Abs(max - rf) < 0.0001)
        {
            hue = 60.0 * (((gf - bf) / delta) % 6.0);
        }
        else if (Math.Abs(max - gf) < 0.0001)
        {
            hue = 60.0 * (((bf - rf) / delta) + 2.0);
        }
        else
        {
            hue = 60.0 * (((rf - gf) / delta) + 4.0);
        }

        if (hue < 0.0)
        {
            hue += 360.0;
        }

        bool hueMatch = hue >= 255.0 && hue <= 318.0;
        bool purpleBias = (((double)r + (double)b) / 2.0) >= (g + 8.0);
        return hueMatch && purpleBias;
    }

    private static bool IsLoosePurpleReferencePixel(byte r, byte g, byte b, byte a)
    {
        if (a < 24)
        {
            return false;
        }

        double rf = r / 255.0;
        double gf = g / 255.0;
        double bf = b / 255.0;

        double max = Math.Max(rf, Math.Max(gf, bf));
        double min = Math.Min(rf, Math.Min(gf, bf));
        double delta = max - min;
        if (delta <= 0.0 || max < 0.18)
        {
            return false;
        }

        double saturation = max <= 0.0 ? 0.0 : delta / max;
        if (saturation < 0.10)
        {
            return false;
        }

        double hue;
        if (Math.Abs(max - rf) < 0.0001)
        {
            hue = 60.0 * (((gf - bf) / delta) % 6.0);
        }
        else if (Math.Abs(max - gf) < 0.0001)
        {
            hue = 60.0 * (((bf - rf) / delta) + 2.0);
        }
        else
        {
            hue = 60.0 * (((rf - gf) / delta) + 4.0);
        }

        if (hue < 0.0)
        {
            hue += 360.0;
        }

        bool hueMatch = hue >= 245.0 && hue <= 325.0;
        bool purpleBias = (((double)r + (double)b) / 2.0) >= (g + 3.0);
        return hueMatch && purpleBias;
    }

    private static void RestoreSubjectGaps(Bitmap bitmap, Bitmap reference)
    {
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        System.Drawing.Imaging.BitmapData data = bitmap.LockBits(
            rect,
            System.Drawing.Imaging.ImageLockMode.ReadWrite,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb
        );
        System.Drawing.Imaging.BitmapData referenceData = reference.LockBits(
            rect,
            System.Drawing.Imaging.ImageLockMode.ReadOnly,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb
        );

        try
        {
            int width = bitmap.Width;
            int height = bitmap.Height;
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] pixels = new byte[byteCount];
            byte[] referencePixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);
            Marshal.Copy(referenceData.Scan0, referencePixels, 0, byteCount);

            bool[] restore = new bool[width * height];

            for (int y = 2; y < height - 2; y++)
            {
                for (int x = 2; x < width - 2; x++)
                {
                    int index = (y * width) + x;
                    int offset = (y * stride) + (x * 4);
                    if (pixels[offset + 3] >= 24)
                    {
                        continue;
                    }

                    byte refB = referencePixels[offset];
                    byte refG = referencePixels[offset + 1];
                    byte refR = referencePixels[offset + 2];
                    byte refA = referencePixels[offset + 3];
                    if (!IsLoosePurpleReferencePixel(refR, refG, refB, refA))
                    {
                        continue;
                    }

                    int opaqueNeighbors = 0;
                    for (int ny = y - 2; ny <= y + 2; ny++)
                    {
                        for (int nx = x - 2; nx <= x + 2; nx++)
                        {
                            if (nx == x && ny == y)
                            {
                                continue;
                            }

                            int neighborOffset = (ny * stride) + (nx * 4);
                            if (pixels[neighborOffset + 3] >= 24)
                            {
                                opaqueNeighbors++;
                            }
                        }
                    }

                    if (opaqueNeighbors >= 10)
                    {
                        restore[index] = true;
                    }
                }
            }

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int index = (y * width) + x;
                    if (!restore[index])
                    {
                        continue;
                    }

                    int offset = (y * stride) + (x * 4);
                    pixels[offset] = referencePixels[offset];
                    pixels[offset + 1] = referencePixels[offset + 1];
                    pixels[offset + 2] = referencePixels[offset + 2];
                    pixels[offset + 3] = referencePixels[offset + 3];
                }
            }

            Marshal.Copy(pixels, 0, data.Scan0, byteCount);
        }
        finally
        {
            bitmap.UnlockBits(data);
            reference.UnlockBits(referenceData);
        }
    }

    private static void KeepLargestOpaqueComponent(Bitmap bitmap)
    {
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        System.Drawing.Imaging.BitmapData data = bitmap.LockBits(
            rect,
            System.Drawing.Imaging.ImageLockMode.ReadWrite,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb
        );

        try
        {
            int width = bitmap.Width;
            int height = bitmap.Height;
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] pixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);

            bool[] visited = new bool[width * height];
            List<int> largestComponent = new List<int>();
            Queue<int> queue = new Queue<int>();

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int startIndex = (y * width) + x;
                    if (visited[startIndex])
                    {
                        continue;
                    }

                    int startOffset = (y * stride) + (x * 4);
                    if (pixels[startOffset + 3] < 24)
                    {
                        visited[startIndex] = true;
                        continue;
                    }

                    List<int> component = new List<int>();
                    visited[startIndex] = true;
                    queue.Enqueue(startIndex);

                    while (queue.Count > 0)
                    {
                        int index = queue.Dequeue();
                        component.Add(index);

                        int currentX = index % width;
                        int currentY = index / width;

                        for (int ny = currentY - 1; ny <= currentY + 1; ny++)
                        {
                            for (int nx = currentX - 1; nx <= currentX + 1; nx++)
                            {
                                if (nx < 0 || ny < 0 || nx >= width || ny >= height)
                                {
                                    continue;
                                }

                                int neighborIndex = (ny * width) + nx;
                                if (visited[neighborIndex])
                                {
                                    continue;
                                }

                                int neighborOffset = (ny * stride) + (nx * 4);
                                visited[neighborIndex] = true;
                                if (pixels[neighborOffset + 3] < 24)
                                {
                                    continue;
                                }

                                queue.Enqueue(neighborIndex);
                            }
                        }
                    }

                    if (component.Count > largestComponent.Count)
                    {
                        largestComponent = component;
                    }
                }
            }

            bool[] keep = new bool[width * height];
            foreach (int index in largestComponent)
            {
                keep[index] = true;
            }

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int index = (y * width) + x;
                    if (keep[index])
                    {
                        continue;
                    }

                    int offset = (y * stride) + (x * 4);
                    pixels[offset] = 0;
                    pixels[offset + 1] = 0;
                    pixels[offset + 2] = 0;
                    pixels[offset + 3] = 0;
                }
            }

            Marshal.Copy(pixels, 0, data.Scan0, byteCount);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static int[] GetRowInkCounts(Bitmap bitmap, byte alphaThreshold)
    {
        int[] rowInk = new int[bitmap.Height];
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        System.Drawing.Imaging.BitmapData data = bitmap.LockBits(
            rect,
            System.Drawing.Imaging.ImageLockMode.ReadOnly,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb
        );

        try
        {
            int width = bitmap.Width;
            int height = bitmap.Height;
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] pixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);

            for (int y = 0; y < height; y++)
            {
                int count = 0;
                for (int x = 0; x < width; x++)
                {
                    int offset = (y * stride) + (x * 4);
                    byte a = pixels[offset + 3];
                    if (a > alphaThreshold)
                    {
                        count++;
                    }
                }

                rowInk[y] = count;
            }
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        return rowInk;
    }

    private static Rectangle GetOpaqueBounds(Bitmap bitmap, byte alphaThreshold, int minY, int maxY)
    {
        int minX = bitmap.Width;
        int top = bitmap.Height;
        int maxX = -1;
        int bottom = -1;

        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        System.Drawing.Imaging.BitmapData data = bitmap.LockBits(
            rect,
            System.Drawing.Imaging.ImageLockMode.ReadOnly,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb
        );

        try
        {
            int width = bitmap.Width;
            int height = bitmap.Height;
            int stride = data.Stride;
            int byteCount = Math.Abs(stride) * height;
            byte[] pixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);

            int startY = Math.Max(0, minY);
            int endY = Math.Min(height - 1, maxY);

            for (int y = startY; y <= endY; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int offset = (y * stride) + (x * 4);
                    byte a = pixels[offset + 3];
                    if (a <= alphaThreshold)
                    {
                        continue;
                    }

                    if (x < minX) minX = x;
                    if (y < top) top = y;
                    if (x > maxX) maxX = x;
                    if (y > bottom) bottom = y;
                }
            }
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        if (maxX < minX || bottom < top)
        {
            return new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        }

        return Rectangle.FromLTRB(minX, top, maxX + 1, bottom + 1);
    }

    private static Rectangle GetPrimarySymbolBounds(Bitmap bitmap, byte alphaThreshold)
    {
        int upperRegionMaxY = Math.Min(bitmap.Height - 1, (int)(bitmap.Height * 0.74));
        return GetOpaqueBounds(bitmap, alphaThreshold, 0, upperRegionMaxY);
    }

    private static Bitmap CropToSquare(Bitmap bitmap, Rectangle bounds, int padding)
    {
        int side = Math.Max(bounds.Width, bounds.Height) + (padding * 2);
        side = Math.Max(side, Math.Max(bounds.Width, bounds.Height));

        Bitmap output = new Bitmap(side, side, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(output))
        {
            graphics.Clear(Color.Transparent);
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

            int destX = (side - bounds.Width) / 2;
            int destY = (side - bounds.Height) / 2;

            graphics.DrawImage(
                bitmap,
                new Rectangle(destX, destY, bounds.Width, bounds.Height),
                bounds,
                GraphicsUnit.Pixel
            );
        }

        return output;
    }

    public static Bitmap Resize(Bitmap bitmap, int size)
    {
        Bitmap output = new Bitmap(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(output))
        {
            graphics.Clear(Color.Transparent);
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            graphics.DrawImage(bitmap, new Rectangle(0, 0, size, size));
        }

        return output;
    }
}
"@

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$OutputPath
  )

  $outputDirectory = Split-Path -Parent $OutputPath
  if (-not (Test-Path $outputDirectory)) {
    New-Item -Path $outputDirectory -ItemType Directory | Out-Null
  }

  $Bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-IcoFromBitmap {
  param(
    [System.Drawing.Bitmap]$SourceBitmap,
    [string]$OutputPath,
    [int[]]$Sizes
  )

  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("icon-from-source-" + [guid]::NewGuid().ToString('N'))
  New-Item -Path $tempDir -ItemType Directory | Out-Null

  try {
    $frames = foreach ($size in $Sizes) {
      $pngPath = Join-Path $tempDir ("icon-$size.png")
      $resized = [IconImageProcessor]::Resize($SourceBitmap, $size)
      try {
        Save-Png -Bitmap $resized -OutputPath $pngPath
      } finally {
        $resized.Dispose()
      }

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
$publicDir = Join-Path $root 'public'
$iconDir = Join-Path $root 'src-tauri\icons'
$sourcePath = Join-Path $publicDir 'icon-source.png'
$pngPath = Join-Path $publicDir 'app-icon-256.png'
$icoPath = Join-Path $iconDir 'icon.ico'

if (-not (Test-Path $sourcePath)) {
  throw "Source icon not found: $sourcePath"
}

$sourceBitmap = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
  $prepared = [IconImageProcessor]::PrepareIcon($sourceBitmap)
  try {
    $pngBitmap = [IconImageProcessor]::Resize($prepared, 256)
    try {
      Save-Png -Bitmap $pngBitmap -OutputPath $pngPath
    } finally {
      $pngBitmap.Dispose()
    }

    New-IcoFromBitmap -SourceBitmap $prepared -OutputPath $icoPath -Sizes @(16, 32, 48, 64, 128, 256)
  } finally {
    $prepared.Dispose()
  }
} finally {
  $sourceBitmap.Dispose()
}

Write-Output "Generated icon assets from icon-source.png:"
Write-Output $pngPath
Write-Output $icoPath
