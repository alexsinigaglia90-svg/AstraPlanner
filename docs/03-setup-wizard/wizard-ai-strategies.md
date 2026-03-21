# Wizard AI Strategies

## 1. Overview

AstraPlanner's setup wizard offers five distinct AI-powered strategies for configuration. Each strategy represents a different interaction paradigm, suited to different user preferences, data availability, and complexity levels. Users can switch between strategies at any point, and strategies can be combined — for example, starting with Natural Language Setup and switching to Guided Interview for fine-tuning.

All five strategies share a common backend architecture: Claude serves as the AI backbone, processing user inputs through strategy-specific prompt pipelines and outputting structured configuration data that populates the wizard forms.

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INPUT LAYER                          │
│                                                             │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ ┌─────┐ │
│  │ Natural   │ │ Document │ │ Guided   │ │Clone │ │Bench│ │
│  │ Language  │ │ Upload   │ │Interview │ │& Mod │ │mark │ │
│  └─────┬─────┘ └────┬─────┘ └────┬─────┘ └──┬───┘ └──┬──┘ │
│        │             │            │           │        │     │
└────────┼─────────────┼────────────┼───────────┼────────┼─────┘
         │             │            │           │        │
         ▼             ▼            ▼           ▼        ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI PROCESSING LAYER                         │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Claude API (Backbone)                     │ │
│  │  - Entity extraction    - Document parsing             │ │
│  │  - Configuration inference  - Benchmark comparison     │ │
│  │  - Confidence scoring   - Clarification generation     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Validation  │  │   Industry   │  │  Fleet Learning  │  │
│  │  Engine      │  │   Knowledge  │  │  Database         │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              CONFIGURATION OUTPUT LAYER                      │
│                                                             │
│  Structured JSON → Wizard Form Population → User Review     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Strategy 1: Natural Language Setup

### 2.1 Concept

The user describes their operation in plain English (or any supported language). The AI parses the description, extracts configuration entities, and pre-fills the wizard forms. This strategy is ideal for users who can describe their operation fluently but find form-filling tedious.

### 2.2 User Interface

A full-screen text area with the prompt: "Describe your operation. Include details about your sites, what you do, your workforce, and how you plan today. The more detail you provide, the better I can configure AstraPlanner for you."

Below the text area, a "Process" button. After processing, a split view shows the original text on the left with highlighted entities, and the extracted configuration on the right as a structured summary with "Edit" links for each section.

### 2.3 Entity Extraction Pipeline

The AI processes the natural language input through a multi-stage pipeline:

**Stage 1: Entity Recognition**

The system identifies and classifies the following entity types:

| Entity Type | Examples | Maps To |
|-------------|----------|---------|
| Organization | "We're a mid-size 3PL", "our company handles e-commerce fulfillment" | Phase 1: Industry, Size |
| Sites | "three warehouses in Ohio", "our DC in Atlanta", "12 locations across the US" | Phase 2: Site list, types, locations |
| Processes | "we do picking, packing, and shipping", "our receiving team unloads 40 trucks a day" | Phase 3: Process definitions |
| Demand | "we ship about 15,000 orders a day", "volume doubles during holiday season" | Phase 4: Demand types, volumes |
| Workforce | "we have 200 full-time associates and bring in 50 temps during peak", "three shifts" | Phase 5: Headcount, contract types |
| Rules | "California labor laws", "our union contract requires 30-minute breaks every 4 hours" | Phase 6: Labor rules |
| Preferences | "we prioritize coverage over cost", "managers approve weekly schedules" | Phase 7: Optimization weights |

**Stage 2: Relationship Resolution**

After entities are extracted, the system resolves relationships:
- "Our Atlanta DC handles all Southeast orders" → Link demand to specific site
- "Forklift operators work receiving and putaway" → Map skills to processes
- "We need at least 5 people in picking at all times" → Minimum staffing for a process at a site

**Stage 3: Gap Detection**

The AI identifies what is missing from the description and generates follow-up questions (see Section 2.5).

### 2.4 Prompt Engineering for Entity Extraction

The system uses a structured prompt with Claude:

```
System Prompt:
You are an expert logistics configuration analyst. The user will describe
their warehouse/distribution operation in natural language. Your task is
to extract structured configuration data for a workforce planning system.

Extract the following entities. For each entity, provide:
- The extracted value
- The confidence level (high/medium/low)
- The source quote from the user's text
- Any ambiguities that need clarification

Output format: JSON matching the schema below.

{
  "organization": {
    "industry_vertical": { "value": "", "confidence": "", "source_quote": "" },
    "size_band": { "value": "", "confidence": "", "source_quote": "" },
    ...
  },
  "sites": [
    {
      "name": { "value": "", "confidence": "", "source_quote": "" },
      "type": { "value": "", "confidence": "", "source_quote": "" },
      "location": { "value": "", "confidence": "", "source_quote": "" },
      "operating_model": { "value": "", "confidence": "", "source_quote": "" },
      "shifts": { "value": "", "confidence": "", "source_quote": "" }
    }
  ],
  "processes": [...],
  "demand": {...},
  "workforce": {...},
  "rules": {...},
  "preferences": {...},
  "gaps": [
    {
      "field": "",
      "question": "",
      "importance": "critical|important|optional"
    }
  ]
}

Industry knowledge:
- Common logistics processes: receiving, putaway, picking (single, multi,
  batch, wave), packing, shipping/manifesting, returns processing,
  cycle counting, replenishment, VAS (kitting, labeling, gift wrap)
- Common demand types: orders, order lines, units, cases, pallets, trucks
- Standard productivity ranges by process type (provided in reference table)
- US state labor law variations (provided in reference table)

Be precise. Do not invent information not present in the user's description.
Mark inferred values as medium confidence. Mark explicit statements as
high confidence.
```

### 2.5 Example: Input and Output

**User Input:**
```
We're a mid-size e-commerce fulfillment company called FastShip based in
the US. We have two fulfillment centers — one in Reno, Nevada that handles
West Coast orders and one in Columbus, Ohio for East Coast. Both run 20
hours a day, 7 days a week with two shifts (6 AM to 4 PM and 2 PM to
midnight, with a 2-hour overlap for handoffs).

Our main processes are receiving (we get about 8 trucks a day at each
site), putaway, picking (mostly single-item picks, about 100 units per
hour per person), packing, and shipping. We also handle returns — about
15% of orders come back.

We ship around 25,000 orders a day across both sites (60% Reno, 40%
Columbus). Peak season is October through December when volume goes up
about 2.5x.

Each site has about 150 full-time associates and we bring in 80-100
temps during peak. We have team leads (1 per 15 associates) and
supervisors (1 per shift per site). Most associates are cross-trained
on at least 2 processes.

We're in Nevada and Ohio so no crazy labor laws but we follow standard
federal overtime rules. 30-minute unpaid lunch break per shift.
```

