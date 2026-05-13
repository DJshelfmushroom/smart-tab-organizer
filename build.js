const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  fs.mkdirSync('lib', { recursive: true });

  // Bundle @xenova/transformers as an IIFE that exposes window.TransformersJS
  await esbuild.build({
    entryPoints: ['node_modules/@xenova/transformers/src/transformers.js'],
    bundle: true,
    format: 'iife',
    globalName: 'TransformersJS',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['fs', 'path', 'url', 'sharp', 'onnxruntime-node'],
    outfile: 'lib/transformers.js',
  });

  // Patch dead Node.js-only code paths that contain eval/new Function
  let bundle = fs.readFileSync('lib/transformers.js', 'utf8');

  // protobuf inquire() — Node.js require() disguised as eval, unreachable in browser
  bundle = bundle.replace(
    /eval\("quire"\.replace\(\/\^\/,\s*"re"\)\)\(moduleName\)/,
    'null'
  );

  // webpack global resolver — safe to replace with globalThis in browser
  bundle = bundle.replaceAll('new Function("return this")()', 'globalThis');

  fs.writeFileSync('lib/transformers.js', bundle);
  console.log('✓ lib/transformers.js');

  // Copy WASM binary from onnxruntime-web (installed as a dep of @xenova/transformers)
  const wasmSrc = path.join(
    'node_modules', '@xenova', 'transformers', 'dist', 'ort-wasm-simd.wasm'
  );
  fs.copyFileSync(wasmSrc, 'lib/ort-wasm-simd.wasm');
  console.log('✓ lib/ort-wasm-simd.wasm');
}

build().catch(e => { console.error(e); process.exit(1); });
