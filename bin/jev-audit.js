#!/usr/bin/env node
// jev-audit CLI — scan a repo for replaceable LLM calls, install the agent skill.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = '0.1.0';
const SKILL_SRC = path.join(__dirname, '..', 'skill', 'jev-audit');

const HARNESS_DIRS = {
  claude: '.claude',
  codex: '.codex',
  cursor: '.cursor',
  grok: '.grok',
  agy: '.agy',
  pi: '.pi',
  zcode: '.zcode',
  agents: '.agents',
};

function usage() {
  console.log(`
jev-audit v${VERSION} — find the decisions hiding in your LLM bill

Usage:
  jev-audit [scan] [path]     Inventory LLM call sites (local regex scan, no network).
                              Writes jev-scan.json and prints the summary.
  jev-audit install <target>  Install the jev-audit skill into an agent harness.
                              Targets: ${Object.keys(HARNESS_DIRS).join(' | ')}
                              Options: --project (cwd instead of ~), --dir <path>
  jev-audit help              This message.

Then, inside your agent:  "audit this repo with jev-audit"
`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function cmdInstall(target, opts) {
  const t = HARNESS_DIRS[target] ? target : 'agents';
  if (target && !HARNESS_DIRS[target]) {
    console.log(`Unknown harness "${target}" — defaulting to "agents" (~/.agents/skills is the cross-tool location). Use --dir to override.`);
  }
  let dest;
  if (opts.dir) {
    dest = path.join(opts.dir, 'jev-audit');
  } else {
    const base = opts.project ? process.cwd() : os.homedir();
    dest = path.join(base, HARNESS_DIRS[t], 'skills', 'jev-audit');
  }
  copyDir(SKILL_SRC, dest);
  console.log(`Installed skill → ${dest}`);
  console.log(`Restart your agent if it was running, then ask: "audit this repo with jev-audit"`);
}

function main() {
  const argv = process.argv.slice(2);
  const opts = { dir: null, project: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') opts.dir = argv[++i];
    else if (argv[i] === '--project') opts.project = true;
    else if (argv[i] === '--version' || argv[i] === '-v') return console.log(VERSION);
    else positional.push(argv[i]);
  }
  const cmd = positional[0] || 'scan';

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') return usage();

  if (cmd === 'install') {
    return cmdInstall(positional[1], opts);
  }

  if (cmd === 'scan' || !fs.existsSync(path.resolve(cmd))) {
    if (cmd !== 'scan') console.log(`"${cmd}" is not a path — treating this as a scan of the current directory.\n`);
    const { runScan, printSummary } = require(path.join(SKILL_SRC, 'scripts', 'scan.js'));
    const result = runScan(positional[1] || '.');
    printSummary(result);
    fs.writeFileSync(path.join(process.cwd(), 'jev-scan.json'), JSON.stringify(result, null, 2));
    console.log(`\n→ full inventory: ${path.join(process.cwd(), 'jev-scan.json')}`);
    console.log(`→ next: npx jev-audit install claude|codex|cursor|grok|agy|pi|zcode|agents, then ask your agent to "audit this repo with jev-audit".`);
    return;
  }

  // bare path argument: scan it
  const { runScan, printSummary } = require(path.join(SKILL_SRC, 'scripts', 'scan.js'));
  const result = runScan(cmd);
  printSummary(result);
  fs.writeFileSync(path.join(process.cwd(), 'jev-scan.json'), JSON.stringify(result, null, 2));
  console.log(`\n→ full inventory: ${path.join(process.cwd(), 'jev-scan.json')}`);
}

main();
