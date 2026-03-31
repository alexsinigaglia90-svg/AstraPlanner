# Demand AI Upload Wizard — Design Spec

**Date:** 2026-03-31
**Status:** Approved

---

## 1. Overview

Enhance the demand upload wizard with Claude AI inline analysis. Claude examines the uploaded Excel "röntgenfoto" (structure scan), identifies headers, data regions, anomalies, and suggests process mappings. Max 2-3 targeted questions to the user. Mappings are saved as reusable templates.

## 2. Architecture

```
User uploads Excel
  → Client extracts "röntgenfoto" (headers, stats, patterns)
  → POST /api/ai/demand-analyze
    → Claude analyzes structure
    → Returns: findings, questions, suggested mappings
  → Wizard shows Claude's analysis inline
  → User answers questions (click-to-answer, not free text)
  → Wizard applies Claude's suggestions to mapping step
  → On import success: save mapping as template
```

## 3. Wizard Flow (enhanced)

### Step 1: Upload + Sheet Select (existing)
No changes. User uploads file, selects sheet if multiple.

### Step 2: AI Analysis (NEW)
After file is parsed, automatically send röntgenfoto to Claude.

**UI:** Inline analysis card with:
- Loading state: "Claude analyseert je bestand..." with shimmer
- Analysis results: structured findings as cards/chips
- Questions: click-to-answer buttons (not free text input)

**Claude's structured output:**
```typescript
interface DemandAnalysis {
  // Structural findings
  headerRow: number              // which row contains the real headers
  dataStartRow: number           // where data begins
  dataEndRow: number             // where data ends (before totals)
  skipRows: number[]             // total/summary rows to exclude
  orientation: 'rows_dates' | 'cols_dates'  // which axis has dates

  // Column/process identification
  dateColumn: number | null      // which column has dates (if rows_dates)
  processColumns: Array<{
    index: number
    rawName: string              // name from Excel
    suggestedMatch: string | null // AstraPlanner process name
    confidence: number           // 0-1
    reason: string               // "Exact match" / "Partial match" / "No match"
  }>

  // Data insights
  unitType: 'units' | 'cases' | 'pallets' | 'hours' | 'fte' | 'unknown'
  unitTypeConfidence: number
  anomalies: string[]            // human-readable warnings

  // Questions for the user (max 3)
  questions: Array<{
    id: string
    text: string                 // Dutch
    type: 'choice' | 'confirm'
    options?: string[]           // for 'choice' type
    default?: string             // pre-selected option
  }>
}
```

**Example questions Claude might ask:**
- "De getallen variëren van 10.000 tot 55.000. Zijn dit units of dozen?" → [Units] [Dozen] [Pallets]
- "Kolom H 'Schoonmaak' heeft 85% lege waarden. Overslaan?" → [Ja, overslaan] [Nee, meenemen]
- "Rij 45 bevat het woord 'Totaal'. Is dit een totaalrij die overgeslagen moet worden?" → [Ja] [Nee]

### Step 3: Process Mapping (enhanced)
Pre-filled with Claude's suggested mappings. User only needs to fix unmatched or low-confidence matches.

### Step 4: Preview & Import (existing)
With template save option at the bottom.

### Step 5: Template Save (NEW, optional)
After successful import:
- "Opslaan als template?" prompt
- Name input (auto-suggest based on filename)
- Save column_mappings + structural settings

## 4. Röntgenfoto Extraction (client-side)

```typescript
interface ExcelXray {
  sheetName: string
  totalRows: number
  totalCols: number

  // First 10 rows raw (to find headers/titles)
  firstRows: unknown[][]

  // Last 5 rows (to detect totals/footers)
  lastRows: unknown[][]

  // Per-column statistics (full sheet scan)
  columnStats: Array<{
    index: number
    headerCandidate: string | null  // value from most likely header row
    sampleValues: string[]          // 5 non-empty sample values
    emptyPct: number                // % empty cells
    numericPct: number              // % numeric cells
    dateLikePct: number             // % date-like cells
    uniqueCount: number
    min?: number
    max?: number
    avg?: number
  }>

  // Row patterns
  rowPatterns: {
    firstDataRow: number | null     // first row with >50% numeric values
    lastDataRow: number | null      // last row before totals
    suspectedTotalRows: number[]    // rows containing "totaal"/"sum"/"total"
    emptyRows: number[]             // fully empty rows
    mergedRegions: string[]         // e.g. "A1:F1"
  }

  // Context: existing processes in AstraPlanner
  existingProcesses: string[]
  existingDemandTypes: string[]
}
```

## 5. API Endpoint

`POST /api/ai/demand-analyze`

**Input:** `{ xray: ExcelXray, organizationId: string }`

**System prompt for Claude:**
```
You are an Excel data analyst for AstraPlanner, a workforce planning tool.
You analyze uploaded demand forecast spreadsheets.

Your job:
1. Identify where headers and data actually start (files are often messy)
2. Match column names to existing AstraPlanner processes
3. Detect the unit type (units, cases, pallets, hours, FTE)
4. Flag anomalies (empty columns, total rows, weird values)
5. Ask max 3 targeted questions to the user (in Dutch)

Return a structured JSON response matching the DemandAnalysis interface.
Always respond in Dutch for question text.
```

**Model:** Claude Haiku (fast, cheap — this is a structured analysis task)

**Response:** `DemandAnalysis` JSON

## 6. Template Storage

### New DB table
```sql
CREATE TABLE demand_import_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL,
  column_mappings JSONB NOT NULL,   -- {"Excel Column": "demand_type_uuid", ...}
  header_row INT NOT NULL,
  data_start_row INT NOT NULL,
  data_end_row INT,
  skip_rows INT[] DEFAULT '{}',
  orientation TEXT NOT NULL DEFAULT 'rows_dates',
  unit_type TEXT NOT NULL DEFAULT 'units',
  sheet_name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_template_org FOREIGN KEY (organization_id) REFERENCES organization(id)
);

ALTER TABLE demand_import_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_org ON demand_import_template
  FOR ALL USING (organization_id = current_setting('app.organization_id', true)::uuid);
```

### Template usage flow
1. On upload: check if any templates exist for this org
2. If template found: auto-apply mappings, skip AI analysis
3. Show "Template X toegepast" with option to re-analyze
4. After import: "Template bijwerken?" if mappings changed

## 7. File Structure

```
src/app/api/ai/demand-analyze/
  route.ts                        # Claude API endpoint

src/lib/demand/
  xray.ts                         # Extract röntgenfoto from workbook

src/components/domain/
  demand-upload-wizard.tsx         # MODIFY: add AI step + template support
  demand-ai-analysis.tsx           # NEW: inline analysis card component

src/server/routers/
  demand.ts                        # MODIFY: add template CRUD
```

## 8. Implementation Sequence

| Step | What | Size |
|------|------|------|
| 1 | Excel röntgenfoto extraction (`xray.ts`) | Small |
| 2 | Claude API endpoint (`/api/ai/demand-analyze`) | Medium |
| 3 | AI analysis card component | Medium |
| 4 | Integrate into wizard (step 2 becomes AI analysis) | Medium |
| 5 | DB migration for `demand_import_template` | Small |
| 6 | Template CRUD in demand router | Small |
| 7 | Template save/load in wizard | Medium |

## 9. Cost Estimation

- Claude Haiku per analysis: ~3000 input tokens + ~500 output tokens = ~$0.001
- Expected usage: 2-5 uploads per org per week
- Monthly cost per org: < $0.02
