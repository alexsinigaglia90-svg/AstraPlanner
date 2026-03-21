# Setup Wizard Logic

## 1. The Adaptive Intelligence Behind the Wizard

AstraPlanner's setup wizard is not a static sequence of forms. It is an adaptive configuration system that observes what the user has entered, infers what they likely need next, pre-fills intelligent defaults, hides irrelevant complexity, and catches errors before they propagate. This document details every mechanism that makes the wizard intelligent.

The core principle: **the wizard should feel like working with an expert consultant who already knows your industry, not like filling out a tax return.**

---

## 2. Smart Defaults Engine

### 2.1 Architecture

The Smart Defaults Engine is a layered inference system that generates pre-filled values for every field in the wizard. Each layer can override or refine the layer above it:

```
┌─────────────────────────────────────┐
│  Layer 4: Fleet Learning Defaults   │  ← Aggregated from similar orgs
├─────────────────────────────────────┤
│  Layer 3: Regional Defaults         │  ← Jurisdiction-specific rules
├─────────────────────────────────────┤
│  Layer 2: Site Type Defaults        │  ← Per site archetype
├─────────────────────────────────────┤
│  Layer 1: Industry Defaults         │  ← Per vertical
├─────────────────────────────────────┤
│  Layer 0: Global Defaults           │  ← Universal baseline
└─────────────────────────────────────┘
```

When a user reaches any field, the engine resolves the default by walking from Layer 4 down to Layer 0, using the first layer that has a value for that field given the current context.

### 2.2 Industry Defaults (Layer 1)

When the user selects an industry vertical in Phase 1, the following defaults cascade:

| Field | E-commerce Fulfillment | Grocery Distribution | Parcel Sorting | Cold Chain / Pharma | 3PL Multi-Client |
|-------|----------------------|---------------------|---------------|--------------------|--------------------|
| Planning Horizon | 4 weeks | 2 weeks | 1 week | 4 weeks | 4 weeks |
| Typical Site Types | Fulfillment Center | DC, Cold Storage | Sortation Hub | Cold Storage, DC | Warehouse, DC |
| Primary Demand Type | Orders | Cases | Parcels | Pallets | Varies by client |
| Peak Season | Oct-Dec (holiday) | Nov-Dec (holiday), weekly (weekend prep) | Year-round (daily peaks) | Even distribution | Client-dependent |
| Typical Shift Count | 2-3 | 2-3 | 3 (24/7) | 2-3 | 2 |
| Automation Level | Semi-Automated | Manual to Semi | Highly Automated | Semi-Automated | Manual |
| Typical Processes (count) | 10-14 | 8-12 | 5-8 | 8-12 | 6-10 per client |
| OT Prevalence | Moderate (seasonal spikes) | Low-Moderate | Moderate | Low | Moderate |
| Agency Staff Usage | High (seasonal) | Moderate | High | Low (certification barriers) | High |
| Avg Picking Productivity | 90-150 UPH | 150-250 cases/hr | N/A (automated sort) | 60-100 UPH | 80-120 UPH |

### 2.3 Site Type Defaults (Layer 2)

When a specific site type is selected in Phase 2, these defaults apply to Phase 3-6 fields:

**Distribution Center**
- Processes: Receiving, Putaway, Replenishment, Case Pick, Full Pallet Pick, Order Assembly, Loading, QC
- Shift structure: 2 shifts (Day 06:00-14:30, Night 14:30-23:00) or 3 shifts for 24/7
- Minimum staffing: Receiving (2), Loading (2), all others (1)
- Equipment: Forklifts, pallet jacks, RF scanners
- Break pattern: 30-min unpaid lunch, 2x 15-min paid breaks

**Fulfillment Center**
- Processes: Receiving, Putaway, Single Pick, Multi Pick, Batch Pick, Pack (Small), Pack (Large), Shipping, Returns, VAS
- Shift structure: Flexible, often 3 shifts with staggered starts
- Equipment: RF scanners, pick carts, conveyors, packing stations
- Break pattern: 30-min unpaid lunch, 2x 10-min paid breaks (higher frequency due to physical intensity)

**Sortation Hub**
- Processes: Unload, Induct, Sort, Load, Problem Resolution
- Shift structure: 3 shifts, tight handover windows (15 min)
- Operating model: 24/7 or extended hours (20 hrs)
- Unique: Very high throughput, short cycle times, minimal storage

**Cold Storage Facility**
- Processes: Receiving, Putaway (Zone-specific), Pick (Zone-specific), Loading, Temperature Monitoring
- Shift structure: 2 shifts with mandatory warm-up breaks
- Unique defaults: Maximum time in freezer per shift (90 min continuous), mandatory warm-up breaks (10 min every 90 min in frozen zone), cold weather gear as equipment requirement
- Certifications: Food safety handling, temperature monitoring

**Returns Processing Center**
- Processes: Returns Receiving, Triage/Inspection, Grading, Restocking, Refurbishment, Disposal
- Unique: Lower throughput standards, higher skill requirements (grading requires product knowledge)
- Typical demand driver: Return units (not orders)

### 2.4 Regional Defaults (Layer 3)

