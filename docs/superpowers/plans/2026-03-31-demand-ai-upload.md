# Demand AI Upload Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude AI analysis to the demand upload wizard — röntgenfoto extraction, inline AI Q&A, and template storage for reusable mappings.

**Architecture:** Client extracts Excel structure scan, sends to `/api/ai/demand-analyze` which calls Claude Haiku for structured analysis. Results shown inline in wizard. Templates saved to DB.

**Tech Stack:** Vercel AI SDK (`@ai-sdk/anthropic`), Claude Haiku, XLSX, tRPC, Supabase

**Spec:** docs/superpowers/specs/2026-03-31-demand-ai-upload-design.md

---

## File Structure

```
src/lib/demand/
  xray.ts                          # CREATE: Extract röntgenfoto from XLSX WorkBook

src/app/api/ai/demand-analyze/
  route.ts                          # CREATE: Claude API endpoint

src/components/domain/
  demand-ai-analysis.tsx            # CREATE: Inline AI analysis card
  demand-upload-wizard.tsx          # MODIFY: integrate AI step + templates

src/server/routers/
  demand.ts                         # MODIFY: add template CRUD

supabase/migrations/
  00016_demand_import_template.sql  # CREATE: template table
```

---

### Task 1: Excel Röntgenfoto Extraction

**Files:**
- Create: `src/lib/demand/xray.ts`
- Test: `tests/lib/demand/xray.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/demand/xray.test.ts
import { describe, it, expect } from 'vitest'
import { extractXray } from '@/lib/demand/xray'
import * as XLSX from 'xlsx'

function makeWorkbook(data: unknown[][]): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return wb
}

describe('extractXray', () => {
  it('extracts basic structure from clean data', () => {
    const wb = makeWorkbook([
      ['Week', 'GTP', 'Scanning', 'Inpakken'],
      ['Wk14', 53000, 12000, 8000],
      ['Wk15', 48000, 11000, 7500],
      ['Wk16', 51000, 13000, 8200],
    ])
    const xray = extractXray(wb, 'Sheet1', ['GTP', 'Scanning'])

    expect(xray.totalRows).toBe(4)
    expect(xray.totalCols).toBe(4)
    expect(xray.firstRows.length).toBeLessThanOrEqual(10)
    expect(xray.columnStats.length).toBe(4)
    expect(xray.existingProcesses).toEqual(['GTP', 'Scanning'])
  })

  it('detects numeric columns with stats', () => {
    const wb = makeWorkbook([
      ['Date', 'Process A'],
      ['2026-04-01', 1000],
      ['2026-04-02', 2000],
      ['2026-04-03', 3000],
    ])
    const xray = extractXray(wb, 'Sheet1', [])
    const colB = xray.columnStats[1]!

    expect(colB.numericPct).toBeGreaterThan(70)
    expect(colB.min).toBe(1000)
    expect(colB.max).toBe(3000)
  })

  it('detects empty rows and suspected total rows', () => {
    const wb = makeWorkbook([
      ['Week', 'Volume'],
      ['Wk14', 100],
      ['', ''],
      ['Wk15', 200],
      ['Totaal', 300],
    ])
    const xray = extractXray(wb, 'Sheet1', [])

    expect(xray.rowPatterns.emptyRows).toContain(2)
    expect(xray.rowPatterns.suspectedTotalRows).toContain(4)
  })

  it('finds first data row (skipping title rows)', () => {
    const wb = makeWorkbook([
      ['Forecast Q2 2026', '', ''],
      ['', '', ''],
      ['Week', 'GTP', 'Scanning'],
      ['Wk14', 53000, 12000],
    ])
    const xray = extractXray(wb, 'Sheet1', [])

    expect(xray.rowPatterns.firstDataRow).toBe(3) // 0-indexed: row with numbers
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/demand/xray.test.ts`

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/demand/xray.ts
import * as XLSX from 'xlsx'

