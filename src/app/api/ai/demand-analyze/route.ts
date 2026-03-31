import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/* ── Schema ──────────────────────────────────────────────────── */

const DemandAnalysisSchema = z.object({
  headerRow: z.number().describe('0-indexed row number of the real headers'),
  dataStartRow: z.number().describe('0-indexed first data row'),
  dataEndRow: z.number().describe('0-indexed last data row'),
  skipRows: z.array(z.number()).describe('rows to skip (totals, empty)'),
  orientation: z.enum(['rows_dates', 'cols_dates']),
  dateColumn: z.number().nullable(),
  processColumns: z.array(
    z.object({
      index: z.number(),
      rawName: z.string(),
      suggestedMatch: z
        .string()
        .nullable()
        .describe('matching process from existingProcesses'),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
  unitType: z.enum(['units', 'cases', 'pallets', 'hours', 'fte', 'unknown']),
  unitTypeConfidence: z.number().min(0).max(1),
  anomalies: z.array(z.string()).describe('warnings in Dutch'),
  questions: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().describe('question in Dutch'),
        type: z.enum(['choice', 'confirm']),
        options: z.array(z.string()).optional(),
        default: z.string().optional(),
      }),
    )
    .max(3),
})

/* ── System prompt ───────────────────────────────────────────── */

const SYSTEM_PROMPT = `Je bent een Excel data-analist voor AstraPlanner, een workforce planning tool voor warehouses.
Je analyseert geüploade demand forecast spreadsheets.

Je taken:
1. Identificeer waar de echte headers en data staan (bestanden zijn vaak rommelig met lege rijen, titels, merged cellen)
2. Match kolomnamen aan bestaande AstraPlanner processen (gegeven in existingProcesses en existingDemandTypes)
3. Detecteer het eenheidstype (units, dozen, pallets, uren, FTE) op basis van de getallenranges
4. Signaleer anomalieën (lege kolommen, totaalrijen, vreemde waarden) — in het Nederlands
5. Stel maximaal 3 gerichte vragen aan de gebruiker (in het Nederlands)

Regels:
- Alle tekst (anomalies, questions, reason) MOET in het Nederlands zijn
- Wees specifiek en concreet
- Als je >90% zeker bent, stel geen vraag maar vermeld het als bevinding
- Getallenranges: 1000+ = waarschijnlijk units, 10-100 = waarschijnlijk FTE, 100-1000 = kan alles zijn
- Gebruik de columnStats (emptyPct, numericPct, min/max/avg) om conclusies te trekken
- Gebruik rowPatterns.suspectedTotalRows om totaalrijen te identificeren`

/* ── Route handler ───────────────────────────────────────────── */

export async function POST(req: Request) {
  /* ── Auth ──────────────────────────────────────────────────── */
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  /* ── Body ──────────────────────────────────────────────────── */
  let xray: unknown
  try {
    const body = await req.json()
    xray = body.xray
  } catch {
    return Response.json({ error: 'Ongeldig verzoek: geen geldige JSON' }, { status: 400 })
  }

  if (!xray || typeof xray !== 'object') {
    return Response.json({ error: 'Verplicht veld ontbreekt: xray' }, { status: 400 })
  }

  /* ── Analysis ──────────────────────────────────────────────── */
  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: DemandAnalysisSchema,
      system: SYSTEM_PROMPT,
      prompt: `Analyseer de volgende Excel structuurscan (röntgenfoto) en retourneer je bevindingen:\n\n${JSON.stringify(xray, null, 2)}`,
    })

    return Response.json(object)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[demand-analyze] Claude error:', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
