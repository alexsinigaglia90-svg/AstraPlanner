# Setup Wizard Flow

## 1. Why a Guided Setup Wizard Is Non-Negotiable

Enterprise logistics planning is among the most configuration-intensive domains in operational software. A single distribution center requires the specification of dozens of processes, hundreds of productivity standards, shift patterns that vary by day of week and season, labor regulations that differ by jurisdiction, and demand profiles that shift hourly. Multiply that by hundreds or thousands of sites across an enterprise and you have a configuration surface that, without guidance, leads to:

- **Abandonment**: Industry data shows that 68% of enterprise SaaS implementations stall during initial configuration when users face unstructured forms. Logistics planning tools are worse — the median time-to-first-value exceeds 14 weeks without guided onboarding.
- **Misconfiguration**: Incorrect productivity standards, missing break rules, or mismatched demand-to-process mappings produce plans that are immediately rejected by operations managers, destroying trust in the system before it has a chance to prove value.
- **Inconsistency**: When 50 site managers each configure their own site independently, naming conventions diverge, process definitions drift, and cross-site analytics become meaningless.
- **Compliance Risk**: Missing a state-specific meal break rule or an EU working time directive constraint can expose the organization to regulatory penalties.

AstraPlanner's AI-guided setup wizard solves all of these by providing a structured, validated, AI-assisted path from zero to a fully operational planning configuration. It reduces time-to-first-plan from weeks to hours, enforces consistency across sites, and catches configuration errors before they reach production.

---

