import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Opt-in release profile for self-hosted Node.js runtimes (Botkeep).
// Unset => the Cloudflare/OpenNext/Vercel/Docker builds are unchanged.
const isBotkeepProfile = process.env.SHORTFORGE_BUILD_PROFILE === 'botkeep';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  typescript: {
    // Separate type-checking from Next.js build for Render Free 512MB RAM compatibility
    ignoreBuildErrors: true,
  },
  // Windows CI: sharp native binary may be missing — avoid Image Optimization requiring it during prerender
  images: { unoptimized: true },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  serverExternalPackages: ['sqlite3', 'better-sqlite3', '@xenova/transformers'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  turbopack: {
    root: '.',
  },
  outputFileTracingIncludes: {
    '*': [
      './node_modules/@firebase/util/**/*',
    ],
  },
  outputFileTracingExcludes: {
    '*': [
      // ── Native modules excluded from edge/worker bundles ────────────────
      '**/*better-sqlite3*/**',
      '**/*sqlite3*/**',
      '**/*@xenova*/**',
      '**/*sharp*/**',
      '**/*@img*/**',
      '**/*.node',
      '**/*.c',
      '**/*.h',
      '**/*.cc',
      '**/*.cpp',
      // ── Python / venv / local-render runtime assets ─────────────────────
      '**/venv/**/*',
      '**/.venv/**/*',
      '**/local-ai/scripts/**/*',
      '**/local-ai/output/**/*',
      // ── Generated / runtime output (never served from Worker) ───────────
      '**/generated/**/*',
      '**/data/**/*',                             // render proofs, AI doctor reports
      '**/scratch/**/*',                           // stability test WAVs etc.
      // ── SQLite source (C/H headers traced by sqlite3 npm package) ────────
      '**/node_modules/sqlite3/deps/**/*',
      // ── Demo / seed media in public (large, served by CDN not Worker) ──
      '**/public/**/*.mp4',
      '**/public/**/*.mov',
      '**/public/**/*.avi',
      '**/public/**/*.wav',
      // ── Benchmarks / telemetry databases ────────────────────────────────
      '**/*.db',
      '**/*.db-journal',
      '**/*.db-wal',
      '**/*.db-shm',
    ],
  },
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/data/**",
        "**/config/**",
        "**/generated/**",
        "**/cache/**",
        "**/telemetry/**",
        "**/logs/**",
        "**/uploads/**",
        "**/benchmarks/**",
        "**/events/**",
        "**/runtime/**",
        "**/tmp/shortfactory/**",
        "**/data/scene-cache/**",
        "**/*.db",
        "**/*.db-journal",
        "**/*.db-wal",
        "**/*.db-shm",
      ],
    };
    // Prevent native-only modules from being bundled by webpack
    // sqlite3 uses native bindings — it's loaded conditionally at runtime
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push('sqlite3');
      config.externals.push('better-sqlite3');
      config.externals.push('@xenova/transformers');
    }
    // Suppress "critical dependency" warnings from dynamic require()
    config.module.exprContextCritical = false;
    return config;
  },
};

/**
 * Botkeep profile: Next.js standalone output with a traced, minimal node_modules.
 *
 * Differences from the default config (only applied when
 * SHORTFORGE_BUILD_PROFILE=botkeep):
 *  - output: 'standalone', tracing root pinned to apps/web (the repo root also
 *    holds a package-lock.json, which would otherwise nest the output).
 *  - The Cloudflare-oriented tracing excludes for native modules
 *    (better-sqlite3, sharp, @img, @xenova, *.node) are NOT applied: a Node
 *    server needs them at runtime. Only build-time sources and local state
 *    are excluded.
 *  - sharp is loaded through require(variable) in several modules, which the
 *    file tracer cannot follow, so it is included explicitly.
 */
function withBotkeepProfile(base) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    ...base,
    output: 'standalone',
    outputFileTracingRoot: here,
    outputFileTracingIncludes: {
      '*': [
        './node_modules/@firebase/util/**/*',
        './node_modules/sharp/**/*',
        './node_modules/@img/**/*',
        './node_modules/detect-libc/**/*',
        './node_modules/semver/**/*',
        // onnxruntime-node loads libonnxruntime.<so|dylib|dll> through a
        // runtime-computed path, so the tracer only picks up the .node binding
        // and the release would fail at inference time. @xenova/transformers
        // has the same problem with its bundled runtime assets.
        './node_modules/onnxruntime-node/**/*',
        './node_modules/@xenova/transformers/**/*',
      ],
    },
    outputFileTracingExcludes: {
      '*': [
        // Native add-on build inputs (the compiled .node files are kept).
        '**/node_modules/better-sqlite3/deps/**/*',
        '**/node_modules/better-sqlite3/src/**/*',
        '**/node_modules/sqlite3/deps/**/*',
        // Local mutable state, python/venv assets and generated output.
        '**/venv/**/*',
        '**/.venv/**/*',
        '**/local-ai/**/*',
        '**/*.db',
        '**/*.db-journal',
        '**/*.db-wal',
        '**/*.db-shm',
      ],
    },
  };
}

export default isBotkeepProfile ? withBotkeepProfile(nextConfig) : nextConfig;
