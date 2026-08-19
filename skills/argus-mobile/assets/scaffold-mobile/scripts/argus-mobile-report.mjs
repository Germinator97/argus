#!/usr/bin/env node
// @ts-check
/**
 * Argus Mobile — rapport HTML
 * ------------------------------------------------------------------------
 * Agrège les JSON produits par les autres scripts en un rapport lisible, au
 * même format que celui du skill web (references/report-format.md §C).
 *
 * Entrées (toutes optionnelles) : argus-mobile-report/{report,perf,a11y,sec,sca}.json
 * Sortie : argus-mobile-report/report.html
 *
 * ⚠️ UNE DIMENSION ABSENTE N'EST PAS UNE DIMENSION VERTE. Un fichier manquant
 * ou marqué `skipped` apparaît explicitement comme non exécutée, avec sa raison.
 * Sans cette distinction, un rapport où rien n'a tourné se lit comme un rapport
 * où rien n'a cassé.
 *
 * Usage : node scripts/argus-mobile-report.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { artifactsDir, loadConfig, log, err, writeJson } from './argus-mobile-config.mjs';

const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'info'];

/** Les cinq sources, avec la dimension qu'elles couvrent. */
const SOURCES = [
  { file: 'report.json', label: 'Parcours Maestro', dimensions: 'functional · visual · a11y · resilience · stability · i18n', how: 'node scripts/argus-mobile-run.mjs' },
  { file: 'perf.json', label: 'Performance', dimensions: 'performance', how: 'node scripts/argus-mobile-perf.mjs' },
  { file: 'a11y.json', label: 'Accessibilité (device)', dimensions: 'a11y', how: 'node scripts/argus-mobile-a11y.mjs' },
  { file: 'sec.json', label: 'Sécurité MASVS', dimensions: 'security', how: 'node scripts/argus-mobile-sec.mjs' },
  { file: 'sca.json', label: 'Dépendances (CVE)', dimensions: 'security', how: 'node scripts/argus-mobile-sca.mjs' },
];

/** @param {string} path @returns {any} */
function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {string} */
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * Rassemble les sources présentes et distingue trois états : exécutée,
 * sautée avec raison, et jamais lancée.
 * @param {string} dir
 */
