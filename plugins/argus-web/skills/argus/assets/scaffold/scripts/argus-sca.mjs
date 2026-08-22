#!/usr/bin/env node
// @ts-check
/**
 * Argus — Module SCA (Software Composition Analysis / scan de dépendances)
 * ------------------------------------------------------------------------
 * Exécute `npm audit --json`, agrège les vulnérabilités par sévérité,
 * écrit un rapport JSON déterministe dans argus-report/sca.json, puis sort
 * en code NON-ZÉRO si au moins une vuln HIGH/CRITICAL est présente.
 *
 * Détecte aussi (SANS les exiger) la présence d'osv-scanner et de Trivy,
 * scanners SCA plus puissants/multi-écosystèmes, et imprime les commandes
 * recommandées (vérifiées 2026).
 *
 * Codes de sortie :
 *   0 = aucun dépassement de seuil
 *   1 = vulnérabilités au-dessus du seuil (par défaut high/critical)
 *   2 = erreur d'outillage (npm absent, lockfile manquant, JSON illisible)
 *
 * Usage :
 *   node scripts/argus-sca.mjs
 *   ARGUS_FAIL_ON=critical node scripts/argus-sca.mjs   // surcharge du seuil
 *
 * Aucune dépendance externe : Node >= 18 (ESM + modules natifs uniquement).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

// --- Constantes ----------------------------------------------------------

/** Répertoire de sortie commun à tous les modules Argus. */
const REPORT_DIR = resolve(process.cwd(), 'argus-report');
/** Fichier de rapport SCA. */
const REPORT_FILE = resolve(REPORT_DIR, 'sca.json');

/** Sévérités npm audit v2, de la moins grave à la plus grave. */
const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];

/** Taille max du buffer stdout : les gros lockfiles produisent beaucoup de JSON. */
const MAX_BUFFER = 32 * 1024 * 1024; // 32 Mo

/**
 * Seuil de blocage : on échoue si une vuln de ce niveau (ou pire) existe.
 * Surchargeable via ARGUS_FAIL_ON (liste CSV de sévérités).
 */
const FAIL_ON = new Set(
  (process.env.ARGUS_SCA_FAIL_ON ?? process.env.ARGUS_FAIL_ON ?? 'high,critical')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

const IS_WINDOWS = process.platform === 'win32';

// --- Exécution de npm audit ---------------------------------------------

/**
 * Lance `npm audit --json` et renvoie le JSON parsé.
 * npm sort en code non-zéro quand des vulns existent : on capture donc
 * stdout QUELLE QUE SOIT la valeur de retour, puis on parse.
 */
function runNpmAudit() {
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: IS_WINDOWS, // npm = npm.cmd sous Windows ; pas de shell ailleurs
    maxBuffer: MAX_BUFFER,
  });

  if (result.error) {
    // npm introuvable (ENOENT), etc.
    throw new Error(`Impossible d'exécuter \"npm audit\" : ${result.error.message}`);
  }

  const stdout = (result.stdout ?? '').trim();
  if (!stdout) {
    const stderr = (result.stderr ?? '').trim();
    throw new Error(`\"npm audit --json\" n'a produit aucune sortie. stderr : ${stderr || '(vide)'}`);
  }

  try {
    return JSON.parse(stdout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Sortie de \"npm audit --json\" non parsable en JSON : ${msg}`);
  }
}

// --- Normalisation du rapport npm v2 ------------------------------------

/**
 * Compteurs de sévérité depuis metadata.vulnerabilities (npm v2).
 * @param {any} audit
 * @returns {Record<string, number>}
 */
function extractCounts(audit) {
  const meta = audit?.metadata?.vulnerabilities ?? {};
  /** @type {Record<string, number>} */
  const counts = {};
  for (const sev of SEVERITY_ORDER) counts[sev] = Number(meta[sev] ?? 0);
  counts.total = Number(meta.total ?? SEVERITY_ORDER.reduce((n, s) => n + counts[s], 0));
  return counts;
}

/**
 * Liste concise de findings depuis la MAP `vulnerabilities` (npm v2),
 * indexée par nom de paquet. Triée par sévérité décroissante.
 * @param {any} audit
 */
function extractFindings(audit) {
  const vulns = audit?.vulnerabilities ?? {};
  /** @type {Array<Record<string, any>>} */
  const findings = [];

  for (const [name, info] of Object.entries(vulns)) {
    const via = /** @type {any[]} */ (Array.isArray(info?.via) ? info.via : []);
    // `via` MÉLANGE des chaînes (paquet transitif) et des objets advisory.
    const advisories = via
      .filter((v) => v && typeof v === 'object')
      .map((v) => ({
        title: v.title ?? null,
        url: v.url ?? null,
        cwe: Array.isArray(v.cwe) ? v.cwe : [],
        cvss: v.cvss?.score ?? null,
        source: v.source ?? null,
      }));

    findings.push({
      package: name,
      severity: info?.severity ?? 'unknown',
      isDirect: Boolean(info?.isDirect),
      range: info?.range ?? null,
      // fixAvailable : booléen OU objet { name, version, isSemVerMajor }
      fixAvailable: info?.fixAvailable ?? false,
      advisories,
    });
  }

  findings.sort((a, b) => {
    const d = SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
    return d !== 0 ? d : a.package.localeCompare(b.package);
  });
  return findings;
}