When a site's address is resolved to a jurisdiction, regulatory defaults are loaded automatically:

**United States (Federal + State)**

| Region | Break Rules | OT Rules | Special |
|--------|------------|----------|---------|
| California | 10-min paid break every 4 hrs; 30-min unpaid meal before 5th hr; second meal if > 10 hrs | Daily OT after 8 hrs; double-time after 12 hrs; 7th consecutive day OT | Predictive scheduling in some cities (SF, LA) |
| New York | 30-min meal after 6 hrs (factory); 45-min meal for factory shifts spanning noon | Weekly OT after 40 hrs | NYC Fair Workweek Law for retail/fast food |
| Texas | No state-mandated breaks (follow federal) | Weekly OT after 40 hrs | — |
| Oregon | 30-min meal for shifts > 6 hrs; 10-min rest per 4 hrs | Weekly OT after 40 hrs; daily OT after 10 hrs | Predictive scheduling in Portland |
| Washington | 10-min paid rest per 4 hrs; 30-min meal for shifts > 5 hrs | Weekly OT after 40 hrs | — |
| Illinois | 20-min meal within first 5 hrs of shift | Weekly OT after 40 hrs | Chicago Fair Workweek Ordinance |

**European Union**

| Region | Working Time | Breaks | Rest | Special |
|--------|------------|--------|------|---------|
| UK (post-Brexit) | 48 hr/week max (opt-out available) | 20-min break for shifts > 6 hrs | 11 hrs between shifts; 24 hrs per week (or 48 hrs per fortnight) | Right to request flexible working |
| Germany | 8 hr/day standard, 10 hr max | 30-min break after 6 hrs; 45-min after 9 hrs | 11 hrs between shifts | Works council co-determination on schedules |
| France | 35 hr/week standard | 20-min break after 6 hrs | 11 hrs between shifts; 35 hrs continuous weekly rest | Night work restrictions; Sunday work limits |
| Netherlands | 9 hr/day max, 45 hr/week max over 4-week average | 30-min break after 5.5 hrs | 11 hrs between shifts | — |
| Poland | 8 hr/day standard | 15-min break for shifts > 6 hrs | 11 hrs between shifts; 35 hrs continuous weekly rest | — |

**Asia-Pacific**

| Region | Key Defaults |
|--------|-------------|
| Australia | 38 hr/week standard; modern award break rules vary by industry; 10 hrs between shifts |
| Japan | 40 hr/week; 6 hrs continuous work requires 45-min break; 8 hrs requires 60-min break |
| India | 48 hr/week max; 30-min break after 5 hrs; state-specific factory act rules |

### 2.5 Fleet Learning Defaults (Layer 4)

This layer draws from anonymized, aggregated configuration data across all AstraPlanner deployments. It is only used when a statistically significant sample (n ≥ 30 similar configurations) exists.

**How it works:**

1. When a user configures a field, the system queries the fleet database: "What value did similar organizations (same industry + site type + region + size band) set for this field?"
2. If a clear central tendency exists (coefficient of variation < 0.3), that value becomes the default.
3. The default is shown with a label: "Common setting for [industry] operations in [region]."
4. The user always sees the source of the default: "Based on 47 similar configurations" — never "AI recommends" without attribution.

**Privacy safeguards:**
- No customer-identifiable data is stored in the fleet database. Only field values with their context tags (industry, site type, region, size band).
- Customers can opt out of fleet learning entirely.
- A minimum of 30 data points is required before a fleet default is generated (k-anonymity principle).
- Fleet defaults are never applied to sensitive fields (pay rates, employee names, budget figures).

**Examples of fleet-learned defaults:**

| Field | Context | Fleet Default | Sample Size |
|-------|---------|--------------|-------------|
| Picking Productivity (UPH) | E-commerce FC, US, Semi-Automated | 118 UPH | n=142 |
| Break Stagger % | 24/7 DC, > 200 employees | 12% | n=67 |
| Overtime Cap (weekly hrs) | Parcel sorting, US East Coast | 12 hrs | n=53 |
| Agency Staff Target % | E-commerce FC, US, peak season | 30% | n=89 |
| Cross-Training Limit | 3PL, US | 25% of shift | n=41 |

---

## 3. Template Engine

### 3.1 What Templates Provide

Templates are pre-built, complete configuration packages that fill Phase 3 through Phase 6 with a single click. They represent the most common operational patterns in logistics and are maintained by AstraPlanner's domain experts based on industry benchmarks and fleet data.

Each template includes:
- Process definitions with productivity standards
- Demand type definitions
- Demand-to-process mappings with default conversion factors
- Role and skill definitions
- Standard rule sets for the target region
- Recommended optimization weights

### 3.2 Available Templates

**Template: E-commerce Fulfillment (Standard)**
- Target: Online retailers with single-item and multi-item orders
- Processes: 14 (Receiving through Shipping, plus Returns and VAS)
- Demand types: Orders, Order Lines, Units, Returns
- Roles: 6 (Associate, Pick Specialist, Pack Specialist, Receiving Clerk, Team Lead, Supervisor)
- Skills: 8 (RF Pick, Voice Pick, Pack - Small Parcel, Pack - Freight, Receiving, Putaway, Returns Processing, Quality Inspection)
- Variants: Standard Volume (< 10K orders/day), High Volume (10K-100K), Mega (100K+)

