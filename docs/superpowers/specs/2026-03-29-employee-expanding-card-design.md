# Employee Expanding Card — Design Spec

**Datum:** 2026-03-29
**Status:** Goedgekeurd
**Scope:** Replace SlideOver quick-edit with in-place expanding card — tabbed interface with profile, skills, and status

---

## 1. Overzicht

De huidige employee quick-edit (SlideOver panel) wordt vervangen door een **Expanding Card** — de employee card groeit in-place vanuit zijn eigen positie, met spring animatie. Andere cards dimmen en schuiven weg. Drie tabs: Profiel (bewerkbaar), Skills (radial grader), Status (alleen lezen).

## 2. Trigger & Animatie

**Trigger:** Hold-to-press (400ms) op een employee card — bestaand gedrag, geen wijziging.

**Open animatie:**
- Card groeit vanuit eigen positie naar ~560px breed, ~auto hoogte
- Spring physics (`bouncy` transition)
- Andere cards dimmen naar 30% opacity
- Expanded card krijgt glassmorphism elevation: `backdrop-blur(16px)`, indigo ring-glow `box-shadow: 0 0 0 3px rgba(99,102,241,0.2), 0 20px 60px rgba(30,27,75,0.12)`
- Avatar vergroot van md naar lg met spring scale

**Sluit animatie:**
- Klik buiten de card, X knop, of Escape key
- Card krimpt terug naar originele grootte
- Andere cards schuiven terug en restoren opacity
- Reverse spring met `gentle` transition

## 3. Card Header (altijd zichtbaar)

- Grote avatar (48px, rounded-xl, gradient achtergrond)
- Naam (font-display, 18px, bold)
- Subtitel: afdeling + crew + contract type
- Status dot (groen=beschikbaar, rood=ziek, amber=verlof)
- Sluiten knop (X, top-right)
- "Bewerken" / "Opslaan" toggle knop (top-right, onder X)

## 4. Tab: Profiel

**Read mode (default):**
- 2-koloms grid met glassmorphism value chips
- Velden: Afdeling, Crew, Role, Contract type, Uren/week, Uurloon (inherited from role, tonen als "€14,50 (via role)")
- Alle waarden in nette read-only chips

**Edit mode (na "Bewerken" klik):**
- Value chips worden GlassSelect dropdowns en inputs
- Afdeling: GlassSelect met bestaande afdelingen
- Crew: GlassSelect met crews van de site
- Role: GlassSelect met roles
- Contract: GlassSelect met contract types
- Uren: number input
- "Opslaan" → animated checkmark SVG, card flasht groen border, toast "Opgeslagen"
- Calls `trpc.workforce.upsertEmployee` met gewijzigde velden

## 5. Tab: Skills

- Huidige skills als badges met sterren-rating (★★★★☆)
- Badge stijl: glassmorphism chip, indigo accent, proficiency als sterren
- **Tap op badge** → popover met AAA-grade radial skill grader
  - Grotere ring dan huidige versie (120px diameter)
  - Gradient arc (indigo → purple)
  - Animated level indicator
  - Particle burst bij level-up (confetti-achtig)
  - Tap buiten = sluiten
  - Wijziging auto-saved via `trpc.workforce.updateSkill`

- **"+ Skill toevoegen"** knop
  - Opent GlassSelect dropdown met beschikbare processen (nog niet toegekend)
  - Na selectie: badge springt in met `wobbly` animatie
  - Default proficiency: 1
  - Calls `trpc.workforce.updateSkill` met nieuwe skill

- **Verwijderen:** hold-to-delete (1.2s) op een skill badge → badge shrinks en verdwijnt

## 6. Tab: Status

- **Beschikbaarheidsstatus:** "Beschikbaar", "Ziek", "Verlof" met colored dot
- **Weekoverzicht:** Ma-Vr blokjes (groen=beschikbaar, rood=afwezig, grijs=weekend)
  - Data uit `employee_availability_override` voor de huidige week
- **Links:** "Ga naar Verzuim" en "Ga naar Verlof" — navigeert naar respectievelijke pagina's
- **Alleen lezen** — geen bewerkingen in deze tab

## 7. Componenten

### Nieuwe bestanden
| Component | Bestand |
|---|---|
| ExpandingCard | `src/components/domain/expanding-card.tsx` |
| ProfileTab | inline in expanding-card.tsx (sub-component) |
| SkillsTab | inline in expanding-card.tsx (sub-component) |
| StatusTab | inline in expanding-card.tsx (sub-component) |
| RadialSkillGrader (upgraded) | `src/components/domain/radial-skill-grader.tsx` (edit bestaande) |

### Gewijzigde bestanden
| Bestand | Wijziging |
|---|---|
| `src/app/dashboard/employees/page.tsx` | Vervang SlideOver + EditEmployeeForm door ExpandingCard |

## 8. Data Requirements

De expanding card heeft deze data nodig per employee:
- Employee record (id, name, department_id, crew_id, job_role_id, contract_type, weekly_hours, status)
- Skills array (via `trpc.workforce.getEmployee` die skills meegeeft)
- Beschikbaarheid overrides voor huidige week (via `trpc.absence.listActive` of nieuwe query)
- Lookup maps: departments, crews, roles, processes (al beschikbaar in employees page)

## 9. Animatie Specificaties

| Animatie | Transition | Duur |
|---|---|---|
| Card expand | `bouncy` (stiffness: 300, damping: 20) | ~400ms |
| Card collapse | `gentle` (stiffness: 200, damping: 26) | ~500ms |
| Tab switch | `snappy` slide (stiffness: 400, damping: 25) | ~200ms |
| Other cards dim | opacity 0.3, transition 300ms ease | 300ms |
| Skill badge enter | `wobbly` (stiffness: 180, damping: 12) | ~600ms |
| Radial grader level-up | particle burst + scale pulse | 400ms |
| Save confirmation | green flash + checkmark SVG | 800ms |

## 10. Buiten Scope

- Meerdere employees tegelijk expanded
- Drag & drop skills reorderen
- Inline verlof/verzuim aanmaken vanuit status tab (links naar aparte pagina's)
- Employee foto upload
