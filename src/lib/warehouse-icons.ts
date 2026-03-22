/**
 * Warehouse icon database — maps department/process names to Lucide icons
 * via keyword matching. When a user types a name, the best matching icon
 * is shown automatically with a bouncy entrance animation.
 */

// ── Icon Registry ──────────────────────────────────────────────────────────
// Each entry: keywords that trigger this icon + the Lucide icon name.
// More specific keywords first — matching stops at first hit.

export interface IconEntry {
  keywords: string[]
  icon: string
  category: 'department' | 'process' | 'both'
}

export const WAREHOUSE_ICONS: IconEntry[] = [
  // ── Inbound / Receiving ────────────────────────────────────────────────
  { keywords: ['receiving', 'ontvangst', 'goods in', 'inkomend'], icon: 'PackageOpen', category: 'both' },
  { keywords: ['unloading', 'lossen', 'unladen'], icon: 'ArrowDownToLine', category: 'process' },
  { keywords: ['putaway', 'opslag', 'put away', 'inslag', 'wegzetten'], icon: 'ArrowDownToDot', category: 'process' },
  { keywords: ['inbound', 'inkomend', 'goods receipt'], icon: 'LogIn', category: 'both' },
  { keywords: ['cross dock', 'crossdock', 'cross-dock'], icon: 'ArrowLeftRight', category: 'process' },
  { keywords: ['quality', 'qc', 'inspection', 'kwaliteit', 'inspectie', 'controle'], icon: 'SearchCheck', category: 'both' },
  { keywords: ['returns', 'retouren', 'return', 'retour', 'rma'], icon: 'RotateCcw', category: 'both' },

  // ── Outbound / Shipping ────────────────────────────────────────────────
  { keywords: ['picking', 'picken', 'pick', 'order pick', 'verzamelen'], icon: 'PackageSearch', category: 'process' },
  { keywords: ['packing', 'pakken', 'pack', 'verpakken', 'inpakken'], icon: 'Package', category: 'process' },
  { keywords: ['shipping', 'verzending', 'dispatch', 'expeditie', 'verzenden'], icon: 'Truck', category: 'both' },
  { keywords: ['loading', 'laden', 'load', 'beladen'], icon: 'ContainerIcon', category: 'process' },
  { keywords: ['outbound', 'uitgaand', 'goods out', 'uitslag'], icon: 'LogOut', category: 'both' },
  { keywords: ['sorting', 'sorteren', 'sort', 'sorteer'], icon: 'ArrowUpDown', category: 'process' },
  { keywords: ['staging', 'klaarzetten', 'stage'], icon: 'LayoutGrid', category: 'process' },
  { keywords: ['labeling', 'labellen', 'label', 'etiketteren'], icon: 'Tag', category: 'process' },
  { keywords: ['palletizing', 'palletiseren', 'palletize', 'palletten'], icon: 'Layers', category: 'process' },
  { keywords: ['wrapping', 'wikkelen', 'wrap', 'folie'], icon: 'Recycle', category: 'process' },
  { keywords: ['consolidation', 'consolideren', 'consolidate', 'samenvoegen'], icon: 'Combine', category: 'process' },

  // ── Storage / Inventory ────────────────────────────────────────────────
  { keywords: ['storage', 'opslag', 'warehouse', 'magazijn'], icon: 'Warehouse', category: 'both' },
  { keywords: ['inventory', 'voorraad', 'stock', 'inventaris'], icon: 'ClipboardList', category: 'both' },
  { keywords: ['cycle count', 'telling', 'count', 'tellen', 'stocktake'], icon: 'Hash', category: 'process' },
  { keywords: ['replenishment', 'replenish', 'bijvullen', 'aanvullen'], icon: 'RefreshCw', category: 'process' },
  { keywords: ['slotting', 'slot', 'locatie'], icon: 'MapPin', category: 'process' },

  // ── Value Added Services ───────────────────────────────────────────────
  { keywords: ['vas', 'value added', 'toegevoegde waarde'], icon: 'Sparkles', category: 'both' },
  { keywords: ['kitting', 'kit', 'assembly', 'samenstellen', 'montage'], icon: 'Puzzle', category: 'process' },
  { keywords: ['co-packing', 'copacking', 'co packing', 'herverpakken'], icon: 'PackagePlus', category: 'process' },
  { keywords: ['rework', 'herbewerken', 'repair', 'reparatie'], icon: 'Wrench', category: 'process' },
  { keywords: ['customization', 'personalisatie', 'custom', 'personaliseren'], icon: 'Paintbrush', category: 'process' },
  { keywords: ['testing', 'testen', 'test'], icon: 'FlaskConical', category: 'process' },
  { keywords: ['gift wrap', 'cadeau', 'gift'], icon: 'Gift', category: 'process' },
  { keywords: ['engraving', 'graveren', 'printing', 'printen', 'bedrukken'], icon: 'Printer', category: 'process' },

  // ── Transport / Fleet ──────────────────────────────────────────────────
  { keywords: ['transport', 'vervoer', 'fleet', 'vloot'], icon: 'Truck', category: 'both' },
  { keywords: ['forklift', 'heftruck', 'reach truck'], icon: 'Forklift', category: 'process' },
  { keywords: ['dock', 'laadkade', 'bay', 'poort'], icon: 'DoorOpen', category: 'process' },
  { keywords: ['delivery', 'bezorging', 'last mile'], icon: 'MapPinned', category: 'process' },

  // ── Departments / Areas ────────────────────────────────────────────────
  { keywords: ['operations', 'operatie', 'ops'], icon: 'Settings', category: 'department' },
  { keywords: ['admin', 'administratie', 'office', 'kantoor'], icon: 'Building2', category: 'department' },
  { keywords: ['maintenance', 'onderhoud', 'techniek', 'technical'], icon: 'Wrench', category: 'department' },
  { keywords: ['safety', 'veiligheid', 'hse', 'arbo'], icon: 'ShieldCheck', category: 'department' },
  { keywords: ['planning', 'plan'], icon: 'Calendar', category: 'department' },
  { keywords: ['management', 'leidinggevende'], icon: 'Users', category: 'department' },
  { keywords: ['it', 'ict', 'systems', 'systemen'], icon: 'Monitor', category: 'department' },
  { keywords: ['hr', 'human resources', 'personeelszaken'], icon: 'UserCog', category: 'department' },
  { keywords: ['finance', 'financien', 'boekhouding', 'accounting'], icon: 'Calculator', category: 'department' },
  { keywords: ['cleaning', 'schoonmaak', 'housekeeping'], icon: 'Sparkle', category: 'both' },
  { keywords: ['cold', 'koel', 'freezer', 'vries', 'cold chain', 'fresh'], icon: 'Snowflake', category: 'both' },
  { keywords: ['hazmat', 'gevaarlijke stoffen', 'dangerous', 'chemical', 'chemisch'], icon: 'AlertTriangle', category: 'both' },
  { keywords: ['e-commerce', 'ecommerce', 'webshop', 'online'], icon: 'ShoppingCart', category: 'both' },
  { keywords: ['b2b', 'wholesale', 'groothandel'], icon: 'Building', category: 'both' },

  // ── Processes / Activities ─────────────────────────────────────────────
  { keywords: ['scanning', 'scannen', 'scan', 'barcode'], icon: 'ScanLine', category: 'process' },
  { keywords: ['weighing', 'wegen', 'weigh', 'weight'], icon: 'Scale', category: 'process' },
  { keywords: ['measuring', 'meten', 'measure', 'dimensioning'], icon: 'Ruler', category: 'process' },
  { keywords: ['training', 'opleiding', 'instructie'], icon: 'GraduationCap', category: 'both' },
  { keywords: ['documentation', 'documentatie', 'paperwork', 'papierwerk'], icon: 'FileText', category: 'process' },
  { keywords: ['reporting', 'rapportage', 'report', 'rapport'], icon: 'BarChart3', category: 'process' },
  { keywords: ['communication', 'communicatie', 'overleg', 'briefing'], icon: 'MessageSquare', category: 'process' },
  { keywords: ['charging', 'opladen', 'battery', 'accu'], icon: 'BatteryCharging', category: 'process' },
  { keywords: ['waste', 'afval', 'disposal', 'recycling'], icon: 'Trash2', category: 'process' },
  { keywords: ['photography', 'foto', 'photo', 'imaging'], icon: 'Camera', category: 'process' },
]

