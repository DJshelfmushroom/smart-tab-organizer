const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Node.js built-ins are marked external by default but emit require() calls that
// crash in Chrome MV3 service workers. Bundle them as empty stubs instead — the
// browser code paths in @xenova/transformers never call these at runtime.
const stubNodeBuiltins = {
  name: 'stub-node-builtins',
  setup(build) {
    const filter = /^(fs|path|url|os|crypto|buffer|events|stream|assert|util|querystring|punycode|onnxruntime-node|sharp)$/;
    build.onResolve({ filter }, args => ({ path: args.path, namespace: 'node-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
      contents: 'module.exports = {}',
      loader: 'js',
    }));
  },
};

async function build() {
  fs.mkdirSync('lib', { recursive: true });

  // Bundle @xenova/transformers as an IIFE that exposes globalThis.TransformersJS
  await esbuild.build({
    entryPoints: ['node_modules/@xenova/transformers/src/transformers.js'],
    bundle: true,
    format: 'iife',
    globalName: 'TransformersJS',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: [],
    plugins: [stubNodeBuiltins],
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

function makeZips() {
  // Files shared by both distributions (relative to repo root)
  const shared = [
    'background.js',
    'chrome-compat.js',
    'storage.js',
    'habits.js',
    'embedding.js',
    'welcome.html',
    'welcome.js',
    'icon-48.png',
    'icon-96.png',
    'lib/transformers.js',
    'lib/ort-wasm-simd.wasm',
    'content/toast.js',
    'popup/popup.html',
    'popup/popup.js',
  ].join(' ');

  // Firefox zip: uses manifest.json as-is
  if (fs.existsSync('firefox.zip')) fs.unlinkSync('firefox.zip');
  execSync(`zip firefox.zip manifest.json ${shared}`, { stdio: 'inherit' });
  console.log('✓ firefox.zip');

  // Chrome zip: manifest.chrome.json → manifest.json, plus background.sw.js
  if (fs.existsSync('chrome.zip')) fs.unlinkSync('chrome.zip');
  // Stage manifest.chrome.json as manifest.json in a temp dir, then zip
  const tmp = fs.mkdtempSync('tab-org-chrome-');
  try {
    fs.cpSync('.', tmp, {
      recursive: true,
      filter: src => !src.includes('node_modules') && !src.includes('.git') && !src.includes(tmp),
    });
    fs.copyFileSync('manifest.chrome.json', path.join(tmp, 'manifest.json'));
    fs.unlinkSync(path.join(tmp, 'manifest.chrome.json'));
    execSync(
      `zip -r ${path.resolve('chrome.zip')} manifest.json background.sw.js ${shared}`,
      { cwd: tmp, stdio: 'inherit' }
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('✓ chrome.zip');
}

build().then(makeZips).catch(e => { console.error(e); process.exit(1); });