export interface ColumnStat {
  index: number
  headerCandidate: string | null
  sampleValues: string[]
  emptyPct: number
  numericPct: number
  dateLikePct: number
  uniqueCount: number
  min?: number
  max?: number
  avg?: number
}

export interface RowPatterns {
  firstDataRow: number | null
  lastDataRow: number | null
  suspectedTotalRows: number[]
  emptyRows: number[]
  mergedRegions: string[]
}

export interface ExcelXray {
  sheetName: string
  totalRows: number
  totalCols: number
  firstRows: unknown[][]
  lastRows: unknown[][]
  columnStats: ColumnStat[]
  rowPatterns: RowPatterns
  existingProcesses: string[]
  existingDemandTypes: string[]
}

const TOTAL_KEYWORDS = ['totaal', 'total', 'sum', 'subtotal', 'grand total', 'eindtotaal']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$|^wk\s?\d{1,2}$/i

export function extractXray(
  wb: XLSX.WorkBook,
  sheetName: string,
  existingProcesses: string[],
  existingDemandTypes: string[] = [],
): ExcelXray {
  const sheet = wb.Sheets[sheetName]!
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

  const totalRows = allRows.length
  const totalCols = Math.max(...allRows.map(r => (r as unknown[]).length), 0)

  // First 10 and last 5 rows
  const firstRows = allRows.slice(0, 10)
  const lastRows = allRows.slice(Math.max(0, totalRows - 5))

  // Row patterns
  const emptyRows: number[] = []
  const suspectedTotalRows: number[] = []
  let firstDataRow: number | null = null
  let lastDataRow: number | null = null

  for (let r = 0; r < totalRows; r++) {
    const row = allRows[r] as unknown[]
    const nonEmpty = row.filter(v => v !== '' && v != null)

    if (nonEmpty.length === 0) {
      emptyRows.push(r)
      continue
    }

    // Check for total rows
    const firstCell = String(row[0] ?? '').toLowerCase().trim()
    if (TOTAL_KEYWORDS.some(k => firstCell.includes(k))) {
      suspectedTotalRows.push(r)
      continue
    }

    // Check if row has >50% numeric values
    const numericCount = row.filter(v => typeof v === 'number' || (typeof v === 'string' && /^\d[\d,.]*$/.test(v.trim()))).length
    if (numericCount > row.length * 0.4 && numericCount >= 2) {
      if (firstDataRow === null) firstDataRow = r
      lastDataRow = r
    }
  }

  // Merged regions
  const mergedRegions: string[] = []
  if (sheet['!merges']) {
    for (const m of sheet['!merges']) {
      mergedRegions.push(XLSX.utils.encode_range(m))
    }
  }

  // Column statistics
  const columnStats: ColumnStat[] = []
  for (let c = 0; c < totalCols; c++) {
    const values: unknown[] = allRows.map(r => (r as unknown[])[c])
    const nonEmpty = values.filter(v => v !== '' && v != null)
    const total = values.length

    // Find header candidate (first non-empty string value)
    const headerRow = firstDataRow !== null ? Math.max(0, firstDataRow - 1) : 0
    const headerCandidate = String(values[headerRow] ?? '').trim() || null

    // Sample values (up to 5 unique non-empty)
    const uniqueVals = [...new Set(nonEmpty.map(v => String(v).trim()))].slice(0, 5)

    // Type percentages
    const numericVals: number[] = []
    let dateLikeCount = 0
    for (const v of nonEmpty) {
      const s = String(v).trim()
      const n = Number(s.replace(/,/g, ''))
      if (!isNaN(n) && s !== '') numericVals.push(n)
      if (DATE_PATTERN.test(s)) dateLikeCount++
    }

    columnStats.push({
      index: c,
      headerCandidate,
      sampleValues: uniqueVals,
      emptyPct: total > 0 ? Math.round(((total - nonEmpty.length) / total) * 100) : 100,
      numericPct: nonEmpty.length > 0 ? Math.round((numericVals.length / nonEmpty.length) * 100) : 0,
      dateLikePct: nonEmpty.length > 0 ? Math.round((dateLikeCount / nonEmpty.length) * 100) : 0,
      uniqueCount: new Set(nonEmpty.map(v => String(v))).size,
      ...(numericVals.length > 0 ? {
        min: Math.min(...numericVals),
        max: Math.max(...numericVals),
        avg: Math.round(numericVals.reduce((a, b) => a + b, 0) / numericVals.length),
      } : {}),
    })
  }

  return {
    sheetName,
    totalRows,
    totalCols,
    firstRows,
    lastRows,
    columnStats,
    rowPatterns: {
      firstDataRow,
      lastDataRow,
      suspectedTotalRows,
      emptyRows: emptyRows.slice(0, 20), // cap at 20
      mergedRegions: mergedRegions.slice(0, 10),
    },
    existingProcesses,
    existingDemandTypes,
  }
}
```

- [ ] **Step 4: Run test, type check, commit**

```bash
npx vitest run tests/lib/demand/xray.test.ts
npx tsc --noEmit
git add src/lib/demand/xray.ts tests/lib/demand/xray.test.ts
git commit -m "feat(demand-ai): Excel röntgenfoto extraction with column stats and row patterns"
```

---

### Task 2: Claude API Endpoint

**Files:**
- Create: `src/app/api/ai/demand-analyze/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
// src/app/api/ai/demand-analyze/route.ts
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const DemandAnalysisSchema = z.object({
  headerRow: z.number(),
  dataStartRow: z.number(),
  dataEndRow: z.number(),
  skipRows: z.array(z.number()),
  orientation: z.enum(['rows_dates', 'cols_dates']),
  dateColumn: z.number().nullable(),
  processColumns: z.array(z.object({
    index: z.number(),
    rawName: z.string(),
    suggestedMatch: z.string().nullable(),
    confidence: z.number(),
    reason: z.string(),
  })),
  unitType: z.enum(['units', 'cases', 'pallets', 'hours', 'fte', 'unknown']),
  unitTypeConfidence: z.number(),
  anomalies: z.array(z.string()),
  questions: z.array(z.object({
    id: z.string(),
    text: z.string(),
    type: z.enum(['choice', 'confirm']),
    options: z.array(z.string()).optional(),
    default: z.string().optional(),
  })).max(3),
})