// ── Matching Logic ──────────────────────────────────────────────────────────

/**
 * Find the best matching icon for a given name.
 * Returns the Lucide icon name, or null if no match.
 *
 * @param name - The department or process name to match
 * @param type - Filter matches to 'department', 'process', or 'both'
 */
export function matchIcon(
  name: string,
  type: 'department' | 'process' = 'process',
): string | null {
  if (!name || name.trim().length < 2) return null

  const normalized = name.toLowerCase().trim()

  for (const entry of WAREHOUSE_ICONS) {
    // Skip entries that don't match the requested type
    if (entry.category !== 'both' && entry.category !== type) continue

    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) {
        return entry.icon
      }
    }
  }

  return null
}

/**
 * Get a fallback icon based on type when no keyword match is found.
 */
export function getFallbackIcon(type: 'department' | 'process'): string {
  return type === 'department' ? 'FolderOpen' : 'Cog'
}

// ── Warehouse Flow Order ────────────────────────────────────────────────────
// Departments are sorted by their position in the warehouse flow:
// Receiving → Storage → VAS/Processing → Outbound → Shipping → Returns → Support
//
// Each entry maps keywords to a flow position (lower = earlier in the flow).
// Departments that don't match any keyword get position 500 (middle/neutral).

const FLOW_ORDER: { keywords: string[]; position: number }[] = [
  // 100s: Inbound
  { keywords: ['receiving', 'ontvangst', 'goods in', 'inkomend', 'inbound', 'unloading', 'lossen'], position: 100 },
  { keywords: ['quality', 'qc', 'inspection', 'kwaliteit', 'inspectie', 'controle'], position: 150 },
  { keywords: ['putaway', 'opslag', 'put away', 'inslag'], position: 180 },

  // 200s: Storage
  { keywords: ['storage', 'opslag', 'warehouse', 'magazijn', 'inventory', 'voorraad', 'stock'], position: 200 },
  { keywords: ['replenishment', 'replenish', 'bijvullen', 'aanvullen'], position: 250 },
  { keywords: ['cold', 'koel', 'freezer', 'vries', 'fresh'], position: 260 },

  // 300s: Value Added / Processing
  { keywords: ['vas', 'value added', 'toegevoegde waarde'], position: 300 },
  { keywords: ['kitting', 'kit', 'assembly', 'samenstellen', 'montage'], position: 310 },
  { keywords: ['co-packing', 'copacking', 'herverpakken', 'rework'], position: 320 },
  { keywords: ['e-commerce', 'ecommerce', 'webshop', 'online'], position: 330 },

  // 400s: Outbound
  { keywords: ['picking', 'picken', 'pick', 'verzamelen'], position: 400 },
  { keywords: ['packing', 'pakken', 'pack', 'verpakken', 'inpakken'], position: 420 },
  { keywords: ['outbound', 'uitgaand', 'goods out', 'uitslag'], position: 440 },
  { keywords: ['sorting', 'sorteren', 'sort'], position: 450 },
  { keywords: ['consolidation', 'consolideren', 'samenvoegen'], position: 460 },

  // 500s: Shipping / Transport
  { keywords: ['staging', 'klaarzetten', 'stage'], position: 500 },
  { keywords: ['loading', 'laden', 'load', 'beladen'], position: 520 },
  { keywords: ['shipping', 'verzending', 'dispatch', 'expeditie'], position: 540 },
  { keywords: ['transport', 'vervoer', 'fleet', 'vloot'], position: 560 },
  { keywords: ['delivery', 'bezorging', 'last mile'], position: 580 },
  { keywords: ['dock', 'laadkade', 'bay', 'poort'], position: 510 },

  // 600s: Returns
  { keywords: ['returns', 'retouren', 'return', 'retour', 'rma'], position: 600 },

  // 700s: Support / Admin
  { keywords: ['operations', 'operatie', 'ops'], position: 700 },
  { keywords: ['maintenance', 'onderhoud', 'techniek', 'technical'], position: 720 },
  { keywords: ['cleaning', 'schoonmaak', 'housekeeping'], position: 730 },
  { keywords: ['safety', 'veiligheid', 'hse', 'arbo'], position: 740 },
  { keywords: ['admin', 'administratie', 'office', 'kantoor'], position: 800 },
  { keywords: ['management', 'leidinggevende'], position: 810 },
  { keywords: ['hr', 'human resources', 'personeelszaken'], position: 820 },
  { keywords: ['it', 'ict', 'systems', 'systemen'], position: 830 },
  { keywords: ['training', 'opleiding', 'instructie'], position: 840 },
  { keywords: ['planning', 'plan'], position: 850 },
]

