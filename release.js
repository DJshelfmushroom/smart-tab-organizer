// release.js — build, sign Firefox XPI, create/update GitHub release
//
// Required env vars:
//   AMO_API_KEY     — JWT issuer from https://addons.mozilla.org/en-US/developers/addon/api/key/
//   AMO_API_SECRET  — JWT secret from the same page
//
// Usage:
//   AMO_API_KEY=... AMO_API_SECRET=... node release.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiKey    = process.env.AMO_API_KEY;
const apiSecret = process.env.AMO_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error('Set AMO_API_KEY and AMO_API_SECRET before running.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const version  = manifest.version;
const tag      = `v${version}`;

// 1. Build lib/ + firefox.zip + chrome.zip
console.log('\n── build ──');
execSync('node build.js', { stdio: 'inherit' });

// 2. Sign Firefox extension (unlisted channel = self-distribution, no AMO listing)
console.log('\n── sign ──');
const signedDir = 'signed';
fs.mkdirSync(signedDir, { recursive: true });

const webExt = path.join('node_modules', '.bin', 'web-ext');
execSync(
  `${webExt} sign \
    --source-dir . \
    --artifacts-dir ${signedDir} \
    --channel unlisted \
    --api-key ${apiKey} \
    --api-secret ${apiSecret} \
    --ignore-files \
      "node_modules/**" ".git/**" "signed/**" \
      "build.js" "release.js" \
      "package.json" "package-lock.json" \
      "*.md" "*.zip" \
      "manifest.chrome.json" "background.sw.js"`,
  { stdio: 'inherit' }
);

const xpis = fs.readdirSync(signedDir).filter(f => f.endsWith('.xpi'));
if (xpis.length === 0) {
  console.error('Signing failed — no XPI found in', signedDir);
  process.exit(1);
}
const xpiPath = path.join(signedDir, xpis[xpis.length - 1]);
console.log('✓ signed:', xpiPath);

// 3. Create or update GitHub release
console.log('\n── release ──');
let releaseExists = false;
try {
  execSync(`gh release view ${tag}`, { stdio: 'ignore' });
  releaseExists = true;
} catch {}

if (releaseExists) {
  // Replace assets on existing release
  execSync(`gh release upload ${tag} ${xpiPath} chrome.zip --clobber`, { stdio: 'inherit' });
  console.log(`✓ updated ${tag} on GitHub`);
} else {
  execSync(
    `gh release create ${tag} ${xpiPath} chrome.zip \
      --title "${tag}" \
      --notes "See CHANGELOG or commit history for details."`,
    { stdio: 'inherit' }
  );
  console.log(`✓ created ${tag} on GitHub`);
}

console.log('\nDone.');