**AI Extracted Configuration:**

```json
{
  "organization": {
    "company_name": { "value": "FastShip", "confidence": "high", "source_quote": "called FastShip" },
    "industry_vertical": { "value": "e_commerce_fulfillment", "confidence": "high", "source_quote": "e-commerce fulfillment company" },
    "size_band": { "value": "medium", "confidence": "high", "source_quote": "mid-size" },
    "country": { "value": "US", "confidence": "high", "source_quote": "based in the US" }
  },
  "sites": [
    {
      "name": { "value": "Reno FC", "confidence": "high", "source_quote": "one in Reno, Nevada" },
      "type": { "value": "fulfillment_center", "confidence": "high", "source_quote": "fulfillment centers" },
      "location": { "value": "Reno, NV, US", "confidence": "high", "source_quote": "Reno, Nevada" },
      "operating_model": { "value": "extended", "confidence": "high", "source_quote": "20 hours a day" },
      "operating_days": { "value": ["mon","tue","wed","thu","fri","sat","sun"], "confidence": "high", "source_quote": "7 days a week" },
      "shifts": {
        "value": [
          { "name": "Day", "start": "06:00", "end": "16:00" },
          { "name": "Swing", "start": "14:00", "end": "00:00" }
        ],
        "confidence": "high",
        "source_quote": "6 AM to 4 PM and 2 PM to midnight"
      }
    },
    {
      "name": { "value": "Columbus FC", "confidence": "high", "source_quote": "one in Columbus, Ohio" },
      "type": { "value": "fulfillment_center", "confidence": "high", "source_quote": "fulfillment centers" },
      "location": { "value": "Columbus, OH, US", "confidence": "high", "source_quote": "Columbus, Ohio" },
      "operating_model": { "value": "extended", "confidence": "high", "source_quote": "20 hours a day" },
      "operating_days": { "value": ["mon","tue","wed","thu","fri","sat","sun"], "confidence": "high", "source_quote": "7 days a week" },
      "shifts": {
        "value": [
          { "name": "Day", "start": "06:00", "end": "16:00" },
          { "name": "Swing", "start": "14:00", "end": "00:00" }
        ],
        "confidence": "high",
        "source_quote": "6 AM to 4 PM and 2 PM to midnight"
      }
    }
  ],
  "processes": [
    {
      "name": { "value": "Receiving", "confidence": "high", "source_quote": "receiving" },
      "demand_driver": { "value": "trucks", "confidence": "medium", "source_quote": "8 trucks a day" },
      "productivity_standard": { "value": null, "confidence": "low", "source_quote": null },
      "note": "Trucks mentioned as volume indicator but productivity per labor hour not stated"
    },
    {
      "name": { "value": "Putaway", "confidence": "high", "source_quote": "putaway" },
      "demand_driver": { "value": "units", "confidence": "medium", "source_quote": null },
      "productivity_standard": { "value": null, "confidence": "low", "source_quote": null }
    },
    {
      "name": { "value": "Single-Item Picking", "confidence": "high", "source_quote": "mostly single-item picks" },
      "demand_driver": { "value": "units", "confidence": "high", "source_quote": "units per hour" },
      "productivity_standard": { "value": 100, "confidence": "high", "source_quote": "about 100 units per hour per person" }
    },
    {
      "name": { "value": "Packing", "confidence": "high", "source_quote": "packing" },
      "demand_driver": { "value": "orders", "confidence": "medium", "source_quote": null },
      "productivity_standard": { "value": null, "confidence": "low", "source_quote": null }
    },
    {
      "name": { "value": "Shipping", "confidence": "high", "source_quote": "shipping" },
      "demand_driver": { "value": "orders", "confidence": "medium", "source_quote": null },
      "productivity_standard": { "value": null, "confidence": "low", "source_quote": null }
    },
    {
      "name": { "value": "Returns Processing", "confidence": "high", "source_quote": "handle returns" },
      "demand_driver": { "value": "returns", "confidence": "high", "source_quote": "15% of orders come back" },
      "productivity_standard": { "value": null, "confidence": "low", "source_quote": null }
    }
  ],
  "demand": {
    "total_daily_orders": { "value": 25000, "confidence": "high", "source_quote": "25,000 orders a day" },
    "site_distribution": {
      "reno": { "value": 0.60, "confidence": "high", "source_quote": "60% Reno" },
      "columbus": { "value": 0.40, "confidence": "high", "source_quote": "40% Columbus" }
    },
    "peak_season": {
      "months": { "value": ["oct", "nov", "dec"], "confidence": "high", "source_quote": "October through December" },
      "multiplier": { "value": 2.5, "confidence": "high", "source_quote": "volume goes up about 2.5x" }
    },
    "return_rate": { "value": 0.15, "confidence": "high", "source_quote": "about 15% of orders" }
  },
  "workforce": {
    "per_site_fulltime": { "value": 150, "confidence": "high", "source_quote": "about 150 full-time associates" },
    "per_site_peak_temps": { "value": "80-100", "confidence": "high", "source_quote": "80-100 temps during peak" },
    "team_lead_ratio": { "value": "1:15", "confidence": "high", "source_quote": "1 per 15 associates" },
    "supervisors_per_shift": { "value": 1, "confidence": "high", "source_quote": "1 per shift per site" },
    "cross_training": { "value": "most on 2+ processes", "confidence": "high", "source_quote": "cross-trained on at least 2 processes" }
  },
  "rules": {
    "overtime": { "value": "federal_standard_40hr", "confidence": "high", "source_quote": "standard federal overtime rules" },
    "meal_break": { "value": "30_min_unpaid", "confidence": "high", "source_quote": "30-minute unpaid lunch break per shift" },
    "state_rules": {
      "nevada": { "value": "standard", "confidence": "medium", "source_quote": "no crazy labor laws" },
      "ohio": { "value": "standard", "confidence": "medium", "source_quote": "no crazy labor laws" }
    }
  },
  "gaps": [
    {
      "field": "processes.receiving.productivity_standard",
      "question": "What is the average time to unload a truck (in labor hours per truck)?",
      "importance": "critical"
    },
    {
      "field": "processes.putaway.productivity_standard",
      "question": "How many units per hour does an associate put away on average?",
      "importance": "critical"
    },
    {
      "field": "processes.packing.productivity_standard",
      "question": "How many orders per hour does a packer process on average?",
      "importance": "critical"
    },
    {
      "field": "processes.shipping.productivity_standard",
      "question": "How many orders per hour does a shipping associate process (manifesting, labeling)?",
      "importance": "critical"
    },
    {
      "field": "workforce.pay_rates",
      "question": "What are the base hourly pay rates for associates, team leads, and supervisors? (needed for cost optimization)",
      "importance": "important"
    },
    {
      "field": "demand.intra_day_distribution",
      "question": "How are orders distributed throughout the day? Do you have specific cut-off times for same-day shipping?",
      "importance": "important"
    },
    {
      "field": "workforce.availability_pattern",
      "question": "Are your 150 full-time associates all available for both shifts, or are they assigned to fixed shifts?",
      "importance": "important"
    },
    {
      "field": "sites.overlap_purpose",
      "question": "You mentioned a 2-hour overlap between shifts (2 PM - 4 PM). Is this for handoff training, peak coverage, or both?",
      "importance": "optional"
    }
  ]
}
```

