import type { ComputeProviderDefinition } from "./ComputeConnectionContracts";

const kaggleInputs = [
  {
    key: "KAGGLE_API_TOKEN",
    label: "Kaggle API token",
    secret: true,
    required: true,
    placeholder: "Paste your Kaggle token",
    helpText: "Advanced fallback only. Normal users should use Connect with Kaggle.",
  },
];

const kaggleLegacyInputs = [
  {
    key: "KAGGLE_USERNAME",
    label: "Kaggle username",
    secret: false,
    required: true,
  },
  {
    key: "KAGGLE_KEY",
    label: "Kaggle legacy API key",
    secret: true,
    required: true,
    placeholder: "Paste your legacy Kaggle key",
    helpText: "Compatibility fallback for existing legacy credentials.",
  },
];

const lightningInputs = [
  {
    key: "LIGHTNING_USER_ID",
    label: "Lightning user ID",
    secret: false,
    required: true,
    helpText: "Found in Lightning's programmatic access settings.",
  },
  {
    key: "LIGHTNING_API_KEY",
    label: "Lightning API key",
    secret: true,
    required: true,
    placeholder: "Paste your Lightning API key",
    helpText: "Stored encrypted and never shown again.",
  },
  {
    key: "LIGHTNING_TEAMSPACE",
    label: "Lightning teamspace",
    secret: false,
    required: true,
    placeholder: "org/teamspace",
    helpText: "The teamspace containing the Studio ShortForge should use.",
  },
];