/**
 * Get the warehouse flow position for a department or process name.
 * Lower numbers = earlier in the warehouse flow.
 *
 * Three-tier matching:
 * 1. Exact keyword match → known position
 * 2. Contextual signal analysis → inferred position
 * 3. No signals → position 900 (end, before support)
 */
export function getFlowPosition(name: string): number {
  if (!name || name.trim().length < 2) return 900

  const normalized = name.toLowerCase().trim()

  // ── Tier 1: Direct keyword match ────────────────────────────────────────
  for (const entry of FLOW_ORDER) {
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) {
        return entry.position
      }
    }
  }

  // ── Tier 2: Contextual signal analysis ──────────────────────────────────
  // Analyze the name for semantic signals that indicate where in the
  // warehouse flow this department/process belongs.

  return inferFlowPosition(normalized)
}

// ── Contextual Signal Engine ──────────────────────────────────────────────
// When a name doesn't match any known keyword, we analyze it for signals
// that suggest its position in the warehouse flow.
//
// Signals are grouped by flow zone. Each signal has a weight.
// The zone with the highest total weight wins.

interface Signal {
  patterns: string[]
  weight: number
}

interface FlowZone {
  position: number
  label: string
  signals: Signal[]
}

const FLOW_ZONES: FlowZone[] = [
  {
    position: 100,
    label: 'inbound',
    signals: [
      // Action signals: things that happen at the start of the flow
      { patterns: ['in', 'aan', 'binnen', 'entry', 'intake', 'arrive', 'import'], weight: 2 },
      // Object signals: things associated with receiving
      { patterns: ['supplier', 'leverancier', 'vendor', 'truck', 'container', 'pallet'], weight: 1.5 },
      // Prefix/suffix signals
      { patterns: ['pre-', 'voor-', 'first', 'eerste'], weight: 1 },
    ],
  },
  {
    position: 200,
    label: 'storage',
    signals: [
      { patterns: ['bulk', 'reserve', 'buffer', 'zone', 'area', 'aisle', 'gang', 'rack', 'stelling', 'shelf', 'schap'], weight: 2 },
      { patterns: ['store', 'bewaar', 'keep', 'hold', 'houd', 'locatie', 'location', 'bin'], weight: 1.5 },
      { patterns: ['mezzanine', 'entresol', 'verdieping', 'floor', 'level'], weight: 1 },
    ],
  },
  {
    position: 300,
    label: 'processing',
    signals: [
      { patterns: ['verwerk', 'process', 'bewerk', 'maak', 'make', 'create', 'bouw', 'build'], weight: 2 },
      { patterns: ['special', 'speciaal', 'custom', 'maat', 'extra', 'plus', 'premium'], weight: 1.5 },
      { patterns: ['service', 'dienst', 'add', 'toevoeg', 'modify', 'wijzig', 'transform'], weight: 1.5 },
      { patterns: ['sticker', 'seal', 'zegel', 'wrap', 'wikkel', 'band', 'strap', 'omsnoer'], weight: 1 },
    ],
  },
  {
    position: 400,
    label: 'outbound',
    signals: [
      { patterns: ['uit', 'out', 'weg', 'away', 'exit', 'vertrek', 'depart'], weight: 2 },
      { patterns: ['order', 'bestelling', 'klant', 'customer', 'client'], weight: 1.5 },
      { patterns: ['collect', 'verzamel', 'gather', 'bundle', 'bundel'], weight: 1 },
      { patterns: ['ready', 'gereed', 'klaar', 'final', 'eind', 'last', 'laatste'], weight: 1 },
    ],
  },
  {
    position: 540,
    label: 'shipping',
    signals: [
      { patterns: ['send', 'stuur', 'verzend', 'mail', 'post', 'parcel', 'pakket'], weight: 2 },
      { patterns: ['carrier', 'vervoerder', 'courier', 'koerier', 'logistiek', 'logistics'], weight: 1.5 },
      { patterns: ['route', 'rit', 'trip', 'tour', 'ronde'], weight: 1 },
      { patterns: ['label', 'track', 'volg', 'document', 'papier', 'paper'], weight: 0.5 },
    ],
  },
  {
    position: 600,
    label: 'returns',
    signals: [
      { patterns: ['terug', 'back', 'reverse', 'omgekeerd', 'defect', 'damage', 'schade', 'broken', 'kapot'], weight: 2 },
      { patterns: ['refund', 'credit', 'claim', 'complaint', 'klacht', 'reject', 'afkeur'], weight: 1.5 },
      { patterns: ['repair', 'repareer', 'fix', 'herstel', 'recondition'], weight: 1 },
    ],
  },
  {
    position: 750,
    label: 'support',
    signals: [
      { patterns: ['support', 'ondersteuning', 'hulp', 'help', 'assist'], weight: 2 },
      { patterns: ['team', 'crew', 'ploeg', 'groep', 'group', 'afdeling', 'department'], weight: 1 },
      { patterns: ['overig', 'other', 'misc', 'diversen', 'general', 'algemeen'], weight: 1.5 },
      { patterns: ['intern', 'internal', 'overhead', 'indirect'], weight: 1 },
      { patterns: ['facility', 'gebouw', 'building', 'terrain', 'terrein', 'yard'], weight: 1 },
    ],
  },
]

function inferFlowPosition(name: string): number {
  let bestZone = -1
  let bestScore = 0

  for (const zone of FLOW_ZONES) {
    let zoneScore = 0

    for (const signal of zone.signals) {
      for (const pattern of signal.patterns) {
        if (name.includes(pattern)) {
          zoneScore += signal.weight
        }
      }
    }

    if (zoneScore > bestScore) {
      bestScore = zoneScore
      bestZone = zone.position
    }
  }

  // Only use inference if we have a meaningful signal (score >= 1.5)
  if (bestScore >= 1.5) {
    return bestZone
  }

  // No meaningful signals — place at end (before support functions)
  return 900
}

/**
 * Sort departments by their warehouse flow position.
 * Maintains stable order for departments with the same position.
 */
export function sortByFlow<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const posA = getFlowPosition(a.name)
    const posB = getFlowPosition(b.name)
    if (posA !== posB) return posA - posB
    return a.name.localeCompare(b.name) // alphabetical within same position
  })
}
