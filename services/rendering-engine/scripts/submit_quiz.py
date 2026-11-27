#!/usr/bin/env python3
"""
CLI Test Harness for Submitting Quiz Short Render Jobs to FactoryOS
===================================================================
Authenticates against FactoryOS Control Plane and queues an ADMIN quiz render job.
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import http.cookiejar

BASE_URL = os.environ.get("CONTROL_PLANE_URL", "http://localhost:3000").rstrip("/")
ADMIN_EMAIL = os.environ.get("FACTORYOS_ADMIN_EMAIL", "gokul32499@gmail.com")
ADMIN_PASSWORD = os.environ.get("FACTORYOS_ADMIN_PASSWORD", "Gokul#333")

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# 1. Login as System Owner / Admin
login_data = json.dumps({
    "email": ADMIN_EMAIL,
    "password": ADMIN_PASSWORD,
    "targetRole": "ADMIN"
}).encode("utf-8")

login_req = urllib.request.Request(
    f"{BASE_URL}/api/auth/login",
    data=login_data,
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with opener.open(login_req, timeout=10) as resp:
        login_res = json.loads(resp.read().decode("utf-8"))
        print("LOGIN_SUCCESS:", json.dumps(login_res))
except Exception as e:
    print(f"LOGIN_FAILED: {e}")
    sys.exit(1)

# 2. Submit Quiz Short Creation with Strict Delivery Target
quiz_payload = {
    "topic": "Quantum Computing Breakthroughs",
    "contentType": "QUIZ_SHORTS",
    "style": "quiz",
    "renderProfile": "FAST_QUIZ",
    "durationSeconds": 45,
    "hook": "Can you ace this Quantum Computing Quiz?",
    "title": "Quantum Computing Breakthroughs",
    "description": "Test your quantum mechanics and quantum computing knowledge!",
    "hashtags": ["#quantum", "#techquiz", "#computerscience"],
    "delivery": {
        "target": "GOOGLE_DRIVE",
        "authMode": "OAUTH_USER",
        "artifactVersion": "v1",
        "allowFallback": False,
    },
    "questions": [
        {
            "question": "What is the fundamental unit of quantum information called?",
            "options": ["Bit", "Qubit", "Byte", "Trubit"],
            "answer": "Qubit",
            "answerIndex": 1
        },
        {
            "question": "Which quantum property allows qubits to exist in multiple states simultaneously?",
            "options": ["Superposition", "Teleportation", "Annealing", "Diffraction"],
            "answer": "Superposition",
            "answerIndex": 0
        },
        {
            "question": "What phenomenon did Einstein famously describe as spooky action at a distance?",
            "options": ["Decoherence", "Quantum Tunneling", "Quantum Entanglement", "Wave Collapse"],
            "answer": "Quantum Entanglement",
            "answerIndex": 2
        },
        {
            "question": "Which famous algorithm polynomializes prime factorization on quantum computers?",
            "options": ["Dijkstra Algorithm", "Shor Algorithm", "Grover Algorithm", "A* Algorithm"],
            "answer": "Shor Algorithm",
            "answerIndex": 1
        },
        {
            "question": "What is the major technical hurdle caused by environmental noise destroying quantum states?",
            "options": ["Quantum Decoherence", "Overclocking", "Latching", "Thermal runaway"],
            "answer": "Quantum Decoherence",
            "answerIndex": 0
        },
        {
            "question": "Which company announced Sycamore achieving quantum computational supremacy in 2019?",
            "options": ["IBM", "Microsoft", "Google", "Intel"],
            "answer": "Google",
            "answerIndex": 2
        }
    ],
    "options": {"difficulty": "medium", "ratio": "9:16"}
}

gen_data = json.dumps(quiz_payload).encode("utf-8")
gen_req = urllib.request.Request(
    f"{BASE_URL}/api/generate-video",
    data=gen_data,
    headers={"Content-Type": "application/json"},
    method="POST"
)

with opener.open(gen_req, timeout=15) as resp:
    gen_res = json.loads(resp.read().decode("utf-8"))
    print("JOB_SUBMISSION_SUCCESS:", json.dumps(gen_res))
