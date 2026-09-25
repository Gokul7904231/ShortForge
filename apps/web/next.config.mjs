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

export default nextConfig;
