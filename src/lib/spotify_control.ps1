# Envoie une commande de lecture (previous/toggle/next) à la session Spotify
# via les Global System Media Transport Controls de Windows - même API que
# spotify_nowplaying.ps1, donc aucune élévation ni compte/API Spotify requis.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("previous", "toggle", "next")]
    [string]$Action
)

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
        Write-Output '{"ok":false}'
        exit 0
    }

    $ok = switch ($Action) {
        "previous" { Await ($spotify.TrySkipPreviousAsync()) ([bool]) }
        "toggle"   { Await ($spotify.TryTogglePlayPauseAsync()) ([bool]) }
        "next"     { Await ($spotify.TrySkipNextAsync()) ([bool]) }
    }

    "{`"ok`":$($ok.ToString().ToLower())}"
} catch {
    Write-Output '{"ok":false}'
}
