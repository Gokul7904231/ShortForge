import os
from pathlib import Path

def load_env():
    env_path = Path(__file__).resolve().parent.parent / "apps" / "web" / ".env"
    if env_path.exists():
        print(f"Loading env from {env_path}")
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                # Strip quotes if present
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                # Replace escaped newlines
                val = val.replace("\\n", "\n")
                os.environ[key] = val
                # Print loaded key for confirmation (without showing secret value)
                print(f"  Loaded env: {key}")
    else:
        print(f"Warning: No .env found at {env_path}")

if __name__ == "__main__":
    load_env()
    import uvicorn
    print("Starting VPS Shorts Rendering Engine on http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
