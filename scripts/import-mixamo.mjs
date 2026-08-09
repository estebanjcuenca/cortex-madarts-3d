#!/usr/bin/env node
/**
 * Fetches Mixamo characters (Sophie, Kate, Megan, Elizabeth, Jody, Martha)
 * and a shared Breathing Idle clip, converts to web-ready GLBs.
 *
 * Run: npm run import:mixamo
 */
import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public/models/civilians');
const TMP = join(ROOT, '.tmp/mixamo-import');

const HF_CHAR =
  'https://huggingface.co/datasets/GbotHQ/mixamo-characters/resolve/main';
const IDLE_FBX =
  'https://community.rokojori.com/Rokojori/winter-tales/raw/commit/5c73b3edac878cec65c57d5745245724381e1d36/assets/Mixamo/idle/Breathing%20Idle-Male.fbx';

const CHARACTERS = ['Sophie', 'Kate', 'Megan', 'Elizabeth', 'Jody', 'Martha'];

const FBX2GLTF = join(
  require.resolve('fbx2gltf'),
  '../bin/Darwin/FBX2glTF',
);

/** @param {string} url */
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** @param {string} cmd @param {string[]} args */
function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

/** @param {string} fbxPath @param {string} outGlb */
function convertAndOptimize(fbxPath, outGlb) {
  const stem = fbxPath.replace(/\.fbx$/i, '');
  run(FBX2GLTF, ['-b', fbxPath, '-o', stem]);
  run('npx', [
    '@gltf-transform/cli',
    'optimize',
    `${stem}.glb`,
    outGlb,
    '--texture-compress',
    'webp',
    '--texture-size',
    '1024',
    '--compress',
    'draco',
    '--simplify',
    'false',
  ]);
}

async function main() {
  await mkdir(TMP, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  console.log('Downloading shared Breathing Idle…');
  const idleFbx = join(TMP, 'breathing-idle.fbx');
  await writeFile(idleFbx, await fetchBuffer(IDLE_FBX));
  convertAndOptimize(idleFbx, join(ROOT, 'public/models/mixamo-idle.glb'));

  for (const name of CHARACTERS) {
    const id = name.toLowerCase();
    process.stdout.write(`\n${name} … `);
    const fbx = join(TMP, `${name}.fbx`);
    await writeFile(fbx, await fetchBuffer(`${HF_CHAR}/${name}.fbx`));
    convertAndOptimize(fbx, join(OUT_DIR, `${id}.glb`));
    console.log(`→ ${id}.glb`);
  }

  const stale = [
    'mixamo-soldier.glb',
    'mixamo-michelle.glb',
    'mixamo-ybot.glb',
    'hoodie.glb',
    'man-casual.glb',
    'man-longsleeves.glb',
    'man-suit.glb',
  ];
  for (const file of stale) {
    await rm(join(OUT_DIR, file), { force: true });
  }

  const readme = `# Mixamo people models

Characters: **Sophie, Kate, Megan, Elizabeth, Jody, Martha** (Adobe Mixamo).

| File | Character |
|------|-----------|
| \`sophie.glb\` | Sophie |
| \`kate.glb\` | Kate |
| \`megan.glb\` | Megan |
| \`elizabeth.glb\` | Elizabeth |
| \`jody.glb\` | Jody |
| \`martha.glb\` | Martha |

Shared idle clip: \`../mixamo-idle.glb\` (Breathing Idle).

Re-import: \`npm run import:mixamo\`

- **License:** [Mixamo / Adobe Terms](https://www.adobe.com/legal/terms.html) — embed in project only.
- **Sources:** [GbotHQ/mixamo-characters](https://huggingface.co/datasets/GbotHQ/mixamo-characters) (FBX), Breathing Idle (Mixamo).
`;
  await writeFile(join(ROOT, 'public/models/README.md'), readme);
  await rm(TMP, { recursive: true, force: true });
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
