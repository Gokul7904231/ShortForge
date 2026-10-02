"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  Cpu,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

type Provider = {
  providerId: string;
  providerFamily: "NOTEBOOK" | "SANDBOX" | "API_GPU";
  displayName: string;
  authMethod: string;
  credentialKeys: string[];
  configurableKeys: string[];
  roles: string[];
  implemented: boolean;
  description: string;
};

type Connection = {
  connectionId: string;
  providerId: string;
  providerFamily: "NOTEBOOK" | "SANDBOX" | "API_GPU";
  displayName: string;
  authMethod: string;
  status: "CONNECTED" | "UNVERIFIED" | "INVALID" | "REVOKED" | "DISCONNECTED" | "BLOCKED";
  maskedSecrets: Record<string, string>;
  secretKeys: string[];
  createdAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
  lastValidationEvidence?: string[];
};

const familyLabels = {
  NOTEBOOK: "Notebook",
  SANDBOX: "Sandbox",
  API_GPU: "API / GPU",
} as const;

function isSecretField(key: string) {
  return ![
    "KAGGLE_USERNAME",
    "LIGHTNING_USER_ID",
    "PAPERSPACE_TEMPLATE_ID",
    "PAPERSPACE_MACHINE_TYPE",
    "PAPERSPACE_REGION",
    "LIGHTNING_MACHINE",
    "LIGHTNING_PYTHON",
    "HF_ZEROGPU_SPACE",
    "HF_ZEROGPU_API_NAME",
  ].includes(key);
}

export default function ComputeConnectionsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [role, setRole] = useState("USER");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const implementedProviders = useMemo(
    () => providers.filter((provider) => provider.implemented),
    [providers],
  );

  const plannedProviders = useMemo(
    () => providers.filter((provider) => !provider.implemented),
    [providers],
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/compute/connections", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load compute connections.");
      setProviders(data.providers || []);
      setConnections(data.connections || []);
      setRole(data.role || "USER");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load compute connections.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function openProvider(provider: Provider) {
    setError(null);
    setSelected(provider);
    setDisplayName(provider.displayName);
    setValues({});
  }

  async function connect() {
    if (!selected) return;

    const missing = selected.credentialKeys.filter((key) => !values[key]);
    if (missing.length) {
      setError("Missing: " + missing.join(", "));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/compute/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selected.providerId,
          displayName: displayName.trim() || selected.displayName,
          credentials: values,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to connect provider.");

      const validationResponse = await fetch(
        "/api/compute/connections/" + data.connection.connectionId,
        { method: "POST" },
      );
      const validationData = await validationResponse.json();
      if (!validationResponse.ok) {
        setError(
          "Connection saved, but verification failed: " +
            (validationData.error || "unknown validation error"),
        );
      }

      setSelected(null);
      setValues({});
      setDisplayName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect provider.");
    } finally {
      setSaving(false);
    }
  }

  async function validate(connectionId: string) {
    setBusyId(connectionId);
    setError(null);
    try {
      const response = await fetch(
        "/api/compute/connections/" + connectionId,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Validation failed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(connectionId: string) {
    setBusyId(connectionId);
    setError(null);
    try {
      const response = await fetch(
        "/api/compute/connections/" + connectionId,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove connection.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove connection.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Cloud className="h-4 w-4" />
            Compute
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
            Compute Connections
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Connect your own remote compute once. ShortForge keeps the credential
            server-side, verifies the connection, and lets ComputeRouter handle the rest.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="mb-6 grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 md:grid-cols-3">
        {(["LOCAL", "NOTEBOOK", "REMOTE"] as const).map((kind) => (
          <div key={kind} className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Cpu className="h-4 w-4 text-slate-400" />
              {kind === "LOCAL" ? "Local rendering" : kind === "NOTEBOOK" ? "Notebook compute" : "Remote compute"}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {kind === "LOCAL"
                ? "Runs on the ShortForge local render path; no provider connection is needed."
                : kind === "NOTEBOOK"
                  ? "Available to Basic users in v1."
                  : role === "USER"
                    ? "Admin-only in v1."
                    : "Admin surface; provider availability depends on the implemented fabric."}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Connected compute</h2>
            <p className="text-sm text-slate-500">Credentials are never shown here after save.</p>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
            {role}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading connections…
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/30 p-8 text-center">
            <LockKeyhole className="mx-auto mb-3 h-7 w-7 text-slate-500" />
            <p className="text-sm font-medium text-slate-300">No remote compute connected yet.</p>
            <p className="mt-1 text-xs text-slate-500">Connect one provider below, then verify it.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {connections.map((connection) => {
              const busy = busyId === connection.connectionId;
              return (
                <div
                  key={connection.connectionId}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-100">{connection.displayName}</h3>
                      <span className="rounded-full bg-slate-900 px-2 py-1 text-[11px] text-slate-400">
                        {familyLabels[connection.providerFamily]}
                      </span>
                      <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
                        {connection.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{connection.providerId}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {connection.secretKeys.map((key) => (
                        <span key={key} className="rounded-md border border-slate-800 px-2 py-1 font-mono text-[10px] text-slate-500">
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void validate(connection.connectionId)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Verify
                    </button>
                    <button
                      onClick={() => void remove(connection.connectionId)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-950/80 px-3 py-2 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Add compute</h2>
          <p className="text-sm text-slate-500">
            In v1, Basic users see notebook connections. Admins also see the future sandbox/API surfaces.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {implementedProviders.map((provider) => (
            <button
              key={provider.providerId}
              onClick={() => openProvider(provider)}
              className="group rounded-2xl border border-slate-800 bg-slate-950/50 p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900/80"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-2">
                  <Cpu className="h-5 w-5 text-slate-300" />
                </div>
                <Plus className="h-4 w-4 text-slate-600 transition group-hover:text-slate-300" />
              </div>
              <h3 className="font-semibold text-slate-100">{provider.displayName}</h3>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                {familyLabels[provider.providerFamily]}
              </p>
              <p className="mt-3 text-sm leading-5 text-slate-400">{provider.description}</p>
            </button>
          ))}
        </div>

        {role !== "USER" && plannedProviders.length > 0 && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
            <h3 className="text-sm font-semibold text-slate-300">Admin integrations staged for v1</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {plannedProviders.map((provider) => (
                <div key={provider.providerId} className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">{provider.displayName}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-600">adapter pending</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{familyLabels[provider.providerFamily]}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">
                  Connect {selected.displayName}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{selected.description}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-900 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Connection name
                </label>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-slate-600"
                />
              </div>

              {selected.credentialKeys.map((key) => (
                <div key={key}>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
                    {key}
                  </label>
                  <input
                    type={isSecretField(key) ? "password" : "text"}
                    autoComplete="off"
                    value={values[key] || ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 font-mono text-sm text-slate-100 outline-none focus:border-slate-600"
                  />
                </div>
              ))}

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs leading-5 text-slate-500">
                ShortForge sends these credentials only to the server, stores the secret bundle encrypted,
                and never returns the raw values after submission.
              </div>

              <button
                disabled={saving}
                onClick={() => void connect()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {saving ? "Connecting…" : "Connect and verify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}