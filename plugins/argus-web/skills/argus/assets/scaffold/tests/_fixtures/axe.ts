// tests/_fixtures/axe.ts
//
// Argus QA harness — accessibility (a11y) fixture.
// Cible : @axe-core/playwright 4.11.3 (embarque axe-core 4.11.4), @playwright/test 1.5x+.
//
// Ce fixture expose `makeAxeBuilder`, une factory qui retourne un AxeBuilder
// pré-configuré avec les tags WCAG. On retourne une *factory* (et non un builder
// déjà construit) pour que chaque test puisse encore enchaîner .include()/.exclude()
// avant d'appeler .analyze() — c'est le pattern recommandé par la doc officielle
// Playwright (https://playwright.dev/docs/accessibility-testing).

import { test as base, expect, type TestInfo } from '@playwright/test';
// IMPORTANT : @axe-core/playwright exporte AxeBuilder à la fois en default ET en
// named export (`export { AxeBuilder, AxeBuilder as default }`). Les deux styles
// fonctionnent. On prend le named export, plus explicite et stable.
import { AxeBuilder } from '@axe-core/playwright';
import type { AxeResults, Result, ImpactValue } from 'axe-core';

// Tags WCAG appliqués par défaut à chaque scan.
// On vise A + AA pour WCAG 2.0 et WCAG 2.1 (cible légale courante).
// Les tags sont des chaînes (unions de strings) — pas d'enum côté axe-core.
export const ARGUS_WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
] as const;

// Niveaux d'impact axe-core, du moins grave au plus grave.
// `null` existe aussi dans le type ImpactValue mais ne représente pas un seuil.
const IMPACT_ORDER: ReadonlyArray<Exclude<ImpactValue, null>> = [
  'minor',
  'moderate',
  'serious',
  'critical',
];

// Seuil d'impact à partir duquel une violation fait échouer le test.
// Lu depuis l'env (ARGUS_A11Y_IMPACT) avec fallback "serious".
// Ex. ARGUS_A11Y_IMPACT=critical pour un mode plus permissif (DEMO),
//     ARGUS_A11Y_IMPACT=minor pour un mode strict (REGRESS).
function resolveImpactThreshold(): Exclude<ImpactValue, null> {
  const raw = (process.env.ARGUS_A11Y_IMPACT ?? 'serious').toLowerCase();
  const isValid = (IMPACT_ORDER as readonly string[]).includes(raw);
  if (!isValid) {
    // On ne crash pas le run pour une config invalide : on loggue et on retombe
    // sur le défaut. Jamais de catch silencieux.
    // eslint-disable-next-line no-console
    console.warn(
      `[argus][a11y] ARGUS_A11Y_IMPACT invalide ("${raw}"), fallback "serious". ` +
        `Valeurs attendues : ${IMPACT_ORDER.join(', ')}.`,
    );
    return 'serious';
  }
  return raw as Exclude<ImpactValue, null>;
}

export const ARGUS_IMPACT_THRESHOLD = resolveImpactThreshold();

// Compare deux impacts : true si `impact` est >= `threshold` dans l'échelle de gravité.
// Une violation sans impact (null/undefined) est traitée comme NON bloquante par
// rapport au seuil, mais reste visible dans le rapport attaché.
export function meetsImpactThreshold(
  impact: ImpactValue | undefined,
  threshold: Exclude<ImpactValue, null>,
): boolean {
  if (impact === null || impact === undefined) {
    return false;
  }
  return IMPACT_ORDER.indexOf(impact) >= IMPACT_ORDER.indexOf(threshold);
}

// Filtre les violations qui atteignent ou dépassent le seuil d'impact configuré.
export function filterViolationsByImpact(
  violations: readonly Result[],
  threshold: Exclude<ImpactValue, null> = ARGUS_IMPACT_THRESHOLD,
): Result[] {
  return violations.filter((v) => meetsImpactThreshold(v.impact, threshold));
}

// Résumé lisible (1 ligne/violation) pour les messages d'assertion et les logs.
// Le JSON complet est attaché séparément au rapport (voir attachAxeResults).
export function summarizeViolations(violations: readonly Result[]): string {
  if (violations.length === 0) {
    return 'Aucune violation.';
  }
  return violations
    .map((v) => {
      const nodeCount = v.nodes.length;
      const targets = v.nodes
        .slice(0, 3)
        .map((n) => JSON.stringify(n.target))
        .join(', ');
      return `- [${v.impact ?? 'n/a'}] ${v.id}: ${v.help} (${nodeCount} nœud(s)) ${targets}`;
    })
    .join('\n');
}

// Attache le JSON brut des résultats axe au rapport Playwright.
// Visible dans le HTML report (onglet Attachments) et dans les artefacts CI.
// On attache TOUJOURS, même quand le test passe, pour garder une trace auditable.
export async function attachAxeResults(
  testInfo: TestInfo,
  results: AxeResults,
  name = 'axe-results',
): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
}

// Type du fixture exposé aux specs.
type AxeFixtures = {
  // Factory : chaque appel retourne un nouveau AxeBuilder pré-taggé.
  makeAxeBuilder: () => AxeBuilder;
};

// `test` étendu avec le fixture a11y. Les specs importent CE test, pas celui de
// @playwright/test, pour bénéficier de makeAxeBuilder.
export const test = base.extend<AxeFixtures>({
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = (): AxeBuilder =>
      new AxeBuilder({ page })
        .withTags([...ARGUS_WCAG_TAGS])
        // Exemple d'exclusion d'un widget tiers connu pour ses faux positifs.
        // À adapter par projet ; commenté par défaut pour ne rien masquer.
        // .exclude('#third-party-widget')
        ;
    await use(makeAxeBuilder);
  },
});

// Re-export d'expect pour que les specs n'aient qu'un seul import.
export { expect };
export type { AxeResults, Result, ImpactValue };
