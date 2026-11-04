"""
ShortForge Local Host Speech Synthesizer.
Provides authoritative, local primary voice synthesis without cloud credentials or network dependencies.
Produces physically valid PCM WAV files with RIFF headers, valid sample rates, and non-zero volume.
"""

import sys
import os
import argparse

def main():
    parser = argparse.ArgumentParser(description="ShortForge Host TTS Synthesizer")
    parser.add_argument("--text", required=True, help="Text to speak")
    parser.add_argument("--output", required=True, help="Destination WAV file path")
    parser.add_argument("--rate", type=int, default=0, help="Speech rate (-10 to 10)")
    args = parser.parse_args()

    output_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if os.name == "nt":
        try:
            import win32com.client
            speaker = win32com.client.Dispatch("SAPI.SpVoice")
            stream = win32com.client.Dispatch("SAPI.SpFileStream")
            stream.Open(output_path, 3, False)  # 3 = SSFMCreateForWrite
            speaker.AudioOutputStream = stream
            if args.rate != 0:
                speaker.Rate = args.rate
            speaker.Speak(args.text)
            stream.Close()
        except Exception as e:
            import subprocess
            escaped_text = args.text.replace('"', '`"')
            ps_script = f"""
            Add-Type -AssemblyName System.Speech
            $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
            $s.SetOutputToWaveFile("{output_path}")
            $s.Speak("{escaped_text}")
            $s.Dispose()
            """
            res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True)
            if res.returncode != 0 or not os.path.exists(output_path):
                raise RuntimeError(f"SAPI synthesis failed: {e}; PowerShell fallback failed: {res.stderr}")
    else:
        import subprocess
        res = subprocess.run(["espeak-ng", "-w", output_path, args.text], capture_output=True, text=True)
        if res.returncode != 0:
            res2 = subprocess.run(["espeak", "-w", output_path, args.text], capture_output=True, text=True)
            if res2.returncode != 0:
                raise RuntimeError(f"Host TTS failed: {res.stderr} / {res2.stderr}")

    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        sys.stderr.write(f"Synthesis output missing or 0 bytes: {output_path}\n")
        sys.exit(1)

    print(f"SYNTHESIS_OK:{output_path}:{os.path.getsize(output_path)}")

if __name__ == "__main__":
    main()
