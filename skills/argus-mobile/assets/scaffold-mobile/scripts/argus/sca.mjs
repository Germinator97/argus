#!/usr/bin/env node
// @ts-check
/**
 * Argus Mobile — SCA (dépendances Dart et natives)
 * ------------------------------------------------------------------------
 * CVE des paquets via osv-scanner sur `pubspec.lock` et sur les lockfiles
 * Gradle s'il y en a, plus l'état de fraîcheur via `pub outdated`.
 * Écrit argus-mobile-report/sca.json.
 *
 * osv-scanner est OPTIONNEL. Absent, la partie CVE est rapportée `skipped` avec
 * la commande d'installation — jamais comme un « aucune vulnérabilité ».
 * Un scanner absent et un scanner qui ne trouve rien produisent le même silence :
 * c'est précisément pour ça qu'il faut les distinguer explicitement.
 *
 * Usage :
 *   node scripts/argus/sca.mjs
 *   node scripts/argus/sca.mjs --require-tools   # en CI
 *
 * `--require-tools` fait ÉCHOUER quand osv-scanner est absent. Sans lui, une CI
 * sur laquelle le scanner n'a pas été installé rendrait vert en n'ayant rien
 * scanné — le faux vert le plus coûteux du lot, puisqu'il porte sur la sécurité.
 *
 * Codes de sortie : 0 vert · 1 major · 2 blocker/critical ou outil requis absent.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

import {
  artifactsDir, detectTools, err, exitCodeFor, loadConfig, log,
  missingToolMessage, sh, warn, writeJson,
} from './config.mjs';

/** Bandes CVSS v3, du plus grave au moins grave. */
const CVSS_BANDS = [
  { min: 9.0, band: 'critical', severity: 'critical' },
  { min: 7.0, band: 'high', severity: 'major' },
  { min: 4.0, band: 'moderate', severity: 'minor' },
  { min: 0.0, band: 'low', severity: 'info' },
];
/** Ordre des seuils déclarables dans security.scaFailOn. */
const BAND_ORDER = ['low', 'moderate', 'high', 'critical'];

/**
 * Score CVSS d'une vulnérabilité OSV. Le champ `severity` porte un vecteur
 * (`CVSS_V3`), pas un nombre : on en extrait le score de base.
 * @param {any} vuln @returns {number|null}
 */
function cvssOf(vuln) {
  for (const entry of vuln?.severity ?? []) {
    const direct = Number.parseFloat(entry?.score);
    if (Number.isFinite(direct)) return direct;
    const vector = String(entry?.score ?? '');
    // Un vecteur CVSS n'est pas un score : sans calcul complet, on ne l'invente
    // pas. On le signale comme inconnu plutôt que d'en déduire un chiffre faux.
    if (vector.startsWith('CVSS:')) return null;
  }
  const named = String(vuln?.database_specific?.severity ?? '').toLowerCase();
  const found = CVSS_BANDS.find((b) => b.band === named);
  return found ? found.min : null;
}

/** @param {number|null} score @returns {{band:string, severity:string}} */
function bandOf(score) {
  if (score === null) return { band: 'unknown', severity: 'major' };
  return CVSS_BANDS.find((b) => score >= b.min) ?? CVSS_BANDS[CVSS_BANDS.length - 1];
}

/**
 * Lockfiles à scanner. `pubspec.lock` toujours ; les lockfiles Gradle seulement
 * si le projet en génère (ils ne sont pas activés par défaut sur Android).
 * @param {string} root @returns {string[]}
 */
function findLockfiles(root) {
  const found = [];
  if (existsSync(join(root, 'pubspec.lock'))) found.push(join(root, 'pubspec.lock'));
  const androidDir = join(root, 'android');
  if (!existsSync(androidDir)) return found;
  const stack = [androidDir];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) break;
    for (const entry of readdirSync(dir)) {
      if (entry === 'build' || entry === '.gradle') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (entry === 'gradle.lockfile' || entry === 'buildscript-gradle.lockfile') found.push(full);
    }
  }
  return found;
}

/**
 * Scan OSV d'un lockfile. La sortie JSON part sur stdout, et osv-scanner sort
 * en 1 quand il trouve quelque chose : on lit stdout quel que soit le code.
 * @param {string} lockfile @returns {{ok:boolean, results:any[], why:string}}
 */
function scanLockfile(lockfile) {
  const res = sh('osv-scanner', ['scan', '--format', 'json', '-L', lockfile], { maxBuffer: 64 * 1024 * 1024 });
  // 0 = rien trouvé · 1 = vulnérabilités · 128 = aucun paquet reconnu.
  if (res.status === 128) return { ok: true, results: [], why: 'aucun paquet reconnu dans ce lockfile' };
  if (!res.stdout.trim()) return { ok: false, results: [], why: res.stderr.trim() || res.error || 'sortie vide' };
  try {
    return { ok: true, results: JSON.parse(res.stdout).results ?? [], why: '' };
  } catch (e) {
    return { ok: false, results: [], why: `JSON osv-scanner illisible : ${e instanceof Error ? e.message : e}` };
  }
}

/**
 * Transforme les résultats OSV en findings Argus.
 * @param {any[]} results @param {string} root @param {string} failOn @returns {any[]}
 */
