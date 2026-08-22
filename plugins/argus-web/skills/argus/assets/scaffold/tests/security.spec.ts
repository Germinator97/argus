import { test, expect } from '@playwright/test';
import { argus } from '../argus.config';
import {
  isHttps,
  auditHeaders,
  auditCookies,
  auditForbiddenPaths,
  auditSourceMaps,
  scanSecrets,
  type SecurityFinding,
  type SecuritySeverity,
} from './_utils/security';

/**
 * argus :: security — contrôles de sécurité NON destructifs (DAST-lite, lecture seule).
 *
 * Couvre : en-têtes de sécurité, flags des cookies de session, contenu mixte,
 * secrets exposés dans les bundles JS, source maps exposées, chemins sensibles
 * accessibles. Le DAST complet (XSS/injection) est délégué à OWASP ZAP
 * (scripts/argus-zap.sh) ; la SCA des dépendances à scripts/argus-sca.mjs.
 *
 * Réglages dans argus.config.ts → security. Gating : échec si finding >= GATE.
 */

const SEVERITY_ORDER: Record<SecuritySeverity, number> = {
  info: 0,
  minor: 1,
  major: 2,
  critical: 3,
  blocker: 4,
};
// Sévérité minimale qui fait échouer la suite (alignée sur la matrice Argus).
const GATE: SecuritySeverity = 'major';
const MAX_SCRIPTS = 30; // borne le nombre de bundles inspectés

test.describe('argus :: security (non destructif)', () => {
  test('en-têtes, cookies, secrets, chemins sensibles', async ({
    page,
    context,
    request,
  }, testInfo) => {
    const https = isHttps(argus.baseURL);
    const sec = argus.security;
    const findings: SecurityFinding[] = [];

    // Collecte des URLs requêtées (pour le contenu mixte) AVANT navigation.
    const requestUrls: string[] = [];
    page.on('request', (r) => requestUrls.push(r.url()));

    const response = await page.goto(argus.baseURL, { waitUntil: 'load' });
    expect(response, 'le document principal doit répondre').toBeTruthy();

    // 1) En-têtes de sécurité du document principal.
    findings.push(...auditHeaders(response!.headers(), sec, https));

    // 2) Flags des cookies de session.
    const cookies = await context.cookies();
    findings.push(...auditCookies(cookies, sec.sessionCookiePattern, https));

    // 3) Contenu mixte : page HTTPS chargeant des ressources HTTP.
    if (https) {
      for (const u of [...new Set(requestUrls.filter((u) => u.startsWith('http://')))]) {
        findings.push({
          id: `sec-mixed-${u}`,
          title: 'Contenu mixte (ressource http sur page https)',
          severity: 'major',
          detail: u,
        });
      }
    }

    // 4) Récupère les bundles JS (déterministe via request) + le HTML inline.
    const scriptSrcs = await page.$$eval('script[src]', (els) =>
      els.map((e) => (e as HTMLScriptElement).src).filter(Boolean),
    );
    const scripts: Array<{ url: string; body: string }> = [
      { url: '(inline-html)', body: await page.content() },
    ];
    for (const u of [...new Set(scriptSrcs)].slice(0, MAX_SCRIPTS)) {
      try {
        const r = await request.get(u, { failOnStatusCode: false });
        if (r.ok()) scripts.push({ url: u, body: await r.text() });
      } catch {
        /* bundle injoignable → ignoré */
      }
    }

    // 5) Secrets dans les bundles / HTML.
    findings.push(...scanSecrets(scripts, sec.secretPatterns));

    // 6) Source maps exposées.
    if (sec.checkSourceMaps) {
      findings.push(
        ...(await auditSourceMaps(
          request,
          [...new Set(scripts.map((s) => s.url))].filter((u) => u.startsWith('http')),
        )),
      );
    }

    // 7) Chemins sensibles accessibles.
    findings.push(...(await auditForbiddenPaths(request, argus.baseURL, sec.forbiddenPaths)));

    // Trace complète (tous les findings, même non bloquants) dans le rapport.
    await testInfo.attach('security-findings.json', {
      body: JSON.stringify(findings, null, 2),
      contentType: 'application/json',
    });

    // Gating : échec si au moins un finding >= GATE.
    const blocking = findings.filter((f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[GATE]);
    const summary = blocking.map((f) => `  - [${f.severity}] ${f.title} :: ${f.detail}`).join('\n');
    expect(
      blocking,
      blocking.length ? `${blocking.length} finding(s) sécurité >= ${GATE} :\n${summary}` : '',
    ).toEqual([]);
  });
});
