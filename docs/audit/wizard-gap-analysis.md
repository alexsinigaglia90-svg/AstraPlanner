# Setup Wizard Gap Analysis

## Adversarial Audit: Wizard Design vs. Reality

**Audit Date**: 2026-03-20
**Auditor**: Automated adversarial review
**Design Quality Score**: 7/10 (thoughtful, detailed, domain-aware)
**Implementation Readiness Score**: 0/10 (zero code exists)

---

## 1. Executive Summary

The setup wizard documentation (`wizard-flow.md`) is the most detailed artifact in the AstraPlanner codebase. It specifies 8 phases, 50+ input fields, AI-assisted interactions, validation rules, and time estimates. As a specification, it demonstrates strong domain knowledge of warehouse operations.

As a blueprint for actual implementation, it contains several fatal assumptions that would collapse on contact with real enterprise customers. There is zero implementation code -- no UI components, no form state management, no validation logic, no API endpoints, no AI integration.

---

## 2. Phase-by-Phase Assessment

### Phase 1: Organization Setup (Documented: 5-10 min)

**Design quality**: Good. The fields are appropriate and the auto-fill-from-company-name AI feature is a genuinely useful UX idea.

**Fatal flaw**: The "Company Lookup" AI feature assumes Claude can reliably identify a company from a name string and return structured data (industry vertical, size, country). This is a hallucination-prone use case. Company names are ambiguous ("Summit Logistics" returns thousands of results). There is no fallback documented for when the AI lookup fails or returns incorrect data.

**Missing**: No account creation flow. No email verification. No SSO/SAML configuration flow. The wizard assumes the user is already authenticated, but the auth system does not exist.

---

### Phase 2: Site Configuration (Documented: 10-15 min single site)

**Design quality**: Strong. The master-detail layout, clone functionality, and bulk import are the right patterns for multi-site enterprises.

**Fatal flaws**:
- **Geocoding dependency**: "Address validated against geocoding API" -- no geocoding API is integrated. No API key management. No fallback for addresses that do not geocode.
- **Map visualization**: "A map visualization at the top plots all configured sites geographically" -- no mapping library is integrated. This is a non-trivial frontend component (Mapbox/Google Maps integration, marker management, responsive sizing).
- **Bulk import**: "Upload a CSV or Excel file with site data. AI maps columns to fields" -- AI-powered column mapping is a complex ML task. No training data exists. No mapping algorithm exists. This feature alone could take 2-3 weeks to build reliably.

---

### Phase 3: Process Definition (Documented: 15-25 min)

**Design quality**: Excellent domain modeling. The process library concept, drag-and-drop reordering, and productivity tiers show deep understanding of warehouse operations.

**Fatal flaws**:
- **"Process Library" sidebar**: The doc describes pre-built process templates that can be dragged onto a table. No process template library exists. Creating one requires domain research to populate realistic defaults for each industry vertical (e-commerce fulfillment, cold chain, 3PL, etc.). This is content creation work, not code.
- **Productivity standards**: The doc says users enter UPH (units per hour) values. In reality, most warehouse managers do not know their engineered standards off the top of their heads. This data lives in WMS systems, industrial engineering studies, or Excel files maintained by IE teams. The wizard assumes the user has this data readily available.
- **"Required Skills" multi-select**: Skills are "created on-the-fly here and referenced in Phase 5." This creates a circular dependency -- Phase 3 creates skills, Phase 5 assigns them to employees. But the skill taxonomy needs to be consistent. Free-text skill creation leads to "Forklift", "Fork Lift", "FLT", "Powered Industrial Truck" all meaning the same thing.

---

### Phase 4: Demand Configuration (Documented: 10-20 min)

**Design quality**: Adequate. Demand-to-process mapping with conversion ratios is the correct approach.

**Fatal flaw**: The wizard assumes the user can provide demand forecasts during initial setup. In reality, demand data comes from WMS/OMS/ERP systems. During initial onboarding, the integration to those systems does not exist yet. The wizard needs to support a "skip and upload later" path, which undermines the "fully configured in 75-145 minutes" promise.

---

### Phase 5: Workforce Setup (Documented: 15-30 min)

**Design quality**: Good structure for employee data capture.

**Fatal flaws**:
- **Bulk employee import**: "Upload a CSV with employee data" is the only realistic path for any organization with more than 20 employees. But the CSV import requires column mapping, data validation, duplicate detection, and error handling. None of this exists.
- **Skill assignment**: After importing 500 employees, the wizard expects someone to assign skill levels (1-5) per process per employee. For a site with 500 employees and 10 processes, that is 5,000 skill assessments. The doc does not address this scale problem. A realistic approach requires bulk defaults with exceptions.
- **PII handling**: Employee data (names, emails, hourly rates) is PII. The wizard doc does not address data handling consent, GDPR right-to-be-informed, or data processing agreements. Enterprise customers will ask about this during onboarding.

---

### Phase 6: Rule Configuration (Documented: 10-20 min)

**Design quality**: Strong. The labor rule model (hard constraint, soft constraint, warning) with jurisdiction-specific rules is well-designed.

**Fatal flaw**: The doc assumes one person knows all applicable labor rules for their jurisdiction. In reality:
- Federal/national rules come from legal/compliance
- State/provincial rules come from local HR
- Union rules come from the CBA (collective bargaining agreement), which is a legal document that requires specialist interpretation
- Company policies come from corporate HR

No single person has all of this knowledge. The "10-20 minutes" estimate assumes perfect knowledge that does not exist in a single human.

---

### Phase 7: Planning Preferences (Documented: 5-10 min)

**Design quality**: Adequate. Objective function weights, planning horizon, and approval workflow are the right configuration points.

