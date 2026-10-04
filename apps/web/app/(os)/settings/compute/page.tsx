"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  Cpu,
  ExternalLink,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type CredentialInput = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  helpText?: string;
};

type CredentialProfile = {
  id: string;
  label: string;
  authMethod: string;
  requiredKeys: string[];
  optionalKeys?: string[];
  inputs: CredentialInput[];
  advanced?: boolean;
};

type Provider = {
  providerId: string;
  providerFamily: "NOTEBOOK" | "SANDBOX" | "API_GPU";
  displayName: string;
  authMethod: string;
  connectionExperience: "OAUTH" | "GUIDED_MANUAL" | "MANUAL";
  credentialKeys: string[];
  configurableKeys: string[];
  credentialProfiles?: CredentialProfile[];
  oauth?: { startPath: string; scopes: string[] };
  setupUrl?: string;
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
  externalAccountId?: string;
  metadata?: Record<string, string>;
  secretKeys?: string[];
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

const fallbackInput = (key: string): CredentialInput => ({
  key,
  label: key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" "),
  secret: /(key|token|secret|password|credential)/i.test(key),
  required: true,
});

function preferredProfile(provider: Provider): CredentialProfile {
  const profile = provider.credentialProfiles?.find((item) => !item.advanced);
  if (profile) return profile;
  return {
    id: "default",
    label: provider.displayName,
    authMethod: provider.authMethod,
    requiredKeys: provider.credentialKeys,
    inputs: provider.credentialKeys.map(fallbackInput),
  };
}