const SYSTEM_PROMPT = `Je bent een Excel data-analist voor AstraPlanner, een workforce planning tool voor warehouses.
Je analyseert geüploade demand forecast spreadsheets.

Je taken:
1. Identificeer waar de echte headers en data staan (bestanden zijn vaak rommelig met lege rijen, titels, merged cellen)
2. Match kolomnamen aan bestaande AstraPlanner processen (gegeven in de context)
3. Detecteer het eenheidstype (units, dozen, pallets, uren, FTE) op basis van de getallenranges
4. Signaleer anomalieën (lege kolommen, totaalrijen, vreemde waarden)
5. Stel maximaal 3 gerichte vragen aan de gebruiker (in het Nederlands)

Regels:
- Alle vragen MOETEN in het Nederlands zijn
- Wees specifiek en concreet in je vragen
- Gebruik de kolom/rij statistieken om conclusies te trekken
- Als je >90% zeker bent, stel geen vraag maar vermeld het als bevinding
- Getallenranges: 1000+ = waarschijnlijk units, 10-100 = waarschijnlijk FTE, 100-1000 = kan alles zijn`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { xray } = body

  if (!xray) return new Response('Missing xray data', { status: 400 })

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: DemandAnalysisSchema,
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(xray, null, 2),
      temperature: 0.1,
    })

    return Response.json(object)
  } catch (err) {
    console.error('[demand-analyze] Claude error:', err)
    return Response.json(
      { error: 'Analyse mislukt. Probeer opnieuw.' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/demand-analyze/route.ts
git commit -m "feat(demand-ai): Claude Haiku endpoint for Excel structure analysis"
```

---

### Task 3: AI Analysis Card Component

**Files:**
- Create: `src/components/domain/demand-ai-analysis.tsx`

- [ ] **Step 1: Create the component**

```typescript
interface DemandAiAnalysisProps {
  /** The analysis result from Claude */
  analysis: DemandAnalysis | null
  /** Whether analysis is loading */
  loading: boolean
  /** Error message if analysis failed */
  error: string | null
  /** Callback when user answers a question */
  onAnswer: (questionId: string, answer: string) => void
  /** Answers given so far */
  answers: Record<string, string>
  /** Callback to retry analysis */
  onRetry: () => void
}
```

**UI states:**

Loading:
- Shimmer card with "Claude analyseert je bestand..." text
- Subtle brain/sparkles icon animation

Success:
- **Findings section:** Cards showing what Claude found
  - "Headers op rij {N}" chip
  - "Data rijen {start}-{end}" chip
  - "Eenheid: {unitType}" chip (with confidence badge)
  - "{N} processen herkend" chip
- **Anomalies:** Warning cards for each anomaly (amber)
- **Questions:** Each question as a card with:
  - Question text
  - For 'choice': pill buttons for each option
  - For 'confirm': [Ja] [Nee] buttons
  - Selected answer highlighted in indigo

Error:
- Error card with retry button

**Styling:** Follow existing glassmorphism patterns. Use Framer Motion stagger for cards.

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/components/domain/demand-ai-analysis.tsx
git commit -m "feat(demand-ai): inline AI analysis card with Q&A"
```

---

### Task 4: Integrate AI into Upload Wizard

**Files:**
- Modify: `src/components/domain/demand-upload-wizard.tsx`

- [ ] **Step 1: Add AI analysis step**

After file upload + sheet selection, add a new step between upload and mapping:

**New wizard flow:**
1. Upload + sheet select (existing)
2. **AI Analysis (NEW)** — send xray, show results, answer questions
3. Process mapping (existing, pre-filled with Claude suggestions)
4. Preview + import (existing)

Changes:
- Import `extractXray` from `@/lib/demand/xray`
- Import `DemandAiAnalysis` from `./demand-ai-analysis`
- After file parse: extract xray, call `/api/ai/demand-analyze` via fetch
- Store analysis result in state
- Apply Claude's suggestions to pre-fill mappings
- Add step indicator for 4 steps instead of 3

**State additions:**
```typescript
const [aiAnalysis, setAiAnalysis] = useState<DemandAnalysis | null>(null)
const [aiLoading, setAiLoading] = useState(false)
const [aiError, setAiError] = useState<string | null>(null)
const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({})
```

**AI call (after file parse):**
```typescript
const runAiAnalysis = async (wb: XLSX.WorkBook, sheetName: string) => {
  setAiLoading(true)
  setAiError(null)
  try {
    const xray = extractXray(wb, sheetName, processNames, demandTypeNames)
    const res = await fetch('/api/ai/demand-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xray }),
    })
    if (!res.ok) throw new Error('Analyse mislukt')
    const analysis = await res.json()
    setAiAnalysis(analysis)
    // Apply Claude's suggestions to mappings
    applyAiSuggestions(analysis)
  } catch (err) {
    setAiError(err instanceof Error ? err.message : 'Analyse mislukt')
  } finally {
    setAiLoading(false)
  }
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/components/domain/demand-upload-wizard.tsx
git commit -m "feat(demand-ai): integrate AI analysis step into upload wizard"
```

---

### Task 5: DB Migration for Templates

**Files:**
- Create: `supabase/migrations/00016_demand_import_template.sql`

- [ ] **Step 1: Write migration**

```sql
-- 00016_demand_import_template.sql
CREATE TABLE demand_import_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL,
  column_mappings JSONB NOT NULL DEFAULT '{}',
  header_row INT NOT NULL DEFAULT 0,
  data_start_row INT NOT NULL DEFAULT 1,
  data_end_row INT,
  skip_rows INT[] DEFAULT '{}',
  orientation TEXT NOT NULL DEFAULT 'rows_dates',
  unit_type TEXT NOT NULL DEFAULT 'units',
  sheet_name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE demand_import_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_select ON demand_import_template
  FOR SELECT USING (organization_id = (
    SELECT (raw_app_meta_data->>'organization_id')::uuid
    FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY template_modify ON demand_import_template
  FOR ALL USING (organization_id = (
    SELECT (raw_app_meta_data->>'organization_id')::uuid
    FROM auth.users WHERE id = auth.uid()
  ));

CREATE TRIGGER trg_template_updated_at
  BEFORE UPDATE ON demand_import_template
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00016_demand_import_template.sql
git commit -m "feat(demand-ai): demand_import_template table migration"
```

---

### Task 6: Template CRUD in Demand Router

**Files:**
- Modify: `src/server/routers/demand.ts`

- [ ] **Step 1: Add template procedures**

Add to the demand router:

```typescript
// listTemplates — fetch all templates for the org
listTemplates: viewerProcedure
  .input(z.object({ site_id: z.string().uuid().optional() }))
  .query(async ({ ctx }) => {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('demand_import_template')
      .select('id, name, column_mappings, sheet_name, unit_type, created_at, updated_at')
      .eq('organization_id', ctx.organizationId)
      .order('updated_at', { ascending: false })
    assertNoError(error, 'listTemplates')
    return data ?? []
  }),

// saveTemplate — create or update a template
saveTemplate: plannerProcedure
  .input(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    column_mappings: z.record(z.string()),
    header_row: z.number().int().min(0),
    data_start_row: z.number().int().min(0),
    data_end_row: z.number().int().optional(),
    skip_rows: z.array(z.number()).optional(),
    orientation: z.string().optional(),
    unit_type: z.string().optional(),
    sheet_name: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const admin = createAdminClient()
    const row = {
      ...input,
      organization_id: ctx.organizationId,
      created_by: ctx.user.id,
    }
    const { data, error } = await admin
      .from('demand_import_template')
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .single()
    assertNoError(error, 'saveTemplate')
    return data
  }),

// deleteTemplate
deleteTemplate: managerProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const admin = createAdminClient()
    const { error } = await admin
      .from('demand_import_template')
      .delete()
      .eq('id', input.id)
      .eq('organization_id', ctx.organizationId)
    assertNoError(error, 'deleteTemplate')
    return { deleted: true }
  }),
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/server/routers/demand.ts
git commit -m "feat(demand-ai): template CRUD in demand router"
```

---

### Task 7: Template Save/Load in Wizard

**Files:**
- Modify: `src/components/domain/demand-upload-wizard.tsx`

- [ ] **Step 1: Add template support**

Changes:
- Query templates: `trpc.demand.listTemplates.useQuery()`
- On upload: check if any template's `column_mappings` keys match the file's process names
- If match found: show "Template '{name}' gevonden — toepassen?" banner
- Apply template: skip AI analysis, pre-fill mappings from template
- After import success: show "Opslaan als template?" with name input
- Save: call `trpc.demand.saveTemplate.useMutation()`

**Template match logic:**
```typescript
function findMatchingTemplate(templates, sourceProcesses) {
  for (const tmpl of templates) {
    const templateKeys = Object.keys(tmpl.column_mappings)
    const matchCount = sourceProcesses.filter(p =>
      templateKeys.some(k => k.toLowerCase() === p.toLowerCase())
    ).length
    if (matchCount >= sourceProcesses.length * 0.7) return tmpl // 70%+ match
  }
  return null
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/components/domain/demand-upload-wizard.tsx
git commit -m "feat(demand-ai): template save/load in upload wizard"
```
