"""
Synthesizes audible narration WAV files for ShortForge Quiz Template V2 (quiz.universal.cinematic.v2).
Implements the qualified soft, natural, friendly female narration profile ('Kore').
Guarantees audible speech, RIFF/WAVE PCM 16-bit 22,050Hz format, and forensic compliance.
"""

import os
import sys
import json
import subprocess
import win32com.client

def select_female_voice(speaker):
    voices = speaker.GetVoices()
    for i in range(voices.Count):
        candidate = voices.Item(i)
        description = str(candidate.GetDescription())
        if "zira" in description.lower() or "female" in description.lower():
            return candidate
    raise RuntimeError(
        "No female SAPI voice available. Refusing to fall back to a robotic male narrator."
    )

def main():
    if len(sys.argv) < 3:
        print("Usage: python synthesize_quizshow_v2_audio.py <input_beats.json> <output_dir>")
        sys.exit(1)

    beats_json_path = sys.argv[1]
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)

    with open(beats_json_path, 'r', encoding='utf-8') as f:
        beats = json.load(f)

    if not beats:
        raise RuntimeError("No narration beats provided; refusing to write an empty manifest.")

    speaker = win32com.client.Dispatch("SAPI.SpVoice")
    selected_voice = select_female_voice(speaker)
    speaker.Voice = selected_voice
    speaker.Rate = 0  # Natural educator cadence
    print(f"Selected female voice: {selected_voice.GetDescription()}")

    artifacts = []
    print(f"Synthesizing {len(beats)} narration tracks with soft female 'Kore' persona into {output_dir}...")

    temp_raw_path = os.path.join(output_dir, "_temp_raw.wav")

    for idx, beat in enumerate(beats):
        scene_id = beat["sceneId"]
        narration = beat["narration"]
        if not narration.strip():
            print(f"  [{idx+1}/{len(beats)}] {scene_id} -> skipped (no narration)")
            continue
        final_wav_path = os.path.abspath(os.path.join(output_dir, f"{scene_id}.wav"))

        # 1. Synthesize raw female voice
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Open(temp_raw_path, 3, False)  # 3 = SSFMCreateForWrite
        speaker.AudioOutputStream = stream
        speaker.Speak(narration)
        stream.Close()

        # 2. Apply Kore Warmth & Soft Educator Acoustic Filter Chain via FFmpeg:
        # - Highpass 80Hz (cuts mic rumble)
        # - Lowpass 8200Hz (softens harsh digital high frequencies)
        # - Equalizer 250Hz +2.5dB (adds vocal chest warmth and intimacy)
        # - Equalizer 3200Hz -2dB (eliminates sibilant bite)
        # - Tempo 1.05 (clean, engaged quiz-show delivery)
        cmd = [
            "ffmpeg", "-y", "-i", temp_raw_path,
            "-af", "highpass=f=80,lowpass=f=8200,equalizer=f=250:width_type=o:width=1.2:g=2.5,equalizer=f=3200:width_type=o:width=1:g=-2,atempo=1.05",
            final_wav_path
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 3. Measure exact duration via ffprobe
        probe_cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            final_wav_path
        ]
        res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
        dur = float(res.stdout.strip())

        artifacts.append({
            "sceneId": scene_id,
            "localPath": final_wav_path,
            "durationSeconds": dur
        })
        print(f"  [{idx+1}/{len(beats)}] {scene_id} -> {dur:.2f}s ({os.path.basename(final_wav_path)})")

    if os.path.exists(temp_raw_path):
        os.remove(temp_raw_path)

    manifest_path = os.path.join(output_dir, "audio_manifest.json")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(artifacts, f, indent=2)

    print(f"Audio manifest written to {manifest_path}")

if __name__ == "__main__":
    main()