**AI Response to User:**

"I've analyzed your description and pre-filled your AstraPlanner configuration. Here's what I extracted:

**Organization**: FastShip — E-commerce Fulfillment, Medium size, US-based.

**Sites**: 2 Fulfillment Centers:
- Reno FC (Nevada) — 60% of volume, 20-hr operations, 2 shifts with overlap
- Columbus FC (Ohio) — 40% of volume, same operating pattern

**Processes**: 6 identified — Receiving, Putaway, Picking (single-item at 100 UPH), Packing, Shipping, Returns Processing. I've applied industry-standard productivity rates for the 4 processes where you didn't specify rates.

**Demand**: 25,000 orders/day (15,000 Reno, 10,000 Columbus). Peak at 2.5x in Oct-Dec. 15% return rate.

**Workforce**: ~300 FT associates (150/site), ~90 temps in peak, 10 team leads/site, 2 supervisors/site. Cross-training active.

**Rules**: Federal OT (40 hr/week), 30-min unpaid meal break.

I have a few questions to fill in the gaps — the most important ones first. You can answer these now or skip and fill them in the wizard forms."

### 2.6 Confidence Thresholds for Auto-Fill

| Confidence Level | Criteria | Auto-Fill Behavior |
|-----------------|----------|-------------------|
| High (≥ 85%) | Explicitly stated in user text with unambiguous meaning | Auto-fills the field, shown with green confidence badge |
| Medium (60-84%) | Inferred from context or partially stated | Auto-fills the field, shown with amber confidence badge, marked for user review |
| Low (< 60%) | Not stated, guessed from industry defaults | Field left empty or filled with industry default, shown with red badge, user must confirm |

---

## 3. Strategy 2: Document Upload

### 3.1 Concept

Users upload existing operational documents — shift schedules, org charts, productivity reports, labor contracts, process maps — and the AI extracts configuration data from them. This strategy recognizes that most organizations already have their operational parameters documented somewhere, just not in a format AstraPlanner can consume directly.

### 3.2 Supported Document Types

| Document Type | Formats | What Gets Extracted |
|--------------|---------|-------------------|
| Shift Schedules | Excel (.xlsx), CSV, PDF (scanned with OCR) | Shift names, start/end times, employee assignments, days of week, rotation patterns |
| Org Charts | PDF, PowerPoint, Visio, image files | Roles, reporting relationships, headcounts per role, department structure |
| Productivity Reports | Excel, CSV, PDF | Process names, productivity standards (UPH), volume data, efficiency metrics |
| Labor Contracts / CBA | PDF, Word (.docx) | Break rules, overtime rules, seniority provisions, shift bidding rules, grievance procedures |
| Employee Rosters | Excel, CSV, HRIS exports | Employee names, IDs, roles, hire dates, skills, certifications, pay rates, availability |
| Process Documentation | PDF, Word, PowerPoint | Process names, steps, equipment requirements, quality standards, training requirements |
| Demand/Volume Reports | Excel, CSV | Historical demand volumes, seasonality patterns, demand types, daily/hourly distributions |
| Floor Plans | PDF, CAD exports, image files | Site layout, dock door counts, zone definitions, workstation counts (used for max concurrent workers) |

### 3.3 Document Processing Pipeline

```
Document Upload
    │
    ▼
Format Detection & Preprocessing
    │  - Determine file type
    │  - For images/scanned PDFs: OCR via Tesseract/Azure AI
    │  - For Excel: parse sheets, detect headers, identify data regions
    │  - For structured documents: parse sections, headings, tables
    │
    ▼
Content Classification
    │  - AI determines document type (schedule? contract? report?)
    │  - Assigns processing strategy
    │
    ▼
Entity Extraction (Claude)
    │  - Process through document-type-specific prompt
    │  - Extract structured data with confidence scores
    │
    ▼
Schema Mapping
    │  - Map extracted entities to AstraPlanner configuration fields
    │  - Resolve conflicts with existing configuration
    │
    ▼
User Review
    │  - Present extracted data alongside source document
    │  - Highlight sections where data was extracted
    │  - Allow accept/reject/modify per field
    │
    ▼
Configuration Population
    │  - Apply accepted values to wizard forms
```

### 3.4 Prompt Engineering for Document Parsing

**Shift Schedule Parsing Prompt:**

```
System Prompt:
You are an expert at parsing workforce shift schedules. The user will
provide the content of a shift schedule document (may be from Excel,
PDF, or other format). Your task is to extract the shift structure and
employee assignments.

Extract:
1. Shift definitions: name, start time, end time, days of week
2. Employee assignments: employee name/ID, assigned shift, assigned
   days, role (if indicated)
3. Rotation patterns: if employees rotate shifts, identify the pattern
   (e.g., weekly rotation, 2-week cycle)
4. Special patterns: split shifts, on-call schedules, flex schedules

Rules:
- Times should be in 24-hour format
- If the schedule uses abbreviations, resolve them
  (M=Monday, T=Tuesday, W=Wednesday, R/Th=Thursday, F=Friday,
  Sa=Saturday, Su=Sunday)
- If the schedule spans multiple weeks, identify if it's a rotation
  or fixed pattern
- Flag any ambiguities (e.g., "TBD", "floater", "as needed")

Output as structured JSON with confidence scores per extraction.
```

**Labor Contract Parsing Prompt:**

```
System Prompt:
You are an expert labor law analyst. The user will provide the content
of a labor contract or collective bargaining agreement. Your task is
to extract scheduling-relevant rules and constraints.

Extract the following categories of rules:

1. Working hours: maximum daily/weekly hours, standard work week
   definition
2. Overtime: threshold hours, pay multipliers, mandatory vs.
   voluntary, distribution rules, equalization requirements
3. Breaks: paid break duration/frequency, unpaid meal break
   duration/trigger, break timing windows
4. Rest periods: minimum hours between shifts, weekly rest
   requirements
5. Shift rules: shift bidding process, shift differential pay,
   rotation requirements, notice period for schedule changes
6. Seniority: how seniority is calculated, how it affects scheduling,
   vacation bidding, layoff order
7. Cross-training: restrictions on job assignments outside
   classification, temporary transfer rules
8. Holidays: recognized holidays, holiday pay rules, voluntary vs.
   mandatory holiday work

For each rule, provide:
- The extracted rule in structured format
- The exact quote from the contract
- The article/section number (if available)
- Any ambiguities or areas where interpretation is needed

Do NOT invent rules that are not in the contract. If a common rule
category is not addressed in the contract, note it as "Not specified
in contract — apply organizational default."
```

