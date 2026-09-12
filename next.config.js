/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  },
  // Renamed out of `experimental` in Next 15.
  serverExternalPackages: ['@react-pdf/renderer'],
  // `@huggingface/transformers` (offline-transcribe.ts) is CLIENT-ONLY — a
  // dynamic `import()` inside a 'use client' module, used only for the
  // on-device transcription fallback. But Vercel's build-output file tracer
  // does static analysis of every reachable `require()`/`import`, including
  // ones behind a runtime-only, browser-only code path, and it cannot prove
  // that path never runs on the server. So it dragged the WHOLE package into
  // the serverless function for every route that could reach it — onnxruntime
  // ships multi-platform native `.node` binaries, and `sharp` (transformers'
  // own dependency, on top of the one already excluded from THIS app's own
  // image handling below) ships prebuilt binaries per OS/arch too. The result
  // was a single page's function ballooning to 380MB uncompressed against
  // Vercel's 250MB limit — the deploy did not almost fail, it did fail, and
  // this is the actual fix, not a tweak: exclude what is genuinely never
  // needed server-side from being traced into ANY function at all.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@huggingface/transformers/**',
      'node_modules/onnxruntime-node/**',
      'node_modules/onnxruntime-web/**',
      'node_modules/sharp/**',
      'node_modules/@img/**',
    ],
  },
  images: {
    // ZRNote uses no `next/image`. Turning the optimizer off removes the
    // /_next/image endpoint entirely, which is what pulls in `sharp` (and its
    // libvips CVEs) and is the target of several Next.js image-related
    // advisories. Nothing in the app regresses: there is nothing to optimize.
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // XSS protection (legacy but harmless)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy (restrict browser features)
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
          // CSP - Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' + blob: are required by FFmpeg.wasm (blob-URL core script
              // + WebAssembly compile). It is lazy-loaded only for exotic audio formats.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://apis.google.com",
              // FFmpeg.wasm runs in a Web Worker created from a blob: URL.
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              // huggingface.co (+ its LFS storage subdomains) and jsdelivr are
              // for the on-device offline-transcription model only (see
              // offline-transcribe.ts): the model weights and the ONNX runtime
              // WASM binary it runs on both come from there. Only ever fetched
              // while the user has a connection and explicitly asked to
              // download it — the offline USE of an already-cached model makes
              // no further network request at all.
              "connect-src 'self' blob: https://api.groq.com https://*.supabase.co wss://*.supabase.co https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net",
              // data: is required by the silent keep-alive clip that holds the
              // tab in a "playing media" state while recording with the screen
              // off (src/lib/background-audio.ts). blob: is the recorder itself.
              "media-src 'self' blob: data:",
              "frame-src 'self' https://accounts.google.com",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          // HSTS (only in production)
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
            : []),
        ],
      },
      // Relax CSP for API routes that need external connections
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://api.groq.com https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      // Allow embedding for OAuth callback pages if needed
      {
        source: '/auth/callback',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;