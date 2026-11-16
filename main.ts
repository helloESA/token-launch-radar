// Token Launch Radar — entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot (--input <file|dir>, default /input/snapshot.json), scores the
// pre-token protocols with lib/model.ts, and writes into the output directory
// (--output <dir>, else $MAKEFUN_OUTPUT_DIR, else /output):
//
//   board.json    the ranked board the gate checks
//   data.js       the dashboard's data (window.RADAR), written beside dashboard/
//   dashboard/    a copy of this repository's dashboard/
//   screenshots/  a copy of this repository's screenshots/
//   dossier.json  written LAST, with buildDossier from vendor/makefun-board.ts, so its bytes
//                 describe the exact dashboard and screenshots the run just produced
//
// The program is deterministic: no clock, no randomness, stable sorts everywhere, so the
// grader's two runs write identical bytes.
//
// Local run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));

/** Read `--name value` or `--name=value` from argv, else the fallback. */
function flag(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < args.length) return args[at + 1]!;
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token launch radar: ${message}\n`);
  process.exit(1);
}

const inputArg = flag('input', '/input');
const inputPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputPath)) fail(`no snapshot at ${inputPath} — pass --input <snapshot.json|directory>`);
const outputDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model produced a board the gate refuses: ${issue}`);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

/** Copy a flat directory of regular files, skipping dotfiles; returns the names copied. */
function copyFlat(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    names.push(name);
  }
  return names;
}

const dashFiles = copyFlat(join(repoDir, 'dashboard'), join(outputDir, 'dashboard'));
if (!dashFiles.includes('index.html')) fail('dashboard/ holds no index.html to copy');
const shots = copyFlat(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'));
if (shots.length < 3 || shots.length > 4) fail(`screenshots/ holds ${shots.length} images — hand in 3 or 4: the board, a detail view, a filtered view`);

// The dossier goes last on purpose: the scorer rebuilds it from this output and compares bytes.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, { text_max_bytes: 65_536 }));

process.stdout.write(
  `token launch radar: snapshot ${snapshot.as_of}, ${snapshot.protocols.length} protocols, ` +
    `${snapshot.watchlist.length} watchlist slugs covered, ${board.length} rows ranked, ${radar.live.length} launched peers shown\n` +
    `token launch radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} images), dossier.json\n`,
);
