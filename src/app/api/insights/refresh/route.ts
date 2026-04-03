import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchRivm } from '@/lib/insights/sources/rivm'
import { fetchKnmi } from '@/lib/insights/sources/knmi'
import { fetchPollen } from '@/lib/insights/sources/pollen'
import { fetchVakanties } from '@/lib/insights/sources/vakanties'
import { fetchCbs } from '@/lib/insights/sources/cbs'

export async function GET(req: Request) {
  // Verify cron secret in production
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const errors: string[] = []
  let refreshed = 0

  const [rivmData, knmiData, pollenData, vakantieData, cbsData] = await Promise.allSettled([
    fetchRivm(), fetchKnmi(), fetchPollen(), fetchVakanties(), fetchCbs(),
  ])

  const allSignals = [
    ...(rivmData.status === 'fulfilled' ? rivmData.value : (errors.push('RIVM failed'), [])),
    ...(knmiData.status === 'fulfilled' ? knmiData.value : (errors.push('KNMI failed'), [])),
    ...(pollenData.status === 'fulfilled' ? pollenData.value : (errors.push('Pollen failed'), [])),
    ...(vakantieData.status === 'fulfilled' ? vakantieData.value : (errors.push('Vakanties failed'), [])),
    ...(cbsData.status === 'fulfilled' ? cbsData.value : (errors.push('CBS failed'), [])),
  ]

  for (const signal of allSignals) {
    const { error } = await admin.from('external_signal').insert({
      source: signal.source,
      signal_type: signal.signal_type,
      value: signal.value,
      severity: signal.severity,
      region: signal.region,
      period_start: signal.period_start,
      period_end: signal.period_end,
      metadata: signal.metadata,
      organization_id: null,
    })
    if (error) errors.push(`${signal.source}/${signal.signal_type}: ${error.message}`)
    else refreshed++
  }

  return NextResponse.json({ refreshed, errors, timestamp: new Date().toISOString() })
}
