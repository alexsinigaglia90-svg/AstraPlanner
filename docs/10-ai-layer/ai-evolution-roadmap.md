# AI Evolution Roadmap

This document defines the four-phase journey from assistive AI to autonomous planning. Each phase has concrete prerequisites, infrastructure requirements, success metrics, and a clear boundary defining when the system is ready to advance.

---

## Phase Overview

```
Phase 1: Assistive AI          (MVP → Month 3)     "AI helps when asked"
Phase 2: Recommendation Engine (Month 4 → 9)       "AI proactively suggests"
Phase 3: Semi-Autonomous       (Month 10 → 18)     "AI acts within boundaries"
Phase 4: Autonomous Planning   (Month 18+)         "AI operates independently for routine decisions"
```

Each phase builds on the data, models, and trust earned in the previous phase. Skipping phases is not possible — the system must accumulate sufficient learning data and demonstrated accuracy before advancing.

---

## Phase 1: Assistive AI (MVP + 3 Months)

### What Ships

| Capability | Description | Automation Level |
|-----------|-------------|-----------------|
| Setup wizard AI suggestions | Claude extracts entities from natural language descriptions, suggests smart defaults | L1 (suggestion) |
| Coverage gap alerts | Real-time alerts when planned coverage drops below threshold | L0 (information) |
| Overtime warnings | Flag employees approaching weekly hour limits | L0 (information) |
| Certification expiry alerts | 90/60/30-day warnings for expiring certifications | L0 (information) |
| Best-match employee suggestion | When user clicks a gap cell, AI ranks available employees by skill + availability | L1 (suggestion) |
| Optimizer explanation | "Why was this plan generated?" — constraint-based explanation of solver output | L0 (information) |
| Data capture infrastructure | Begin logging user interaction events and system outcome events (silent, no user-facing output) | N/A (infrastructure) |

### Infrastructure Built

| Component | Implementation |
|-----------|---------------|
| `intelligence.interaction_events` table | Captures all user behavior events (clicks, edits, overrides, time-on-page) |
| `intelligence.system_events` table | Captures all system events (plan generated, demand updated, absence reported) |
| `intelligence.outcome_events` table | Captures outcome data (plan vs actual divergence, coverage achieved) |
| Event ingestion pipeline | Supabase Database Webhooks → Edge Function → event tables |
| Basic feature store | Redis counters for real-time stats (recommendation accept/reject counts) |
| Claude integration | ai-gateway Edge Function with PII stripping, cost tracking, rate limiting |
| Explanation engine v1 | Constraint-based explanations for optimizer output |

### Data Accumulation Target

By end of Phase 1, each active tenant should have:
- 3+ months of interaction events (~50,000-200,000 events per site)
- 3+ months of plan generation history (12-52 plans per site)
- 3+ months of override data (which AI suggestions were accepted/rejected)
- Initial absence pattern data (enough for day-of-week baseline)

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| AI feature engagement | > 50% of active users interact with AI features weekly | Analytics (PostHog) |
| Recommendation volume | > 10 suggestions per site per week | `intelligence.recommendations` count |
| Accept/dismiss ratio | > 25% (baseline for learning) | Feedback tracking |
| Explanation usage | > 30% of generated plans have explanation viewed | Click tracking |
| Data capture completeness | > 95% of user interactions logged | Event pipeline monitoring |
| System stability | Zero AI-related incidents affecting core planning | Incident tracking |

### Exit Criteria for Phase 2

- [ ] 3+ months of continuous data capture across all event types
- [ ] At least 5 active tenants with consistent usage data
- [ ] Feature store operational with < 100ms read latency
- [ ] Claude API integration stable with < 0.1% error rate
- [ ] No privacy or security incidents related to data capture
- [ ] Accept/dismiss ratio measurable and > 20% for best-match suggestions

---

## Phase 2: Recommendation Engine (Month 4–9)

### What Ships