export default function ComputeConnectionsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [role, setRole] = useState("USER");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    const params = new URLSearchParams(window.location.search);
    const kaggle = params.get("kaggle");
    if (kaggle === "connected") {
      setNotice("Kaggle connected. ShortForge will refresh the access token automatically when needed.");
    } else if (kaggle === "oauth_unavailable") {
      setNotice("One-click Kaggle connection is not enabled on this ShortForge deployment yet. Use the advanced token option or ask the administrator to enable the Kaggle OAuth client.");
    } else if (kaggle === "oauth_denied") {
      setNotice("Kaggle authorization was cancelled.");
    } else if (kaggle === "oauth_error") {
      setError(params.get("message") || "Kaggle connection failed.");
    }
  }, []);

  function openProvider(provider: Provider) {
    setError(null);
    setNotice(null);
    setSelected(provider);
    setDisplayName(provider.displayName);
    setValues({});
    setAdvancedMode(provider.connectionExperience !== "OAUTH");
  }

  async function connectManually() {
    if (!selected) return;
    const profile = advancedMode
      ? (selected.credentialProfiles?.find((item) => item.advanced) || preferredProfile(selected))
      : preferredProfile(selected);
    const missing = profile.requiredKeys.filter((key) => !values[key]);
    if (missing.length) {
      setError("Please complete: " + profile.inputs.filter((input) => missing.includes(input.key)).map((input) => input.label).join(", "));
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
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
        setNotice(
          "Connection saved, but verification failed: " +
            (validationData.error || "unknown validation error"),
        );
      } else {
        setNotice("Connected and verified. ShortForge can now route work to this provider.");
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

  function connectWithOAuth() {
    if (!selected?.oauth?.startPath) return;
    setSaving(true);
    window.location.assign(selected.oauth.startPath);
  }

  async function validate(connectionId: string) {
    setBusyId(connectionId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/compute/connections/" + connectionId, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Validation failed.");
      setNotice("Connection verified successfully.");
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
    setNotice(null);
    try {
      const response = await fetch("/api/compute/connections/" + connectionId, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove connection.");
      setNotice("Connection removed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove connection.");
    } finally {
      setBusyId(null);
    }
  }

  const selectedProfile = selected
    ? advancedMode
      ? (selected.credentialProfiles?.find((item) => item.advanced) || preferredProfile(selected))
      : preferredProfile(selected)
    : null;

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
            Connect your own compute accounts once. ShortForge keeps credentials server-side,
            verifies the provider, and lets ComputeRouter handle selection automatically.
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

      {notice && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm text-emerald-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-8 grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 md:grid-cols-3">
        {([["LOCAL", "Local rendering"], ["NOTEBOOK", "Notebook compute"], ["REMOTE", "Remote compute"]] as const).map(([kind, label]) => (
          <div key={kind} className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Cpu className="h-4 w-4 text-slate-400" />
              {label}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {kind === "LOCAL"
                ? "Available without connecting a remote provider."
                : kind === "NOTEBOOK"
                  ? "Basic users can connect supported notebook accounts."
                  : role === "USER"
                    ? "Remote API/GPU surfaces are not part of the Basic-user experience yet."
                    : "Admin-only provider surface."}
            </p>
          </div>
        ))}
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Connected compute</h2>
            <p className="text-sm text-slate-500">ShortForge never shows your raw provider credentials after connection.</p>
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
            <p className="mt-1 text-xs text-slate-500">Pick a provider below. You only do this once.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {connections.map((connection) => {
              const busy = busyId === connection.connectionId;
              const account = connection.metadata?.kaggleUsername;
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
                    {account && (
                      <p className="mt-1 text-xs text-slate-500">Connected as {account}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-600">
                      Last verified: {connection.lastValidatedAt ? new Date(connection.lastValidatedAt).toLocaleString() : "Not verified yet"}
                    </p>
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
            Use the simplest provider connection ShortForge can safely support. Advanced credentials are a fallback, not the default.
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
              <p className="mt-3 text-xs font-medium text-slate-500">
                {provider.connectionExperience === "OAUTH"
                  ? "One-click connection available"
                  : provider.connectionExperience === "GUIDED_MANUAL"
                    ? "Guided connection"
                    : "Advanced connection"}
              </p>
            </button>
          ))}
        </div>

        {role !== "USER" && plannedProviders.length > 0 && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
            <h3 className="text-sm font-semibold text-slate-300">Admin integrations staged</h3>
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
                <h2 className="text-xl font-semibold text-slate-100">Connect {selected.displayName}</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.description}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-900 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {selected.connectionExperience === "OAUTH" && !advancedMode ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                    <ShieldCheck className="h-4 w-4" />
                    Recommended: connect securely
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    You will be sent to {selected.displayName} to sign in and approve ShortForge.
                    No provider password or raw API key is entered into ShortForge.
                  </p>
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
                    Requested access: {selected.oauth?.scopes.join(", ")}
                  </div>
                </div>

                <button
                  disabled={saving}
                  onClick={connectWithOAuth}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  Connect with {selected.displayName}
                </button>

                <button
                  onClick={() => setAdvancedMode(true)}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-300"
                >
                  Use an advanced API-token connection instead
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {selected.connectionExperience === "GUIDED_MANUAL" && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm leading-6 text-slate-400">
                    ShortForge needs a small amount of provider setup because this provider does not expose a suitable delegated web authorization flow here.
                    Enter it once; the values are encrypted on the server and never shown again.
                  </div>
                )}

                {advancedMode && selected.connectionExperience === "OAUTH" && (
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="text-xs leading-5 text-slate-500">
                      Advanced fallback. Prefer the normal provider authorization button above whenever it is available.
                    </div>
                    <button
                      onClick={() => setAdvancedMode(false)}
                      className="shrink-0 text-xs text-slate-300 hover:text-white"
                    >
                      Back
                    </button>
                  </div>
                )}

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

                {selectedProfile?.inputs.map((input) => (
                  <div key={input.key}>
                    <label className="mb-2 block text-xs font-medium text-slate-300">
                      {input.label}
                      {!input.required && <span className="ml-1 text-slate-600">(optional)</span>}
                    </label>
                    <input
                      type={input.secret ? "password" : "text"}
                      autoComplete="off"
                      placeholder={input.placeholder}
                      value={values[input.key] || ""}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [input.key]: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-slate-600"
                    />
                    {input.helpText && <p className="mt-1.5 text-xs leading-5 text-slate-600">{input.helpText}</p>}
                  </div>
                ))}

                {selected.setupUrl && (
                  <a
                    href={selected.setupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Provider setup help
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs leading-5 text-slate-500">
                  Your raw credential values are sent only to the ShortForge server, stored encrypted,
                  and never returned to the browser after submission.
                </div>

                <button
                  disabled={saving}
                  onClick={() => void connectManually()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {saving ? "Connecting…" : "Connect and verify"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
