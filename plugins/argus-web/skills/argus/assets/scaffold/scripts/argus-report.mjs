#!/usr/bin/env node
/**
 * argus-report.mjs — transforme le JSON du reporter Playwright en rapport HTML Argus.
 *
 * Entrée  : test-results/results.json (reporter ['json'] de playwright.config.ts)
 * Sortie  : argus-report/report.html
 *
 * Sans dépendance externe (Node >= 18, ESM). Lancé via `npm run argus:report`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const INPUT = process.env.ARGUS_JSON ?? 'test-results/results.json';
const OUT_DIR = 'argus-report';
const OUT_FILE = path.join(OUT_DIR, 'report.html');

if (!existsSync(INPUT)) {
  console.error(
    `[argus] ${INPUT} introuvable. Lance d'abord la suite (npm run argus:test) ` +
      'pour générer le rapport JSON, puis relance argus:report.',
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(INPUT, 'utf8'));

// --- Aplatissement récursif des suites → liste de cas (spec × projet) --------
/** @returns {Array<{title,file,project,status,durationMs,errors:string[],attachments:any[]}>} */
function flatten(suites, trail = []) {
  const out = [];
  for (const suite of suites ?? []) {
    const nextTrail = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = (t.results ?? [])[t.results.length - 1] ?? {};
        const errors = [];
        for (const r of t.results ?? []) {
          for (const e of r.errors ?? []) if (e?.message) errors.push(stripAnsi(e.message));
          if (r.error?.message) errors.push(stripAnsi(r.error.message));
        }
        out.push({
          title: [...nextTrail, spec.title].join(' › '),
          file: spec.file ?? suite.file ?? '',
          project: t.projectName ?? '',
          status: t.status ?? last.status ?? 'unknown', // expected|unexpected|flaky|skipped
          durationMs: last.duration ?? 0,
          errors: [...new Set(errors)],
          attachments: (t.results ?? []).flatMap((r) => r.attachments ?? []),
        });
      }
    }
    out.push(...flatten(suite.suites, nextTrail));
  }
  return out;
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// --- Sévérité Argus à partir du statut Playwright ----------------------------
function severityOf(status) {
  if (status === 'unexpected') return 'critical';
  if (status === 'flaky') return 'minor';
  return null; // expected / skipped → pas un finding
}

// --- Extraction des Core Web Vitals depuis les attachments -------------------
function readAttachmentJson(att) {
  try {
    if (att.body) return JSON.parse(Buffer.from(att.body, 'base64').toString('utf8'));
    if (att.path && existsSync(att.path)) return JSON.parse(readFileSync(att.path, 'utf8'));
  } catch {
    /* attachement illisible → ignoré */
  }
  return null;
}

const cases = flatten(report.suites);
const stats = report.stats ?? {};
const summary = {
  total: cases.length,
  passed: cases.filter((c) => c.status === 'expected').length,
  failed: cases.filter((c) => c.status === 'unexpected').length,
  flaky: cases.filter((c) => c.status === 'flaky').length,
  skipped: cases.filter((c) => c.status === 'skipped').length,
};
const gate = summary.failed > 0 ? 'fail' : 'pass';

// CWV agrégés (dernière valeur par métrique vue dans les attachments).
const cwv = {};
for (const c of cases) {
  for (const att of c.attachments) {
    if (!/core-web-vitals/i.test(att.name ?? '')) continue;
    const data = readAttachmentJson(att);
    const vitals = data?.vitals;
    if (!vitals) continue;
    const list = Array.isArray(vitals) ? vitals : Object.values(vitals);
    for (const v of list) if (v?.name) cwv[v.name] = v;
  }
}
const CWV_BUDGET = { LCP: 2500, CLS: 0.1, INP: 200, TTFB: 800, FCP: 1800 };

// --- Rendu HTML --------------------------------------------------------------
const findings = cases.filter((c) => severityOf(c.status));
const ok = cases.filter((c) => c.status === 'expected');

const metric = (label, value, cls = '') =>
  `<div class="metric ${cls}"><div class="v">${value}</div><div class="l">${label}</div></div>`;

const cwvRows = Object.keys(CWV_BUDGET)
  .filter((k) => cwv[k])
  .map((k) => {
    const v = cwv[k];
    const val = k === 'CLS' ? Number(v.value).toFixed(3) : Math.round(v.value);
    const good = v.value <= CWV_BUDGET[k];
    return `<tr><td>${k}</td><td class="${good ? 'good' : 'bad'}">${val}${k === 'CLS' ? '' : ' ms'}</td><td>${CWV_BUDGET[k]}${k === 'CLS' ? '' : ' ms'}</td><td>${esc(v.rating ?? '')}</td></tr>`;
  })
  .join('');