## 2. Complete Wizard Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SETUP WIZARD FLOW                            │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ Phase 1  │──▶│ Phase 2  │──▶│ Phase 3  │──▶│   Phase 4    │    │
│  │ Org      │   │ Sites    │   │ Process  │   │   Demand     │    │
│  │ Setup    │   │ Config   │   │ Defn     │   │   Config     │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────┬───────┘    │
│                                                       │             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐         │             │
│  │ Phase 8  │◀──│ Phase 7  │◀──│ Phase 6  │◀──┌─────┴───────┐    │
│  │ Review & │   │ Planning │   │ Rule     │   │   Phase 5   │    │
│  │ Activate │   │ Prefs    │   │ Config   │   │  Workforce  │    │
│  └──────────┘   └──────────┘   └──────────┘   │   Setup     │    │
│                                                └─────────────┘    │
│                                                                     │
│  Navigation: Linear default, non-linear allowed after Phase 2       │
│  Progress:   Auto-saved after every field change                    │
│  AI:         Active assistance available at every phase              │
└─────────────────────────────────────────────────────────────────────┘
```

### Time Estimates Summary

| Phase | Name | Estimated Time (Single Site) | Estimated Time (Multi-Site, 10+) |
|-------|------|------------------------------|----------------------------------|
| 1 | Organization Setup | 5-10 minutes | 5-10 minutes |
| 2 | Site Configuration | 10-15 minutes | 30-90 minutes (with clone) |
| 3 | Process Definition | 15-25 minutes | 20-40 minutes (template reuse) |
| 4 | Demand Configuration | 10-20 minutes | 15-30 minutes |
| 5 | Workforce Setup | 15-30 minutes | 20-60 minutes (with bulk import) |
| 6 | Rule Configuration | 10-20 minutes | 15-30 minutes |
| 7 | Planning Preferences | 5-10 minutes | 10-15 minutes |
| 8 | Review & Activate | 5-15 minutes | 10-20 minutes |
| **Total** | | **75-145 minutes** | **125-295 minutes** |

For enterprises using AI-assisted setup (natural language or document upload), total time is typically reduced by 40-60%.

---

## 3. Phase 1: Organization Setup

### Purpose

Establish the organizational identity, operating context, and global defaults that cascade to every subsequent configuration screen. This phase is deliberately short to build momentum — the user should feel productive within the first five minutes.

### Screen Description

A clean single-page form divided into four card sections. The top card shows a welcome message personalized to the user's name (from SSO/identity provider). A progress bar at the top shows "Phase 1 of 8". An AI assistant panel on the right offers to auto-fill based on company name lookup.

### Required Inputs

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Company Name | Text (max 200 chars) | Legal entity name | Must not be empty. AI will attempt company lookup for auto-fill. |
| Industry Vertical | Dropdown + search | Primary industry classification | Must select one. Options: E-commerce Fulfillment, Grocery/Food Distribution, Parcel & Last-Mile, Cold Chain/Pharma, 3PL/Contract Logistics, Manufacturing Logistics, Retail Distribution, Automotive Parts, General Warehousing, Other. |
| Organization Size | Segmented control | Headcount range | Options: Small (< 500 employees), Medium (500-5,000), Large (5,000-50,000), Enterprise (50,000+). Drives default complexity levels. |
| Primary Planning Horizon | Dropdown | Default planning lookahead | Options: 1 week, 2 weeks, 4 weeks, 8 weeks, 13 weeks (quarter), 26 weeks (half-year). Default: 4 weeks. |
| Fiscal Year Start | Month picker | First month of fiscal year | Default: January. Used for budget alignment and annual planning cycles. |
| Primary Country | Country dropdown | Headquarters country | Drives default labor regulations, date/time formats, and currency. |
| Primary Timezone | Timezone dropdown (auto-filtered by country) | Default timezone for org-level reporting | Auto-suggested based on Primary Country. |
| Primary Currency | Currency dropdown (auto-filtered by country) | Currency for cost calculations | Auto-suggested. Options include all ISO 4217 currencies. |
| Primary Language | Language dropdown | UI and report language | Auto-detected from browser. Available: English, Spanish, French, German, Dutch, Polish, Portuguese, Mandarin, Japanese. |

### Optional Inputs

| Field | Type | Description |
|-------|------|-------------|
| Company Logo | Image upload (PNG/SVG, max 2 MB) | Displayed in reports and dashboards |
| ERP System | Dropdown | SAP, Oracle, Microsoft Dynamics, NetSuite, Infor, Other, None. Drives integration recommendations in later phases. |
| WMS System | Dropdown | Manhattan, Blue Yonder, Körber, SAP EWM, Oracle WMS, Other, None |
| TMS System | Dropdown | Current transportation management system |
| Union Presence | Toggle | Whether any sites have unionized workforce. If yes, Phase 6 shows union-specific rule fields. |
| Multi-Tenant Mode | Toggle (3PL only) | Whether the organization operates multiple client accounts. Shown only when Industry Vertical = 3PL. |

### AI Assistance Offered

- **Company Lookup**: When the user types a company name, the AI searches public data to pre-fill industry vertical, organization size, country, and timezone.
- **Industry Recommendation**: If the user selects "Other", the AI asks: "Describe your operation in a sentence and I'll recommend the closest industry template."
- **Contextual Tooltips**: Each field has an AI-generated tooltip explaining why the field matters. Example: "Your planning horizon determines how far ahead the system generates workforce schedules. Most distribution operations use 4 weeks; seasonal operations benefit from 13 weeks."

### Estimated Time

5-10 minutes. Most fields auto-populate after company name entry.

---

## 4. Phase 2: Site Configuration

### Purpose

Define every physical location where workforce planning will occur. Each site becomes an independent planning unit with its own processes, demand profiles, and workforce pool — though cross-site resource sharing can be configured later.

### Screen Description

A master-detail layout. The left panel shows a list of sites (initially empty) with an "Add Site" button and a "Bulk Import" option. The right panel shows the configuration form for the selected site. A map visualization at the top plots all configured sites geographically.

### Required Inputs (Per Site)

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Site Name | Text (max 100 chars) | Human-readable name | Must be unique within the organization. |
| Site Code | Text (max 20 chars, alphanumeric) | Internal identifier | Must be unique. Auto-generated from name if left blank (e.g., "Chicago DC" → "CHI-DC-01"). |
| Site Type | Dropdown | Operational classification | Options: Distribution Center, Fulfillment Center, Warehouse, Cross-Dock, Sortation Hub, Retail Store (Backroom), Manufacturing Plant, Cold Storage Facility, Returns Processing Center, Transportation Hub. |
| Address | Address form (street, city, state/province, postal code, country) | Physical location | Country auto-filled from Phase 1. Address validated against geocoding API. |
| Timezone | Timezone dropdown | Site-local timezone | Auto-detected from address. Critical for shift calculations. |
| Operating Model | Segmented control | Hours of operation | Options: 24/7, Extended (16-20 hrs), Standard (8-12 hrs), Variable. |
| Operating Days | Multi-select checkboxes | Days of the week the site operates | Default: Mon-Fri. Validation: at least 1 day must be selected. |
| Shift Structure | Dropdown | Number of shifts per operating day | Options: 1 Shift, 2 Shifts, 3 Shifts, Flexible/Staggered. Must be consistent with Operating Model (e.g., Standard model cannot have 3 shifts). |
| Shift Definitions | Repeating group per shift | Start time, end time, shift name | Start/end times must not overlap. Total shift coverage must match Operating Model. Break windows defined here or in Phase 6. |
| Peak Capacity (Headcount) | Number | Maximum people on-site simultaneously | Must be > 0. Used for fire code / physical space constraints. |

### Optional Inputs (Per Site)

| Field | Type | Description |
|-------|------|-------------|
| Site Manager | User lookup | Primary contact for this site |
| Square Footage | Number | Facility size; used for density calculations |
| Temperature Zones | Multi-select | Ambient, Chilled (2-8°C), Frozen (-18°C), Deep Freeze (-25°C). Shown for Cold Storage and Fulfillment Center types. |
| Dock Doors (Inbound) | Number | Number of receiving docks; used for receiving process capacity |
| Dock Doors (Outbound) | Number | Number of shipping docks |
| Automation Level | Dropdown | Manual, Semi-Automated (conveyor/sortation), Highly Automated (AS/RS, AMR), Lights-Out. Affects productivity standards in Phase 3. |
| Client Assignments | Multi-select (3PL only) | Which clients this site serves |
| Cost Center Code | Text | Financial tracking identifier |
| Go-Live Date | Date picker | When this site should begin receiving plans. Default: today. |

### AI Assistance Offered

- **Address Autocomplete**: As the user types, address suggestions appear with geocoded coordinates.
- **Site Type Recommendation**: Based on the address (urban vs. suburban vs. rural) and organization's industry, the AI suggests the most likely site type. "Based on your location in a suburban industrial park and your e-commerce fulfillment vertical, this is likely a Fulfillment Center."
- **Clone Site**: After the first site is configured, the AI offers: "Would you like to create similar sites? I can clone this configuration and you just change the address and name." This is the primary time-saver for multi-site enterprises.
- **Bulk Import**: Upload a CSV or Excel file with site data. AI maps columns to fields, previews the import, and highlights any validation errors. Template download available.
- **Shift Pattern Suggestions**: "For a 24/7 distribution center in this region, the most common pattern is 3 shifts: Day (06:00-14:00), Swing (14:00-22:00), Night (22:00-06:00). Would you like to use this?"

### Validation Rules

- Site codes must be globally unique.
- Shift times must collectively cover the declared operating model window. If the site is 24/7, shifts must span all 24 hours.
- If Operating Model is "24/7" but only 5 days are selected, the wizard flags a warning: "You selected 24/7 operations but only Mon-Fri. Did you mean Extended Hours?"
- Peak capacity must be at least 2x the largest single-shift headcount defined in Phase 5 (validated retroactively).
- Cold storage sites must have at least one temperature zone defined.

### Estimated Time

- Single site: 10-15 minutes.
- Multi-site (10 sites with clone): 30-45 minutes.
- Multi-site (50+ sites with bulk import): 20-30 minutes (mostly review time).

---

## 5. Phase 3: Process Definition

### Purpose

Define the operational processes performed at each site and establish the productivity standards that convert demand volume into labor hours. This is the most technically important phase — errors here propagate directly into planning accuracy.

### Screen Description

A two-tier layout. The top section shows a site selector (tabs or dropdown for each site configured in Phase 2). The main area shows a process table with drag-and-drop reordering. Each process row expands to show detailed configuration. A "Process Library" sidebar on the right shows pre-built process templates that can be dragged onto the table.

### Required Inputs (Per Process)

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Process Name | Text or select from library | Operational process identifier | Must be unique within the site. |
| Process Code | Text (max 10 chars) | Short code for reporting | Auto-generated from name. Must be unique within the site. |
| Process Category | Dropdown | Functional grouping | Options: Inbound (Receiving, Putaway, QC Inbound), Outbound (Picking, Packing, Shipping, Loading), Value-Added (Kitting, Labeling, Gift Wrap, Assembly), Inventory (Cycle Count, Replenishment, Transfers), Returns (Receiving Returns, Inspection, Restocking, Disposal), Support (Training, Meetings, Cleaning, Maintenance). |
| Demand Driver | Dropdown | What demand metric drives this process | Options: Orders, Order Lines, Units, Cases, Pallets, Containers, Trucks, Weight (kg), Custom. Must align with demand types configured in Phase 4. |
| Productivity Standard | Number | Units of demand driver processed per labor hour | Must be > 0. Example: 120 units/hour for picking, 45 orders/hour for packing. |
| Productivity Variability | Percentage | Expected deviation from standard | Default: ±15%. Used by the optimization engine to build buffer into plans. |
| Minimum Staffing | Number | Minimum headcount required regardless of volume | Can be 0. Example: Receiving always needs at least 2 people when dock is open. |
| Required Skills | Multi-select (from Phase 5 skill list, or define inline) | Skills needed to perform this process | At least one skill must be selected. Skills are created on-the-fly here and referenced in Phase 5. |

### Optional Inputs (Per Process)

| Field | Type | Description |
|-------|------|-------------|
| Productivity Tiers | Table (volume range → standard) | Different productivity at different volumes. Example: first 500 units/hr at 120 UPH, next 500 at 105 UPH (fatigue/congestion). |
| Equipment Required | Multi-select | Forklift, RF Scanner, Pallet Jack, Voice Pick Headset, Conveyor Access, etc. Equipment constraints limit how many people can work concurrently. |
| Certification Required | Multi-select | Forklift License, Hazmat Handling, Food Safety, Controlled Substance, PIT License. |
| Ramp-Up Time | Duration (minutes) | Time from shift start before process reaches full productivity. Default: 15 minutes. |
| Learning Curve | Table (tenure range → productivity multiplier) | New hires at 60% for weeks 1-2, 80% for weeks 3-4, 100% after week 4. |
| Sequencing Dependencies | Multi-select of other processes | Processes that must be completed before this one can begin (e.g., Receiving before Putaway). |
| Max Concurrent Workers | Number | Physical limit on how many people can work this process simultaneously. |
| Batch Size | Number | Minimum batch of demand driver before process starts. Example: Don't start packing until at least 50 orders are picked. |
| Seasonal Adjustment Profile | Table (month → multiplier) | Productivity varies by season (e.g., 0.9x in summer for non-AC warehouses). |

### Pre-Built Process Templates

The following templates are available based on site type:

**E-commerce Fulfillment Center**
| Process | Demand Driver | Default Productivity | Category |
|---------|--------------|---------------------|----------|
| Receiving | Cartons | 35 cartons/hr | Inbound |
| Putaway | Cartons | 28 cartons/hr | Inbound |
| Single-Item Pick | Orders | 95 orders/hr | Outbound |
| Multi-Item Pick | Order Lines | 150 lines/hr | Outbound |
| Batch Pick | Units | 200 units/hr | Outbound |
| Pack - Small Parcel | Orders | 55 orders/hr | Outbound |
| Pack - Multi-Box | Orders | 30 orders/hr | Outbound |
| Shipping / Manifest | Orders | 120 orders/hr | Outbound |
| Returns Receiving | Returns | 25 returns/hr | Returns |
| Returns Inspection | Returns | 20 returns/hr | Returns |
| Restocking | Units | 40 units/hr | Returns |
| Cycle Count | Locations | 60 locations/hr | Inventory |
| VAS - Gift Wrap | Orders | 18 orders/hr | Value-Added |
| VAS - Kitting | Kits | 22 kits/hr | Value-Added |

**Grocery Distribution Center**
| Process | Demand Driver | Default Productivity | Category |
|---------|--------------|---------------------|----------|
| Receiving (Ambient) | Pallets | 12 pallets/hr | Inbound |
| Receiving (Chilled) | Pallets | 10 pallets/hr | Inbound |
| Receiving (Frozen) | Pallets | 8 pallets/hr | Inbound |
| Putaway | Pallets | 10 pallets/hr | Inbound |
| Case Pick | Cases | 180 cases/hr | Outbound |
| Layer Pick | Pallets | 15 pallets/hr | Outbound |
| Full Pallet Pull | Pallets | 20 pallets/hr | Outbound |
| Order Assembly | Pallets | 8 pallets/hr | Outbound |
| Loading | Trucks | 3 trucks/hr | Outbound |
| QC Inspection | Pallets | 25 pallets/hr | Inbound |
| Replenishment | Cases | 60 cases/hr | Inventory |

### AI Assistance Offered

- **Template Application**: "I see this is an e-commerce fulfillment center. Here are the 14 standard processes for this type of operation. Would you like to start with these and customize?"
- **Productivity Benchmarking**: "Your picking productivity standard of 200 UPH is in the top 10% for manual pick operations. This is achievable with voice pick or pick-to-light systems — do you have those?" If the standard seems unrealistic, the AI flags it.
- **Process Gap Detection**: "You have Picking and Shipping defined but no Packing process. Most fulfillment operations need a packing step between pick and ship. Should I add one?"
- **Dependency Inference**: "I've automatically set Putaway to depend on Receiving, and Packing to depend on Picking. You can adjust these."

### Validation Rules

- Every site must have at least one process defined.
- Demand drivers used must be configured in Phase 4 (or created on-the-fly and carried forward).
- Productivity standards are validated against industry benchmarks: values more than 3 standard deviations from the mean trigger a warning (not a block).
- If sequencing dependencies create a circular reference, the wizard blocks save and highlights the cycle.
- If minimum staffing exceeds peak capacity for the site, a warning is shown.

### Estimated Time

- Single site with template: 15-20 minutes (mostly reviewing and adjusting defaults).
- Single site from scratch: 25-40 minutes.
- Additional sites (clone from first): 5-10 minutes each.

---

## 6. Phase 4: Demand Configuration

### Purpose

Connect AstraPlanner to the sources of demand data and define how raw demand translates into process workload. Without accurate demand, even perfect process definitions and workforce configurations produce useless plans.

### Screen Description

A three-tab layout: (1) Demand Sources — integration configuration, (2) Demand Types — defining the metrics, (3) Demand-to-Process Mapping — linking demand to processes. A live preview panel shows sample demand data once a source is connected.

### Tab 1: Demand Sources — Required Inputs

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Source Name | Text | Human-readable identifier | Must be unique. |
| Source Type | Dropdown | Integration method | Options: API (REST/GraphQL), Database (direct query), File Upload (CSV/Excel, scheduled or ad-hoc), WMS Feed, ERP Feed, Forecast System, Manual Entry. |
| Connection Configuration | Dynamic form based on Source Type | Credentials, endpoints, query definitions | API: URL, auth method (API key, OAuth2, Basic), headers. Database: connection string, query. File: upload path or SFTP config. |
| Refresh Frequency | Dropdown | How often demand data is pulled | Options: Real-time (webhook/streaming), Every 15 minutes, Hourly, Every 4 hours, Daily, Weekly, Manual. |
| Site Mapping | Multi-select | Which sites this source provides demand for | At least one site. |
| Data Format | Configuration screen | Column/field mapping from source to AstraPlanner's demand model | Map: timestamp, demand type, quantity, site identifier, optional attributes. |

### Tab 2: Demand Types — Required Inputs

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Demand Type Name | Text | The unit of demand measurement | Must match demand drivers used in Phase 3 processes. Examples: Orders, Units, Cases, Pallets, Trucks, Lines. |
| Unit of Measure | Text | How quantity is expressed | E.g., "each", "case", "pallet", "truck". |
| Forecast Horizon | Number + unit | How far ahead forecasts are available for this type | E.g., 14 days, 4 weeks. Must be ≤ org planning horizon from Phase 1. |
| Forecast Granularity | Dropdown | Time resolution of forecasts | Options: 15-minute intervals, Hourly, 4-hour blocks, Daily, Weekly. |
| Seasonality Profile | Optional table or curve | Monthly multipliers for seasonal patterns | 12 values, each between 0.1 and 10.0. Default: all 1.0 (no seasonality). |

### Tab 3: Demand-to-Process Mapping — Required Inputs

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Demand Type | Dropdown (from Tab 2) | Source demand metric | — |
| Target Process | Dropdown (from Phase 3) | Process that consumes this demand | — |
| Conversion Factor | Number | How demand converts to process demand driver | Default: 1.0. Example: 1 Order = 3.2 Order Lines (average). |
| Time Lag | Duration | Delay between demand arrival and process execution | Example: orders received at 08:00 reach Picking at 09:00 (1 hr lag). Default: 0. |
| Distribution Curve | Dropdown or custom | How daily demand distributes across hours | Options: Uniform, Front-loaded (60% in first half), Back-loaded, Bell curve, Custom (hour-by-hour percentages). |

### AI Assistance Offered

- **Integration Setup**: "I see you're using SAP EWM. Here's the standard demand extraction query. Would you like me to configure the connection with your endpoint?"
- **Demand Type Inference**: Based on industry vertical and site types, the AI pre-creates the most likely demand types. "For e-commerce fulfillment, the typical demand types are Orders, Order Lines, Units, and Returns. I've created these — would you like to adjust?"
- **Conversion Factor Estimation**: "Based on industry benchmarks for your vertical, the average order contains 3.2 lines and 4.8 units. I've used these as starting conversion factors. You can refine them once you have your own data."
- **Seasonality Detection**: If historical data is uploaded, the AI automatically detects seasonal patterns and suggests a seasonality profile.
- **Demand Validation**: "Your peak daily demand of 50,000 orders would require approximately 180 FTEs for picking alone, based on your productivity standards. Your site peak capacity is 200. This is feasible but tight — consider whether your standards are accurate."

### Validation Rules

- Every process defined in Phase 3 must have at least one demand type mapped to it, or be flagged as "support process" (not demand-driven).
- Conversion factors must be > 0.
- Forecast horizon must be ≤ planning horizon (Phase 1).
- If demand granularity is finer than shift duration, the system can plan intra-shift rebalancing. If coarser, it warns that intra-day flexibility will be limited.
- Distribution curves must sum to 100% across the operating window.

### Estimated Time

- With API/system integration: 15-20 minutes (mostly connection setup and testing).
- With manual/file upload: 10-15 minutes.
- Demand-to-process mapping: 5-10 minutes (most is auto-suggested).

---

## 7. Phase 5: Workforce Setup

### Purpose

Import or define the workforce — every person who will be scheduled, their roles, skills, availability constraints, and contractual terms. This is the human side of the planning equation.

### Screen Description

A data-grid layout optimized for handling large employee datasets. The top bar offers three import methods: Manual Entry, File Upload (CSV/Excel), and System Integration (HRIS/WMS). Below is a filterable, sortable grid showing all imported employees. A side panel opens for individual employee editing.

### Required Inputs — Workforce Structure

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Roles | Definition table | Named roles with associated permissions | At least one role. Examples: Warehouse Associate, Team Lead, Supervisor, Trainer, Forklift Operator, Receiving Specialist. |
| Skills | Definition table (may carry forward from Phase 3) | Named skills that map to process requirements | At least one skill. Examples: RF Scanning, Forklift Operation, Hazmat Handling, Pick-to-Voice, Quality Inspection. |
| Proficiency Levels | Scale definition | How skill mastery is measured | Default: 4-level scale — Trainee (50% productivity), Developing (75%), Proficient (100%), Expert (110%). Customizable. |
| Contract Types | Definition table | Employment classifications | At least one. Examples: Full-Time, Part-Time, Temporary/Seasonal, Agency/Contingent, Flex/On-Call. |

### Required Inputs — Per Employee

| Field | Type | Description | Validation Rules |
|-------|------|-------------|-----------------|
| Employee ID | Text | Unique identifier (from HRIS or auto-generated) | Must be unique across the organization. |
| Name | Text (first, last) | Employee name | Must not be empty. |
| Primary Site | Dropdown (from Phase 2 sites) | Home site assignment | Must be a configured site. |
| Role | Dropdown (from roles above) | Primary role | Must be a defined role. |
| Contract Type | Dropdown | Employment classification | Must be a defined contract type. |
| Skills | Multi-select with proficiency | Skills this employee possesses | At least one skill. Each skill has an associated proficiency level. |
| Weekly Contracted Hours | Number | Standard weekly hours | Must be > 0 and ≤ 168. Full-time default: 40 (US) / 37.5 (UK) / 35 (FR). |
| Availability Pattern | Weekly grid (day × shift) | When the employee is available to work | At least one available slot. Grid shows each day of week × each shift defined for the site. |

### Optional Inputs — Per Employee

| Field | Type | Description |
|-------|------|-------------|
| Hire Date | Date | Used for seniority calculations and learning curve application |
| Secondary Sites | Multi-select | Sites where this employee can be temporarily assigned |
| Preferred Shifts | Multi-select | Shift preferences (considered but not guaranteed) |
| Max Overtime Hours | Number/week | Personal overtime limit (may be less than legal max) |
| Certifications | Multi-select with expiry dates | Forklift license, food handler card, etc. |
| Supervisor | Employee lookup | Reporting relationship |
| Pay Rate | Currency | Base hourly rate. Used for cost optimization. |
| Overtime Rate Multiplier | Number | Default: 1.5x. Some contracts specify 2.0x. |
| Weekend Rate Multiplier | Number | Default: 1.0x (no premium). |
| Accommodation Requirements | Multi-select | Lifting restrictions, standing time limits, temperature restrictions, etc. |
| Notes | Free text | Special considerations for scheduling |

### Bulk Import Specification

The CSV/Excel import accepts the following columns (header names are flexible — AI maps them):

```
employee_id, first_name, last_name, site_code, role, contract_type,
skill_1, skill_1_proficiency, skill_2, skill_2_proficiency, ...,
weekly_hours, hire_date, pay_rate, shift_preference,
availability_mon, availability_tue, ..., availability_sun,
certifications, max_overtime, supervisor_id
```

The AI import assistant:
1. Previews the first 10 rows.
2. Maps each column to an AstraPlanner field (user confirms or overrides).
3. Validates all rows and reports errors per row.
4. Allows fixing errors inline or re-uploading.
5. Shows import summary: "Imported 342 employees. 12 rows had warnings (missing skills — defaulted to Trainee level). 3 rows failed (invalid site code)."

### AI Assistance Offered

- **HRIS Integration**: Direct connections to Workday, ADP, BambooHR, SAP SuccessFactors, UKG. "I see you use Workday. I can pull employee data, roles, and availability directly. Would you like to connect?"
- **Skill Inference**: "Employee Jane Doe has role 'Forklift Operator' and 3 years of tenure. I'm assigning her Forklift Operation at Expert level and RF Scanning at Proficient level. Does this look right?"
- **Gap Analysis**: After import, the AI runs a coverage check: "You have 45 employees with Picking skills but your peak demand requires 62. You have a gap of 17 FTEs for picking during peak. Consider cross-training or adding contingent staff."
- **Role Auto-Creation**: If imported data has role names not yet defined, the AI offers to create them and map standard skills.

### Validation Rules

- Employee IDs must be unique.
- Every employee must have at least one skill that maps to at least one process at their primary site.
- Contracted hours must comply with the labor regulations configured in Phase 6 (validated retroactively).
- If a process requires a certification (Phase 3) and no employee at the site holds that certification, a warning is raised.
- Total available FTEs per site per shift must be ≥ sum of minimum staffing across all processes for that shift (from Phase 3).

### Estimated Time

- Manual entry (< 50 employees): 20-30 minutes.
- File upload (any size): 15-20 minutes (import + review).
- HRIS integration: 10-15 minutes (connection + validation).

---

## 8. Phase 6: Rule Configuration

### Purpose

Define the labor regulations, scheduling rules, and organizational policies that constrain how workforce plans are generated. These rules are hard constraints — the optimizer will never violate them.

### Screen Description

A categorized accordion layout. Each category expands to show relevant rules with toggle switches (enabled/disabled) and configuration fields. A jurisdiction selector at the top auto-loads applicable regulations. A "Compliance Score" indicator shows how completely rules are configured.

### Rule Categories and Inputs

#### 6.1 Working Time Regulations

| Rule | Type | Description | Default (US) | Default (EU) |
|------|------|-------------|-------------|-------------|
| Maximum Daily Hours | Number | Max hours per employee per day | 12 | 10 (Working Time Directive) |
| Maximum Weekly Hours | Number | Max hours per employee per week | 60 | 48 (WTD) |
| Maximum Consecutive Days | Number | Max days before a required day off | 6 | 6 |
| Minimum Rest Between Shifts | Hours | Mandatory gap between end of one shift and start of next | 8 | 11 (WTD) |
| Overtime Threshold (Daily) | Hours | Hours after which overtime rate applies | 8 | Varies by country |
| Overtime Threshold (Weekly) | Hours | Weekly hours after which overtime rate applies | 40 | Varies by contract |
| Double-Time Threshold | Hours | Hours after which double-time rate applies | None (disabled) | Not applicable |
| Minimum Shift Length | Hours | Shortest permissible shift | 4 | 4 |
| Maximum Shift Length | Hours | Longest permissible shift | 12 | 10 |

#### 6.2 Break Rules

| Rule | Type | Description | Validation |
|------|------|-------------|-----------|
| Paid Break Duration | Minutes | Duration of paid break(s) per shift | Must be > 0 if enabled. |
| Paid Break Frequency | Dropdown | When paid breaks occur | Options: 1 per shift, Every 4 hours, Every 3 hours, Custom schedule. |
| Unpaid Meal Break Duration | Minutes | Meal break duration | Common: 30 or 60 minutes. |
| Meal Break Trigger | Hours | After how many hours of work a meal break is required | Common: after 5 or 6 hours. |
| Meal Break Window | Time range | Earliest and latest the break can be taken | E.g., must be taken between hours 3-5 of shift. |
| Break Staggering | Toggle + config | Whether breaks are staggered to maintain floor coverage | If enabled: max % of workforce on break simultaneously (default: 15%). |
| State/Province-Specific Overrides | Nested rule set | Jurisdiction-specific break rules that override defaults | E.g., California requires 10-min paid break every 4 hours, 30-min unpaid meal break before 5th hour. |

#### 6.3 Overtime Rules

| Rule | Type | Description |
|------|------|-------------|
| Overtime Approval Required | Toggle | Whether overtime requires manager pre-approval |
| Maximum Overtime Hours (Weekly) | Number | Cap on overtime per employee per week |
| Maximum Overtime Hours (Monthly) | Number | Cap on overtime per employee per month |
| Overtime Distribution Policy | Dropdown | How overtime is allocated: Voluntary First, Seniority-Based, Rotating, Lowest-Cost, Equalized |
| Mandatory Overtime Allowed | Toggle | Whether the employer can mandate overtime |
| Overtime Blackout Days | Date list | Days when overtime is not permitted (e.g., certain holidays) |

#### 6.4 Cross-Training Policies

| Rule | Type | Description |
|------|------|-------------|
| Cross-Training Allowed | Toggle | Whether employees can be assigned to processes outside their primary role |
| Cross-Training Limit | Percentage | Max % of shift spent on non-primary process |
| Skill Minimum for Cross-Assignment | Proficiency level | Minimum proficiency level to be assigned to a cross-trained process (default: Developing / 75%) |
| Cross-Site Assignment Allowed | Toggle | Whether employees can be temporarily moved to other sites |
| Cross-Site Notice Period | Days | Minimum advance notice for cross-site assignment |

#### 6.5 Seniority and Preference Rules

| Rule | Type | Description |
|------|------|-------------|
| Seniority Basis | Dropdown | Hire date, Role start date, or Custom ranking |
| Seniority Weight in Scheduling | Percentage (0-100) | How much seniority influences shift assignment (0 = ignored, 100 = strict seniority) |
| Shift Preference Honoring | Dropdown | Always (hard constraint), When Possible (soft constraint, weighted), Never |
| Vacation Priority | Dropdown | First-come-first-served, Seniority-based, Rotating |

#### 6.6 Union Rules (Shown if Union Presence = Yes in Phase 1)

| Rule | Type | Description |
|------|------|-------------|
| Contract Upload | File upload | Upload CBA (Collective Bargaining Agreement) for AI parsing |
| Bid Shift System | Toggle + config | Whether shifts are awarded by seniority bidding |
| Grievance Buffer | Minutes | Time added to shifts for union activities |
| Steward Scheduling | Toggle | Whether union stewards have scheduling protections |
| Overtime Equalization Period | Dropdown | Weekly, Monthly, Quarterly — period over which OT must be equalized |

### AI Assistance Offered

- **Jurisdiction Auto-Load**: "Your site in California, US has specific labor rules. I've loaded California's meal and rest break requirements, daily overtime rules (over 8 hours), and 7th-day overtime provisions. Review them below."
- **CBA Parsing**: "Upload your union contract and I'll extract scheduling rules, break requirements, overtime provisions, and seniority clauses automatically."
- **Conflict Detection**: "Your overtime policy allows up to 20 hours/week overtime, but your maximum weekly hours rule is set to 48 hours with a 40-hour base. That means overtime is actually capped at 8 hours/week. I've adjusted the overtime cap to match."
- **Regulation Updates**: "Note: effective January 2026, your jurisdiction updated minimum rest between shifts from 8 to 10 hours. I've applied this change."

### Validation Rules

- Maximum daily hours must be ≤ 24.
- Minimum rest between shifts must be ≥ (24 - maximum shift length) to avoid impossible schedules.
- Break rules must not consume more than 40% of the shift duration.
- Cross-training percentage + primary process time must ≤ 100%.
- If overtime is not allowed and available workforce cannot cover peak demand (from Phase 4/5 analysis), a warning is shown.

### Estimated Time

- US single-state operation: 10-12 minutes (most rules auto-loaded).
- Multi-state US operation: 15-20 minutes (review jurisdiction-specific overrides).
- EU multi-country operation: 20-30 minutes (significant variation between countries).
- Unionized operation: add 10-15 minutes for CBA rule entry.

---

## 9. Phase 7: Planning Preferences

### Purpose

Configure how the optimization engine should balance competing objectives when generating workforce plans. This is where organizational strategy meets mathematical optimization.

### Screen Description

A preferences dashboard with three main sections: Optimization Objectives, Tolerance Thresholds, and Approval Workflows. Each section uses visual sliders and priority rankings rather than raw numbers, making it accessible to non-technical users.

### Required Inputs

#### 7.1 Optimization Objectives

The user ranks and weights three primary objectives. Weights must sum to 100%.

| Objective | Description | Weight (Slider 0-100) | Default |
|-----------|-------------|----------------------|---------|
| Minimize Cost | Reduce total labor cost (base pay + overtime + agency premiums) | Variable | 40% |
| Maximize Coverage | Ensure every process has enough staff to meet demand | Variable | 40% |
| Balanced Workload | Distribute work evenly across employees (fairness) | Variable | 20% |

Secondary objectives (enabled/disabled with toggle):

| Objective | Description | Default |
|-----------|-------------|---------|
| Minimize Overtime | Prefer solutions with less overtime even if slightly more expensive | Enabled |
| Maximize Skill Utilization | Assign people to processes where they are most proficient | Enabled |
| Prefer Consistency | Keep employees on the same shift/process pattern week-to-week | Enabled |
| Minimize Cross-Training | Use cross-trained assignments only when necessary | Disabled |
| Maximize Employee Preferences | Honor shift and day-off preferences | Enabled |

#### 7.2 Tolerance Thresholds

| Threshold | Type | Description | Default |
|-----------|------|-------------|---------|
| Understaffing Tolerance | Percentage | How much understaffing is acceptable before flagging | 5% |
| Overstaffing Tolerance | Percentage | How much overstaffing is acceptable before flagging | 10% |
| Cost Overrun Alert | Percentage above budget | When to alert on labor cost exceeding plan | 8% |
| Forecast Accuracy Threshold | Percentage | Deviation between forecast and actual demand that triggers re-planning | 15% |
| Minimum Plan Confidence | Percentage | Below this confidence, plan is flagged for human review | 85% |

#### 7.3 Approval Workflows

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| Auto-Approve Plans | Toggle | Whether plans are published automatically when confidence > threshold | Disabled |
| Approval Chain | User list (ordered) | Who must approve plans and in what order | Site Manager → Regional Manager (if multi-site) |
| Approval Deadline | Hours before plan period starts | How far in advance plans must be approved | 48 hours |
| Escalation Rule | Configuration | What happens if approval deadline passes without action | Auto-approve if confidence > 90%; otherwise escalate to next level |
| Employee Notification Timing | Hours after plan approval | When employees are notified of their schedule | 2 hours after approval |
| Change Lockout Period | Hours before shift starts | Period during which scheduled changes require employee consent | 24 hours |

### Optional Inputs

| Field | Type | Description |
|-------|------|-------------|
| Budget Cap (per site, per week) | Currency | Hard ceiling on weekly labor cost per site |
| Target Agency Percentage | Percentage | Target ratio of agency/contingent to permanent staff |
| Preferred Overtime Distribution | Dropdown | Spread evenly vs. concentrate on willing employees |
| Re-Planning Trigger Rules | Configuration | Events that trigger automatic re-planning (e.g., demand change > 20%, employee callout affecting > 10% of staff) |
| Scenario Count | Number | How many alternative plans to generate per planning cycle (default: 3) |
| Planning Cycle | Dropdown | When plans are generated: Daily, Weekly, Bi-weekly |

### AI Assistance Offered

- **Objective Recommendation**: "Based on your industry (e-commerce fulfillment) and organization size, most similar organizations weight Coverage at 50%, Cost at 35%, and Balance at 15%. During peak season, they shift to Coverage 65%, Cost 25%, Balance 10%. Would you like to use these?"
- **Threshold Calibration**: "With your current workforce size and demand variability, a 5% understaffing tolerance means up to 3 FTEs short during peak. An 8% tolerance would give the optimizer more flexibility and reduce overtime by approximately 12%. Consider increasing to 8%."
- **Workflow Suggestion**: "For organizations your size with 10+ sites, I recommend a two-level approval chain: Site Manager approves operational details, Regional Manager approves cost overruns above budget. This balances speed with financial control."

### Validation Rules

- Optimization objective weights must sum to 100%.
- Understaffing tolerance cannot exceed 25% (safety limit).
- Approval deadline must be > change lockout period.
- If auto-approve is enabled, approval chain is informational only (notified, not gated).
- Budget cap (if set) must be achievable given minimum staffing requirements from Phase 3 and pay rates from Phase 5.

### Estimated Time

5-10 minutes. This phase is deliberately concise — most users accept defaults with minor adjustments.

---

## 10. Phase 8: Review & Activate

### Purpose

Provide a comprehensive summary of the entire configuration, run validation checks, generate an initial plan to verify everything works, and allow the user to go live.

### Screen Description

A multi-section summary page with collapsible panels for each prior phase. Each panel shows a summary card with key statistics and a "Review Details" link that opens the full configuration. At the top, a validation status banner shows either "All checks passed" (green) or "N issues found" (amber/red). At the bottom, a "Generate Test Plan" button and, after that succeeds, a "Go Live" button.

### Summary Panels

| Panel | Key Metrics Shown |
|-------|------------------|
| Organization | Company name, industry, planning horizon, # of sites |
| Sites | List with site name, type, operating model, shift count, headcount capacity |
| Processes | # of processes per site, unique demand drivers, total minimum staffing |
| Demand | # of demand sources, demand types, forecast horizon, integration status |
| Workforce | Total employees, breakdown by contract type, total FTEs, skill coverage percentage |
| Rules | # of active rules, jurisdictions configured, union sites flagged |
| Preferences | Optimization weights, approval workflow summary, tolerance settings |

### Validation Checks (Automated)

The system runs the following validation checks automatically:

| Check | Severity | Description |
|-------|----------|-------------|
| Skill Coverage | Error | Every process has at least one employee with the required skills |
| Demand-Process Mapping | Error | Every process has demand mapped, or is marked as support |
| Shift Coverage | Error | Available employee hours ≥ minimum staffing hours for every shift |
| Rule Consistency | Error | No contradictory rules (e.g., min rest > 24 - max shift) |
| Integration Connectivity | Error | All demand source connections are active and returning data |
| Timezone Consistency | Warning | All sites in same org have compatible timezone settings for cross-site planning |
| FTE Sufficiency | Warning | Available FTEs ≥ projected demand-driven FTE need within tolerance |
| Cost Feasibility | Warning | Projected labor cost within budget caps (if set) |
| Certification Expiry | Warning | Employees with certifications expiring within planning horizon |
| Data Freshness | Warning | Demand data is not stale (last update within expected refresh interval) |
| Proficiency Distribution | Info | Flags if a process relies solely on Trainee-level employees |
| Single Points of Failure | Info | Processes where only one employee has the required skill |

### Initial Plan Generation

After validation passes (or warnings are acknowledged), the user clicks "Generate Test Plan". The system:

1. Pulls the latest demand data (or uses sample data if no live connection).
2. Runs the optimization engine for one planning period.
3. Presents the result: a staffing plan showing headcount per process per shift per day.
4. Highlights any conflicts, unfilled slots, or overtime required.
5. Shows projected cost vs. budget.
6. Displays a "Plan Quality Score" (0-100) combining coverage, cost efficiency, and fairness metrics.

This test plan is not published — it is a dry run to verify the configuration produces reasonable results.

### Go-Live Confirmation

Once the user is satisfied with the test plan:

1. A confirmation dialog asks: "You are about to activate AstraPlanner for [Organization Name] with [N] sites and [M] employees. Plans will be generated on your configured schedule. Continue?"
2. The user selects the go-live date (default: now for immediate, or a future date for staged rollout).
3. The system records the activation event, sets the configuration to "Active", and schedules the first production plan generation.
4. A success screen shows: "AstraPlanner is now active. Your first plan will be generated at [datetime]. You'll be notified when it's ready for review."

### AI Assistance Offered

- **Configuration Review**: "I've reviewed your complete configuration. Here's my assessment: your setup is comprehensive for a mid-size e-commerce fulfillment operation. Two suggestions: (1) Your picking productivity standard of 180 UPH is aggressive — consider adding a 10% buffer. (2) You have no cross-training defined between Picking and Packing — this limits flexibility."
- **Issue Resolution**: For each validation error or warning, the AI offers a specific fix. "Skill Coverage Error: Process 'Hazmat Receiving' at Site CHI-DC-01 requires Hazmat Handling certification, but no employee at this site has it. Options: (a) assign certification to an existing employee, (b) remove the certification requirement, (c) mark this process as inactive."
- **Test Plan Analysis**: "Your test plan shows 94% coverage (6% understaffed during Monday morning peak). This is within your 8% tolerance. The understaffing is in Receiving — adding 2 trained employees to the Monday morning shift would bring coverage to 100%."

### Validation Rules

- All "Error" severity checks must pass before the plan can be generated.
- "Warning" checks can be acknowledged and bypassed.
- The test plan must generate successfully (optimization engine returns a feasible solution) before go-live is enabled.
- If the optimization engine returns an infeasible solution, the AI diagnoses the constraint conflict and suggests which rules to relax.

### Estimated Time

- Reviewing summary: 5-10 minutes.
- Fixing validation issues: 0-15 minutes (depends on issue count).
- Test plan generation and review: 3-5 minutes.
- Go-live confirmation: 1 minute.

---

## 11. Cross-Cutting Wizard Features

### Progress Persistence

- Every field change is auto-saved to the server within 2 seconds.
- The wizard can be closed and resumed at any point. Upon return, the user lands on the last incomplete phase.
- Multiple administrators can work on different phases simultaneously (with optimistic concurrency control and conflict resolution).

### Non-Linear Navigation

- After completing Phase 2, the sidebar navigation unlocks all phases, allowing users to jump to any phase.
- Phases 1 and 2 are locked as prerequisites because later phases depend on site and org data.
- A completeness indicator on each phase tab shows: "Not Started", "In Progress", "Complete", or "Needs Attention" (if retroactive validation failed).

### Multi-Language Support

The wizard UI is fully localized. All labels, tooltips, error messages, and AI suggestions are translated. However, user-entered data (site names, process names) remains in the language entered. The AI assistant responds in the language set in Phase 1.

### Accessibility

The wizard meets WCAG 2.1 AA compliance. All form fields have proper labels, focus management follows a logical tab order, error messages are announced by screen readers, and color is never the sole indicator of status.

### Audit Trail

Every configuration change is logged with timestamp, user identity, old value, and new value. This audit trail is preserved indefinitely and is accessible from the admin panel. It is critical for compliance in regulated industries (food, pharma).
