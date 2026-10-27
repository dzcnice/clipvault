$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Storage.Streams.DataWriter, Windows.Foundation, ContentType=WindowsRuntime]
  $ocrPayload = [Console]::In.ReadLine() | ConvertFrom-Json
  if (!$ocrPayload.base64 -or $ocrPayload.base64.Length -gt 45000000) { throw 'Invalid input' }
  $ocrBytes = [Convert]::FromBase64String($ocrPayload.base64)
  $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (!$ocrEngine) { throw 'No OCR language available' }
  $awaitMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  function Await-Ocr($operation, [Type]$resultType) {
    $ocrTask = $awaitMethod.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $ocrTask.GetAwaiter().GetResult()
  }
  $ocrStream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
  $ocrWriter = [Windows.Storage.Streams.DataWriter]::new($ocrStream)
  $ocrWriter.WriteBytes($ocrBytes)
  $null = Await-Ocr ($ocrWriter.StoreAsync()) ([uint32])
  $ocrStream.Seek(0)
  $ocrDecoder = Await-Ocr ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ocrStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $ocrBitmap = Await-Ocr ($ocrDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  if ($ocrBitmap.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $ocrBitmap.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) { throw 'Image dimensions exceed OCR limit' }
  $ocrResult = Await-Ocr ($ocrEngine.RecognizeAsync($ocrBitmap)) ([Windows.Media.Ocr.OcrResult])
  @{ success = $true; text = (($ocrResult.Lines | ForEach-Object { $_.Text }) -join "`n"); language = $ocrEngine.RecognizerLanguage.LanguageTag } | ConvertTo-Json -Compress
} catch {
  @{ success = $false; error = 'Local OCR unavailable. Check installed Windows recognition languages.' } | ConvertTo-Json -Compress
  exit 1
} finally {
  if ($ocrBitmap) { $ocrBitmap.Dispose() }
  if ($ocrWriter) { $null = $ocrWriter.DetachStream(); $ocrWriter.Dispose() }
  if ($ocrStream) { $ocrStream.Dispose() }
  if ($ocrBytes) { [Array]::Clear($ocrBytes, 0, $ocrBytes.Length) }
}
