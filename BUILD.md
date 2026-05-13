# Build Instructions

The extension's first-party source files (`background.js`, `embedding.js`, `habits.js`,
`storage.js`, `chrome-compat.js`, `content/toast.js`, `popup/`, `welcome.js`) are plain
JavaScript and require no build step — they are included in the extension as-is.

Two files in `lib/` are generated from third-party npm packages and must be reproduced
using the steps below.

---

## Environment Requirements

- **Operating system**: Linux, macOS, or Windows
- **Node.js**: v18 or later ([download](https://nodejs.org/en/download))
- **npm**: v9 or later (bundled with Node.js)

To verify:
```
node --version   # should print v18.x.x or higher
npm --version    # should print 9.x.x or higher
```

---

## Build Steps

```bash
# 1. Install dependencies
npm install

# 2. Generate lib/transformers.js and lib/ort-wasm-simd.wasm
node build.js
```

After running these two commands, the `lib/` directory will contain the same files
shipped in the extension XPI.

---

## What the build produces

| Output file | Source | Version | License |
|---|---|---|---|
| `lib/transformers.js` | `@xenova/transformers` bundled with esbuild | 2.17.2 | Apache 2.0 |
| `lib/ort-wasm-simd.wasm` | `onnxruntime-web` (bundled inside `@xenova/transformers`) | 1.14.0 | MIT |

---

## Patches applied to lib/transformers.js after bundling

Three patterns present in the bundled output are patched by `build.js` because they are
Node.js-only dead code paths that are unreachable in a browser context:

| Pattern | Replacement | Location in source |
|---|---|---|
| `eval("quire".replace(/^/, "re"))(moduleName)` | `null` | `protobufjs` — Node.js `require()` fallback, never reached in browser |
| `new Function("return this")()` (×2) | `globalThis` | webpack runtime global resolver — `globalThis` is the correct browser equivalent |

These patches do not change any browser-reachable behavior. The `inquire()` function
containing the `eval` is only called on Node.js (guarded by environment checks), and the
`new Function` pattern is replaced with its exact semantic equivalent in browser context.
