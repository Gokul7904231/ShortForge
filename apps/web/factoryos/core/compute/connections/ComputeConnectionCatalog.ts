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
    providerId: "notebook_paperspace",
    providerFamily: "NOTEBOOK",
    displayName: "Paperspace",
    authMethod: "CREDENTIAL_BUNDLE",
    connectionExperience: "GUIDED_MANUAL",
    credentialKeys: [
      "PAPERSPACE_API_KEY",
      "PAPERSPACE_TEMPLATE_ID",
      "PAPERSPACE_MACHINE_TYPE",
      "PAPERSPACE_REGION",
    ],
    configurableKeys: [
      "PAPERSPACE_DISK_GB",
      "PAPERSPACE_STARTUP_SCRIPT_ID",
    ],
    roles: ["BASIC", "ADMIN"],
    implemented: true,
    description: "Paperspace machine-backed notebook.",
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
    connectionExperience: "MANUAL",
    credentialKeys: ["DAYTONA_API_KEY"],
    configurableKeys: ["DAYTONA_API_URL", "DAYTONA_TARGET"],
    roles: ["ADMIN"],
    implemented: true,
    description: "Hosted sandbox execution through the Daytona TypeScript SDK.",
  },
  {
    providerId: "sandbox_modal_hosted",
    providerFamily: "SANDBOX",
    displayName: "Modal Hosted",
    authMethod: "CREDENTIAL_BUNDLE",
    connectionExperience: "MANUAL",
    credentialKeys: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
    configurableKeys: ["MODAL_SANDBOX_APP_NAME", "MODAL_SANDBOX_IMAGE"],
    roles: ["ADMIN"],
    implemented: true,
    description: "Hosted sandbox execution through the Modal JavaScript SDK.",
  },
  {
    providerId: "sandbox_vibengine", providerFamily: "SANDBOX", displayName: "Vibengine", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["VIBENGINE_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted sandbox backend; admin-only in v1 until the real adapter is wired.",
  },
  {
    providerId: "sandbox_instavm", providerFamily: "SANDBOX", displayName: "InstaVM", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["INSTAVM_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted microVM backend; admin-only in v1 until the real adapter is wired.",
  },
  {
    providerId: "sandbox_leap0", providerFamily: "SANDBOX", displayName: "Leap0", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["LEAP0_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted Firecracker sandbox backend; admin-only in v1 until the real adapter is wired.",
  },
  {
    providerId: "sandbox_blaxel", providerFamily: "SANDBOX", displayName: "Blaxel", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["BLAXEL_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted persistent sandbox backend; admin-only in v1 until the real adapter is wired.",
  },
  {
    providerId: "sandbox_opencomputer", providerFamily: "SANDBOX", displayName: "OpenComputer", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["OPENCOMPUTER_API_KEY"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Hosted Linux sandbox backend; admin-only until the real adapter is wired.",
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
    providerId: "api_vast", providerFamily: "API_GPU", displayName: "Vast.ai", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["VAST_API_KEY"], configurableKeys: ["VAST_API_BASE_URL"], roles: ["ADMIN"], implemented: false, description: "Remote GPU API provider; admin-only in v1.",
  },
  {
    providerId: "api_runpod_v2", providerFamily: "API_GPU", displayName: "RunPod", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["RUNPOD_API_KEY"], configurableKeys: ["RUNPOD_API_BASE_URL"], roles: ["ADMIN"], implemented: false, description: "Remote GPU API provider; admin-only in v1.",
  },
  {
    providerId: "api_daytona", providerFamily: "API_GPU", displayName: "Daytona", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["DAYTONA_API_KEY"], configurableKeys: ["DAYTONA_API_BASE_URL"], roles: ["ADMIN"], implemented: false, description: "Remote sandbox/GPU control API; admin-only in v1.",
  },
  {
    providerId: "api_paperspace", providerFamily: "API_GPU", displayName: "Paperspace API", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["PAPERSPACE_API_KEY"], configurableKeys: ["PAPERSPACE_API_BASE_URL"], roles: ["ADMIN"], implemented: false, description: "Remote machine control API; admin-only in v1.",
  },
  {
    providerId: "api_modal", providerFamily: "API_GPU", displayName: "Modal", authMethod: "API_KEY", connectionExperience: "MANUAL", credentialKeys: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"], configurableKeys: [], roles: ["ADMIN"], implemented: false, description: "Remote compute control API; admin-only in v1.",
  },
];

export function getComputeProviderDefinition(providerId: string): ComputeProviderDefinition | undefined {
  return COMPUTE_PROVIDER_CATALOG.find((provider) => provider.providerId === providerId);
}