function findingsFromOsv(results, root, failOn) {
  const floor = Math.max(0, BAND_ORDER.indexOf(failOn));
  const findings = [];
  for (const result of results) {
    const source = relative(root, result?.source?.path ?? '') || 'lockfile';
    for (const pkg of result?.packages ?? []) {
      const name = pkg?.package?.name ?? '?';
      const version = pkg?.package?.version ?? '?';
      for (const vuln of pkg?.vulnerabilities ?? []) {
        const score = cvssOf(vuln);
        const { band, severity } = bandOf(score);
        const belowFloor = band !== 'unknown' && BAND_ORDER.indexOf(band) < floor;
        findings.push({
          id: vuln?.id ?? `OSV-${findings.length + 1}`,
          title: `${name} ${version} — ${vuln?.summary ?? vuln?.id ?? 'vulnérabilité'}`,
          dimension: 'security', severity: belowFloor ? 'info' : severity,
          expected: 'dépendance sans CVE connue',
          actual: `${vuln?.id} (${band}${score === null ? '' : ` ${score}`})`,
          suggestedFix: `Monte ${name} au-dessus de ${version}, ou documente pourquoi la vulnérabilité ne s'applique pas ici.`,
          evidence: [source], status: 'open',
        });
      }
    }
  }
  return findings;
}

/**
 * Fraîcheur des dépendances Dart. Ce n'est pas une vulnérabilité : c'est la
 * dette qui la précède, donc `info`, jamais bloquant.
 * @returns {{ok:boolean, outdated:any[], why:string}}
 */
function pubOutdated() {
  const runner = detectTools(['flutter']).flutter.present ? 'flutter' : 'dart';
  const res = sh(runner, ['pub', 'outdated', '--json'], { maxBuffer: 32 * 1024 * 1024 });
  if (!res.stdout.trim()) return { ok: false, outdated: [], why: res.stderr.trim() || `${runner} pub outdated n'a rien rendu` };
  try {
    const parsed = JSON.parse(res.stdout);
    const outdated = (parsed.packages ?? [])
      .filter((/** @type {any} */ p) => p?.current?.version && p?.latest?.version && p.current.version !== p.latest.version)
      .map((/** @type {any} */ p) => ({ name: p.package, current: p.current.version, resolvable: p.resolvable?.version ?? null, latest: p.latest.version }));
    return { ok: true, outdated, why: '' };
  } catch (e) {
    return { ok: false, outdated: [], why: `JSON pub outdated illisible : ${e instanceof Error ? e.message : e}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Point d'entrée
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  const requireTools = process.argv.slice(2).includes('--require-tools');
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  const root = process.cwd();
  const reportPath = join(artifactsDir(config), 'sca.json');
  const failOn = String(config.security?.scaFailOn ?? 'high');

  if (!existsSync(resolve(root, 'pubspec.yaml'))) {
    err('pubspec.yaml introuvable : lance ce script à la racine du projet Flutter.');
    process.exit(2);
  }

  const lockfiles = findLockfiles(root);
  const scanner = detectTools(['osv-scanner'])['osv-scanner'];
  /** @type {any[]} */
  let findings = [];
  /** @type {any} */
  const cve = { scanned: false, why: '', lockfiles: lockfiles.map((f) => relative(root, f)) };

  if (!scanner.present) {
    cve.why = missingToolMessage('osv-scanner');
    if (requireTools) err(`CVE non scannées — ${cve.why}`);
    else warn(`CVE non scannées — ${cve.why}`);
  } else if (lockfiles.length === 0) {
    cve.why = 'aucun lockfile trouvé (pubspec.lock absent ?). Lance `flutter pub get`.';
    warn(cve.why);
  } else {
    cve.scanned = true;
    for (const lockfile of lockfiles) {
      const { ok, results, why } = scanLockfile(lockfile);
      if (!ok) {
        cve.scanned = false;
        cve.why = `${relative(root, lockfile)} : ${why}`;
        warn(cve.why);
        continue;
      }
      findings.push(...findingsFromOsv(results, root, failOn));
    }
  }

  const outdated = pubOutdated();
  if (!outdated.ok) warn(`fraîcheur des dépendances non relevée — ${outdated.why}`);
  else if (outdated.outdated.length > 0) {
    findings.push({
      id: 'QAM-SCA-OUTDATED', title: `${outdated.outdated.length} dépendance(s) Dart en retard`,
      dimension: 'security', severity: 'info',
      expected: 'dépendances à jour', actual: outdated.outdated.slice(0, 10).map((/** @type {any} */ p) => `${p.name} ${p.current}→${p.latest}`).join(', '),
      suggestedFix: 'Relis le changelog avant de monter : une montée non lue casse plus souvent qu\'elle ne corrige.',
      status: 'open',
    });
  }

  writeJson(reportPath, {
    root, failOn, cve,
    outdated: { scanned: outdated.ok, count: outdated.outdated.length, packages: outdated.outdated, why: outdated.why },
    findings,
  });

  const counts = ['blocker', 'critical', 'major', 'minor', 'info']
    .map((s) => `${findings.filter((f) => f.severity === s).length} ${s}`).join(' · ');
  log(`${cve.scanned ? 'CVE scannées' : 'CVE NON scannées'} · ${findings.length} finding(s) — ${counts}`);
  log(`rapport : ${reportPath}`);
  if (requireTools && !cve.scanned) {
    err('--require-tools : la dimension CVE n\'a pas été exécutée, le résultat ne peut pas être vert.');
    process.exit(2);
  }
  process.exit(exitCodeFor(findings, config.gate));
}

main();