function collect(dir) {
  const parts = [];
  for (const source of SOURCES) {
    const data = readJson(join(dir, source.file));
    if (data === null) {
      parts.push({ ...source, state: 'absent', reason: `jamais lancé — ${source.how}`, findings: [], data: null });
    } else if (data.skipped || data.cve?.scanned === false) {
      parts.push({ ...source, state: 'skipped', reason: data.skipReason ?? data.cve?.why ?? 'non exécutée', findings: data.findings ?? [], data });
    } else {
      parts.push({ ...source, state: 'ok', reason: '', findings: data.findings ?? [], data });
    }
  }
  return parts;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fragments HTML
// ═══════════════════════════════════════════════════════════════════════════

/** @param {string} label @param {string|number} value @param {string} [cls] */
const metric = (label, value, cls = '') =>
  `<div class="metric ${cls}"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;

/** @param {any[]} parts @returns {string} */
function coverageRows(parts) {
  /** @type {Record<string,string>} */
  const badges = { ok: 'good', skipped: 'warn', absent: 'bad' };
  /** @type {Record<string,string>} */
  const states = { ok: 'exécutée', skipped: 'sautée', absent: 'non lancée' };
  return parts.map((part) => {
    const badge = badges[part.state];
    const state = states[part.state];
    return `<tr><td>${esc(part.label)}</td><td class="muted">${esc(part.dimensions)}</td>`
      + `<td><span class="badge ${badge}">${state}</span></td>`
      + `<td class="muted">${esc(part.reason)}</td></tr>`;
  }).join('');
}

/** @param {any} perf @returns {string} */
function perfRows(perf) {
  const metrics = perf?.metrics;
  if (!metrics) return '';
  const thresholds = perf.thresholds ?? {};
  /** @type {Array<[string, any, any, string]>} */
  const rows = [
    ['Premier lancement après installation', metrics.firstLaunchMs, null, 'ms'],
    ['Démarrage à froid (médiane)', metrics.coldStartMs, thresholds.coldStartMs, 'ms'],
    ['Démarrage à chaud (médiane)', metrics.warmStartMs, thresholds.warmStartMs, 'ms'],
    ['Frames en retard', metrics.jankFramesPct, thresholds.jankFramesPct, '%'],
    ['Mémoire (TOTAL PSS)', metrics.memoryMb, thresholds.memoryMb, 'Mo'],
    ['Taille du binaire', metrics.binarySizeMb, thresholds.binarySizeMb, 'Mo'],
  ];
  return rows.filter(([, value]) => value !== null && value !== undefined).map(([label, value, budget, unit]) => {
    const cls = budget === null || budget === undefined ? '' : (value <= budget ? 'good' : 'bad');
    return `<tr><td>${esc(label)}</td><td class="${cls}">${esc(value)} ${esc(unit)}</td>`
      + `<td class="muted">${budget === null || budget === undefined ? '— (contexte)' : `${budget} ${unit}`}</td></tr>`;
  }).join('');
}

/** @param {any[]} findings @returns {string} */
function findingCards(findings) {
  if (findings.length === 0) return '<p class="muted">Aucun finding. 🎉</p>';
  return SEVERITIES.map((severity) => {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) return '';
    const cards = group.map((f) => `<div class="card ${severity}">
      <div class="card-h"><span class="badge ${severity}">${severity}</span> <strong>${esc(f.title)}</strong> <span class="muted">${esc(f.id)}</span></div>
      <div class="meta">${esc(f.dimension ?? '')}${f.screen ? ` · écran ${esc(f.screen)}` : ''}${f.selector ? ` · ${esc(f.selector)}` : ''}${f.device ? ` · ${esc(f.device)}` : ''}${f.platform ? ` · ${esc(f.platform)}` : ''}</div>
      <table class="kv"><tr><th>attendu</th><td>${esc(f.expected)}</td></tr><tr><th>constaté</th><td>${esc(f.actual)}</td></tr></table>
      ${f.suggestedFix ? `<div class="fix">${esc(f.suggestedFix)}</div>` : ''}
      ${(f.evidence ?? []).length ? `<div class="meta">preuve : ${(f.evidence ?? []).map((/** @type {string} */ e) => esc(e)).join(' · ')}</div>` : ''}
      ${(f.repro ?? []).length ? `<pre>${(f.repro ?? []).map((/** @type {string} */ r) => esc(r)).join('\n')}</pre>` : ''}
      ${f.wcag ? `<div class="meta">${esc(f.wcag)}</div>` : ''}
    </div>`).join('');
    return `<h3>${severity} (${group.length})</h3>${cards}`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// Rendu
// ═══════════════════════════════════════════════════════════════════════════

/** @param {any} context @returns {string} */
function render(context) {
  const { run, counts, gate, parts, findings, coverage, perf, generatedAt } = context;
  const devices = (run?.devices ?? []).map((/** @type {any} */ d) => `${d.id} (${d.model || '?'} · ${d.os || '?'}${d.physical ? ' · APPAREIL RÉEL' : ''})`).join(', ');
  const ok = parts.filter((/** @type {any} */ p) => p.state === 'ok' && p.findings.length === 0);

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Argus Mobile — rapport QA</title>
<style>
  :root{--bg:#0f1115;--card:#181b22;--fg:#e7e9ee;--muted:#8b93a7;--ok:#2ecc71;--bad:#e85d26;--warn:#f1c40f;--line:#262b36}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 20px}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 12px;border-bottom:1px solid var(--line);padding-bottom:8px}
  h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:20px 0 8px}
  .sub{color:var(--muted);margin-bottom:24px;font-size:13px}
  .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}
  .metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;text-align:center}
  .metric .v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}.metric .l{color:var(--muted);font-size:12px;margin-top:4px}
  .metric.blocker .v,.metric.critical .v{color:var(--bad)}.metric.major .v{color:var(--warn)}.metric.pass .v{color:var(--ok)}
  .gate{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700}
  .gate.pass{background:rgba(46,204,113,.15);color:var(--ok)}.gate.fail{background:rgba(232,93,38,.15);color:var(--bad)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
  tr:last-child td{border-bottom:none}
  td.good{color:var(--ok)}td.bad{color:var(--bad)}
  .card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--muted);border-radius:8px;padding:14px;margin-bottom:12px}
  .card.blocker,.card.critical{border-left-color:var(--bad)}.card.major{border-left-color:var(--warn)}.card.minor{border-left-color:var(--muted)}
  .card-h{font-size:14px}.meta{color:var(--muted);font-size:12px;margin:6px 0}
  .fix{font-size:13px;margin-top:8px;padding-left:10px;border-left:2px solid var(--line);color:var(--fg)}
  table.kv{margin:8px 0;background:transparent;border:none}table.kv th{width:90px;font-size:12px}table.kv td,table.kv th{border-bottom:none;padding:2px 8px 2px 0}
  .badge{font-size:11px;text-transform:uppercase;padding:2px 8px;border-radius:999px;font-weight:700}
  .badge.blocker,.badge.critical,.badge.bad{background:rgba(232,93,38,.18);color:var(--bad)}
  .badge.major,.badge.warn{background:rgba(241,196,15,.18);color:var(--warn)}
  .badge.minor,.badge.info{background:rgba(139,147,167,.18);color:var(--muted)}
  .badge.good{background:rgba(46,204,113,.18);color:var(--ok)}
  pre{background:#0b0d11;border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;font-size:12px;white-space:pre-wrap;margin:8px 0 0}
  .ok-list{list-style:none;padding:0}.ok-list li{margin:4px 0}
  .muted{color:var(--muted)}footer{margin-top:40px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:16px}
</style></head><body><div class="wrap">
  <h1>Argus Mobile — rapport QA</h1>
  <div class="sub">
    ${esc(run?.appId ?? '')} ·
    ${esc(run?.platform ?? '')} ·
    ${devices ? `${esc(devices)} · ` : ''}
    ${esc(generatedAt)} ·
    <span class="gate ${gate}">gate: ${gate}</span>
  </div>

  <div class="metrics">
    ${SEVERITIES.map((s) => metric(s, counts[s], counts[s] > 0 ? s : 'pass')).join('')}
    ${metric('dimensions exécutées', `${parts.filter((/** @type {any} */ p) => p.state === 'ok').length}/${parts.length}`)}
  </div>

  <h2>Couverture</h2>
  <table><tr><th>Source</th><th>Dimensions</th><th>État</th><th>Raison</th></tr>${coverageRows(parts)}</table>
  ${coverage ? `<p class="muted">Écrans déclarés : ${coverage.screensDeclared ?? '?'} · avec ancre sémantique : ${coverage.screensConfigured ?? '?'}${(coverage.notConfigured ?? []).length ? ` · sans ancre, donc non testés : ${esc((coverage.notConfigured ?? []).join(', '))}` : ''}</p>` : ''}

  ${perfRows(perf) ? `<h2>Performance</h2><table><tr><th>Mesure</th><th>Valeur</th><th>Budget</th></tr>${perfRows(perf)}</table>
  <p class="muted">Le premier lancement après installation est mesuré à part : c'est un état réel, vécu une fois par chaque utilisateur, et le moyenner avec le régime stabilisé ne décrirait ni l'un ni l'autre.</p>` : ''}

  <h2>Findings (${findings.length})</h2>
  ${findingCards(findings)}

  <h2>✅ Ce qui fonctionne</h2>
  ${ok.length ? `<ul class="ok-list">${ok.map((/** @type {any} */ p) => `<li>${esc(p.label)} <span class="muted">— exécutée, aucun finding</span></li>`).join('')}</ul>` : '<p class="muted">Aucune dimension n\'a tourné sans finding.</p>'}

  <footer>Généré par Argus Mobile (Claude Code) · ${esc(generatedAt)}</footer>
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Point d'entrée
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  const dir = artifactsDir(config);
  const parts = collect(dir);
  const findings = parts.flatMap((p) => p.findings);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));

  const failOn = new Set(config.gate?.failOn ?? []);
  const gate = SEVERITIES.some((s) => failOn.has(s) && counts[s] > 0) ? 'fail' : 'pass';
  const run = parts.find((p) => p.file === 'report.json')?.data?.run ?? { platform: (config.platforms ?? [])[0], appId: config.app?.androidPackage || config.app?.iosBundleId };
  const coverage = parts.find((p) => p.file === 'report.json')?.data?.coverage ?? null;
  const perf = parts.find((p) => p.file === 'perf.json')?.data ?? null;
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const htmlPath = join(dir, 'report.html');
  writeJson(join(dir, 'summary.json'), {
    generatedAt, gate, counts, findings: findings.length,
    dimensions: parts.map((p) => ({ source: p.file, state: p.state, reason: p.reason, findings: p.findings.length })),
  });
  writeFileSync(htmlPath, render({ run, counts, gate, parts, findings, coverage, perf, generatedAt }), 'utf8');

  const notRun = parts.filter((p) => p.state !== 'ok');
  log(`${findings.length} finding(s) · gate ${gate} · ${parts.length - notRun.length}/${parts.length} dimension(s) exécutée(s)`);
  for (const part of notRun) log(`  ○ ${part.label} : ${part.reason}`);
  log(`rapport : ${htmlPath}`);
  log(`ouvrir : open ${htmlPath}   (ou : xdg-open / start)`);
}

main();