const findingCards = findings.length
  ? findings
      .map((c) => {
        const sev = severityOf(c.status);
        return `<div class="card ${sev}">
        <div class="card-h"><span class="badge ${sev}">${sev}</span> <strong>${esc(c.title)}</strong></div>
        <div class="meta">${esc(c.project)} · ${esc(c.file)} · ${Math.round(c.durationMs)} ms</div>
        ${c.errors.length ? `<pre>${esc(c.errors.join('\n\n'))}</pre>` : ''}
      </div>`;
      })
      .join('')
  : '<p class="muted">Aucun échec. 🎉</p>';

const okList = ok.length
  ? `<ul class="ok-list">${ok.map((c) => `<li>${esc(c.title)} <span class="muted">(${esc(c.project)})</span></li>`).join('')}</ul>`
  : '<p class="muted">Aucun test passant.</p>';

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Argus — rapport QA</title>
<style>
  :root{--bg:#0f1115;--card:#181b22;--fg:#e7e9ee;--muted:#8b93a7;--ok:#2ecc71;--bad:#e85d26;--warn:#f1c40f;--line:#262b36}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 20px}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 12px;border-bottom:1px solid var(--line);padding-bottom:8px}
  .sub{color:var(--muted);margin-bottom:24px;font-size:13px}
  .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}
  .metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;text-align:center}
  .metric .v{font-size:26px;font-weight:700}.metric .l{color:var(--muted);font-size:12px;margin-top:4px}
  .metric.pass .v{color:var(--ok)}.metric.fail .v{color:var(--bad)}.metric.flaky .v{color:var(--warn)}
  .gate{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700}
  .gate.pass{background:rgba(46,204,113,.15);color:var(--ok)}.gate.fail{background:rgba(232,93,38,.15);color:var(--bad)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600}
  td.good{color:var(--ok)}td.bad{color:var(--bad)}
  .card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--bad);border-radius:8px;padding:14px;margin-bottom:12px}
  .card.minor{border-left-color:var(--warn)}
  .card-h{font-size:14px}.meta{color:var(--muted);font-size:12px;margin:6px 0}
  .badge{font-size:11px;text-transform:uppercase;padding:2px 8px;border-radius:999px;font-weight:700}
  .badge.critical{background:rgba(232,93,38,.18);color:var(--bad)}.badge.minor{background:rgba(241,196,15,.18);color:var(--warn)}
  pre{background:#0b0d11;border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;font-size:12px;white-space:pre-wrap}
  .ok-list{columns:2;gap:24px;list-style:none;padding:0}.ok-list li{margin:4px 0;break-inside:avoid}
  .muted{color:var(--muted)}footer{margin-top:40px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:16px}
</style></head><body><div class="wrap">
  <h1>Argus — rapport QA</h1>
  <div class="sub">
    ${esc(process.env.ARGUS_BASE_URL ?? '')} ·
    ${esc(process.env.ARGUS_MODE ?? 'REGRESS')} ·
    ${esc(stats.startTime ?? '')} ·
    durée ${Math.round((stats.duration ?? 0) / 1000)} s ·
    <span class="gate ${gate}">gate: ${gate}</span>
  </div>

  <div class="metrics">
    ${metric('tests', summary.total)}
    ${metric('réussis', summary.passed, 'pass')}
    ${metric('échecs', summary.failed, 'fail')}
    ${metric('flaky', summary.flaky, 'flaky')}
    ${metric('ignorés', summary.skipped)}
  </div>

  ${cwvRows ? `<h2>Core Web Vitals</h2><table><tr><th>Métrique</th><th>Valeur</th><th>Budget</th><th>Note</th></tr>${cwvRows}</table>` : ''}

  <h2>Findings (${findings.length})</h2>
  ${findingCards}

  <h2>✅ Ce qui fonctionne (${ok.length})</h2>
  ${okList}

  <footer>Généré par Argus (Claude Code) · ${esc(stats.startTime ?? '')}</footer>
</div></body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html, 'utf8');
console.log(`[argus] rapport écrit : ${OUT_FILE}`);
console.log(`[argus] ouvrir : open ${OUT_FILE}   (ou: xdg-open / start)`);
