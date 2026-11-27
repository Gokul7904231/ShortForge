import os
import sys
import time
import random
import json
import argparse
import requests
from pathlib import Path

# Load env before any imports that require it
def load_env():
    # Try current directory first, then apps/web folder
    current_env = Path(__file__).resolve().parent / ".env"
    web_env = Path(__file__).resolve().parent.parent / "apps" / "web" / ".env"
    env_path = current_env if current_env.exists() else web_env

    if env_path.exists():
        print(f"[Scheduler] Loading environment variables from {env_path}")
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                val = val.replace("\\n", "\n")
                os.environ[key] = val
    else:
        print("[Scheduler] Warning: No .env configuration file found.")

load_env()

# Initialize Firebase admin SDK
import firebase_admin
from firebase_admin import credentials, firestore

def _init_firebase() -> None:
    if firebase_admin._apps:
        return
        
    bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET")
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    
    if sa_json:
        try:
            cred = credentials.Certificate(json.loads(sa_json))
            firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})
            print("[Scheduler] Firebase Initialized with Service Account JSON.")
            return
        except Exception as e:
            print(f"[Scheduler] Firebase Service Account JSON init failed: {e}")
            
    private_key = os.environ.get("FIREBASE_PRIVATE_KEY")
    client_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    
    if private_key and client_email and project_id:
        try:
            cred_dict = {
                "type": "service_account",
                "project_id": project_id,
                "private_key": private_key.replace("\\n", "\n"),
                "client_email": client_email,
                "token_uri": "https://oauth2.googleapis.com/token"
            }
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})
            print("[Scheduler] Firebase Initialized with individual parameters.")
            return
        except Exception as e:
            print(f"[Scheduler] Firebase Individual parameters init failed: {e}")
            
    try:
        firebase_admin.initialize_app(options={"storageBucket": bucket_name})
        print("[Scheduler] Firebase Initialized with default credentials.")
    except Exception as e:
        print(f"[Scheduler] Firebase Fallback initialization failed: {e}")

# The 150 Target Countries Pool (15 days * 10 per day)
COUNTRIES = [
    "US", "GB", "IN", "JP", "IT", "BR", "DE", "FR", "CA", "AU", # Batch 1
    "MX", "ES", "RU", "CN", "ZA", "EG", "SA", "TR", "AR", "CO", # Batch 2
    "PE", "CL", "VE", "SE", "NO", "FI", "DK", "NL", "BE", "CH", # Batch 3
    "AT", "PL", "GR", "PT", "CZ", "HU", "RO", "UA", "IE", "NZ", # Batch 4
    "KR", "SG", "MY", "TH", "ID", "PH", "VN", "PK", "BD", "NG", # Batch 5
    "KE", "GH", "MA", "DZ", "AE", "IL", "QA", "KW", "OM", "BH", # Batch 6
    "IQ", "IR", "SY", "LB", "JO", "AF", "LK", "NP", "MM", "KH", # Batch 7
    "LA", "TW", "HK", "MO", "MN", "KZ", "UZ", "TM", "KG", "TJ", # Batch 8
    "AZ", "GE", "AM", "BY", "MD", "RS", "HR", "BA", "MK", "AL", # Batch 9
    "BG", "SK", "SI", "EE", "LV", "LT", "IS", "LU", "MC", "LI", # Batch 10
    "SM", "MT", "CY", "JM", "HT", "DO", "CU", "PR", "BS", "BB", # Batch 11
    "TT", "PA", "CR", "NI", "HN", "SV", "GT", "BZ", "UY", "PY", # Batch 12
    "BO", "EC", "GY", "SR", "SN", "CI", "CM", "AO", "MZ", "TZ", # Batch 13
    "UG", "ZM", "ZW", "MW", "MG", "MU", "SC", "MV", "FJ", "PG", # Batch 14
    "WS", "TO", "VU", "SB", "KI", "MH", "FM", "PW", "NR", "TV"  # Batch 15
]
DIFFICULTIES = ["Easy", "Medium", "Hard"]

