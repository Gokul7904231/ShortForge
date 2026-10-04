from lightning_sdk import Studio
import os
import json

teamspace = os.environ.get("LIGHTNING_TEAMSPACE")
if not teamspace:
    raise RuntimeError("LIGHTNING_TEAMSPACE is required.")
org, space = teamspace.split("/", 1)

names = [
    "shortforge-lightning-physical-1791094737740-782d8bf4",
    "shortforge-lightning-physical-1791094738997-4c5bb705",
    "shortforge-lightning-physical-1791094770713-3d4b01ac",
    "shortforge-lightning-physical-1791094914328-10a718a9",
    "shortforge-lightning-physical-1791094944421-9cd3fe21",
    "shortforge-lightning-physical-1791095267471-0297af06",
    "shortforge-lightning-physical-1791095295813-d3419801",
    "shortforge-lightning-physical-1791095302327-d631d553",
    "shortforge-lightning-physical-1791095314064-caf0f48f",
    "shortforge-lightning-physical-1791095494950-764871cc",
    "shortforge-lightning-physical-1791095507001-554e6a03",
    "shortforge-lightning-physical-1791095524978-e401b8b7",
    "shortforge-lightning-physical-1791095526091-1cfd1b7d",
    "shortforge-live-lightning-probe-1791007995786",
]

for name in names:
    try:
        studio = Studio(name, teamspace=space, org=org, create_ok=False)
        print(json.dumps({
            "name": name,
            "status": str(studio.status),
            "machine": str(getattr(studio, "machine", "")),
        }))
    except Exception as error:
        print(json.dumps({
            "name": name,
            "status": "ERROR",
            "error": str(error),
        }))
