/**
 * Presentation flow step definitions.
 * Each step maps to a route, title, and talking points for the presenter.
 */

export interface DemoStep {
  /** Route to navigate to */
  route: string
  /** Short title shown in the presenter bar */
  title: string
  /** Subtitle / talking point for the presenter */
  note: string
  /** Optional scenario override for this step */
  scenario?: 'normal' | 'peak' | 'absence'
}

export const DEMO_STEPS: DemoStep[] = [
  {
    route: '/dashboard',
    title: 'Dashboard',
    note: 'Overzicht van je hele operatie — medewerkers, processen, planningen.',
  },
  {
    route: '/dashboard/settings/sites',
    title: 'Locaties',
    note: 'Multi-site beheer — Amsterdam DC en Rotterdam Hub.',
  },
  {
    route: '/dashboard/employees',
    title: 'Medewerkers',
    note: '28 medewerkers met contracten, vaardigheden en beschikbaarheid.',
  },
  {
    route: '/dashboard/skills',
    title: 'Vaardigheden',
    note: 'Skill matrix — wie kan wat op welk niveau.',
  },
  {
    route: '/dashboard/processes',
    title: 'Processen & Normen',
    note: '6 warehouse processen met productiviteitsnormen.',
  },
  {
    route: '/dashboard/demand',
    title: 'Demand & Workload',
    note: '4 weken vraag met zichtbare piek in week 12.',
  },
  {
    route: '/dashboard/planning/demo-plan-normal',
    title: 'Solver — Normaal',
    note: 'De solver optimaliseert in seconden. 96% dekking, 4 uur overwerk.',
    scenario: 'normal',
  },
  {
    route: '/dashboard/planning/demo-plan-normal',
    title: 'Planning Grid',
    note: 'Wie werkt waar en wanneer — volledig geoptimaliseerd rooster.',
    scenario: 'normal',
  },
  {
    route: '/dashboard/planning/demo-plan-normal',
    title: 'Dekking & KPIs',
    note: '96% dekking, €28.400 kosten, minimaal overwerk.',
    scenario: 'normal',
  },
  {
    route: '/dashboard/planning/demo-plan-peak',
    title: 'Piek Scenario',
    note: 'Black Friday — dubbele vraag. Solver haalt 88% met overtime.',
    scenario: 'peak',
  },
  {
    route: '/dashboard/planning/demo-plan-absence',
    title: 'Verzuim Impact',
    note: '3 medewerkers ziek. Solver herplant en haalt 84%.',
    scenario: 'absence',
  },
  {
    route: '/dashboard/planning/demo-plan-absence',
    title: 'Vergelijking',
    note: 'Side-by-side: normaal vs. verzuim — impact direct zichtbaar.',
    scenario: 'absence',
  },
  {
    route: '/dashboard',
    title: 'Afsluiting',
    note: 'Klaar om te starten? Van chaos naar orde in seconden.',
  },
]