**Template: E-commerce Fulfillment (Fashion/Apparel)**
- Extends Standard with: VAS (steaming, tagging, monogramming), higher returns processing capacity (30-40% return rate), seasonal demand profile (spring/fall fashion seasons)

**Template: Grocery Distribution**
- Target: Grocery retailers and food distributors
- Processes: 11 (temperature-zone-specific receiving, picking, and shipping)
- Demand types: Cases, Pallets, Trucks, Stop Count
- Unique: Temperature zone tracking, short shelf-life urgency scoring, early morning loading emphasis
- Regulatory: FSMA compliance checks, temperature logging requirements

**Template: Parcel Sorting**
- Target: Last-mile delivery and parcel networks
- Processes: 5 (Unload, Induct, Sort, Load, Problem Resolution)
- Demand types: Parcels, Bags, Containers
- Unique: Very high throughput standards, shift-critical timing windows, hub-and-spoke demand patterns
- Variants: Ground Hub, Air Hub, Last-Mile Delivery Station

**Template: Cold Chain / Pharmaceutical**
- Target: Temperature-controlled logistics for pharma, biologics, specialty food
- Processes: 8 with strict zone-based separation
- Unique: GDP/GMP compliance rules, mandatory temperature exposure limits, certification requirements (cold chain handling, controlled substances), detailed audit logging
- Regulatory: DEA Schedule II-V handling rules (US), EU GDP Annex compliance

**Template: 3PL Multi-Client**
- Target: Third-party logistics providers managing multiple clients
- Processes: Variable (union of client requirements)
- Unique: Client-level process isolation, shared vs. dedicated staff pools, client-specific SLA targets, billing integration points
- Demand types: Client-specific (templated per client)

**Template: Manufacturing Logistics (Inbound)**
- Target: Factory-adjacent warehouses feeding production lines
- Processes: Receiving, Quality Inspection, Staging, Line-Side Delivery, Sequencing, Empty Container Return
- Demand types: Parts, Containers, Line Calls
- Unique: Just-in-time delivery requirements, line-down escalation rules, kanban-triggered replenishment

### 3.3 Template Application Flow

1. User selects a template from the template gallery (visual cards with descriptions).
2. System shows a preview: "This template will create N processes, M demand types, K roles, and J rules. Review before applying?"
3. User clicks "Apply". All Phase 3-6 fields are populated.
4. Fields populated by the template are marked with a badge: "From template: E-commerce Fulfillment (Standard)".
5. The user can modify any field. Modified fields lose the template badge and are marked as "Customized".
6. If the user later switches templates, customized fields are preserved (with a confirmation dialog: "You have 7 customized fields. Keep your customizations or reset to the new template?").

### 3.4 Template Customization and Sharing

- Organizations can save their customized configuration as a private template for reuse across sites.
- Saved templates appear alongside built-in templates with an "Organization" badge.
- Multi-site enterprises typically configure one site fully, save it as a template, and apply it to remaining sites.

---

## 4. Progressive Disclosure

### 4.1 Concept

Every screen in the wizard has two layers: **Essential** (shown by default) and **Advanced** (hidden behind an "Advanced Settings" expander). The split is determined by two factors:

1. **Frequency of customization**: If >80% of fleet users accept the default value for a field, it is classified as Advanced.
2. **Impact of misconfiguration**: Fields where an incorrect value causes hard failures (e.g., shift times) are always Essential. Fields where incorrect values cause soft degradation (e.g., seasonal adjustment profiles) are Advanced.

### 4.2 Complexity Scoring

Each screen receives a complexity score from 1 to 10 based on the number of Essential fields, the number of Advanced fields expanded by the user, and the interdependencies with other screens. This score is:

- Shown to the user as a subtle indicator: "Configuration complexity: Standard" (1-4), "Detailed" (5-7), or "Expert" (8-10).
- Used by the AI assistant to calibrate the level of detail in its suggestions. At "Standard" complexity, the AI gives simple recommendations. At "Expert", it provides detailed rationale and data.
- Logged for analytics to identify screens that are unnecessarily complex and need UX redesign.

### 4.3 Field Classification by Phase

**Phase 3: Process Definition**
| Essential Fields | Advanced Fields |
|-----------------|----------------|
| Process Name | Productivity Tiers |
| Process Category | Equipment Required |
| Demand Driver | Certification Required |
| Productivity Standard | Ramp-Up Time |
| Minimum Staffing | Learning Curve |
| Required Skills | Sequencing Dependencies |
| | Max Concurrent Workers |
| | Batch Size |
| | Seasonal Adjustment Profile |