### 3.5 Example: Parsing an Excel Shift Schedule

**Input**: An Excel file with the following structure:

| Employee | Role | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|----------|------|-----|-----|-----|-----|-----|-----|-----|
| Smith, J | Picker | D | D | D | D | D | OFF | OFF |
| Jones, M | Picker | D | D | D | OFF | D | D | OFF |
| Williams, K | Packer | S | S | S | S | S | OFF | OFF |
| Brown, T | Lead | D | D | D | D | D | OFF | OFF |
| Davis, R | Receiver | D | D | D | D | D | OFF | OFF |
| Garcia, L | Picker | S | S | S | S | OFF | OFF | S |
| ...150 more rows... |

Where D = Day shift (06:00-14:30), S = Swing shift (14:30-23:00)

**AI Extraction:**
```json
{
  "shifts": [
    { "code": "D", "name": "Day", "start": "06:00", "end": "14:30", "confidence": "high" },
    { "code": "S", "name": "Swing", "start": "14:30", "end": "23:00", "confidence": "high" }
  ],
  "employees": [
    {
      "name": "Smith, J",
      "role": "Picker",
      "pattern": { "mon": "D", "tue": "D", "wed": "D", "thu": "D", "fri": "D", "sat": "OFF", "sun": "OFF" },
      "weekly_shifts": 5,
      "shift_type": "fixed_day",
      "confidence": "high"
    },
    ...
  ],
  "summary": {
    "total_employees": 155,
    "roles_found": ["Picker", "Packer", "Lead", "Receiver", "Shipper", "Returns"],
    "shift_distribution": { "Day": 98, "Swing": 57 },
    "day_distribution": { "5_day": 130, "6_day": 15, "variable": 10 },
    "patterns_detected": "Mostly fixed shifts with some weekend rotation"
  },
  "ambiguities": [
    { "employee": "Wilson, P", "issue": "Has 'F' on Thursday — unclear if this is a third shift or a typo", "recommendation": "Ask user to clarify 'F' code" }
  ]
}
```

### 3.6 Privacy and Data Handling for Uploaded Documents

| Concern | Handling |
|---------|---------|
| Document Storage | Documents are stored encrypted (AES-256) in the customer's dedicated storage partition. They are never shared across tenants. |
| AI Processing | Document content is sent to Claude's API for parsing. The API does not retain inputs or outputs beyond the request lifecycle. No training on customer data occurs. |
| PII Handling | Employee names, IDs, and pay rates extracted from documents are treated as PII. They are stored only in the customer's workforce database and are never included in fleet learning aggregations. |
| Document Retention | After extraction and user confirmation, the original document is retained for 90 days (configurable) for audit purposes, then automatically deleted. Users can delete immediately. |
| Access Control | Only users with "Admin" or "HR Manager" roles can upload documents containing employee data. The system logs all document uploads with user identity and timestamp. |
| Compliance | Document handling complies with GDPR (EU), CCPA (California), PIPEDA (Canada). Data processing agreements are available for enterprise customers. |
| Right to Delete | Users can request deletion of all uploaded documents and extracted data at any time. Deletion is confirmed within 24 hours and verified by automated audit. |

---

## 4. Strategy 3: Guided Interview

### 4.1 Concept

A conversational interface where the AI asks questions one at a time (or in small groups), building the configuration incrementally. This strategy is ideal for users who prefer dialogue over forms, or who are unsure what information is needed.

### 4.2 Conversation Design Principles

1. **Start broad, narrow down**: Begin with high-level questions ("What does your operation do?") before specific ones ("What's your picking productivity?").
2. **One concept per turn**: Never ask about shifts and productivity in the same question.
3. **Acknowledge and reflect**: After each answer, the AI confirms what it understood: "Got it — you run a 24/7 operation with 3 shifts. Let me set that up."
4. **Progressive complexity**: Start with simple questions. Only ask detailed questions if the user's answers indicate sophistication.
5. **Escape hatch**: At any point, the user can say "I'd rather fill this in the form" and the wizard switches to standard form view with whatever the AI has captured so far.

### 4.3 Interview Script Structure

The interview follows a decision-tree structure with conditional branches. Below is the top-level flow:

```
1. "Let's start with the basics. What type of logistics operation do you run?"
   │
   ├─ User describes operation
   │  AI: Classify industry, extract site count, identify key characteristics
   │
2. "How many sites do you have, and where are they located?"
   │
   ├─ User lists sites
   │  AI: Create site records, auto-detect types from descriptions
   │
3. [For each site, or for the first site as a template]
   "Tell me about [Site Name]. What are the main activities
    that happen there?"
   │
   ├─ User describes processes
   │  AI: Map to standard process library, ask for productivity details
   │
4. "How do you measure demand? What drives the work volume?"
   │
   ├─ User describes demand (orders, cases, etc.)
   │  AI: Create demand types, ask about volumes and patterns
   │
5. "Let's talk about your team. How many people work at [Site]
    and what roles do they have?"
   │
   ├─ User describes workforce
   │  AI: Create roles, estimate skill mappings
   │
6. "What scheduling rules do you follow? Any specific labor laws
    or contract requirements I should know about?"
   │
   ├─ User describes rules
   │  AI: Map to rule categories, auto-load jurisdiction defaults
   │
7. "Finally, what matters most when building your workforce plans?
    Keeping costs down, making sure every position is covered,
    or treating everyone fairly?"
   │
   ├─ User states priorities
   │  AI: Set optimization weights
   │
8. "Great — I've built a complete configuration based on our
    conversation. Let me walk you through it for your review."
```

### 4.4 Handling Ambiguity

When the user's answer is ambiguous, the AI uses specific clarification patterns:

**Pattern: Multiple Interpretation**
```
User: "We pick about 1,000 an hour."
AI: "Just to clarify — is that 1,000 units per hour for the entire
     picking team, or 1,000 units per hour per person?"
```

**Pattern: Missing Context**
```
User: "We have two shifts."
AI: "Got it — two shifts. What are the start and end times for each
     shift? And do both shifts run every day of the week?"
```

**Pattern: Inconsistency Detection**
```
User: "We run 24/7 with two 8-hour shifts."
AI: "I notice a gap — two 8-hour shifts cover 16 hours, which leaves
     8 hours uncovered for 24/7 operations. Do you have a third shift
     I should know about, or are those hours covered differently
     (perhaps with a skeleton crew or automation)?"
```