// --- Affichage -----------------------------------------------------------

/**
 * @param {Record<string, number>} counts
 * @param {Array<Record<string, any>>} findings
 * @param {boolean} failed
 * @param {string[]} breached
 */
function printSummary(counts, findings, failed, breached) {
  console.log('\nArgus — SCA (npm audit)');
  console.log('────────────────────────');
  for (const sev of [...SEVERITY_ORDER].reverse()) {
    console.log(`  ${sev.padEnd(9)} : ${counts[sev] ?? 0}`);
  }
  console.log(`  ${'total'.padEnd(9)} : ${counts.total ?? 0}`);
  console.log(`\n  Rapport écrit : ${REPORT_FILE}`);

  if (findings.length > 0) {
    console.log('\n  Top findings :');
    for (const f of findings.slice(0, 10)) {
      const fix = f.fixAvailable
        ? typeof f.fixAvailable === 'object'
          ? `fix: ${f.fixAvailable.name}@${f.fixAvailable.version}`
          : 'fix dispo'
        : 'pas de fix';
      console.log(`   - [${f.severity}] ${f.package} (${f.range ?? '?'}) — ${fix}`);
    }
  }

  if (failed) {
    console.log(
      `\n✖ Échec : vulnérabilités ${breached.join('/')} détectées ` +
        `(seuil ARGUS_FAIL_ON=${[...FAIL_ON].join(',')}).`,
    );
  } else {
    console.log('\n✔ Aucun dépassement de seuil.');
  }
}

/**
 * Détecte osv-scanner et Trivy (sans les exiger) et imprime les commandes
 * recommandées. Ces scanners couvrent plus d'écosystèmes que npm audit.
 */
function printAlternativeScanners() {
  console.log('\n  Scanners SCA complémentaires :');

  const tools = [
    {
      bin: 'osv-scanner',
      // osv-scanner v2 : sous-commande `scan source`. -r = récursif.
      hint: 'osv-scanner scan source -r .   # OSV.dev (Google), multi-écosystèmes',
    },
    {
      bin: 'trivy',
      // Trivy : scan FS, scanner \"vuln\" uniquement + seuil de sévérité + exit-code.
      hint: 'trivy fs --scanners vuln --severity HIGH,CRITICAL --exit-code 1 .',
    },
  ];

  for (const t of tools) {
    const probe = spawnSync(t.bin, ['--version'], { encoding: 'utf8', shell: IS_WINDOWS });
    const present = !probe.error && probe.status === 0;
    if (present) {
      const version = (probe.stdout || '').split('\n')[0].trim();
      console.log(`   ✔ ${t.bin} détecté (${version || 'version inconnue'})`);
      console.log(`       → ${t.hint}`);
    } else {
      console.log(`   ○ ${t.bin} absent — alternative recommandée : ${t.hint}`);
    }
  }
}

// --- Point d'entrée ------------------------------------------------------

function main() {
  let audit;
  try {
    audit = runNpmAudit();
  } catch (err) {
    console.error(`✖ Argus SCA : ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2; // erreur d'outillage (≠ vulnérabilités trouvées)
    return;
  }

  // npm renvoie parfois { error: { code, summary } } (ex. lockfile manquant).
  if (audit?.error) {
    const reason = audit.error.summary ?? audit.error.code ?? 'erreur inconnue';
    console.error(`✖ npm audit a échoué : ${reason}`);
    console.error('  Astuce : générez un lockfile (npm i --package-lock-only) puis relancez.');
    process.exitCode = 2;
    return;
  }

  const counts = extractCounts(audit);
  const findings = extractFindings(audit);

  // Sévérités qui déclenchent l'échec ET effectivement présentes.
  const breached = [...FAIL_ON].filter((sev) => (counts[sev] ?? 0) > 0);
  const failed = breached.length > 0;

  const report = {
    tool: 'npm audit',
    auditReportVersion: audit?.auditReportVersion ?? null,
    generatedAt: new Date().toISOString(),
    failOn: [...FAIL_ON],
    failed,
    counts,
    findings,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  printSummary(counts, findings, failed, breached);
  printAlternativeScanners();

  // Code de sortie : 1 si seuil franchi, 0 sinon.
  process.exitCode = failed ? 1 : 0;
}

main();