| Capability | Description | Automation Level |
|-----------|-------------|-----------------|
| Personalized recommendations | Recommendations ranked by predicted relevance for each user | L1 (suggestion) |
| Absence prediction | "Department B has 18% Monday absence probability next week" | L0 (information) |
| Demand forecast adjustment | "Historical data suggests forecast is 12% low for post-holiday Monday" | L1 (suggestion) |
| Productivity drift detection | "Night shift pick rate has declined 8% over last quarter" | L0 (information) |
| Cross-training recommendations | "Only 2 employees certified for Hazmat. Recommend cross-training Employee X." | L1 (suggestion) |
| Process improvement suggestions | "Staggering breaks by 15 min would eliminate throughput dip" | L1 (suggestion) |
| Shift pattern optimization | "Demand analysis suggests 45/35/20 staffing split, not even thirds" | L1 (suggestion) |
| Weekly insight digest | Claude-generated summary of key patterns and recommendations per site | L0 (information) |
| Recommendation fatigue management | Limit volume, track engagement, suppress irrelevant recommendations | N/A (quality) |
| Counterfactual explanations | "If you had accepted the AI suggestion, coverage would have been 96% vs 91%" | L0 (information) |
| User intelligence model | System builds cognitive model of each user's planning style and preferences | N/A (infrastructure) |
| Site intelligence model | System learns site-specific patterns (demand volatility, absence rates, productivity curves) | N/A (infrastructure) |

### Infrastructure Built

| Component | Implementation |
|-----------|---------------|
| `intelligence.user_profiles` table | Per-user behavioral model with decision patterns and preferences |
| `intelligence.site_profiles` table | Per-site operational fingerprint with seasonal models |
| `intelligence.process_intelligence` table | Per-process learning (actual vs standard UPH, time-of-day effects) |
| `intelligence.recommendations` table | Full recommendation lifecycle with feedback tracking |
| `intelligence.models` table | Serialized ML model weights per tenant |
| ML training pipeline | pg_cron → Edge Function: weekly model retraining for absence prediction, demand adjustment |
| Feature engineering pipeline | Raw events → computed features (override_rate_7d, absence_rate_trend, demand_volatility_index) |
| Recommendation ranking engine | Weighted scoring: impact × urgency × confidence × user_relevance |
| Earned autonomy tracking | `intelligence.autonomy_levels` table: tracks acceptance rates per action type per site |

### ML Models Deployed

| Model | Features | Output | Training Frequency |
|-------|----------|--------|-------------------|
| Absence probability | employee_tenure, day_of_week, season, team, recent_absence_history | P(absent) per employee per day | Weekly |
| Demand adjustment | forecast_value, day_type, season, recent_actuals, post_holiday_flag | adjusted_forecast (multiplier) | Weekly |
| Assignment quality | employee_skill_level, process_complexity, shift_type, historical_performance | quality_score (0-1) | Weekly |
| Recommendation relevance | user_segment, recommendation_type, time_of_day, user_override_rate | relevance_score (0-1) | Weekly |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Recommendation precision | > 40% acted on (accepted or modified) | Feedback tracking |
| Absence prediction accuracy | > 75% (AUC-ROC) | Model evaluation against actuals |
| Demand adjustment accuracy | Adjusted forecast within 5% of actual (vs 15% raw forecast error) | Forecast vs actual comparison |
| User trust score | > 3.5 / 5 (survey or inferred from behavior) | User survey + override rate trend |
| Personalization lift | Personalized recommendations 2x more likely to be accepted than generic | A/B comparison |
| Insight engagement | > 60% of weekly digests opened | Email/notification tracking |
| Earned autonomy progress | > 30% of action types at Level 1 with > 70% acceptance rate | Autonomy tracking |

### Exit Criteria for Phase 3

