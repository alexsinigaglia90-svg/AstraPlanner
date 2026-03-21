# Gap Analysis

## 1. Introduction

This document provides an honest assessment of the gaps between AstraPlanner's current architecture and a production-ready, enterprise-grade workforce planning platform. Each gap is analyzed for its impact on the MVP, the effort required to close it, the recommended phase for addressing it, and practical workarounds until the gap is closed.

AstraPlanner's core strength is the demand-to-assignment pipeline: Demand -> Workload -> FTE -> Assignment. The gaps identified here are capabilities that surround, feed into, or consume the output of this core pipeline. Some gaps are acceptable at MVP (addressed via integrations or workarounds), while others become critical at enterprise scale.

---

## 2. Gap Inventory

### Gap 1: Forecasting Engine

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner's current design assumes demand forecasts are produced by external systems (ERP demand planning, WMS order pipelines, or manual CSV uploads) and consumed as input. Many logistics organizations -- particularly mid-market (100-500 employees, 5-20 sites) -- do not have sophisticated demand planning systems. They rely on tribal knowledge, last-year-same-week assumptions, or no forecasting at all. Without an internal forecasting engine, these organizations cannot use AstraPlanner effectively because they cannot provide the demand inputs the system requires. |
| **Current State** | Demand ingestion pipeline accepts external forecasts. No internal forecast generation capability. |
| **What's Missing** | (1) Statistical forecasting models: ARIMA, exponential smoothing, and Prophet for time-series demand prediction based on historical patterns. (2) Seasonal decomposition: automatic detection of weekly, monthly, and annual seasonality in demand. (3) Event-driven adjustments: incorporation of known events (promotions, holidays, weather) as demand modifiers. (4) Forecast accuracy tracking: comparing forecasted demand to actual demand and reporting accuracy metrics (MAPE, WMAPE, bias). (5) Multiple forecast horizons: short-term (1-7 days, high accuracy), medium-term (1-12 weeks, moderate accuracy), long-term (3-18 months, directional). |
| **Impact on MVP** | **High.** Without a built-in forecast, the addressable market is limited to organizations with existing demand planning systems. Mid-market customers -- the likely early adopters -- are excluded. |
| **Effort to Close** | **Large** (3-4 months, 2 engineers). Requires: time-series modeling library integration (Prophet, statsforecast), historical data storage and retrieval, forecast generation pipeline, accuracy tracking, and UI for forecast review and adjustment. |
| **Recommended Phase** | **V2** (Post-MVP, pre-enterprise GA). Ship MVP with external forecast support. Build forecasting engine as the first major V2 feature. |
| **Workaround Until Built** | (1) Provide a "simple forecast" tool: Excel template that customers fill in with last-year demand + growth factor. The template outputs a CSV in AstraPlanner's demand format. (2) Offer a "last-period repeat" mode: the system copies last week's actual demand (from T&A integration) as next week's forecast, with a configurable growth/shrink multiplier. (3) Partner with a demand planning SaaS (e.g., Lokad, Blue Yonder) for customers who need sophisticated forecasting, providing a pre-built integration. |

---

