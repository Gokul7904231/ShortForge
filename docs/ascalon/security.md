# Project Ascalon: Security, Sanitization & Secret Scrubbing Specification

## 1. Overview

Project Ascalon implements automated data sanitization and secret detection mechanisms to guarantee that training datasets, replay logs, and telemetry streams are completely devoid of credentials, tokens, and personally identifiable information (PII).

---

## 2. Automated Secret Detection

All data ingested into or exported from the Ascalon trajectory pipeline is validated against regex filters covering known secret patterns:

| Target Pattern | Description | Regex Definition |
| :--- | :--- | :--- |
| **Google API Key** | Cloud / Gemini API Keys | `/AIza[0-9A-Za-z-_]{30,}/` |
| **OpenAI / OpenRouter** | Model Provider Keys | `/sk-[a-zA-Z0-9_-]{20,}/` |
| **Groq API Key** | Groq Fast Inference Keys | `/gsk_[a-zA-Z0-9_-]{20,}/` |
| **NVIDIA NIM** | NVIDIA NIM API Keys | `/nvapi-[a-zA-Z0-9_-]{20,}/` |
| **GitHub Token** | Personal Access Tokens | `/ghp_[a-zA-Z0-9_-]{20,}/` |
| **Bearer Token** | HTTP Authorization Headers | `/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i` |
| **JSON Web Token** | Authentication JWTs | `/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}/` |
| **Private Keys** | RSA / EC PEM Private Keys | `/-----BEGIN\s+PRIVATE\s+KEY-----/` |
| **Clerk Secrets** | Clerk Secret Keys | `/CLERK_SECRET_KEY/i` |

If any attribute or nested string within a trajectory matches these patterns, the `AscalonTrajectoryValidator` halts processing and raises a blocking `SECRET_LEAKAGE` violation.

---

## 3. Capability Boundary Enforcement

- Workers and pipeline agents operate with least-privilege capability tokens.
- No agent may perform network requests, file modifications, or cloud publications without an explicit grant signed by the Guardian regulator.
- Capabilities are strictly enumerated in `training/ascalon/ontology/capabilities.json`. Any invocation of an undeclared capability string triggers a `HALLUCINATED_TOOL` blocking error.