- [ ] Absence prediction AUC-ROC > 0.75 for at least 80% of active sites
- [ ] Recommendation acceptance rate > 40% across all recommendation types
- [ ] User intelligence models active for > 90% of planners
- [ ] Site intelligence models producing actionable insights for > 80% of sites
- [ ] Earned autonomy: at least 3 action types have > 70% acceptance rate over 20+ suggestions
- [ ] Zero false-positive compliance alerts (no planner was told to act on something that was actually fine)
- [ ] T&A integration operational (required for outcome measurement in Phase 3)

---

## Phase 3: Semi-Autonomous Planning (Month 10–18)

### What Ships

| Capability | Description | Automation Level |
|-----------|-------------|-----------------|
| Assisted backfill | "3 gaps detected. We've prepared optimal backfills. [Apply All] [Review Each]" | L2 (assisted) |
| Supervised absence replacement | System auto-assigns replacement when absence reported, user notified, 30-min undo | L3 (supervised) |
| Continuous plan adjustment | Plans auto-adjust to demand changes within ±10% tolerance band | L3 (supervised) |
| Cross-site benchmarking | Compare similar sites, identify outliers, recommend best practices | L1 (suggestion) |
| Structural recommendations | "Based on 13-week trend, Site 3 needs 8 additional FTEs by Q3" | L1 (suggestion) |
| Advanced anomaly detection | Multi-signal correlation, structural vs temporary classification | L0 (information) |
| Employee schedule explanations | "Why am I assigned to this shift?" via employee self-service portal | L0 (information) |
| Organization-level seasonal models | Automatic seasonal staffing index computation and application | L2 (assisted) |
| Best practice transfer | "Site 3's staggered start times reduced OT by 22%. Recommend for Site 5." | L1 (suggestion) |

### Infrastructure Built

| Component | Implementation |
|-----------|---------------|
| `intelligence.automated_actions` table | Full audit trail for all L2+ automated actions |
| `intelligence.anomalies` table | Classified anomalies with response protocols |
| Automation execution engine | Edge Function that executes L2/L3 actions with safety boundary checks |
| Undo pipeline | Supabase Realtime notification + 30-minute undo window for L3 actions |
| Emergency stop | Admin-level control to disable all automation per site/tenant |
| Cross-site comparison engine | Site similarity scoring, benchmark computation, outlier detection |
| Outcome measurement pipeline | T&A integration → plan vs actual comparison → feedback to models |
| Employee explanation API | `GET /api/explain/assignment/{id}` — generates employee-facing explanation |

### Autonomy Progression

By end of Phase 3, expected autonomy levels:

| Action Type | Expected Level | Condition |
|-------------|---------------|-----------|
| Absence backfill (single) | L3 | > 85% acceptance over 50+ suggestions |
| Demand-triggered re-optimization | L3 | > 85% acceptance, outcomes within 5% of manual |
| Certification expiry alert | L4 | Purely informational, no action risk |
| Overstaffing rebalance | L2 | > 70% acceptance over 20+ suggestions |
| Productivity standard adjustment | L2 | Data-driven with > 70% acceptance |
| Overtime approval | L1 | Legal/financial — remains human decision |
| Shift pattern change | L1 | Structural — remains human decision |
| Plan publication | L0 | Always human — legal implications |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Routine decisions automated | > 30% of backfill decisions at L2+ | Automation tracking |
| Zero compliance violations | 0 violations from automated actions | Compliance monitoring |
| Planner time savings | 10% reduction in time spent per plan | Session duration tracking |
| Outcome quality (auto vs manual) | Automated decisions within 5% of manual quality | Outcome comparison |
| Human intervention frequency | Declining trend (fewer overrides per automated action) | Override tracking |
| Anomaly detection precision | > 80% of flagged anomalies are real | Anomaly feedback |
| Employee explanation satisfaction | > 70% of employees rate explanation as "clear" | Survey |

### Exit Criteria for Phase 4