### Gap 2: Mobile Application

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner's current design is web-only (Next.js responsive web application). Frontline supervisors who manage workforce allocation on the floor need a mobile experience -- they are walking the warehouse, not sitting at a desk. Key mobile use cases: (a) view today's plan and assignments while on the floor; (b) mark employees as present/absent; (c) reassign employees in response to floor conditions; (d) receive alerts (absence, demand change, safety event); (e) approve plan changes from a phone while away from the office. A responsive web app partially addresses these needs, but lacks offline capability, push notifications, and the speed of a native experience. |
| **Current State** | Responsive web design accessible on mobile browsers. No native app. No offline support. No push notifications. |
| **What's Missing** | (1) Native mobile application (iOS + Android) or a Progressive Web App (PWA) with offline support. (2) Push notifications for critical alerts (mass absence, plan approval requests, demand spikes). (3) Offline mode: view today's plan and record attendance even without network connectivity, syncing when connectivity is restored. (4) Barcode/QR scanning for employee check-in at workstations. (5) Simplified mobile-optimized UI for the 5-6 actions supervisors perform most frequently. |
| **Impact on MVP** | **Medium.** MVP can launch with responsive web. However, supervisor adoption will be lower without a purpose-built mobile experience. Early feedback from pilots will likely surface mobile as a top request. |
| **Effort to Close** | **Large** (4-6 months, 2-3 engineers). Options: (a) React Native app sharing logic with web (3-4 months); (b) PWA with service workers (2-3 months, less capable); (c) Native iOS + Android (6-8 months, best experience). Recommended: PWA for V2, native for V3. |
| **Recommended Phase** | **V2** (PWA) / **V3** (Native). |
| **Workaround Until Built** | (1) Optimize the responsive web layout for tablet (10" screen is common on warehouse floors). (2) Use the browser's "Add to Home Screen" to create a pseudo-app experience. (3) Integrate with existing mobile communication tools (Slack, Teams, WhatsApp) for push notifications via webhooks. (4) Provide a printable daily plan PDF that supervisors can carry on the floor. |

---

### Gap 3: Employee Self-Service Portal

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner currently has no employee-facing interface. Employees do not see their own schedules in the system, cannot request shift swaps, cannot indicate preferences (preferred shifts, processes, days off), and cannot submit availability or time-off requests. All communication about schedules happens outside the system (printed schedules, email, verbal). This creates friction: planners must manually incorporate employee preferences, availability changes are delayed, and shift swap requests require planner intervention for every transaction. |
| **Current State** | No employee-facing UI. Plans are communicated externally (print, email, posted schedule). |
| **What's Missing** | (1) Employee web/mobile portal: view my upcoming schedule, view my assigned process and zone, view my skills and certifications. (2) Availability submission: "I'm not available next Thursday" with approval workflow. (3) Shift swap marketplace: "I want to trade my Tuesday morning for a Wednesday afternoon" -- system validates skill compatibility and constraint compliance, then routes for approval. (4) Preference capture: preferred shift patterns, preferred processes, blackout dates, overtime willingness. (5) Notification delivery: "Your schedule for next week has been published" via email, SMS, or push. (6) Self-service time-off requests integrated with the planning engine. |
| **Impact on MVP** | **Medium.** MVP can function without employee self-service because the planner manages all assignments. However, the absence of self-service increases planner workload and reduces employee satisfaction. For organizations with 500+ employees, manual preference management becomes unsustainable. |
| **Effort to Close** | **Medium** (2-3 months, 2 engineers). The data model already contains employee and assignment data. The gap is primarily UI/UX: building the employee-facing views, the swap workflow, and the notification system. |
| **Recommended Phase** | **V2.** This is a significant value-add that differentiates AstraPlanner from planning-only tools. |
| **Workaround Until Built** | (1) Export plans to PDF or CSV for distribution to employees via email or posting. (2) Accept availability and preference data via a Google Form or Microsoft Form that exports to CSV, imported into AstraPlanner. (3) Shift swap requests handled via a shared spreadsheet or existing communication channels, with the planner manually updating the plan. |

---

### Gap 4: Payroll Calculation

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner generates workforce plans that include planned hours per employee per day. However, it does not calculate pay: no gross pay computation, no overtime premium calculation, no differential pay (night shift, weekend, holiday), no tax withholding, and no payroll export in standard payroll system formats. The planned hours are the input to payroll, but translating hours into pay requires: (a) pay rate lookup per employee per pay type; (b) overtime rule application (daily, weekly, California, FLSA); (c) premium calculations (shift differential, holiday multiplier, hazard pay); (d) benefit deductions; (e) tax calculations. This is a deep domain with significant regulatory complexity. |
| **Current State** | Plans include hours per employee. No pay calculations. No payroll system integration. |
| **What's Missing** | (1) Pay rate storage per employee (base rate, overtime rate, differential rates). (2) Overtime calculation engine respecting jurisdiction-specific rules. (3) Cost projection: estimated labor cost per plan, per site, per process. (4) Payroll export: generate files in formats consumed by ADP, Paychex, Workday Payroll, or generic CSV. (5) Actual vs. budget comparison: planned labor cost vs. actual payroll. |
| **Impact on MVP** | **Low for planning, High for ROI demonstration.** Planning works without payroll, but demonstrating labor cost savings (the primary ROI metric) requires cost visibility. Without it, AstraPlanner says "you need 12 fewer FTEs on Tuesday" but cannot say "that saves you $4,200." |
| **Effort to Close** | **Large** (4-6 months, 2-3 engineers for full payroll calculation). **Medium** (1-2 months, 1 engineer for cost projection only -- without tax, deductions, or payroll export). |
| **Recommended Phase** | **V1 (MVP): Cost projection only** (planned hours x pay rate = estimated cost). **V2: Overtime calculation and payroll export.** **V3: Full payroll calculation** (or never -- better to integrate with payroll systems). |
| **Workaround Until Built** | (1) V1 cost projection: store base pay rate per employee. Calculate `planned_cost = SUM(hours * base_rate)` with a configurable overtime multiplier (default 1.5x for hours > 40/week). This is approximate but sufficient for cost comparison and savings estimation. (2) For payroll export, provide a CSV export of planned hours per employee per day that payroll teams can import into their payroll system manually. |

---

### Gap 5: Time and Attendance Integration

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner generates plans (what should happen) but has no visibility into what actually happens. Without time and attendance (T&A) data -- clock-in, clock-out, break timestamps -- the system cannot: (a) compare planned vs. actual headcount in real time; (b) detect no-shows and trigger absence management workflows; (c) calculate plan accuracy metrics; (d) feed actuals back into the planning engine for calibration (e.g., adjusting absence rates, actual productivity vs. planned productivity). The plan-vs-actual feedback loop is essential for continuous improvement and is cited by operations managers as the #1 capability that builds trust in a planning tool. |
| **Current State** | No T&A integration. No actual vs. planned comparison. Plans are "fire and forget." |
| **What's Missing** | (1) T&A system integrations (Kronos/UKG, ADP, Deputy, Time Doctor, biometric systems). (2) Real-time attendance tracking: which planned employees are actually on site? (3) Absence detection: employee was planned but has not clocked in within 30 minutes of shift start -> trigger absence alert. (4) Actual hours recording: how many hours did each employee actually work? (5) Plan accuracy dashboard: planned headcount vs. actual headcount by time slot, by process. (6) Variance analysis: systematic over/understaffing patterns that inform future planning. |
| **Impact on MVP** | **High.** Without T&A integration, the plan-reality feedback loop is broken. This is the gap most frequently cited by operations professionals evaluating workforce planning tools. Without it, AstraPlanner is a planning tool; with it, AstraPlanner is a workforce management platform. |
| **Effort to Close** | **Medium** (2-3 months, 1-2 engineers). The integration is relatively straightforward (T&A systems have well-established APIs). The complexity is in real-time processing and the plan-vs-actual comparison engine. |
| **Recommended Phase** | **V1 (MVP): Basic integration with 2-3 major T&A providers.** Focus on attendance tracking (present/absent) and plan accuracy metrics. Real-time processing can use batch sync (every 15 minutes) rather than streaming. |
| **Workaround Until Built** | (1) Manual attendance recording: provide a simple "mark present/absent" toggle in the plan view for supervisors. This captures attendance data without T&A integration. (2) End-of-shift actual hours entry: supervisors enter actual hours worked per employee at shift end. (3) CSV import of T&A data from the T&A system for next-day plan accuracy reporting. |

---

### Gap 6: Advanced Analytics and BI

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner includes basic dashboards: headcount by site, utilization by process, plan status. However, enterprise customers need advanced analytics capabilities that go beyond operational dashboards: (a) trend analysis across months and years; (b) predictive attrition modeling (which employees are likely to leave and what's the planning impact?); (c) cost modeling and scenario comparison (what if overtime costs increase 20%? what if we add a third shift?); (d) benchmarking across sites (which sites are most efficient? which have the highest overtime ratio?); (e) custom report builder for ad-hoc analysis; (f) scheduled report delivery (email weekly KPI summary to executives). |
| **Current State** | Basic dashboards for operational metrics. No trend analysis, no predictive analytics, no custom reporting. |
| **What's Missing** | (1) BI integration layer: connect AstraPlanner data to external BI tools (Tableau, Power BI, Looker) via a semantic layer or direct database access. (2) Embedded analytics: in-app advanced charting with drill-down, filtering, and comparison capabilities. (3) Predictive models: attrition prediction, demand trend forecasting, skill gap projection. (4) Custom report builder: drag-and-drop report designer for ad-hoc queries. (5) Scheduled reports: automated report generation and delivery on configurable schedules. (6) Data export API: well-documented API for data extraction by customer BI teams. |
| **Impact on MVP** | **Low.** MVP customers will accept basic dashboards. Advanced analytics becomes a differentiator at Growth phase and a requirement at Enterprise phase. |
| **Effort to Close** | **Large** (6+ months for full BI capabilities). **Small** (2-4 weeks for BI tool connectivity via read-only database access or API). |
| **Recommended Phase** | **V1 (MVP): BI tool connectivity** (read-only database credentials or data export API). **V2: Embedded analytics, scheduled reports.** **V3: Predictive models, custom report builder.** |
| **Workaround Until Built** | (1) Provide read-only database access (via Supabase's direct connection) for customers to connect their own BI tools. Include a data dictionary documenting key tables and relationships. (2) Export plan data, headcount summaries, and utilization metrics to CSV for analysis in Excel or Google Sheets. (3) Pre-built Power BI / Tableau template dashboards that connect to AstraPlanner's data model. |

---

### Gap 7: Workflow Engine

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner describes several approval workflows: plan approval, overtime approval, constraint override approval, and schedule change approval. The current design treats each workflow as a bespoke feature. There is no generic workflow engine that supports: (a) configurable approval chains (single approver, sequential multi-approver, parallel approval); (b) escalation rules (auto-escalate after 24 hours of no action); (c) conditional routing (overtime > 20 hours requires VP approval; overtime < 20 hours requires site manager approval); (d) workflow audit trail; (e) custom workflows defined by the customer without code changes. Without a generic engine, every new approval workflow requires custom development. |
| **Current State** | Plan approval is a simple status toggle (draft -> approved). No multi-step approval, no escalation, no conditional routing. |
| **What's Missing** | (1) Workflow definition language or visual designer. (2) Configurable approval chains with roles, conditions, and timeouts. (3) Escalation engine: automatic escalation when actions are not taken within SLA. (4) Delegation: "I'm on vacation; delegate my approvals to [Person]." (5) Workflow analytics: average approval time, bottleneck identification, SLA compliance. (6) Webhook triggers: fire external events on workflow state changes (e.g., notify Slack when a plan is approved). |
| **Impact on MVP** | **Low.** MVP can ship with simple single-approver plan approval. Multi-step workflows are an enterprise requirement. |
| **Effort to Close** | **Medium** (2-3 months, 2 engineers). A state machine-based workflow engine with configurable transitions, conditions, and actions. |
| **Recommended Phase** | **V2.** Build a simple workflow engine that covers the 4-5 standard workflows. Extensibility for custom workflows in V3. |
| **Workaround Until Built** | (1) Simple approval: plan status (draft -> pending approval -> approved). Single approver per site. No escalation. (2) For multi-step approval, use external tools: route approval requests to a Slack channel or email, with a link back to AstraPlanner for the approval action. (3) For escalation, use a scheduled job that checks for pending approvals older than the threshold and sends reminder notifications. |

---

### Gap 8: Communication Layer

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner has no built-in messaging between planners and employees or between planners and supervisors. All communication about schedules, changes, absences, and overrides happens outside the system. This creates information fragmentation: the decision (in AstraPlanner) is disconnected from the communication about the decision (in email/Slack/WhatsApp). When an employee's schedule changes, there is no system-initiated notification. When a planner needs to explain why an assignment was made, there is no in-context messaging thread. |
| **Current State** | No in-app messaging. No notification system (email, SMS, push). Alerts exist as in-app UI elements only -- no external delivery. |
| **What's Missing** | (1) Notification engine: configurable notifications via email, SMS, push, and in-app. Triggered by system events (plan published, schedule changed, absence detected, approval required). (2) Notification preferences per user: which events trigger which channels. (3) In-context messaging: attach comments or notes to plans, assignments, and overrides. Visible to relevant stakeholders. (4) Broadcast messaging: planner sends a message to all employees on a specific shift ("mandatory safety briefing at 2 PM"). (5) Integration with communication platforms: Slack, Microsoft Teams, WhatsApp Business API for organizations already using these tools. |
| **Impact on MVP** | **Medium.** Without notifications, schedule publication and changes are communicated manually, adding 15-30 minutes of planner work per plan publication. For MVP with < 50 sites, this is tolerable. At Growth scale, it becomes a bottleneck. |
| **Effort to Close** | **Medium** (2-3 months, 1-2 engineers). Email notification engine: 2-4 weeks. SMS (via Twilio): 1-2 weeks. Push notifications: 2-3 weeks (requires mobile app or PWA). Slack/Teams integration: 2-3 weeks. |
| **Recommended Phase** | **V1 (MVP): Email notifications for critical events** (plan published, approval required, mass absence alert). **V2: Full notification engine with preferences, SMS, Slack/Teams.** **V3: In-context messaging, broadcast capability.** |
| **Workaround Until Built** | (1) Use Supabase Edge Functions to send emails via SendGrid or Resend on key database events (plan status change, new assignment). (2) Webhook integration: fire a webhook on key events that customers can route to their existing communication tools. (3) Plan export to PDF for manual distribution. |

---

### Gap 9: Union / CBA Rule Engine

| Attribute | Detail |
|-----------|--------|
| **Description** | Collective Bargaining Agreements (CBAs) introduce workforce planning constraints that go far beyond statutory labor law. CBA rules are highly specific, vary by bargaining unit, and change with each contract negotiation (typically every 2-4 years). Examples of CBA constraints not currently modeled: (a) seniority-based shift bidding (most senior employees choose shifts first); (b) mandatory overtime distribution (overtime must be offered in seniority order); (c) job classification restrictions (a "Material Handler 2" cannot perform "Material Handler 3" tasks even if physically capable); (d) bumping rights (in layoff situations, senior employees can "bump" junior employees from their positions); (e) mandatory break patterns that exceed statutory requirements; (f) grievance-triggering schedule changes (schedule changes within 72 hours trigger a grievance process). |
| **Current State** | The optimization engine supports hard and soft constraints, but CBA rules are not specifically modeled. Basic labor rules (overtime limits, break requirements) are supported. Seniority-based bidding, overtime distribution, bumping rights, and job classification restrictions are not. |
| **What's Missing** | (1) Seniority engine: employee seniority ranking by bargaining unit, used as a preference weight in the solver. (2) Overtime equalization: track cumulative overtime per employee and distribute new overtime to employees with the least accumulated overtime (common CBA requirement). (3) Job classification constraints: restrict assignments based on classification, not just skills. An employee with the skill may not have the classification. (4) Bidding system: for shift bids, allow seniority-ordered selection where senior employees' preferences take priority. (5) CBA rule versioning: CBAs change. The system must know which CBA was in effect for each plan date for audit and grievance defense. (6) Grievance risk flagging: identify plan elements that are likely to trigger grievances under the active CBA. |
| **Impact on MVP** | **Low for non-union customers; blocking for union customers.** Many logistics operations (especially in the US Northeast, Midwest, and West Coast) are unionized. Without CBA rule support, these customers cannot adopt AstraPlanner -- plans that violate CBA rules are worse than no plan at all. |
| **Effort to Close** | **Large** (3-5 months, 2 engineers + labor law consultation). CBA rules are complex, vary enormously, and require careful modeling. The seniority engine and overtime equalization are significant solver modifications. |
| **Recommended Phase** | **V2** for common CBA rules (seniority preferences, overtime equalization, job classifications). **V3** for full CBA rule engine with versioning and grievance risk flagging. |
| **Workaround Until Built** | (1) Model the most common CBA rules as custom constraints in the existing constraint engine (hard/soft constraints with configurable parameters). This covers 60-70% of CBA needs. (2) For seniority-based bidding, generate the AI-optimized plan, then let supervisors manually adjust to reflect seniority preferences. The override tracking captures the reason ("CBA seniority"). (3) For overtime equalization, provide a report of cumulative overtime per employee that supervisors reference when making overtime decisions. |

---

### Gap 10: Training and Skill Development Planner

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner identifies skill gaps (e.g., "Process X requires 15 qualified employees but only 10 are available; cross-train 5 more"). However, it stops at the identification step. It does not: (a) schedule training sessions (who trains, when, where); (b) track training completion and certification; (c) project future skill availability based on planned training; (d) integrate with Learning Management Systems (LMS) for course enrollment; (e) calculate the ROI of training (cost of training vs. reduction in overtime/temp labor from having more cross-trained employees). The gap between "you need to cross-train people" and "here is a training schedule that accomplishes it" is significant. |
| **Current State** | Skill gap identification in planning reports. No training scheduling, tracking, or LMS integration. |
| **What's Missing** | (1) Training session scheduler: create training events with instructor, trainees, location, and duration. (2) Skill acquisition modeling: "If Employee A completes Module 1 (8 hours), they gain Level 2 in Picking. If they then complete Module 2 (16 hours), they reach Level 3." (3) Training capacity planning: how many employees can be in training at once without impacting production? (4) LMS integration: enroll employees in courses, track completion, update skill records automatically. (5) Training ROI calculator: "Cross-training 10 employees in Packing costs $15,000 (training hours + instructor) and saves $8,000/month in overtime by eliminating the Packing staffing bottleneck. Payback: 1.9 months." (6) Certification tracking: mandatory certifications (forklift, HAZMAT) with expiration dates and renewal alerts. |
| **Impact on MVP** | **Low.** MVP focuses on planning with current skills. Skill development is a strategic capability for retention and operational flexibility. |
| **Effort to Close** | **Medium** (2-3 months for basic training scheduling and tracking; 4-6 months for LMS integration, ROI calculation, and certification management). |
| **Recommended Phase** | **V3.** Training planning is a distinct product area. Initial focus should be on certification tracking (V2, as it affects planning compliance) and full training planning in V3. |
| **Workaround Until Built** | (1) Skill gap reports are exported to Excel. Training teams use their existing training scheduling tools. (2) Manual skill updates: when an employee completes training, their skill record is updated manually in AstraPlanner. (3) Certification expiration can be tracked via a custom date field on the employee record, with a report showing upcoming expirations. |

---

## 3. Prioritization Matrix

### Impact vs. Effort Visualization

```
                          E F F O R T
                    Small          Medium          Large
              +------------------+------------------+------------------+
              |                  |                  |                  |
   High       |                  | Gap 5: T&A       | Gap 1: Forecast  |
              |                  | Integration      |                  |
I             |                  |                  |                  |
M             +------------------+------------------+------------------+
P             |                  |                  |                  |
A   Medium    |                  | Gap 3: Employee  | Gap 2: Mobile    |
C             |                  |   Self-Service   |   App            |
T             |                  | Gap 8: Comms     | Gap 9: CBA Rules |
              |                  |   Layer          |                  |
              +------------------+------------------+------------------+
              |                  |                  |                  |
   Low        | Gap 6: Analytics | Gap 7: Workflow  | Gap 10: Training |
              |   (BI connect)   |   Engine         |   Planner        |
              |                  | Gap 4: Payroll   |                  |
              |                  |   (cost proj.)   |                  |
              +------------------+------------------+------------------+
```

### Prioritization Decision Framework

Gaps in the **High Impact / Small Effort** quadrant (top-left) are immediate wins. Gaps in the **High Impact / Large Effort** quadrant (top-right) are strategic investments. Gaps in the **Low Impact / Large Effort** quadrant (bottom-right) are deferred or avoided.

---

## 4. Recommended Phase Allocation

### V1 (MVP) -- Ship with These

| Gap | Scope for MVP | Effort |
|-----|--------------|--------|
| Gap 4: Payroll (cost projection only) | Store base pay rates. Calculate `planned_hours * rate` for cost projection. No overtime calc, no payroll export. | 2-3 weeks |
| Gap 5: T&A Integration (basic) | Integration with 2-3 major T&A providers (UKG, ADP). Attendance tracking (present/absent). Plan accuracy dashboard. | 6-8 weeks |
| Gap 6: Analytics (BI connectivity) | Read-only database access. Data dictionary. CSV export for all plan data. | 1-2 weeks |
| Gap 8: Communication (email only) | Email notifications for: plan published, approval required, mass absence alert. | 2-3 weeks |

**Total MVP gap closure effort: ~3 months of engineering time (1-2 engineers)**

### V2 (Growth Phase) -- Build These Next

| Gap | Scope for V2 | Effort |
|-----|-------------|--------|
| Gap 1: Forecasting Engine | Statistical forecasting (ARIMA, Prophet). Seasonal decomposition. Accuracy tracking. | 3-4 months |
| Gap 2: Mobile App (PWA) | Progressive Web App with offline plan viewing, attendance marking, push notifications. | 2-3 months |
| Gap 3: Employee Self-Service | Schedule viewing, availability submission, shift swap requests, notification preferences. | 2-3 months |
| Gap 4: Payroll (overtime calc) | Jurisdiction-aware overtime calculation. Shift differential. Payroll system export (ADP, Paychex CSV formats). | 2-3 months |
| Gap 7: Workflow Engine | Generic state-machine workflow engine. Configurable approval chains for 5 standard workflows. Escalation rules. | 2-3 months |
| Gap 8: Communication (full) | SMS, push, Slack/Teams integration. Notification preferences. In-context comments on plans. | 2-3 months |
| Gap 9: CBA Rules (common) | Seniority preferences, overtime equalization, job classification constraints. | 3-4 months |

**Total V2 effort: ~18-23 months of engineering time (4-6 engineers over 6-9 months)**

### V3 (Enterprise Phase) -- Strategic Capabilities

| Gap | Scope for V3 | Effort |
|-----|-------------|--------|
| Gap 2: Mobile App (native) | Native iOS + Android apps. Barcode scanning. Full offline capability. | 4-6 months |
| Gap 6: Analytics (advanced) | Embedded analytics, predictive models (attrition, demand trends), custom report builder, scheduled reports. | 4-6 months |
| Gap 9: CBA Rules (full) | CBA rule versioning, grievance risk flagging, bidding system, bumping rights. | 3-4 months |
| Gap 10: Training Planner | Training session scheduling, skill acquisition modeling, LMS integration, training ROI calculator, certification management. | 4-6 months |

**Total V3 effort: ~15-22 months of engineering time (4-6 engineers over 6-9 months)**

---

## 5. Gap Closure Dependencies

Some gaps have dependencies on others. The following sequence constraints apply:

```
Gap 5 (T&A Integration) ─────► Gap 4 (Payroll - actual hours needed for payroll)
                         ─────► Gap 1 (Forecast - actuals needed to measure forecast accuracy)

Gap 2 (Mobile App) ──────────► Gap 3 (Employee Self-Service - best delivered on mobile)
                   ──────────► Gap 8 (Communication - push notifications need mobile)

Gap 7 (Workflow Engine) ─────► Gap 9 (CBA Rules - CBA processes need workflow support)
                        ─────► Gap 3 (Employee Self-Service - swap approvals need workflow)

Gap 6 (Analytics) ───────────► Gap 10 (Training Planner - training ROI needs analytics)
```

**Critical path:** T&A Integration (Gap 5) is the foundational gap. It enables plan accuracy measurement (needed for trust building), actual hours for payroll calculation, and historical data for forecasting accuracy. Closing this gap first maximizes the value of subsequent gap closures.

---

## 6. Competitive Landscape Context

Understanding which competitors cover these gaps helps prioritize:

| Gap | Quinyx | NICE WFM | Blue Yonder WFM | Legion | AstraPlanner |
|-----|--------|----------|-----------------|--------|--------------|
| Forecasting | Basic | Advanced | Advanced | AI-native | Gap |
| Mobile App | Native | Native | Native | Native | Gap |
| Employee Self-Service | Yes | Yes | Yes | Yes | Gap |
| Payroll Calculation | Integration | Full | Integration | Integration | Gap |
| T&A Integration | Yes | Yes | Yes | Yes | Partial |
| Advanced Analytics | Basic | Advanced | Advanced | Advanced | Gap |
| Workflow Engine | Basic | Advanced | Advanced | Basic | Gap |
| Communication | Yes | Yes | Yes | Yes | Gap |
| CBA Rules | Basic | Advanced | Advanced | Basic | Gap |
| Training Planner | No | Basic | No | No | Gap |
| **AI-Driven Planning** | No | No | Basic | Yes | **Core Strength** |
| **Setup Simplicity** | Medium | Low | Low | Medium | **Core Strength** |
| **Demand-to-Plan Pipeline** | No | Partial | Yes | Partial | **Core Strength** |

AstraPlanner's competitive advantage is the AI-driven demand-to-assignment pipeline and the setup simplicity (AI wizard). The gaps are in surrounding capabilities that mature WFM platforms have built over 10-20 years. The strategy is not to build everything, but to close the highest-impact gaps (T&A, forecasting, mobile) while maintaining the core differentiation, and integrate with best-of-breed tools for deep domain needs (payroll, LMS, advanced BI).

---

## 7. Summary

| Gap # | Gap Name | MVP Scope | V2 Scope | V3 Scope |
|-------|----------|-----------|----------|----------|
| 1 | Forecasting Engine | External forecast only | Built-in statistical forecasting | ML-based forecasting |
| 2 | Mobile Application | Responsive web | PWA | Native iOS + Android |
| 3 | Employee Self-Service | None | Schedule view, availability, swaps | Full self-service portal |
| 4 | Payroll Calculation | Cost projection | Overtime calc + payroll export | Integrate; don't build full payroll |
| 5 | T&A Integration | Basic (2-3 providers) | Expanded providers + real-time | Real-time streaming + IoT |
| 6 | Advanced Analytics | BI connectivity + CSV | Embedded analytics + scheduled reports | Predictive models + custom reports |
| 7 | Workflow Engine | Simple approve/reject | Generic engine (5 workflows) | Custom workflow designer |
| 8 | Communication Layer | Email notifications | SMS + push + Slack/Teams | In-context messaging + broadcast |
| 9 | CBA Rule Engine | Manual constraint config | Common CBA rules | Full CBA engine + grievance risk |
| 10 | Training Planner | Skill gap reports | Certification tracking | Full training planning + LMS |

The path to production readiness requires closing Gaps 4 (cost projection), 5 (T&A), 6 (BI connectivity), and 8 (email notifications) at MVP -- a combined 3-month engineering effort. These four closures give AstraPlanner enough surrounding capability to deliver measurable value in a production logistics environment while maintaining focus on the core demand-to-assignment pipeline that is the platform's primary differentiator.