export const COMPUTE_PROVIDER_CATALOG: ComputeProviderDefinition[] = [
  {
    providerId: "notebook_kaggle",
    providerFamily: "NOTEBOOK",
    displayName: "Kaggle",
    authMethod: "TOKEN",
    connectionExperience: "OAUTH",
    credentialKeys: ["KAGGLE_API_TOKEN"],
    configurableKeys: [],
    credentialProfiles: [
      {
        id: "kaggle-api-token",
        label: "API token",
        authMethod: "TOKEN",
        requiredKeys: ["KAGGLE_API_TOKEN"],
        inputs: kaggleInputs,
      },
      {
        id: "kaggle-legacy-key",
        label: "Legacy username + key",
        authMethod: "CREDENTIAL_BUNDLE",
        requiredKeys: ["KAGGLE_USERNAME", "KAGGLE_KEY"],
        inputs: kaggleLegacyInputs,
        advanced: true,
      },
    ],
    oauth: {
      startPath: "/api/compute/connections/oauth/kaggle",
      scopes: [
        "kernels.get:*",
        "kernels.update:*",
        "kernels.execute:*",
        "kernels.delete:*",
      ],
      permissions: [
        "Read your Kaggle notebooks",
        "Create and update ShortForge notebooks",
        "Execute ShortForge notebooks",
        "Remove temporary ShortForge notebooks after rendering",
      ],
    },
    setupUrl: "https://www.kaggle.com/settings/api",
    roles: ["BASIC", "ADMIN"],
    implemented: true,
    description: "Kaggle notebook/kernel execution with one-click delegated connection when OAuth is enabled.",
  },
  {
    providerId: "notebook_colab",
    providerFamily: "NOTEBOOK",
    displayName: "Google Colab",
    authMethod: "TOKEN",
    connectionExperience: "GUIDED_MANUAL",
    credentialKeys: ["COLAB_ACCESS_TOKEN"],
    configurableKeys: [],
    roles: ["BASIC", "ADMIN"],
    implemented: true,
    description: "Colab runtime control API.",
  },
  {
    providerId: "notebook_lightning",
    providerFamily: "NOTEBOOK",
    displayName: "Lightning AI",
    authMethod: "CREDENTIAL_BUNDLE",
    connectionExperience: "GUIDED_MANUAL",
    credentialKeys: [
      "LIGHTNING_USER_ID",
      "LIGHTNING_API_KEY",
      "LIGHTNING_TEAMSPACE",
    ],
    configurableKeys: ["LIGHTNING_MACHINE", "LIGHTNING_PYTHON"],
    credentialProfiles: [
      {
        id: "lightning-programmatic",
        label: "Programmatic connection",
        authMethod: "CREDENTIAL_BUNDLE",
        requiredKeys: [
          "LIGHTNING_USER_ID",
          "LIGHTNING_API_KEY",
          "LIGHTNING_TEAMSPACE",
        ],
        inputs: lightningInputs,
      },
    ],
    setupUrl: "https://lightning.ai/docs/overview/getting-started",
    roles: ["BASIC", "ADMIN"],
    implemented: true,
    onboarding: {
      summary:
        "Lightning does not currently provide the delegated web authorization flow ShortForge needs for a one-click connection. This is a one-time guided setup.",
      steps: [
        "Open Lightning's programmatic access settings and create an API key.",
        "Copy the Lightning User ID shown with your programmatic credentials.",
        "Choose the Teamspace where ShortForge may create or reuse a Studio.",
        "Paste those details here once; ShortForge stores the secret encrypted and verifies the connection.",
      ],
    },
    description: "Lightning Studio execution. ShortForge uses the official programmatic access path; no fake OAuth flow.",
  },
  {
    providerId: "notebook_hf_zerogpu",
    providerFamily: "NOTEBOOK",
    displayName: "Hugging Face ZeroGPU",
    authMethod: "CREDENTIAL_BUNDLE",
    connectionExperience: "GUIDED_MANUAL",
    credentialKeys: ["HF_ZEROGPU_SPACE", "HF_ZEROGPU_API_NAME"],
    configurableKeys: ["HF_TOKEN"],
    roles: ["BASIC", "ADMIN"],
    implemented: true,
    description: "Hugging Face Space hosted GPU function.",
  },
  {
    providerId: "sandbox_daytona_hosted",
    providerFamily: "SANDBOX",
    displayName: "Daytona Hosted",
    authMethod: "API_KEY",
    connectionExperience: "GUIDED_MANUAL",
    credentialKeys: ["DAYTONA_API_KEY"],
    configurableKeys: ["DAYTONA_API_URL", "DAYTONA_TARGET"],
    setupUrl: "https://www.daytona.io/docs/api-keys",
    roles: ["ADMIN"],
    implemented: true,
    onboarding: {
      summary:
        "Connect a hosted Daytona workspace. ShortForge only needs an API key; optional region settings can stay at Daytona's defaults.",
      steps: [
        "Open Daytona Dashboard and create an API key with the permissions needed for sandbox creation and execution.",
        "Copy the generated Daytona API key.",
        "Paste the API key into ShortForge. Leave API URL and target at their defaults unless your organization uses a custom endpoint or region.",
      ],
    },
    description: "Hosted sandbox execution through the Daytona TypeScript SDK.",
  },
  {
    providerId: "sandbox_vibengine", providerFamily: "SANDBOX", displayName: "Vibengine", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["VIBENGINE_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted sandbox backend; admin-only in v1 until the real adapter is wired.",
  },
  {
    providerId: "sandbox_instavm",
    providerFamily: "SANDBOX",
    displayName: "InstaVM",
    authMethod: "API_KEY",
    connectionExperience: "GUIDED_MANUAL",
    credentialKeys: ["INSTAVM_API_KEY"],
    configurableKeys: [],
    setupUrl: "https://instavm.io/docs/quickstart",
    roles: ["ADMIN"],
    implemented: true,
    onboarding: {
      summary:
        "Connect InstaVM with one API key. ShortForge uses the hosted Firecracker microVM session for isolated rendering and keeps the credential encrypted server-side.",
      steps: [
        "Open the InstaVM Dashboard → API Keys and create a key starting with instavm_sk_.",
        "Paste the API key into ShortForge. ShortForge stores it encrypted and never exposes it to worker commands, telemetry, or F06 payloads.",
        "Choose Connect and verify. ShortForge checks the provider connection before the sandbox can be selected.",
      ],
    },
    description:
      "Hosted Firecracker microVM sandbox with session-bound command execution and physical artifact transfer; admin-only in V1 and never an F06 worker authority.",
  },
  {
    providerId: "sandbox_github_codespaces",
    providerFamily: "SANDBOX",
    displayName: "GitHub Codespaces",
    authMethod: "API_KEY",
    connectionExperience: "GUIDED_MANUAL",
    credentialKeys: ["GITHUB_CODESAPCES_TOKEN"],
    configurableKeys: ["GITHUB_CODESAPCES_BASE_URL"],
    setupUrl: "https://docs.github.com/en/rest/codespaces/codespaces",
    roles: ["ADMIN"],
    implemented: true,
    onboarding: {
      summary:
        "Provision a persistent Linux VM from GitHub Codespaces (up to 120 core-hours/month free, no credit card required). The VM boots with FFmpeg pre-installed and executes commands over SSH; used for isolated rendering behind the Execution Plane.",
      steps: [
        "Create a fine-grained personal access token at github.com/settings/tokens with repo and codespaces scopes.",
        "Paste the token into ShortForge under GitHub Codespaces connection settings.",
        "Choose Connect and verify. ShortForge probes the GitHub Codespaces API and keeps the credential encrypted server-side.",
      ],
    },
    description:
      "GitHub Codespaces microVM sandbox — persistent Linux VM with FFmpeg, 120 free core-hours/month; admin-only in V1 and never an F06 worker authority.",
  },
  {
    providerId: "sandbox_codesandbox",
    providerFamily: "SANDBOX",
    displayName: "CodeSandbox / VibEngine",
    authMethod: "API_KEY",
    connectionExperience: "MANUAL",
    credentialKeys: ["CODESANDBOX_API_KEY"],
    configurableKeys: ["CODESANDBOX_BASE_URL", "CODESANDBOX_REGION"],
    roles: ["ADMIN"],
    implemented: true,
    onboarding: {
      summary:
        "Burst a Firecracker microVM sandbox via the CodeSandbox/VibEngine API. FFmpeg is pre-installed at bootstrap; ephemeral GPU and CPU bursts are available.",
      steps: [
        "Create an API key at the CodeSandbox/VibEngine dashboard.",
        "Paste the API key into ShortForge. Leave API URL and region at their defaults unless your organization runs a private cluster.",
        "Choose Connect and verify. ShortForge probes the sandbox API and stores the credential encrypted server-side.",
      ],
    },
    description:
      "Firecracker microVM sandbox slot (CodeSandbox/VibEngine) for isolated rendering; admin-only in V1 and never an F06 worker authority.",
  },
  {
    providerId: "sandbox_leap0", providerFamily: "SANDBOX", displayName: "Leap0", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["LEAP0_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted Firecracker sandbox backend; admin-only in v1 until the real adapter is wired.",
  },
  {
    providerId: "sandbox_blaxel", providerFamily: "SANDBOX", displayName: "Blaxel", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["BLAXEL_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted persistent sandbox backend; admin-only in v1 until the real adapter is wired.",
  },
  {
    providerId: "sandbox_freestyle", providerFamily: "SANDBOX", displayName: "Freestyle VMs", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["FREESTYLE_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted VM backend; admin-only until the real adapter is wired.",
  },
  {
    providerId: "sandbox_runloop", providerFamily: "SANDBOX", displayName: "Runloop", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["RUNLOOP_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted devbox sandbox backend; admin-only until the real adapter is wired.",
  },
  {
    providerId: "sandbox_temps", providerFamily: "SANDBOX", displayName: "Temps", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["TEMPS_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Container/microVM backend; admin-only until the real adapter is wired.",
  },
  {
    providerId: "api_daytona", providerFamily: "API_GPU", displayName: "Daytona", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["DAYTONA_API_KEY"], configurableKeys: ["DAYTONA_API_BASE_URL"], roles: ["ADMIN"], implemented: false, description: "Remote sandbox/GPU control API; admin-only in v1.",
  },
];

export function getComputeProviderDefinition(providerId: string): ComputeProviderDefinition | undefined {
  return COMPUTE_PROVIDER_CATALOG.find((provider) => provider.providerId === providerId);
}
