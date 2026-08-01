# Lit la piste en cours via les Global System Media Transport Controls de
# Windows (l'API que Spotify - et la plupart des lecteurs media - utilisent
# pour exposer "lecture en cours" a l'OS, meme sans app UWP ni OAuth Spotify).
$ErrorActionPreference = "Stop"

function Await($WinRtTask, $ResultType) {
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null

    $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
        ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

    $sessions = $mgr.GetSessions()
    $spotify = $sessions | Where-Object { $_.SourceAppUserModelId -like "*Spotify*" } | Select-Object -First 1

    if (-not $spotify) {
        Write-Output '{"playing":false}'
        exit 0
    }

    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
    $props = Await ($spotify.TryGetMediaPropertiesAsync()) `
        ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])

    $playbackInfo = $spotify.GetPlaybackInfo()
    $isPlaying = $playbackInfo.PlaybackStatus -eq `
        [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing

    $thumbB64 = $null
    if ($props.Thumbnail) {
        try {
            $streamRA = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $asStreamForRead = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
                $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1
            })[0]
            $netStream = $asStreamForRead.Invoke($null, @($streamRA))
            $ms = New-Object System.IO.MemoryStream
            $netStream.CopyTo($ms)
            $thumbB64 = [Convert]::ToBase64String($ms.ToArray())
        } catch {
            $thumbB64 = $null
        }
    }

    $result = [ordered]@{
        playing   = [bool]$isPlaying
        title     = $props.Title
        artist    = $props.Artist
        thumbnail = $thumbB64
    }
    $result | ConvertTo-Json -Compress
} catch {
    Write-Output '{"playing":false}'
}