def run_autonomous_generation():
    print("\n" + "="*60)
    print(f"[Scheduler] JOB START: Triggering Autonomous Quiz Generation & Render...")
    print("="*60)
    
    try:
        # Check Admin Kill Switch from Firestore (fail-open)
        _init_firebase()
        db = firestore.client()
        # Fetch Automation State for the 15-Day Wheel
        state_ref = db.collection("system_config").document("automation_state")
        state_doc = state_ref.get()
        
        current_batch_day = 1
        successful_runs_today = 0
        completed_countries_today = []
        
        if state_doc.exists:
            state_data = state_doc.to_dict()
            if state_data.get("isFactoryActive") is False:
                print("[Scheduler][ADMIN] Factory is currently paused. Skipping this interval.")
                return
            current_batch_day = state_data.get("current_batch_day", 1)
            successful_runs_today = state_data.get("successful_runs_today", 0)
            completed_countries_today = state_data.get("completed_countries_today", [])
            
        # Check if batch day needs to advance
        if successful_runs_today >= 10:
            current_batch_day += 1
            if current_batch_day > 15:
                current_batch_day = 1
            successful_runs_today = 0
            completed_countries_today = []
            print(f"[Scheduler] Advancing to Batch Day {current_batch_day}")
            state_ref.set({
                "current_batch_day": current_batch_day,
                "successful_runs_today": successful_runs_today,
                "completed_countries_today": completed_countries_today
            }, merge=True)
            
        # Determine current batch
        start_idx = (current_batch_day - 1) * 10
        batch_countries = COUNTRIES[start_idx : start_idx + 10]
        
        # Pick a country from the batch that hasn't been completed today
        available_countries = [c for c in batch_countries if c not in completed_countries_today]
        if not available_countries:
            print("[Scheduler] Warning: All batch countries completed but successful runs < 10. Randomizing fallback.")
            available_countries = batch_countries
            
        country_code = random.choice(available_countries)
        difficulty = random.choice(DIFFICULTIES)
        tone = "challenging"
        format_type = "8_rapid"
        
        print(f"[Scheduler] Selected Profile: Country={country_code}, Difficulty={difficulty}, Batch Day={current_batch_day}")
        
        # 2. Fetch past 24 questions for negative constraints
        print(f"[Scheduler] Fetching historical questions for {country_code} to prevent repetition...")
        negative_constraints = []
        try:
            past_quizzes = db.collection("quizzes").where("country", "==", country_code).order_by("createdAt", direction=firestore.Query.DESCENDING).limit(3).stream()
            for doc in past_quizzes:
                data = doc.to_dict()
                questions = data.get("questions", [])
                for q in questions:
                    if "question" in q:
                        negative_constraints.append(q["question"])
        except Exception as qe:
            print(f"[Scheduler] Warning: Failed to fetch negative constraints ({qe}). Proceeding without them.")
            
        print(f"[Scheduler] Loaded {len(negative_constraints)} negative constraints.")
        
        # Check and increment target version ID in Firestore
        prefix = f"quiz_{country_code.lower()}_{tone}_{format_type}_v"
        docs = db.collection("quizzes").list_documents()
        versions = [0]
        for doc in docs:
            if doc.id.startswith(prefix):
                try:
                    v_part = doc.id[len(prefix):]
                    versions.append(int(v_part))
                except Exception:
                    pass
                    
        next_version = max(versions) + 1
        
        # 3. POST to Next.js API /api/quiz/generate (The Indestructible Cascade)
        next_api_url = os.environ.get("NEXT_API_URL", "http://localhost:3000")
        geo_url = f"{next_api_url}/api/quiz/generate"
        
        geo_payload = {
            "countryCode": country_code,
            "tone": tone,
            "format": format_type,
            "version": next_version,
            "negativeConstraints": negative_constraints
        }
        
        print(f"[Scheduler] Dispatching POST to {geo_url}...")
        geo_res = requests.post(geo_url, json=geo_payload, timeout=60)
        
        if geo_res.status_code != 200:
            raise RuntimeError(f"Next.js geo generation endpoint failed ({geo_res.status_code}): {geo_res.text}")
            
        quiz_data = geo_res.json()
        quiz_id = quiz_data.get("quizId")
        print(f"[Scheduler] Quiz draft created/fetched successfully. Quiz ID: {quiz_id}")
        
        # 4. POST to Next.js API /api/quiz/compile to trigger pipeline execution ( FFmpeg + Cloudinary )
        compile_url = f"{next_api_url}/api/quiz/compile"
        compile_payload = {
            "quizId": quiz_id,
            "theme": quiz_data["country"],
            "questions": quiz_data["questions"],
            "hook": quiz_data["hook"],
            "gradingScale": quiz_data["gradingScale"],
            "voiceCode": quiz_data["voiceCode"],
            "flagUrl": quiz_data["flagUrl"],
            "country": quiz_data["country"],
            "difficulty": difficulty,
            "version": next_version,
            "batch": "1"
        }
        
        print(f"[Scheduler] Dispatching POST to {compile_url}...")
        compile_res = requests.post(compile_url, json=compile_payload, timeout=60)
        
        if compile_res.status_code != 200:
            raise RuntimeError(f"Next.js compile/trigger endpoint failed ({compile_res.status_code}): {compile_res.text}")
            
        compile_result = compile_res.json()
        print(f"[Scheduler] Pipeline successfully triggered. Job ID: {compile_result.get('jobId')} (Status: {compile_result.get('status')})")
        print("[Scheduler] JOB SUCCESS: Pipeline is executing in background.")
        
        # Increment successful runs and record completed country
        successful_runs_today += 1
        completed_countries_today.append(country_code)
        state_ref.set({
            "current_batch_day": current_batch_day,
            "successful_runs_today": successful_runs_today,
            "completed_countries_today": completed_countries_today
        }, merge=True)
        print(f"[Scheduler] Recorded success in Firestore. ({successful_runs_today}/10 for Batch {current_batch_day})")

        
    except Exception as e:
        print(f"[Scheduler][ERROR] Autonomous job execution failed: {e}")
        print("[Scheduler] Scheduler will remain active for the next interval pass.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Autonomous Geo-Quiz Background Scheduler Daemon")
    parser.add_argument("--test-now", action="store_true", help="Execute the generation task immediately once and exit")
    args = parser.parse_args()
    
    if args.test_now:
        run_autonomous_generation()
        sys.exit(0)
        
    from apscheduler.schedulers.background import BackgroundScheduler
    
    # Start scheduler daemon
    scheduler = BackgroundScheduler()
    # 10 times a day = 144 minutes interval
    interval_minutes = 144
    
    scheduler.add_job(
        run_autonomous_generation,
        trigger='interval',
        minutes=interval_minutes,
        id='quiz_factory_job',
        name='Generate Quiz Video 10x Daily'
    )
    
    print(f"[Scheduler] Starting BackgroundScheduler. Interval = {interval_minutes} minutes (10x Daily).")
    scheduler.start()
    
    try:
        # Keep main thread alive
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        print("[Scheduler] Shutting down background daemon.")
        scheduler.shutdown()