**Phase 5: Workforce Setup**
| Essential Fields | Advanced Fields |
|-----------------|----------------|
| Employee ID | Hire Date |
| Name | Secondary Sites |
| Primary Site | Preferred Shifts |
| Role | Max Overtime Hours |
| Contract Type | Certifications |
| Skills + Proficiency | Supervisor |
| Weekly Contracted Hours | Pay Rate |
| Availability Pattern | Overtime Rate Multiplier |
| | Weekend Rate Multiplier |
| | Accommodation Requirements |

**Phase 6: Rule Configuration**
| Essential Fields | Advanced Fields |
|-----------------|----------------|
| Max Daily Hours | Double-Time Threshold |
| Max Weekly Hours | Meal Break Window |
| Min Rest Between Shifts | Break Staggering |
| Break Duration + Frequency | State-Specific Overrides |
| OT Threshold (Weekly) | OT Distribution Policy |
| | Mandatory OT Allowed |
| | OT Blackout Days |
| | All Seniority Rules |
| | All Union Rules |

### 4.4 Adaptive Disclosure

The boundary between Essential and Advanced is not static. The wizard dynamically promotes fields from Advanced to Essential based on user context:

- If the user selected "Cold Chain / Pharma" as industry, "Certification Required" is promoted to Essential in Phase 3.
- If "Union Presence" is toggled on in Phase 1, all union rules are promoted to Essential in Phase 6.
- If the user has expanded Advanced settings on 3 or more screens, the system offers: "You're using detailed configurations. Would you like to show all advanced options by default?"
- If the user's configuration triggers a validation warning that relates to an Advanced field, that field is automatically promoted to Essential on the next visit.

---

## 5. Validation Intelligence

### 5.1 Real-Time Validation Levels

The validation engine runs continuously as users enter data. It operates at three levels:

| Level | Trigger | User Experience | Example |
|-------|---------|-----------------|---------|
| **Field-Level** | On field blur or 500ms after typing stops | Inline error below the field, red border | "Productivity standard must be greater than 0" |
| **Cross-Field** | On any field change within a screen | Banner at top of screen, linked to offending fields | "Shift End (22:00) is before Shift Start (06:00) — did you mean 22:00 the next day?" |
| **Cross-Phase** | On phase navigation or manual trigger | Modal dialog listing all issues, grouped by phase | "Phase 5: 3 employees have skills not defined in Phase 3 process requirements" |

### 5.2 Impossible Configuration Detection

The validation engine specifically checks for configurations that are mathematically impossible to satisfy:

**Temporal impossibilities:**
- 24/7 operation with only day-shift employees → "You need employees available for swing and night shifts to cover 24/7 operations."
- Minimum rest period (11 hours) + maximum shift length (12 hours) = 23 hours, leaving only 1 hour of flexibility → "With 12-hour shifts and 11-hour rest requirements, employees can only work one shift per day with no day-to-day shift rotation. Consider 10-hour shifts for more flexibility."
- Break requirements that exceed shift duration → "Your configured breaks total 90 minutes, but your shortest shift is 4 hours. Breaks cannot exceed 37% of shift duration."

**Capacity impossibilities:**
- Total demand-driven FTE need exceeds total available workforce by more than overtime + agency can cover → "Peak demand on Mondays requires 85 FTEs, but you have 60 employees available with max 10 hrs overtime each. Even with full overtime, you can cover only 75 FTEs. You need 10 additional employees or agency staff."
- Minimum staffing across all processes exceeds site peak capacity → "Sum of minimum staffing (45) across all processes exceeds your site peak capacity (40). Either reduce minimums or increase capacity."
- A process requires a skill held by zero employees at the site → "Process 'Hazmat Receiving' requires 'Hazmat Certification' but no employee at CHI-DC-01 holds this certification."

**Logical impossibilities:**
- Cross-training disallowed + single-skilled employees + process coverage gaps → "12 employees can only do Picking. If picking demand drops below 12 FTEs, these employees have no alternative assignment and cross-training is disabled."
- Overtime disallowed + understaffing tolerance = 0% + workforce < demand → "You've set zero tolerance for understaffing and disabled overtime. With current staffing, you cannot cover Tuesday peak demand."

### 5.3 Warning vs. Error Classification

| Classification | Behavior | Example |
|---------------|----------|---------|
| **Error** | Blocks progression to next phase or to go-live | Missing required field, impossible configuration, integration failure |
| **Warning** | Shows amber indicator, allows progression with acknowledgment | Productivity standard > 2 standard deviations from benchmark, single point of failure for a skill |
| **Info** | Shows blue indicator, no action required | "Tip: Enabling cross-training between Picking and Packing would increase your scheduling flexibility by approximately 15%" |

### 5.4 Contextual Validation Messages

Validation messages are not generic. They include:
- **What** is wrong: "Picking productivity is set to 300 UPH."
- **Why** it matters: "This is 2.5x the industry median for manual picking operations and would be in the top 0.1%."
- **What to do**: "If you use automated goods-to-person systems, this may be achievable. Otherwise, consider a range of 90-150 UPH. Would you like to adjust?"

---

## 6. AI Suggestion System

### 6.1 Suggestion Types

The AI assistant generates four types of suggestions throughout the wizard:

| Type | Icon | Description | Example |
|------|------|-------------|---------|
| **Default Recommendation** | Lightbulb | Suggests a specific value for a field | "For a 24/7 DC in the US Southeast, the most common shift pattern is 3 shifts: 06:00-14:00, 14:00-22:00, 22:00-06:00." |
| **Configuration Improvement** | Arrow-up | Suggests changes to improve plan quality | "Adding a 'Float' role with cross-training in Pick + Pack would reduce your understaffing events by approximately 20%." |
| **Issue Resolution** | Wrench | Suggests fixes for validation errors | "To resolve the Hazmat skill gap, you can either assign Hazmat certification to Employee #1042 (who has 2 years receiving experience) or remove the Hazmat requirement from the process." |
| **Strategic Insight** | Chart | Provides analysis based on configuration | "Your workforce is heavily skewed toward Picking (60% of FTEs). Industry benchmark is 40-50%. This may indicate over-specialization — consider cross-training 10% of pickers in Packing." |

### 6.2 Suggestion Generation Pipeline

```
User Action (field change, phase entry, explicit "Help me" click)
    │
    ▼
Context Assembly
    │  Gather: current field values, industry, site type, region,
    │          prior user decisions, fleet benchmarks, validation state
    │
    ▼
Relevance Filter
    │  Is this a field/moment where a suggestion adds value?
    │  Suppress if: user has already customized this field, user dismissed
    │               a similar suggestion before, suggestion confidence < 70%
    │
    ▼
Suggestion Generation (Claude API)
    │  Prompt includes: field context, user profile, industry benchmarks,
    │                   fleet data, and instruction templates
    │
    ▼
Confidence Scoring
    │  Rate the suggestion on: data support (benchmark backing),
    │  specificity (generic vs. tailored), actionability (can user apply it?)
    │
    ▼
Presentation
    │  Show in AI assistant panel with: suggestion text, confidence badge,
    │  "Apply" button (auto-fills the value), "Dismiss" button, "Tell me more"
    │
    ▼
Feedback Loop
    │  Log: suggestion shown, accepted/dismissed/modified, final value chosen
    │  Feed back into fleet learning to improve future suggestions
```

### 6.3 How Shift Pattern Suggestions Are Generated (Concrete Example)

When a user sets a site's operating model to "24/7" and selects "3 Shifts":

1. **Context assembly**: Industry = E-commerce Fulfillment, Region = US Eastern Time, Site Type = Fulfillment Center, Operating Model = 24/7, Shift Count = 3.

2. **Fleet query**: Query fleet database for the most common 3-shift patterns in e-commerce FCs in the US Eastern timezone. Result: 73% use 06:00-14:00 / 14:00-22:00 / 22:00-06:00. 18% use 07:00-15:00 / 15:00-23:00 / 23:00-07:00. 9% other.

3. **Regional context**: US Eastern timezone. Most inbound trucking arrives 06:00-10:00. Outbound carrier pickups are 14:00-18:00. The 06:00 start aligns receiving with truck arrivals.

4. **Suggestion generated**: "For a 24/7 e-commerce fulfillment center in the US Eastern timezone, the most common shift pattern (used by 73% of similar operations) is: Day (06:00-14:00), Swing (14:00-22:00), Night (22:00-06:00). The 06:00 Day shift start aligns with typical inbound trucking windows. Would you like to use this pattern?"

5. **Confidence**: 92% (strong fleet data, clear regional context).

6. **One-click apply**: If the user clicks "Apply", all three shift definitions are auto-filled.

---

## 7. Branching Logic

### 7.1 How Branching Works

The wizard's structure adapts based on answers in earlier phases. This is not simple show/hide logic — it is a dependency graph evaluated in real-time.

### 7.2 Branching Rules

**Industry Vertical Branching (Phase 1 → Phase 3-7)**

| If Industry = | Then |
|--------------|------|
| Cold Chain / Pharma | Phase 3: Show temperature zone fields per process. Phase 5: Show certification fields (cold chain handling, GDP). Phase 6: Show freezer exposure time limits, warm-up break rules. |
| 3PL Multi-Client | Phase 2: Show client assignment field. Phase 3: Processes can be tagged per client. Phase 5: Staff can be assigned to client pools. Phase 7: Show per-client SLA targets. |
| Grocery Distribution | Phase 3: Show temperature-specific process variants (ambient/chilled/frozen). Phase 4: Show truck-based demand scheduling (early AM loading). |
| Parcel Sorting | Phase 3: Simplified process list (fewer processes, higher throughput). Phase 4: Show intra-day demand curve with hourly granularity. Phase 6: Show short-shift rules (4-6 hr sorts). |

**Organization Size Branching (Phase 1 → Phase 7-8)**

| If Size = | Then |
|-----------|------|
| Small (< 500) | Phase 7: Simplified approval workflow (single approver). Phase 8: Simplified review (fewer analytics). |
| Enterprise (50,000+) | Phase 7: Multi-level approval chains, role-based access control config. Phase 8: Extended validation including cross-site consistency checks. |

**Operating Model Branching (Phase 2 → Phase 5-6)**