- [ ] L3 automation active for at least 2 action types at > 50% of active sites
- [ ] Zero adverse outcomes from L3 automated actions in last 90 days
- [ ] Override rate for L3 actions < 15%
- [ ] Planner time savings measurable and > 10%
- [ ] Outcome quality for automated decisions within 3% of human decisions
- [ ] Full audit trail operational with explanation for every automated action
- [ ] Employee-facing explanation system operational
- [ ] Regulatory review completed for autonomous decision-making

---

## Phase 4: Autonomous Planning (Month 18+)

### What Ships

| Capability | Description | Automation Level |
|-----------|-------------|-----------------|
| Full automation for routine decisions | System handles predictable disruptions autonomously | L4 (full) |
| Proactive workforce planning | System generates headcount recommendations 3 months ahead | L1 (suggestion) |
| Self-improving models | A/B testing of planning strategies, automatic model selection | N/A (infrastructure) |
| Natural language planning | "Generate a plan for Black Friday that minimizes agency cost" | L2 (assisted) |
| Strategic intelligence | "Based on growth trajectory, Site 3 needs a new shift by Q3" | L1 (suggestion) |
| Closed-loop optimization | Plan → execute → measure → learn → improve → plan (continuous) | L3/L4 |
| Workforce simulation | "What if we cross-trained 20% of picking staff in packing?" with AI-predicted outcomes | L1 (suggestion) |

### Autonomy at Maturity

| Action Type | Level | Condition |
|-------------|-------|-----------|
| Absence backfill (single) | L4 | > 95% acceptance over 100+ actions, 0 adverse outcomes in 30 days |
| Demand re-optimization (within band) | L4 | > 95% acceptance, outcomes consistently within targets |
| Certification expiry management | L4 | Fully automated alerting and training scheduling |
| Overstaffing rebalance | L3 | Auto-rebalance with notification |
| Productivity standard calibration | L3 | Auto-adjust based on 13-week rolling data |
| New employee initial assignment | L2 | Suggest based on skill profile, supervisor confirms |
| Overtime decisions | L1 | Always human — legal/financial |
| Shift pattern redesign | L1 | Always human — structural |
| Plan publication | L0 | Always human — legal |

### Infrastructure Built

| Component | Implementation |
|-----------|---------------|
| A/B testing framework | Split tenants into control/treatment for strategy comparison |
| Strategy selection engine | Automatic solver parameter tuning based on outcome data |
| NLQ planning interface | Claude interprets planning intent → generates solver configuration → runs optimization |
| Proactive planning pipeline | 13-week demand extrapolation → headcount gap analysis → recommendation generation |
| Simulation engine v2 | AI-predicted outcomes for hypothetical workforce changes |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Routine decisions automated | > 60% of eligible decisions at L3+ | Automation tracking |
| Labor cost reduction | 5-10% measurable savings attributed to AI | Cost comparison (before/after, control/treatment) |
| Planner role shift | Planners spend > 60% of time on exceptions, < 40% on routine | Time tracking |
| Human override rate | < 10% for L4 actions | Override tracking |
| System trust (planner survey) | > 4.0 / 5.0 | Quarterly survey |
| Forecast accuracy (AI-adjusted) | Within 5% of actual for 90%+ of sites | Forecast vs actual |
| Zero adverse outcomes | 0 compliance violations or SLA misses from automated decisions | Incident tracking |

---

## Implementation Dependencies

| Phase | Prerequisites | New Infrastructure | Data Required | Additional Team | Duration |
|-------|--------------|-------------------|---------------|----------------|----------|
| **Phase 1** | MVP complete (24 weeks) | Event tables, Claude gateway, basic feature store | None (starts collecting) | 0 (built into MVP) | 3 months |
| **Phase 2** | Phase 1 data (3+ months), ML training infra | User/site profiles, ML pipeline, recommendation engine | 50K+ events per site, 12+ plans per site | +1 ML engineer | 6 months |
| **Phase 3** | Phase 2 models validated, T&A integration (V2), employee portal | Automation engine, undo pipeline, emergency stop, cross-site engine | 9+ months of events, validated ML models | +1 ML engineer, +0.5 compliance | 9 months |
| **Phase 4** | Phase 3 operating 6+ months, regulatory approval | A/B framework, strategy selection, NLQ interface | 18+ months of events, outcome data | Same team | Ongoing |

