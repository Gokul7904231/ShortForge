Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$audioDir = "C:\Users\ASUS\OneDrive\Desktop\123\ShortForge-production-acceptance\apps\web\data\audio"
if (!(Test-Path $audioDir)) {
    New-Item -ItemType Directory -Path $audioDir -Force | Out-Null
}
$wavFile = Join-Path $audioDir "creator_narration_sapi.wav"
$synth.SetOutputToWaveFile($wavFile)
$scriptText = "Welcome to ShortForge. Today, we are exploring the Mariana Trench, the deepest point on Planet Earth. Plunging nearly eleven kilometers beneath the ocean surface, the water pressure exceeds one thousand atmospheres. Yet, remarkable creatures thrive in complete darkness, completely defying known biological limits. This is genuine ShortForge video production."
$synth.Speak($scriptText)
$synth.Dispose()
Write-Host "Audio synthesized successfully: $wavFile"