**Fatal flaw**: The multi-objective weight configuration (cost=0.35, skill=0.25, overtime=0.20, preference=0.12, fairness=0.08) is meaningless to a non-technical user. The doc describes an "interactive slider" UI, but understanding the tradeoffs between these objectives requires running the optimizer and seeing the results -- which cannot happen because the optimizer does not exist.

---

### Phase 8: Review & Activate (Documented: 5-15 min)

**Design quality**: Appropriate checkpoint pattern. A summary review before activation is standard practice.

**Fatal flaw**: "Activate" implies the system starts producing plans. But no planning engine exists. Activation is a button that does nothing.

---

## 3. Structural Problems with the Wizard Design

### 3.1 The "Single Person" Assumption

The wizard assumes one person sits down and completes all 8 phases in a single session. Real warehouse onboarding involves:

| Knowledge Area | Typical Owner | Phase(s) |
|----------------|--------------|----------|
| Company info, subscription | IT/Procurement | Phase 1 |
| Site details, operating hours | Site/Ops Manager | Phase 2 |
| Process definitions, productivity standards | Industrial Engineering | Phase 3 |
| Demand data, forecast sources | Supply Chain Planning | Phase 4 |
| Employee data, skills, contracts | HR/HRIS Admin | Phase 5 |
| Labor regulations, union rules | Legal/Compliance | Phase 6 |
| Planning objectives, approval workflows | VP of Operations | Phase 7 |
| Final review and sign-off | Project Sponsor | Phase 8 |

That is 5-8 different people. The wizard needs a collaborative/delegated setup flow where Phase 2 can be assigned to a site manager, Phase 5 to HR, Phase 6 to legal, etc. This is not documented.

### 3.2 The "75-145 Minutes" Fiction

The time estimate of 75-145 minutes for a single site assumes:
- The user has all data readily available (false for productivity standards, demand data, and labor rules)
- The AI features work perfectly (they do not exist, and when built, they will have error rates)
- No data cleanup is needed (employee CSVs from HRIS exports are notoriously messy)
- No internal approvals are needed (enterprise customers require sign-off at each phase)
- No integration setup is needed (demand data must come from somewhere)

**Realistic timeline for a single site**: 2-4 weeks of professional services engagement, with the wizard serving as a structured data collection tool, not a self-service onboarding experience.

**Realistic timeline for 10+ sites**: 6-12 weeks, with a dedicated implementation consultant.

### 3.3 The "AI-Assisted Setup" Risk

The wizard describes four AI-powered features:

| AI Feature | Risk Level | Rationale |
|-----------|-----------|-----------|
| Company lookup and auto-fill | Medium | Hallucination risk. Public company data is sparse for private logistics companies. |
| Natural language setup ("describe your operation") | High | Extremely open-ended NLP task. Mapping free-text descriptions to structured configuration requires domain-specific fine-tuning. |
| Document upload and parsing (employee rosters, CBA docs) | Very High | Document parsing accuracy for PDFs of union contracts is a hard ML problem. OCR quality varies. Layout varies. Legal language is ambiguous. |
| Smart defaults from industry data | Medium | Requires a curated dataset of industry benchmarks that does not exist. The "fleet data" referenced for smart defaults is fiction. |

The highest-risk claim is CBA parsing. Collective bargaining agreements are 50-200 page legal documents with complex clause structures, exceptions, and cross-references. Extracting structured labor rules from these documents with sufficient accuracy to drive a constraint solver is a research-grade problem, not a product feature.

### 3.4 The Smart Defaults Problem

The wizard documentation references "smart defaults" and "industry templates" throughout. For example:
- Phase 2: "For a 24/7 distribution center in this region, the most common pattern is 3 shifts: Day (06:00-14:00), Swing (14:00-22:00), Night (22:00-06:00)."
- Phase 3: Pre-built process library with productivity standards

These defaults require a curated dataset of industry benchmarks. No such dataset exists in the codebase. Building one requires:
- Partnerships with industry associations or consulting firms
- Access to anonymized operational data from real warehouses
- Domain expert review of every default value

Without this dataset, the "smart defaults" feature is vaporware.

---

## 4. What Would a Realistic Wizard Look Like?

A pragmatic MVP wizard would:

1. **Cut to 4 phases**: Org setup, site + process configuration (combined), employee import, rule configuration
2. **Drop all AI features for V1**: Use static industry templates instead of AI-generated defaults
3. **Support multi-user delegation**: Allow the wizard to be shared with different stakeholders for different sections
4. **Support "incomplete" activation**: Let the system run with partial configuration (e.g., generate plans for one site even if other sites are not configured)
5. **Expect professional services**: The wizard is a tool for implementation consultants, not a self-service experience
6. **Budget 3-4 weeks for implementation**: The wizard UI alone (8 phases, 50+ fields, validation, state persistence, navigation) is 3-4 weeks of frontend development

---

## 5. Scoring Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Domain correctness of the design | 8/10 | The wizard captures the right data for workforce planning. Field choices reflect real operational needs. |
| UX design quality | 7/10 | Progressive disclosure, AI assistance, and clone/bulk patterns are thoughtful. But the single-user assumption is a UX failure for enterprise. |
| Feasibility of time estimates | 2/10 | 75-145 minutes is fiction. 2-4 weeks per site is realistic. |
| AI feature feasibility | 3/10 | Company lookup is feasible. NL setup is risky. CBA parsing is a research problem. Smart defaults require data that does not exist. |
| Implementation readiness | 0/10 | Zero code. Zero UI components. Zero API endpoints. Zero AI integration. |
| **Overall** | **4/10** | Strong domain design fatally undermined by unrealistic assumptions and zero implementation. |