| If Operating Model = | Then |
|---------------------|------|
| 24/7 | Phase 5: Require employees across all shifts. Phase 6: Show night differential rules, minimum rest between shifts becomes critical. |
| Standard (8-12 hrs) | Phase 5: Availability patterns simplified to single shift. Phase 6: Hide night shift specific rules. |

**Union Presence Branching (Phase 1 → Phase 6)**

| If Union = Yes | Then |
|---------------|------|
| Always | Phase 6: Show full union rules section (bid shifts, grievance buffer, OT equalization, steward scheduling, CBA upload). |

**Automation Level Branching (Phase 2 → Phase 3)**

| If Automation = | Then |
|----------------|------|
| Manual | Phase 3: Standard productivity standards. All processes require human skills. |
| Semi-Automated | Phase 3: Show conveyor/sortation-adjusted productivity multipliers. Some processes have "machine-paced" flag. |
| Highly Automated | Phase 3: Show robot-assisted productivity standards (2-3x manual). Reduce process staffing minimums. Add "Robot Supervision" as a process/skill. |
| Lights-Out | Phase 3: Minimal human processes (exception handling, maintenance, supervision only). |

### 7.3 Branching Implementation

The branching system uses a declarative rules engine. Each rule is defined as:

```
{
  "condition": {
    "field": "organization.industry_vertical",
    "operator": "equals",
    "value": "cold_chain_pharma"
  },
  "effects": [
    {
      "target": "phase3.process_form.temperature_zone",
      "action": "show",
      "required": true
    },
    {
      "target": "phase5.employee_form.certifications",
      "action": "show",
      "required": true,
      "default_options": ["Cold Chain Handling", "GDP Certification"]
    },
    {
      "target": "phase6.rules.freezer_exposure",
      "action": "show",
      "required": true,
      "default_value": { "max_continuous_minutes": 90, "warmup_break_minutes": 10 }
    }
  ]
}
```

Rules are evaluated on every field change. When a condition changes from true to false (e.g., user changes industry from Cold Chain to E-commerce), affected fields are hidden but their values are preserved in case the user switches back.

---

## 8. Error Recovery and Session Management

### 8.1 Auto-Save

Every field change triggers an auto-save with the following mechanism:

1. On field blur or 500ms after last keystroke, the field value is queued for save.
2. A debounced API call (max 1 per second) sends all queued changes to the server.
3. The server responds with a save confirmation and a timestamp.
4. A small "Saved" indicator flashes next to the last saved field.
5. If the save fails (network error), changes are persisted to local storage and retried with exponential backoff (1s, 2s, 4s, 8s, max 30s).
6. If the browser closes before save completes, local storage preserves the state. On next load, the system detects unsaved changes and offers: "You have unsaved changes from your last session. Restore them?"

### 8.2 Multi-User Collaboration

When multiple administrators work on the same wizard simultaneously:

