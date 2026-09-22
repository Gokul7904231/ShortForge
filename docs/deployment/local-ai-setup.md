# 🛠️ Local AI Provider Setup & Troubleshooting — FactoryOS v1

This guide covers setting up and connecting local AI runtimes (**Ollama**, **LM Studio**, **llama.cpp**) to FactoryOS.

---

## 1. 🚀 Quick Start: Connecting Ollama

### Step 1: Install & Start Ollama
Ensure Ollama is running on your machine:
```bash
ollama serve
```

Pull your desired model:
```bash
ollama pull llama3:8b
# or
ollama pull qwen2.5:7b
```

### Step 2: Configure in FactoryOS Control Center
1. Navigate to **FactoryOS Settings** → **AI Provider Configuration**.
2. Under **Local AI Provider**, enter your endpoint: `http://127.0.0.1:11434`.
3. Click **Detect Models**. FactoryOS will discover `llama3:8b` dynamically.
4. Click **Test Connection**. Once verified, status changes to **CONNECTED**.

---

## 2. 🔌 LM Studio & OpenAI-Compatible Runtimes

1. Launch **LM Studio** and start the local server on `http://127.0.0.1:1234`.
2. Enable CORS in LM Studio server settings.
3. In FactoryOS, select runtime type **LM Studio** and click **Detect Models**.

---

## 3. ⚠️ Troubleshooting Connection Statuses

| Status | Cause | Fix |
| :--- | :--- | :--- |
| `OFFLINE` | Local runtime is not running | Start Ollama or LM Studio service on local machine. |
| `TIMEOUT` | Request took > 3000ms to respond | Check firewall settings or increase `LOCAL_OLLAMA_TIMEOUT_MS`. |
| `MODEL_UNAVAILABLE` | Selected model is not installed | Run `ollama pull <model_id>` to download model weights. |
| `CONNECTED` | Connection & model verified | Ready for local content generation! |