**Pattern: Jargon Resolution**
```
User: "We do wave picking and use a sorter for put-wall."
AI: "I'm setting up wave picking as a process. For the put-wall sort
     — is this a manual sortation process where employees sort items
     to order-specific slots, or is it automated sortation that requires
     an operator?"
```

### 4.5 Example Conversation

```
AI: Welcome to AstraPlanner! I'm going to help you set up your
    workforce planning system through a quick conversation. Let's
    start simple — what does your operation do?

User: We're a frozen food distributor. We supply grocery stores across
      the Midwest from our main DC in Indianapolis.

AI: Frozen food distribution — got it. I've set your industry to
    "Grocery/Food Distribution" and noted that you operate in cold
    chain. Your main site is a Distribution Center in Indianapolis.

    A few quick questions about Indianapolis:
    - What hours does the DC operate?
    - How many dock doors do you have (roughly)?

User: We run from 4 AM to midnight, Monday through Saturday. About
      20 inbound doors and 30 outbound.

AI: Set up: Indianapolis DC, operating 20 hours/day (04:00-00:00),
    Mon-Sat. 20 inbound docks, 30 outbound.

    For a frozen food DC operating 20 hours, most operations run
    2 shifts — something like 04:00-14:00 and 14:00-00:00. Does
    that match your setup?

User: Yeah, that's right. Day shift starts at 4, night shift at 2 PM.

AI: Perfect. Two shifts confirmed: Day (04:00-14:00), Night
    (14:00-00:00).

    Now, since you're frozen food, I know temperature management is
    critical. What temperature zones does your DC have?

User: Mostly frozen at -20F, but we have a small chilled section for
      dairy and a dry goods area for things like canned goods.

AI: Three temperature zones set up:
    - Frozen (-29°C / -20°F) — primary
    - Chilled (2-8°C / 35-46°F) — dairy
    - Ambient — dry goods

    I'll create separate receiving and picking processes for each
    zone since productivity rates differ significantly in frozen
    environments. Does that sound right?

User: Yes, frozen is definitely slower. Our pickers do maybe 120
      cases per hour in dry but only about 80 in the freezer.

AI: Makes sense — the 33% productivity reduction in frozen is
    typical (industry average is 30-40% reduction). I've set:
    - Dry picking: 120 cases/hr
    - Chilled picking: 100 cases/hr (estimated — does that sound right?)
    - Frozen picking: 80 cases/hr

    I'll also add mandatory freezer rotation rules — most frozen
    operations limit continuous freezer time to 90 minutes with a
    10-minute warm-up break. Do you follow something similar?

User: We do 60 minutes max in the freezer, then 15 minutes out.

AI: Updated: 60-minute maximum continuous freezer exposure, 15-minute
    warm-up break. This is stricter than average (90/10), which
    means you'll need more pickers to maintain the same throughput.
    I'll factor that into the staffing calculations.

    Let's talk about your workforce...
```

---

## 5. Strategy 4: Clone & Modify

### 5.1 Concept

Copy an existing site's configuration (from within the same organization or from a template library) and use AI to identify what needs to change. This is the fastest strategy for organizations expanding to new sites or onboarding sites with similar operational profiles.

### 5.2 Clone Sources

| Source | Description | Use Case |
|--------|-------------|----------|
| Existing Site (Same Org) | Clone from a site already configured in AstraPlanner | Opening a new warehouse similar to an existing one |
| Organization Template | Clone from a saved organizational template | Standardized rollout across many sites |
| Industry Template | Clone from AstraPlanner's built-in templates | First site setup using a known operational pattern |
| Peer Benchmark (Anonymized) | Clone from an anonymized configuration of a similar organization | New to the industry, want to start with proven patterns |

### 5.3 AI-Guided Modification Process

After cloning, the AI walks the user through a structured review:

```
Clone Applied: Chicago DC → Detroit DC

AI: I've cloned the configuration from Chicago DC to Detroit DC.
    Let me highlight what you'll likely need to change:

    MUST CHANGE:
    ✗ Address: Currently shows Chicago address → Enter Detroit address
    ✗ Timezone: Currently Central → Confirm Eastern
    ✗ Site-specific employee assignments: Chicago employees won't
      work at Detroit

    LIKELY DIFFERENT:
    ⚠ Shift times: Chicago runs 05:00-13:00 / 13:00-21:00 / 21:00-05:00.
      Detroit may have different optimal shift times due to local
      trucking patterns.
    ⚠ Peak capacity: Chicago is 250,000 sq ft with capacity for 180.
      What's Detroit's size?
    ⚠ State labor rules: Chicago (Illinois) has specific break rules.
      Detroit (Michigan) has different rules — I'll swap them
      automatically.

    PROBABLY THE SAME (but review):
    ✓ Process definitions and productivity standards
    ✓ Demand-to-process mappings
    ✓ Optimization preferences
    ✓ Cross-training policies

    Shall I walk you through each change, or do you want to jump to
    the forms and handle it yourself?
```

### 5.4 Differential Analysis

The AI generates a detailed diff between the source configuration and what the new site likely needs:

| Field | Source Value | Recommended Change | Reason |
|-------|-------------|-------------------|--------|
| Address | 123 Main St, Chicago, IL | Enter Detroit address | Different location |
| Timezone | America/Chicago (Central) | America/Detroit (Eastern) | Auto-detected from address |
| Break Rules | IL: 20-min meal within first 5 hrs | MI: No state meal break mandate (use federal/org policy) | Jurisdiction change |
| Site Manager | Jane Smith | TBD | Different site |
| Dock Doors (Inbound) | 15 | Review (depends on facility) | Physical property |
| Dock Doors (Outbound) | 20 | Review (depends on facility) | Physical property |
| Peak Capacity | 180 | Review (depends on facility) | Physical property |
| Shift Start Times | 05:00 / 13:00 / 21:00 | Likely 06:00 / 14:00 / 22:00 (Eastern timezone standard) | Regional pattern |

### 5.5 Smart Merge for Multi-Source Cloning

When a site combines characteristics from multiple sources (e.g., a new site that does e-commerce fulfillment like Site A but also handles returns like Site B), the AI can merge:

```
AI: You mentioned the new Phoenix site will handle both standard
    fulfillment (like your Reno FC) and returns processing (like
    your Columbus Returns Center).

    I'll merge the configurations:
    - From Reno FC: Receiving, Putaway, Picking, Packing, Shipping
      processes with their productivity standards and demand mappings
    - From Columbus Returns: Returns Receiving, Inspection, Grading,
      Restocking processes

    I'll combine the skill and role requirements from both sources.
    For employees who need to float between fulfillment and returns,
    I'll set up cross-training rules.

    One conflict to resolve: Reno FC uses a 2-shift model and
    Columbus Returns uses 1 shift. Which pattern should Phoenix follow?
```

