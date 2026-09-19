#!/usr/bin/env node
// jev-audit scanner — local, zero-dependency inventory of LLM call sites.
// Usage: node scan.js <path>   (writes jev-scan.json in cwd, prints a summary)
'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor', '.next', '.nuxt',
  'coverage', '.venv', 'venv', '__pycache__', '.cache', '.terraform', '.idea',
  '.vscode', 'target', '.gradle', 'bower_components', '.pytest_cache',
  '.mypy_cache', '.circleci', '.github',
  // agent-harness config + project-local installed skills are not app call sites
  '.agents', '.claude', '.codex', '.cursor', '.zcode', '.grok', '.agy', '.pi',
]);
const EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift', '.php', '.cs', '.sh', '.yaml', '.yml', '.toml', '.json',
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const PATTERNS = [
  // SDK imports / clients
  { id: 'openai', category: 'sdk', re: /(?:from\s+|import\s+[\w{},\s]*from\s+|require\(\s*)['"]openai[/'"]|@azure\/openai|new\s+OpenAI\b/ },
  { id: 'anthropic', category: 'sdk', re: /@anthropic-ai\/sdk|(?:from\s+|require\(\s*)['"]@?anthropic(?:-ai)?[/'"]/ },
  { id: 'google-ai', category: 'sdk', re: /@google\/generative-ai|google\.generativeai|@google-cloud\/vertexai|vertexai/ },
  { id: 'vercel-ai', category: 'sdk', re: /@ai-sdk\/|from\s+['"]ai['"]|require\(\s*['"]ai['"]\s*\)/ },
  { id: 'langchain', category: 'sdk', re: /langchain/ },
  { id: 'llamaindex', category: 'sdk', re: /llamaindex|llama_index/ },
  { id: 'mistral', category: 'sdk', re: /(?:from\s+|require\(\s*)['"]mistralai?[/'"]/ },
  { id: 'cohere', category: 'sdk', re: /(?:from\s+|require\(\s*)['"]cohere[-_\/]/ },
  { id: 'groq', category: 'sdk', re: /(?:from\s+|require\(\s*)['"]groq(?:-sdk)?[/'"]/ },
  { id: 'xai', category: 'sdk', re: /@xai\/sdk|(?:from\s+|require\(\s*)['"]@?xai[/'"]/ },
  { id: 'ollama', category: 'sdk', re: /['"]ollama(?:\/|-sdk)?[/'"]|from\s+['"]ollama[/'"]/ },
  { id: 'bedrock', category: 'sdk', re: /@aws-sdk\/client-bedrock|bedrock-runtime|bedrock\.Runtime/ },
  // raw HTTP endpoints
  { id: 'openai', category: 'endpoint', re: /api\.openai\.com/ },
  { id: 'anthropic', category: 'endpoint', re: /api\.anthropic\.com/ },
  { id: 'google-ai', category: 'endpoint', re: /generativelanguage\.googleapis\.com/ },
  { id: 'mistral', category: 'endpoint', re: /api\.mistral\.ai/ },
  { id: 'cohere', category: 'endpoint', re: /api\.cohere\.(?:ai|com)/ },
  { id: 'groq', category: 'endpoint', re: /api\.groq\.com/ },
  { id: 'xai', category: 'endpoint', re: /api\.x\.ai\b/ },
  { id: 'together', category: 'endpoint', re: /api\.together\.xyz/ },
  { id: 'openrouter', category: 'endpoint', re: /openrouter\.ai\/api/ },
  { id: 'deepseek', category: 'endpoint', re: /api\.deepseek\.com/ },
  // API keys in env/config
  { id: 'env-keys', category: 'env-key', re: /\b(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|GOOGLE_AI|GOOGLE_VERTEX|MISTRAL|GROQ|XAI|COHERE|TOGETHER|DEEPSEEK|OPENROUTER|PERPLEXITY|FIREWORKS)_API_KEY\b/ },
  // call-site shapes
  { id: 'chat-completion', category: 'call', re: /chat\.completions\.create|completions\.create|responses\.create/ },
  { id: 'message-create', category: 'call', re: /\.messages\.create|client\.respond\b/ },
  { id: 'generate-content', category: 'call', re: /generateContent|generate_content/ },
  { id: 'chain-class', category: 'call', re: /ChatOpenAI|ChatAnthropic|AzureChatOpenAI|ChatGoogleGenerativeAI|GoogleGenerativeAI/ },
  { id: 'llm-invoke', category: 'call', re: /\bllm\s*\.\s*(?:invoke|predict|call)\b|\.invoke\(\s*['"]/ },
  { id: 'agent-run', category: 'call', re: /\bagent\s*\(/ },
  { id: 'llm-params', category: 'param', re: /\bmax_tokens\b|\btemperature\s*[:=]/ },
  // already on Jev
  { id: 'jev', category: 'jev', re: /@typesafe-ai\/sdk|typesafe_sdk|api\.typesafe\.ai|typesafe-ai|system_one|systemone/ },
];

const DECISION_RE = /classif|categor|intent|route|routing|label|spam|toxic|moderat|guardrail|jailbreak|sentiment|urgen|prioriti|triage|severity|relevan|rating|verif|validat|is_|should_|detect|screen|escalat|fraud|disput|refund|complaint|lead\b|qualif/i;

function* walk(dir, depth) {
  if (depth > 14) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(full, depth + 1);
    } else if (e.isFile()) {
      const base = e.name;
      const ext = path.extname(base).toLowerCase();
      if (EXTS.has(ext) || base.startsWith('.env') || base === 'env') yield full;
    }
  }
}

function looksBinary(buf) {
  return buf.slice(0, 4096).includes(0);
}

function scanFile(file, root) {
  let buf;
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_FILE_BYTES) return [];
    buf = fs.readFileSync(file);
  } catch { return []; }
  if (looksBinary(buf)) return [];
  const lines = buf.toString('utf8').split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    for (const p of PATTERNS) {
      if (!p.re.test(line)) continue;
      const window = (lines[i - 2] || '') + '\n' + line + '\n' + (lines[i + 1] || '') + '\n' + (lines[i + 2] || '');
      hits.push({
        file: path.relative(root, file) || file,
        line: i + 1,
        category: p.category,
        id: p.id,
        snippet: line.trim().slice(0, 160),
        decisionShaped: DECISION_RE.test(line) || DECISION_RE.test(window),
      });
      break; // one record per line, first matching pattern
    }
  }
  return hits;
}

function runScan(rootDir) {
  const root = path.resolve(rootDir || '.');
  const hits = [];
  let filesScanned = 0;
  for (const file of walk(root, 0)) {
    if (path.basename(file) === 'jev-scan.json') continue;
    filesScanned++;
    hits.push(...scanFile(file, root));
  }
  const bySdk = {};
  const byCategory = {};
  const byFile = {};
  for (const h of hits) {
    byCategory[h.category] = (byCategory[h.category] || 0) + 1;
    if (h.category !== 'param') bySdk[h.id] = (bySdk[h.id] || 0) + 1;
    byFile[h.file] = (byFile[h.file] || 0) + 1;
  }
  return {
    scanner: 'jev-audit',
    version: '0.1.0',
    scannedAt: new Date().toISOString(),
    root,
    filesScanned,
    summary: {
      touchpoints: hits.filter((h) => h.category !== 'jev').length,
      decisionShaped: hits.filter((h) => h.decisionShaped && h.category !== 'jev' && h.category !== 'param').length,
      alreadyJev: hits.filter((h) => h.category === 'jev').length,
      byCategory,
      bySdk,
      byFile,
    },
    hits,
  };
}

function printSummary(result) {
  const s = result.summary;
  console.log(`\njev-audit scan — ${result.root}`);
  console.log(`files scanned: ${result.filesScanned}   llm touchpoints: ${s.touchpoints}   decision-shaped: ${s.decisionShaped}${s.alreadyJev ? `   already-jev: ${s.alreadyJev}` : ''}`);
  const sdks = Object.entries(s.bySdk).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  if (sdks) console.log(`signals: ${sdks}`);
  const files = Object.entries(s.byFile).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (files.length) {
    console.log('\nhottest files:');
    for (const [f, n] of files) console.log(`  ${String(n).padStart(3)}  ${f}`);
  }
  const candidates = result.hits.filter((h) => h.decisionShaped && (h.category === 'call' || h.category === 'sdk'));
  if (candidates.length) {
    console.log('\ndecision-shaped call sites (prime Jev candidates):');
    for (const c of candidates.slice(0, 8)) console.log(`  ${c.file}:${c.line}  [${c.id}]  ${c.snippet.slice(0, 80)}`);
  }
}

if (require.main === module) {
  const target = process.argv[2] || '.';
  const result = runScan(target);
  printSummary(result);
  const out = path.join(process.cwd(), 'jev-scan.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`\n→ full inventory: ${out}`);
  console.log('→ next: run the jev-audit skill in your agent ("audit this repo with jev-audit") for tiers, savings, and architecture.');
}

module.exports = { runScan, printSummary };
