/**
 * argus — helpers de sécurité (dimension SECURITY).
 *
 * Fonctions pures + checks basés sur APIRequestContext. La collecte côté page
 * (headers du document, cookies, scripts chargés, mixed content) est faite dans
 * tests/security.spec.ts, qui passe les données à ces helpers.
 *
 * Tous ces contrôles sont NON destructifs (lecture seule) : pas d'exploitation,
 * juste de la détection. L'exploitation active reste le pentest manuel.
 */
import type { APIRequestContext } from '@playwright/test';

export type SecuritySeverity = 'blocker' | 'critical' | 'major' | 'minor' | 'info';

export interface SecurityFinding {
  id: string;
  title: string;
  severity: SecuritySeverity;
  detail: string;
}

/** Sous-ensemble des champs cookie utilisés (évite un import de type fragile). */
export interface CookieLike {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | string;
}

/** true si l'URL est en HTTPS (certains contrôles ne s'appliquent qu'en HTTPS). */
export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalise une map d'en-têtes en clés minuscules. */
export function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}

/**
 * Audit des en-têtes de sécurité de la réponse du document principal.
 * HSTS n'est exigé qu'en HTTPS (ignoré sur http://localhost).
 */
export function auditHeaders(
  headers: Record<string, string>,
  cfg: {
    requiredHeaders: string[];
    recommendedHeaders: string[];
    requireHstsOnHttps: boolean;
  },
  https: boolean,
): SecurityFinding[] {
  const h = lowerHeaders(headers);
  const findings: SecurityFinding[] = [];

  for (const name of cfg.requiredHeaders) {
    if (!h[name]) {
      findings.push({
        id: `sec-header-missing-${name}`,
        title: `En-tête de sécurité manquant : ${name}`,
        severity: 'major',
        detail: `La réponse ne définit pas \`${name}\`. Recommandé pour durcir l'app.`,
      });
    }
  }
  for (const name of cfg.recommendedHeaders) {
    if (!h[name]) {
      findings.push({
        id: `sec-header-reco-${name}`,
        title: `En-tête recommandé absent : ${name}`,
        severity: 'minor',
        detail: `\`${name}\` améliorerait la posture de sécurité (non bloquant).`,
      });
    }
  }
  if (https && cfg.requireHstsOnHttps && !h['strict-transport-security']) {
    findings.push({
      id: 'sec-header-missing-hsts',
      title: 'HSTS manquant (Strict-Transport-Security)',
      severity: 'major',
      detail: 'Site HTTPS sans HSTS : exposé au downgrade/SSL-strip.',
    });
  } else if (!https) {
    findings.push({
      id: 'sec-http-not-https',
      title: 'Service en HTTP (non chiffré)',
      severity: https ? 'info' : 'info',
      detail: 'Cible en http:// — contrôles HSTS/cookies Secure non applicables (OK en local).',
    });
  }
  return findings;
}

/** Audit des flags des cookies de session. Secure non exigé en http (local). */
export function auditCookies(
  cookies: CookieLike[],
  sessionCookiePattern: string,
  https: boolean,
): SecurityFinding[] {
  const re = new RegExp(sessionCookiePattern, 'i');
  const findings: SecurityFinding[] = [];
  for (const c of cookies.filter((c) => re.test(c.name))) {
    const issues: string[] = [];
    if (!c.httpOnly) issues.push('HttpOnly');
    if (https && !c.secure) issues.push('Secure');
    if (!c.sameSite || c.sameSite === 'None') issues.push('SameSite (Lax/Strict)');
    if (issues.length) {
      findings.push({
        id: `sec-cookie-${c.name}`,
        title: `Cookie de session faiblement protégé : ${c.name}`,
        severity: 'major',
        detail: `Flags manquants/faibles : ${issues.join(', ')}.`,
      });
    }
  }
  return findings;
}

/** Vérifie que les chemins sensibles ne répondent PAS 200 (exposition de secrets/infra). */
export async function auditForbiddenPaths(
  request: APIRequestContext,
  baseURL: string,
  paths: string[],
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const p of paths) {
    try {
      const url = new URL(p, baseURL).toString();
      const res = await request.get(url, { failOnStatusCode: false, maxRedirects: 0 });
      if (res.status() !== 200) continue;
      const ct = (res.headers()['content-type'] ?? '').toLowerCase();
      const body = (await res.text()).slice(0, 600);
      // Beaucoup de SPA renvoient index.html (200) pour TOUTE route inconnue
      // (catch-all) → ce n'est PAS une exposition. On ne signale que si la réponse
      // n'est PAS du HTML : le vrai fichier sensible est alors réellement servi.
      const looksHtml = ct.includes('text/html') || /<!doctype html|<html[\s>]/i.test(body);
      if (looksHtml) continue;
      findings.push({
        id: `sec-exposed-${p}`,
        title: `Chemin sensible exposé : ${p}`,
        severity: 'critical',
        detail: `${url} répond 200 (${ct || 'type ?'}) — fuite potentielle de secrets/infrastructure.`,
      });
    } catch {
      /* injoignable → non exposé, OK */
    }
  }
  return findings;
}

/** Recherche des motifs de secrets dans le contenu des bundles JS chargés. */
export function scanSecrets(
  scripts: Array<{ url: string; body: string }>,
  patterns: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const compiled = patterns.map((p) => new RegExp(p, 'g'));
  for (const { url, body } of scripts) {
    for (let i = 0; i < compiled.length; i++) {
      const m = body.match(compiled[i]);
      if (m && m.length) {
        findings.push({
          id: `sec-secret-${i}-${url}`,
          title: 'Secret potentiel exposé côté client',
          severity: 'blocker',
          detail: `Motif "${patterns[i]}" trouvé dans ${url} (ex: ${m[0].slice(0, 8)}…). À vérifier/rotater.`,
        });
      }
    }
  }
  return findings;
}

/** Détecte les source maps exposées (référencées ET réellement atteignables). */
export async function auditSourceMaps(
  request: APIRequestContext,
  scriptUrls: string[],
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  for (const u of scriptUrls) {
    const mapUrl = `${u}.map`;
    try {
      const res = await request.get(mapUrl, { failOnStatusCode: false, maxRedirects: 0 });
      if (res.status() === 200) {
        findings.push({
          id: `sec-sourcemap-${u}`,
          title: 'Source map exposée',
          severity: 'minor',
          detail: `${mapUrl} est accessible — révèle le code source. À désactiver en prod.`,
        });
      }
    } catch {
      /* pas de map → OK */
    }
  }
  return findings;
}