---

## 6. Strategy 5: Benchmark Comparison

### 6.1 Concept

The AI compares the user's configuration against industry benchmarks and peer group data, flagging outliers and suggesting adjustments. This strategy is used after initial configuration (any method) to validate and improve the setup.

### 6.2 Benchmark Data Sources

| Source | Description | Update Frequency |
|--------|-------------|-----------------|
| AstraPlanner Fleet Data | Anonymized, aggregated configuration data from all deployments | Continuous (real-time aggregation) |
| Industry Research | Published benchmarks from WERC, MHI, Gartner, DC Velocity | Quarterly updates |
| Government Data | BLS labor statistics, OSHA injury rates by industry | Annual updates |
| Template Standards | AstraPlanner's curated template values | Maintained by domain experts |

### 6.3 Benchmark Comparison Report

After configuration, the AI generates a benchmark comparison report:

```
╔══════════════════════════════════════════════════════════════╗
║          BENCHMARK COMPARISON REPORT                         ║
║          FastShip — Reno FC                                  ║
║          Compared to: E-commerce FCs, US West, 10K-50K      ║
║          orders/day (n=89)                                   ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  PRODUCTIVITY STANDARDS                                      ║
║  ┌────────────────────┬──────┬──────────┬─────────────────┐  ║
║  │ Process            │ Yours│ Median   │ Assessment      │  ║
║  ├────────────────────┼──────┼──────────┼─────────────────┤  ║
║  │ Single-Item Pick   │ 100  │ 112      │ ⚠ Below median  │  ║
║  │ Packing            │ 50   │ 48       │ ✓ At benchmark  │  ║
║  │ Receiving          │ 30   │ 32       │ ✓ At benchmark  │  ║
║  │ Shipping           │ 110  │ 95       │ ⚠ Above median  │  ║
║  │ Returns Processing │ 22   │ 24       │ ✓ At benchmark  │  ║
║  └────────────────────┴──────┴──────────┴─────────────────┘  ║
║                                                              ║
║  STAFFING RATIOS                                             ║
║  ┌────────────────────┬──────┬──────────┬─────────────────┐  ║
║  │ Metric             │ Yours│ Median   │ Assessment      │  ║
║  ├────────────────────┼──────┼──────────┼─────────────────┤  ║
║  │ Orders / FTE / day │ 100  │ 92       │ ✓ Above median  │  ║
║  │ Team lead ratio    │ 1:15 │ 1:18     │ ⚠ More leads    │  ║
║  │ Supervisor ratio   │ 1:75 │ 1:60     │ ⚠ Fewer sups    │  ║
║  │ Agency % (peak)    │ 40%  │ 32%      │ ⚠ Higher agency │  ║
║  └────────────────────┴──────┴──────────┴─────────────────┘  ║
║                                                              ║
║  RECOMMENDATIONS                                             ║
║                                                              ║
║  1. Picking Productivity (100 vs. median 112 UPH):           ║
║     Your picking rate is 11% below the peer median.          ║
║     Common causes: manual pick-to-cart without voice/RF,     ║
║     long travel distances (large facility), or high SKU      ║
║     complexity. If you're using voice-directed picking, the  ║
║     median for voice pick is 125 UPH.                        ║
║     → Action: Verify your picking method and adjust.         ║
║                                                              ║
║  2. Shipping Productivity (110 vs. median 95):               ║
║     Your shipping rate is 16% above median. This is valid    ║
║     if you have automated manifesting/labeling. If manual,   ║
║     this may be optimistic.                                  ║
║     → Action: Confirm automation level in shipping.          ║
║                                                              ║
║  3. Agency Staff at 40% during peak:                         ║
║     Higher than peer median (32%). High agency % can reduce  ║
║     effective productivity by 15-20% due to training gaps.   ║
║     Consider building a seasonal workforce pool with         ║
║     returning workers.                                       ║
║     → Action: Review agency strategy.                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### 6.4 Outlier Detection Logic

The AI uses statistical methods to flag outliers:

1. For each numeric configuration value, compute the z-score against the peer group: `z = (user_value - peer_median) / peer_std_dev`.
2. Classification:
   - |z| < 1.0: Normal range → green checkmark
   - 1.0 ≤ |z| < 2.0: Notable deviation → amber warning with explanation
   - |z| ≥ 2.0: Significant outlier → red flag with strong recommendation to review
3. For non-numeric fields (shift patterns, rule configurations), the AI compares against the most common patterns in the peer group and flags uncommon choices.

### 6.5 Benchmark Comparison Prompts

```
System Prompt:
You are a logistics operations analyst comparing a customer's
configuration against industry benchmarks. For each outlier, provide:

1. What the outlier is (field, customer value, benchmark value)
2. Why it matters (impact on planning accuracy, cost, or coverage)
3. Common causes of this outlier (based on your logistics knowledge)
4. A specific, actionable recommendation

Tone: professional, non-judgmental, data-driven. Acknowledge that
outliers may be intentional and valid — always frame recommendations
as "consider" or "verify" rather than "you must change."

Do NOT flag values that are within 1 standard deviation of the median
as outliers — these are normal variation. Focus your analysis on the
2-3 most impactful outliers.
```

---

## 7. Claude as the AI Backbone

### 7.1 Why Claude

AstraPlanner uses Claude (Anthropic) as the backbone AI for all wizard strategies. The selection criteria:

| Requirement | Claude's Capability |
|-------------|-------------------|
| Structured output | Reliable JSON output with schema adherence for configuration extraction |
| Long context | Handles complete labor contracts (50-100 pages), large employee rosters, and multi-document uploads within a single context |
| Domain reasoning | Strong performance on logistics domain reasoning without fine-tuning, including understanding of shift patterns, labor laws, and process dependencies |
| Instruction following | Precisely follows extraction schemas and output formats, critical for automated form population |
| Multilingual | Supports all AstraPlanner-supported languages for both input and output |
| Safety | Does not hallucinate configuration values when data is absent — clearly marks low-confidence extractions |

### 7.2 API Integration Architecture

```
┌─────────────────────────────────────────────────────┐
│                AstraPlanner Backend                   │
│                                                     │
│  ┌──────────────────┐    ┌──────────────────────┐   │
│  │  Wizard Service   │───▶│  AI Gateway Service  │   │
│  │                  │    │                      │   │
│  │  - Manages state │    │  - Prompt assembly   │   │
│  │  - Validates     │    │  - Rate limiting     │   │
│  │  - Applies config│    │  - Response parsing  │   │
│  └──────────────────┘    │  - Caching           │   │
│                          │  - Retry logic       │   │
│                          │  - Cost tracking     │   │
│                          └──────────┬───────────┘   │
│                                     │               │
└─────────────────────────────────────┼───────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  Claude API       │
                            │  (Anthropic)      │
                            │                  │
                            │  Model: Claude   │
                            │  Max tokens: 4K  │
                            │  Temperature: 0.1│
                            │  (low for config │
                            │   extraction)    │
                            └──────────────────┘