1. Each user's changes are tagged with their user ID and timestamp.
2. If two users edit the same field within 60 seconds, the later save shows a conflict dialog: "User [name] changed [field] to [value] 30 seconds ago. Keep their value or use yours?"
3. Different phases can be worked on concurrently without conflicts (Phase 3 and Phase 5 don't share fields).
4. A "collaborators" indicator shows who else is currently in the wizard and which phase they are on.

### 8.3 Non-Linear Navigation

After Phase 2 is complete, the wizard sidebar shows all 8 phases with status indicators:

```
Phase 1: Organization Setup     ✓ Complete
Phase 2: Site Configuration     ✓ Complete
Phase 3: Process Definition     ● In Progress (7/14 processes)
Phase 4: Demand Configuration   ○ Not Started
Phase 5: Workforce Setup        ○ Not Started
Phase 6: Rule Configuration     ○ Not Started
Phase 7: Planning Preferences   ○ Not Started
Phase 8: Review & Activate      ○ Locked (prerequisites incomplete)
```

Users can click any unlocked phase to jump to it. Phase 8 unlocks only when all other phases show "Complete" or "In Progress" with no blocking errors.

### 8.4 Undo/Redo

The wizard maintains a per-session undo stack of up to 100 actions. Ctrl+Z undoes the last field change (including reverting dependent branching and validation states). Ctrl+Shift+Z redoes. The undo stack is cleared when the user navigates away from the wizard.

### 8.5 Configuration Snapshots

At any point, the user can save a named snapshot of the current configuration: "Save as: Pre-Go-Live Configuration v2". Snapshots can be restored, compared side-by-side, or exported as JSON. This is critical for:
- A/B testing different configurations (e.g., 2-shift vs. 3-shift) before go-live.
- Rolling back after a bad configuration change in production.
- Audit compliance (proving what configuration was active at a given date).

---

## 9. Configuration Confidence Score

### 9.1 What It Measures

The Configuration Confidence Score (CCS) is a composite metric (0-100) that rates the completeness and quality of the wizard setup. It is displayed prominently in Phase 8 and on the main dashboard after go-live.

### 9.2 Score Components

| Component | Weight | Description | Scoring |
|-----------|--------|-------------|---------|
| Completeness | 25% | Percentage of Essential fields filled across all phases | Linear: 0% filled = 0, 100% filled = 25 |
| Data Richness | 15% | Percentage of Advanced fields configured | Linear: 0% = 0, 100% = 15 (bonus, not required for a high score) |
| Validation Health | 25% | Ratio of passed validation checks to total checks | 100% pass = 25, each Error = -5, each Warning = -2 |
| Benchmark Alignment | 15% | How closely productivity standards and staffing match industry benchmarks | Within 1 SD = 15, within 2 SD = 10, beyond 2 SD = 5 |
| Integration Quality | 10% | Whether live data connections are established and returning fresh data | All connected = 10, partial = 5, none = 2 |
| Coverage Adequacy | 10% | Whether workforce can cover projected demand within tolerance | Full coverage = 10, within tolerance = 7, gaps = 3 |

### 9.3 Score Interpretation

| Score Range | Label | Meaning |
|-------------|-------|---------|
| 90-100 | Excellent | Configuration is comprehensive, well-calibrated, and production-ready. Expect high-quality plans immediately. |
| 75-89 | Good | Core configuration is solid. Some advanced settings could be refined. Plans will be good with minor manual adjustments expected in the first 2 weeks. |
| 60-74 | Adequate | Basic configuration is complete but several areas need attention. Plans will require regular human review. |
| 40-59 | Needs Work | Significant gaps in configuration. Plans may be unreliable. Address warnings before go-live. |
| 0-39 | Incomplete | Configuration is fundamentally incomplete. Do not go live. |

### 9.4 Score Improvement Suggestions

When the score is below 90, the AI provides ranked suggestions for improving it:

```
Your Configuration Confidence Score: 78 / 100 (Good)

Top improvements:
1. [+5 points] Add productivity tiers for Picking process — volume-dependent
   productivity will improve plan accuracy during peak hours.
2. [+4 points] Connect a live demand source — you're currently using manual upload.
   An API connection would improve data freshness from daily to real-time.
3. [+3 points] Define learning curves for processes — 23% of your workforce has
   tenure < 3 months. Without learning curves, the optimizer will overestimate
   their throughput.
```

---

## 10. Concrete Example Walkthrough: Setting Up a 3PL with 12 Warehouses

### 10.1 Scenario

**Company**: GlobalLogis Inc., a 3PL operating 12 warehouses across the US and Canada, serving 8 clients. 2,400 total employees. Clients include an e-commerce retailer, a consumer electronics brand, a health & beauty company, and five others.

### 10.2 Phase 1: Organization Setup (5 minutes)

The admin enters "GlobalLogis Inc." — the AI looks up the company and pre-fills:
- Industry Vertical: 3PL / Contract Logistics (auto-detected)
- Organization Size: Large (5,000-50,000) (slightly over — AI asks to confirm, admin selects "Large")
- Primary Country: United States
- Timezone: US Eastern
- Currency: USD
- ERP: SAP (auto-detected from public data)
- WMS: Manhattan Associates (auto-detected)
- Multi-Tenant Mode: Yes (auto-enabled for 3PL vertical)

Admin confirms all defaults. Adds the company logo. Clicks "Next".

### 10.3 Phase 2: Site Configuration (45 minutes)

Admin uses bulk import — uploads an Excel file with 12 rows containing site names, addresses, and types. The AI maps columns and imports all 12 sites.

Import results:
- 12 sites imported successfully.
- AI auto-detected site types based on names and addresses: 8 Warehouses, 2 Distribution Centers, 1 Cross-Dock, 1 Returns Processing Center.
- AI assigned timezones based on addresses.
- Admin reviews and corrects 1 site type (a "Warehouse" that is actually a "Fulfillment Center" for the e-commerce client).

For each site, the admin configures operating model and shifts. The AI suggests patterns based on site type and region. For the 8 standard warehouses, the admin configures one, saves it as a template, and clones to the remaining 7, adjusting only operating hours (some are 16-hr, some are 24/7).

Client assignments: Admin assigns each of the 8 clients to their respective warehouses. Two warehouses serve multiple clients (shared operations).

### 10.4 Phase 3: Process Definition (30 minutes)

The admin selects the "3PL Multi-Client" template. The AI creates a base set of 8 processes per site. For the e-commerce fulfillment site, the AI suggests additional processes (Returns, VAS) and the admin accepts.

For each client, the admin reviews and adjusts productivity standards:
- Client A (e-commerce): Picking at 105 UPH, Packing at 45 orders/hr (AI suggests these are slightly below benchmark and flags it: "Your picking standard of 105 UPH is at the 25th percentile for similar operations. Is this due to manual picking without voice/RF assist?")
- Client B (consumer electronics): Picking at 60 UPH (heavy/bulky items — AI accepts this as reasonable for the product type).

The admin uses the "Copy Process Set" function to apply Client A's processes to 3 sites that serve Client A, adjusting only site-specific minimums.

### 10.5 Phase 4: Demand Configuration (20 minutes)

The admin configures the Manhattan WMS integration as the primary demand source. The AI provides the standard Manhattan demand extraction query and the admin enters the connection details.

For each client, demand types are defined:
- Client A: Orders, Order Lines, Units, Returns
- Client B: Orders, Units, Pallets
- Others: similar patterns

The admin sets forecast horizons (Client A provides 14-day forecasts; Client B provides only 7-day). The AI warns: "Client B's 7-day forecast is shorter than your 4-week planning horizon. Plans for weeks 3-4 will rely on historical patterns rather than forecasts."

### 10.6 Phase 5: Workforce Setup (40 minutes)

The admin connects the ADP HRIS integration. 2,400 employee records are pulled automatically with roles, hire dates, and pay rates.

The AI maps ADP job codes to AstraPlanner roles:
- "WHSAssocI" → Warehouse Associate
- "WHSAssocII" → Senior Associate
- "WHSLead" → Team Lead
- "WHSSup" → Supervisor

The admin confirms the mappings. The AI then runs skill inference based on roles and tenure, assigning proficiency levels. The admin reviews a sample of 20 employees and adjusts 3 skill assignments.

Gap analysis result: "Site LAX-WH-03 has 0 employees with Forklift certification but 4 processes requiring it. You need at least 6 certified forklift operators at this site." Admin notes this for follow-up.

Client pool assignments: For shared-client sites, the admin designates which employees are in dedicated client pools vs. the flexible shared pool. The AI suggests: "Based on Client A's SLA requirements, 70% dedicated / 30% shared is common for 3PL operations."

### 10.7 Phase 6: Rule Configuration (20 minutes)

The AI auto-loads rules for each site's jurisdiction:
- 8 US sites across 5 states: California (2 sites), Texas (2), Illinois (1), New Jersey (2), Georgia (1)
- 4 Canadian sites: Ontario (3), British Columbia (1)

California sites get the strictest configuration (daily OT, specific break rules). The admin reviews and confirms.

For multi-province Canadian operations, the AI highlights: "Ontario and BC have different overtime thresholds (44 hrs vs. 40 hrs). I've applied province-specific rules to each site."

Cross-training policy: Allowed within client pools (25% of shift), not allowed across client pools without manager approval.

### 10.8 Phase 7: Planning Preferences (10 minutes)

The admin sets objectives:
- Client SLA Coverage: 50% weight (3PL must meet contractual SLAs)
- Minimize Cost: 35% weight
- Balanced Workload: 15% weight

Approval workflow: Site Manager approves, then Client Account Manager reviews (for SLA compliance), then Regional VP for cost overruns > 5%.

The admin enables per-client SLA targets: Client A requires 99% process coverage, Client B requires 95%.

### 10.9 Phase 8: Review & Activate (15 minutes)

Configuration Confidence Score: 82 / 100 (Good).

Validation results:
- 2 Errors: Site LAX-WH-03 forklift gap (known), Site TOR-WH-01 missing demand source mapping for 1 process.
- 5 Warnings: Productivity below benchmark at 3 sites, single point of failure for hazmat skill at 2 sites.
- 8 Info: Cross-training recommendations, seasonal adjustment suggestions.

The admin fixes the demand source mapping (2 minutes) and acknowledges the forklift gap (hiring in progress). Warnings are acknowledged.

Test plan generated for all 12 sites. Plan Quality Score: 87. The AI notes: "Coverage is 97% across all sites and clients. Understaffing occurs at LAX-WH-03 on Tuesdays (forklift-dependent processes) and at CHI-DC-01 on Monday mornings (peak inbound). Consider adjusting shift starts or adding 2 FTEs."

Admin selects go-live date: next Monday (5 days out), giving time to address the forklift certification gap.

**Total wizard time: approximately 3 hours for a 12-site, 2,400-employee, 8-client 3PL operation.** Without the wizard's AI assistance, templates, and bulk import, this configuration would have taken an estimated 3-4 weeks of consulting time.

---

## 11. Performance Characteristics

### 11.1 Wizard Load Times

| Action | Target Latency | Implementation |
|--------|---------------|----------------|
| Initial wizard load | < 2 seconds | Phase 1 form is pre-rendered; later phases lazy-loaded |
| Phase transition | < 1 second | Next phase pre-fetched during current phase |
| AI suggestion appearance | < 3 seconds | Async call to AI service; displayed when ready without blocking form |
| Validation check (field-level) | < 200ms | Client-side validation for format; server-side for cross-phase |
| Validation check (full cross-phase) | < 5 seconds | Runs on phase transition and on-demand |
| Bulk import (1,000 employees) | < 30 seconds | Server-side processing with progress indicator |
| Template application | < 2 seconds | Pre-computed template applied client-side |
| Test plan generation | 30-120 seconds | Depends on site count and workforce size; progress bar shown |

### 11.2 Scalability Limits

| Dimension | Supported Maximum | Notes |
|-----------|------------------|-------|
| Sites per organization | 10,000 | Bulk import required above 50; paginated UI above 100 |
| Employees per organization | 500,000 | Imported via integration or bulk upload; not manual entry |
| Processes per site | 200 | Rarely exceeded; most operations have 8-20 |
| Rules per organization | 5,000 | Including jurisdiction-specific overrides |
| Concurrent wizard users | 50 | Per organization; collaborative editing with conflict resolution |
