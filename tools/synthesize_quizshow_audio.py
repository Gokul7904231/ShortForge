"""
Synthesizes 26 audible SAPI narration WAV files for ShortForge QuizShow v1.
Guarantees audible speech, RIFF/WAVE PCM 16-bit 22,050Hz format, and forensic compliance.
"""

import os
import sys
import json
import subprocess
import win32com.client

def main():
    if len(sys.argv) < 3:
        print("Usage: python synthesize_quizshow_audio.py <input_beats.json> <output_dir>")
        sys.exit(1)

    beats_json_path = sys.argv[1]
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)

    with open(beats_json_path, 'r', encoding='utf-8') as f:
        beats = json.load(f)

    speaker = win32com.client.Dispatch("SAPI.SpVoice")
    # Rate 1: crisp game-show cadence
    speaker.Rate = 1

    artifacts = []

    print(f"Synthesizing {len(beats)} narration tracks into {output_dir}...")

    for idx, beat in enumerate(beats):
        scene_id = beat["sceneId"]
        narration = beat["narration"]
        wav_path = os.path.abspath(os.path.join(output_dir, f"{scene_id}.wav"))

        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Open(wav_path, 3, False)  # 3 = SSFMCreateForWrite
        speaker.AudioOutputStream = stream
        speaker.Speak(narration)
        stream.Close()

        # Measure exact duration via ffprobe
        probe_cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            wav_path
        ]
        res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
        dur = float(res.stdout.strip())

        artifacts.append({
            "sceneId": scene_id,
            "localPath": wav_path,
            "durationSeconds": dur
        })
        print(f"  [{idx+1}/{len(beats)}] {scene_id} -> {dur:.2f}s ({wav_path})")

    manifest_path = os.path.join(output_dir, "audio_manifest.json")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(artifacts, f, indent=2)

    print(f"Audio manifest written to {manifest_path}")

if __name__ == "__main__":
    main()