```

### 7.3 Prompt Management

Prompts are managed as versioned assets in the codebase:

| Prompt | Version | Purpose | Avg Tokens (Input) | Avg Tokens (Output) |
|--------|---------|---------|-------------------|-------------------|
| `entity_extraction_v3` | 3.2.1 | Natural language → config entities | 2,000-5,000 | 1,500-3,000 |
| `document_parse_schedule_v2` | 2.1.0 | Shift schedule document → shift config | 3,000-15,000 | 1,000-2,000 |
| `document_parse_contract_v2` | 2.0.3 | Labor contract → rule config | 10,000-50,000 | 2,000-5,000 |
| `guided_interview_v3` | 3.0.0 | Conversational config building | 500-2,000/turn | 200-500/turn |
| `clone_diff_v1` | 1.1.0 | Identify changes needed after clone | 2,000-4,000 | 1,000-2,000 |
| `benchmark_compare_v2` | 2.0.1 | Compare config to benchmarks | 3,000-5,000 | 1,500-3,000 |
| `suggestion_generate_v3` | 3.1.0 | Generate field-level suggestions | 500-1,500 | 200-500 |
| `validation_diagnose_v1` | 1.0.2 | Diagnose and fix validation errors | 1,000-3,000 | 500-1,000 |

### 7.4 Temperature and Parameter Selection

| Use Case | Temperature | Top-P | Reasoning |
|----------|------------|-------|-----------|
| Configuration extraction | 0.1 | 0.95 | Near-deterministic; we want consistent, precise extraction |
| Suggestion generation | 0.3 | 0.95 | Slight creativity for natural-sounding suggestions, but still grounded |
| Guided interview | 0.4 | 0.95 | More conversational, but still factually grounded |
| Benchmark analysis | 0.2 | 0.95 | Analytical, data-driven, but needs natural language output |
| Clarification questions | 0.3 | 0.95 | Needs to be contextually appropriate and natural |

### 7.5 Error Handling and Fallbacks

| Failure Mode | Detection | Fallback |
|-------------|-----------|----------|
| API timeout (> 30s) | Request timeout | Retry once with shorter context. If still fails, show manual form with message: "AI assistant is temporarily unavailable. You can fill in the form manually." |
| Malformed JSON response | JSON parse failure | Retry with explicit JSON formatting instruction appended. If still fails, log and fallback to manual. |
| Low confidence across all fields | All confidence scores < 60% | Show extraction results but do not auto-fill. Message: "I wasn't able to confidently extract configuration from your input. Here's my best interpretation — please review carefully." |
| Rate limit hit | 429 response | Queue request with exponential backoff. Show: "Processing your request — this may take a moment during busy periods." |
| Content filter triggered | API returns refusal | Log the input for review. Show: "I wasn't able to process that input. Try rephrasing or use the manual form." |
| Service outage | Multiple consecutive failures | Switch to fully manual mode. Display: "AI assistance is currently unavailable. All wizard features are fully functional in manual mode." |

---

## 8. Confidence Scoring Deep Dive

### 8.1 Scoring Model

Every AI-extracted configuration value receives a confidence score from 0 to 100. The score is a composite of three factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Source Strength | 40% | How directly the value was stated (explicit quote = 100, inferred = 50, industry default = 20) |
| Consistency | 30% | Whether the value is consistent with other extracted values (e.g., 100 UPH picking is consistent with "manual pick" but inconsistent with "goods-to-person automation") |
| Benchmark Alignment | 30% | Whether the value falls within expected ranges for the industry/site type (within 1 SD = 100, within 2 SD = 70, beyond 2 SD = 40) |

### 8.2 Confidence-Based UI Behavior

| Score | Badge | Auto-Fill | User Action Required |
|-------|-------|-----------|---------------------|
| 85-100 | Green "High Confidence" | Yes, field is populated | None (but can edit) |
| 60-84 | Amber "Review Suggested" | Yes, field is populated | Field is highlighted; user is prompted to confirm |
| 40-59 | Red "Low Confidence" | No, field shows suggested value in placeholder | User must explicitly accept or enter their own value |
| 0-39 | Gray "Insufficient Data" | No, field is empty | User must enter value manually; AI provides tooltip with best guess |

### 8.3 Aggregate Confidence

The overall extraction confidence is the weighted average of all field confidences, weighted by field importance (Essential fields weighted 2x vs. Advanced fields). This aggregate score is shown prominently:

- "I'm 91% confident in this configuration" → Most fields can be auto-applied.
- "I'm 68% confident — several fields need your review" → Guided review of amber/red fields.
- "I'm 42% confident — I need more information" → AI triggers follow-up questions or suggests switching to guided interview strategy.

---

## 9. Handling Ambiguity and Clarification

### 9.1 Ambiguity Classification

| Ambiguity Type | Example | AI Response Pattern |
|----------------|---------|-------------------|
| **Lexical** | "We do about a thousand" (1,000 what?) | "When you say 'about a thousand,' is that orders, units, or cases?" |
| **Referential** | "The big warehouse handles most of the volume" (which warehouse?) | "Which of your sites is 'the big warehouse'? Is that the Reno FC?" |
| **Quantitative** | "We have a lot of turnover" (how much?) | "When you say 'a lot of turnover,' is that roughly 20%, 50%, or more annually? This affects how I set up learning curves." |
| **Temporal** | "We're busy in the fall" (Sep-Nov? Oct-Dec?) | "Which months does your fall peak cover — September through November, or October through December?" |
| **Scope** | "Overtime is rare" (< 5%? < 10%? < 20%?) | "Is overtime rare meaning less than 5% of shifts, or occasionally occurring but not a regular pattern?" |
| **Contradiction** | "We run 24/7" + "we close on Sundays" | "You mentioned running 24/7, but also that you close on Sundays. Should I set you up as Monday-Saturday 24 hours, with Sundays closed?" |

### 9.2 Clarification Strategy

The AI batches clarification questions to avoid overwhelming the user. The approach:

1. After initial extraction, rank all ambiguities by importance (critical fields first).
2. Group related ambiguities (all productivity questions together, all scheduling questions together).
3. Present the top 3-5 most important clarifications first.
4. For lower-importance ambiguities, use best-guess defaults and flag them for review.
5. Never ask more than 5 clarification questions at once — if more exist, present them in subsequent rounds.

### 9.3 Clarification Prompt Pattern

```
System Prompt:
The user provided a description of their logistics operation. You
extracted configuration data but have ambiguities. Generate
clarification questions that:

1. Are specific and close-ended (provide 2-3 options when possible)
2. Explain why you're asking (what it affects in the configuration)
3. Are ordered from most to least important
4. Include your best guess so the user can confirm rather than compose

Format each question as:
- Question text
- Why it matters (1 sentence)
- Your best guess (if any)
- Options (if applicable)

Maximum 5 questions per batch.
```

**Example Output:**

```
I have a few questions to fill in the gaps:

1. What is your average packing rate per associate?
   This determines how many packers you need per shift.
   My best guess based on your operation: ~45 orders/hour.
   Is that close?

2. Are your 150 associates assigned to fixed shifts, or do
   they rotate between Day and Swing shifts?
   This affects how I model availability and shift preferences.
   Most operations your size use fixed shift assignments.

3. You mentioned 80-100 temps during peak. When does peak
   staffing start and end?
   I need this to plan the ramp-up. Based on your Oct-Dec peak
   season: do temps start in early October or mid-September
   (for training)?

4. What is your order cut-off time for same-day shipping?
   This determines the intra-day demand distribution. Common
   cut-offs are 2 PM or 5 PM for next-day ground, noon for
   same-day.

5. Do you use any automation in shipping (auto-labeling, auto-
   manifest, conveyor/sortation to carrier lanes)?
   Your shipping productivity of 110/hr is above median, which
   makes sense if you have automation.
```

---

## 10. Fallback to Manual Entry

### 10.1 When Fallback Occurs

The system falls back to manual form entry when:

| Trigger | Threshold | User Experience |
|---------|-----------|-----------------|
| AI confidence too low across most fields | Aggregate confidence < 40% | "I wasn't able to extract enough from your input. Let's switch to the form-based setup — I've filled in what I could." |
| User explicitly requests it | "I'd rather fill this in myself" | Immediately switch to standard form view, preserving any AI-populated values. |
| Document is unparseable | OCR confidence < 50%, or document type unrecognized | "I couldn't parse this document reliably. You can try a different format (Excel works best for schedules) or enter the data manually." |
| Repeated clarification loops | User has been asked 3+ rounds of clarification without resolution | "It seems like there's too much complexity for me to capture conversationally. Let's switch to the detailed form where you can see all the fields and fill them in precisely." |
| AI service unavailable | Service outage or rate limiting | "AI assistance is temporarily unavailable. The full wizard is available in manual mode — all features work without AI." |

### 10.2 Graceful Degradation

The wizard is fully functional without AI. Every feature that AI enhances has a manual alternative:

| AI Feature | Manual Alternative |
|-----------|-------------------|
| Natural language extraction | Standard form entry |
| Document parsing | Manual data entry or CSV upload with column mapping UI |
| Smart defaults | Industry template selection |
| Guided interview | Step-by-step wizard forms |
| Benchmark comparison | Static benchmark reference tables in help documentation |
| AI suggestions | Tooltip help text with best practices |
| Validation diagnosis | Error messages with links to relevant documentation |

### 10.3 Partial AI Assistance

The most common mode is partial AI assistance — the AI fills what it can confidently, and the user completes the rest manually. The UI clearly distinguishes:

- Fields with green badges: AI-populated, high confidence.
- Fields with amber badges: AI-populated, review recommended.
- Fields with no badge: User-entered or empty.
- Fields with a sparkle icon: AI suggestion available but not auto-applied (click to see).

---

## 11. Cross-Strategy Integration

### 11.1 Strategy Switching

Users can switch between strategies at any point. The wizard maintains a unified configuration state that all strategies read from and write to.

**Common switching patterns:**

| Starting Strategy | Switch To | Trigger |
|------------------|-----------|---------|
| Natural Language | Guided Interview | AI needs more detail than the description provided |
| Natural Language | Manual Entry | User wants precise control over specific fields |
| Document Upload | Guided Interview | Document was partial; AI asks follow-up questions |
| Guided Interview | Clone & Modify | User mentions "this site is just like our Chicago DC" |
| Any | Benchmark Comparison | After initial config, user wants to validate against industry data |

### 11.2 Multi-Strategy Workflow Example

1. **Start**: User begins with Natural Language Setup, describing their operation in 3 paragraphs. AI extracts 70% of the configuration at high confidence.
2. **Enhance**: User uploads an Excel shift schedule. AI parses and fills Phase 2 shift definitions and Phase 5 employee availability patterns, bringing coverage to 85%.
3. **Refine**: User enters Guided Interview mode for the remaining gaps. AI asks 8 targeted questions about productivity standards and break rules.
4. **Expand**: User uses Clone & Modify to replicate the first site's configuration to 4 additional sites, with AI highlighting what needs to change per site.
5. **Validate**: User runs Benchmark Comparison to verify the entire configuration against industry data. AI flags 2 outliers; user adjusts.
6. **Activate**: Configuration confidence score: 94%. User proceeds to go-live.

Total time with multi-strategy approach: approximately 90 minutes for a 5-site operation — versus an estimated 20+ hours of manual configuration.

---

## 12. Metrics and Continuous Improvement

### 12.1 AI Strategy Effectiveness Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Extraction Accuracy | % of AI-populated fields that users accept without modification | > 80% |
| Confidence Calibration | Correlation between confidence scores and actual acceptance rates | r > 0.85 |
| Strategy Adoption | % of setups that use at least one AI strategy | > 90% |
| Time Savings | Wizard completion time with AI vs. estimated manual time | > 50% reduction |
| Clarification Rounds | Average number of follow-up question rounds needed | < 2 |
| Fallback Rate | % of setups that fall back to fully manual mode | < 5% |
| Configuration Quality | Average Configuration Confidence Score at go-live | > 80 |
| First-Plan Acceptance | % of first generated plans approved without changes | > 70% |

### 12.2 Feedback Loop

Every AI interaction generates telemetry that feeds back into system improvement:

1. **Acceptance/Rejection tracking**: When a user modifies an AI-populated field, the original AI value and the user's correction are logged (anonymized).
2. **Prompt refinement**: Monthly analysis of low-accuracy extractions identifies prompt improvements. Version-controlled prompt updates are tested against historical inputs before deployment.
3. **Template updates**: When fleet data shows consistent deviations from template defaults (e.g., the template says 120 UPH for picking but 80% of users change it to 100), the template default is updated.
4. **New pattern detection**: When multiple users describe operations that don't match any existing template (e.g., "drone delivery staging"), the system flags this for template development.
5. **Benchmark recalibration**: Quarterly recalculation of benchmark statistics as the fleet grows and diversifies.