### Dependency on Other V2 Features

| AI Phase | Depends On | Why |
|----------|-----------|-----|
| Phase 2 | — | Can operate on plan quality metrics alone |
| Phase 3 | T&A Integration (V2) | Outcome measurement requires actual vs planned data |
| Phase 3 | Employee Portal (V2) | Employee-facing explanations need a delivery channel |
| Phase 3 | Mobile App (V2+) | Shift supervisors need real-time automation notifications |
| Phase 4 | Advanced Analytics (V2) | Strategic recommendations need BI-grade data infrastructure |

---

## Risk Management Per Phase

### Phase 1 Risks
| Risk | Mitigation |
|------|-----------|
| Data capture creates performance overhead | Async event logging, batch writes, monitor DB load |
| Users concerned about behavior tracking | Transparent data policy, opt-out for non-essential tracking |

### Phase 2 Risks
| Risk | Mitigation |
|------|-----------|
| ML models produce incorrect predictions | Confidence thresholds prevent low-quality recommendations from reaching users |
| Recommendation fatigue | Volume limits, relevance scoring, fatigue detection |
| Cold start for new tenants | Industry-average models as baseline, rapid warm-up protocol |

### Phase 3 Risks
| Risk | Mitigation |
|------|-----------|
| Automated action causes compliance violation | Safety boundaries (never exceed legal limits), immediate demotion on adverse outcome |
| Users distrust automation | Earned autonomy model (system proves itself), one-click undo, emergency stop |
| Automation creates dependency | Ensure manual planning path always works, never remove manual controls |

### Phase 4 Risks
| Risk | Mitigation |
|------|-----------|
| Regulatory pushback on autonomous scheduling | GDPR Article 22 compliance, EU AI Act readiness, human-in-the-loop for publication |
| Model drift over time | Continuous monitoring, automatic retraining, confidence decay |
| Organizational resistance | Change management program, gradual rollout, measurable ROI demonstrations |

---

## Measuring AI ROI

### Quantifiable Value

| Metric | Measurement Method | Expected Impact |
|--------|-------------------|----------------|
| Planner productivity | Hours per plan × plans per week | Phase 2: 10% reduction, Phase 4: 40% reduction |
| Labor cost efficiency | Total labor cost / demand units processed | Phase 3: 3-5% improvement, Phase 4: 5-10% |
| Coverage achievement | % of shifts covered at 95%+ | Phase 2: +2-3%, Phase 4: +5-8% |
| Overtime reduction | Overtime hours / total hours | Phase 2: 5-10% reduction, Phase 4: 15-25% |
| Agency spend reduction | Agency hours / total hours | Phase 3: 10-15% reduction via better planning |
| Absence impact reduction | Coverage loss per absence event | Phase 3: 50% faster backfill, Phase 4: near-zero impact |

### Qualitative Value

| Benefit | Phase | Evidence |
|---------|-------|---------|
| Planner satisfaction | Phase 2+ | Survey, retention rates |
| Decision confidence | Phase 2+ | Fewer plan revisions post-publication |
| Organizational learning | Phase 3+ | Best practices spread across sites faster |
| Strategic visibility | Phase 4 | Leadership has data-driven workforce insights |

---

## The North Star

The ultimate goal is not to replace planners. It is to **elevate** them.

In Phase 4, a planner's job transforms from:
- "Build a schedule that covers demand" (routine, repetitive, low-value)

To:
- "Handle the exceptions the AI can't solve, make judgment calls on values and priorities, and steer the organization's workforce strategy" (high-value, uniquely human)

The AI handles the **knowable**. Humans handle the **judgment calls**. Together, they achieve what neither could alone.
