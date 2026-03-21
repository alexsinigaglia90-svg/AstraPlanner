# AstraPlanner Security Threat Model

This document provides a comprehensive threat model for AstraPlanner, an AI-driven workforce planning platform that processes employee PII, compensation data, demand forecasts, and operational schedules. It uses the STRIDE framework, maps the full attack surface, and recommends security controls for pre-launch hardening.

---

## 1. Asset Inventory

### 1.1 High-Value Data Assets

| Asset | Classification | Examples | Impact if Compromised |
|---|---|---|---|
| Employee PII | Confidential | Names, emails, phone numbers, employee numbers | GDPR/privacy violations, regulatory fines, reputational damage |
| Compensation Data | Highly Confidential | Hourly rates, pay grades, overtime hours, labor cost estimates | Competitive disadvantage, employee relations crises, lawsuits |
| Employee Schedules | Internal | Shift assignments, availability, preferences | Operational disruption, social engineering enablement |
| Demand Forecasts | Confidential | Volume projections, seasonal patterns, AI predictions | Competitive intelligence leakage, market manipulation |
| Organization Configs | Internal | SSO configs, integration credentials, feature flags | Account takeover, lateral movement, privilege escalation |
| Plan Versions & Scenarios | Confidential | Workforce optimization outputs, cost models, hiring/freeze plans | Strategic intelligence leakage |
| Audit Logs | Internal | User actions, IP addresses, state change history | Cover tracks for insider threats, compliance failures |
| Integration Credentials | Highly Confidential | WMS/OMS/HRIS API keys and connection strings (encrypted in `integration_config.connection_params_encrypted`) | Supply chain system compromise, lateral movement |
| AI Interaction Data | Confidential | Prompts sent to Claude API containing workforce data | Training data exposure, cross-tenant data leakage |

### 1.2 System Assets

| Asset | Description | Impact if Compromised |
|---|---|---|
| Supabase PostgreSQL | Primary data store with RLS | Full data breach across all tenants |
| Supabase Auth | Identity provider, JWT issuance | Universal authentication bypass |
| Supabase Edge Functions | Business logic execution | Code injection, SSRF, data exfiltration |
| Vercel Frontend | Next.js application hosting | XSS, phishing, credential harvesting |
| Claude API Integration | AI-powered planning recommendations | Prompt injection, data exfiltration |
| Redis/Upstash Cache | Session data, rate limits, cached entities | Session hijacking, cache poisoning |
| S3 Archive Storage | Historical data in Parquet format | Mass historical data breach |

---

## 2. Threat Actors

| Actor | Motivation | Capability | Access Level |
|---|---|---|---|
| **Malicious Insider** | Financial gain, disgruntlement | High — has legitimate credentials, understands data model | Authenticated user within a tenant |
| **Compromised Tenant Admin** | Attacker has stolen admin credentials via phishing/credential stuffing | High — full tenant admin privileges | Admin role in one organization |
| **External Attacker** | Data theft, ransomware, competitive espionage | Medium-High — sophisticated tooling, automated scanning | Unauthenticated or with stolen credentials |
| **Competitor Intelligence** | Access demand forecasts, workforce strategies, cost structures | Medium — may use social engineering or bribe insiders | Varies |
| **Rogue Tenant** | Abuse platform to access other tenants' data | Medium — legitimate account, probes RLS boundaries | Authenticated user in their own tenant |
| **Compromised Dependency** | Supply chain attack via npm package, API provider | High — can inject code or intercept data | Runs within application context |

---

## 3. STRIDE Analysis

### 3.1 Spoofing

| ID | Threat | Component | Likelihood | Impact | Existing Mitigation | Recommended Controls |
|---|---|---|---|---|---|---|
| S-1 | Authentication bypass via JWT forgery | Supabase Auth | Low | Critical | Supabase manages JWT signing with RS256 | Rotate JWT signing keys quarterly; monitor for key exposure in logs |
| S-2 | Session hijacking via stolen JWT | Client/API | Medium | High | JWTs have expiry (default 1 hour) | Implement refresh token rotation; bind tokens to client fingerprint; short-lived access tokens (15 min) |
| S-3 | SSO misconfiguration allowing unauthorized org access | Supabase Auth + SSO | Medium | Critical | SSO config stored encrypted in `organization.sso_config_json` | Validate SSO assertions server-side; enforce audience restriction; log all SSO events; test each SSO provider integration |
| S-4 | API key impersonation for integration endpoints | Edge Functions | Medium | High | Integration credentials encrypted at rest | Implement API key scoping per integration; IP allowlisting for inbound integrations; mutual TLS for critical integrations |
| S-5 | Account takeover via credential stuffing | Supabase Auth | High | High | Supabase rate limits on auth endpoints | Enforce MFA for all admin/planner roles; implement progressive delays; CAPTCHA after 3 failed attempts; breach password detection |

### 3.2 Tampering

| ID | Threat | Component | Likelihood | Impact | Existing Mitigation | Recommended Controls |
|---|---|---|---|---|---|---|
| T-1 | Plan data modification by unauthorized user | PlanVersion, ShiftAssignment | Medium | High | RLS restricts write access to admin/planner roles | Add `is_locked` enforcement at database level (trigger preventing writes to locked plan versions); require approval workflow for published plans |
| T-2 | Skill record falsification to influence assignments | EmployeeSkill | Medium | Medium | RLS restricts writes to admin/planner/manager roles | Audit trail on all skill changes; require `assessed_by` to differ from `employee_id`; periodic skill assessment verification |
| T-3 | Demand data poisoning via compromised integration | DemandForecast, IntegrationConfig | Medium | High | Integration field mappings validated | Implement anomaly detection on imported volumes (flag >50% deviation from 30-day average); quarantine suspicious imports for human review |
| T-4 | Labor rule tampering to bypass compliance | LaborRule | Low | Critical | RLS restricts to admin/owner roles | Require dual-approval for labor rule changes; immutable audit log for all rule modifications; compare against known regulatory databases |
| T-5 | JSONB payload injection in `settings_json`, `assumptions_json` | Multiple tables | Medium | Medium | Application-layer validation | Define and enforce JSON schemas for all JSONB columns; sanitize JSONB inputs; limit JSONB payload size |

### 3.3 Repudiation

| ID | Threat | Component | Likelihood | Impact | Existing Mitigation | Recommended Controls |
|---|---|---|---|---|---|---|
| R-1 | Audit log gaps — actions not captured | AuditLog | Medium | High | AuditLog table exists with immutability trigger | Ensure audit logging covers ALL write operations (use database triggers, not just application-layer logging); alert on audit log write failures |
| R-2 | Unsigned plan approvals — disputed approval decisions | PlanVersion | Medium | Medium | `approved_by` and `approved_at` fields captured | Implement cryptographic signing of approval actions (hash of plan content + approver ID + timestamp); store signature in `summary_metrics_json` |
| R-3 | Integration sync disputes — who imported what data | DemandForecast, Employee | Medium | Medium | `source` and `source_reference` fields on DemandForecast | Log full import batch metadata including checksum of source file, row counts, and transformation details |
| R-4 | Optimizer decision auditability — why was employee X assigned to shift Y | ShiftAssignment | Low | Medium | `assignment_source` field tracks origin | Store optimizer decision rationale (constraint satisfaction report) for each optimization run; link to plan version |

### 3.4 Information Disclosure

| ID | Threat | Component | Likelihood | Impact | Existing Mitigation | Recommended Controls |
|---|---|---|---|---|---|---|
| I-1 | Cross-tenant data leakage via RLS bypass | PostgreSQL | Medium | Critical | RLS policies on all tables filter by `organization_id` from JWT | Automated RLS bypass testing in CI/CD (attempt queries with manipulated JWT claims); penetration test RLS with every schema migration; add database-level assertion that prevents cross-org JOINs |
| I-2 | AI prompt injection exposing other tenants' data | Claude API | Medium | Critical | None currently | Never include raw tenant data in prompts without sanitization; implement tenant isolation at the prompt construction layer; use separate API sessions per tenant; strip PII before sending to Claude |
| I-3 | API response over-fetching | tRPC endpoints | High | Medium | None currently | Implement field-level access control; strip `hourly_rate`, `pay_grade` from responses unless caller has HR role; define explicit response schemas per role |
| I-4 | Error messages leaking schema or data details | Edge Functions, tRPC | Medium | Low | None currently | Implement generic error responses for production; log detailed errors server-side only; never expose stack traces or SQL errors to clients |
| I-5 | Cached data served to wrong tenant | Redis | Low | Critical | Cache keys include `org:{id}` prefix | Validate org_id in cache key matches requesting user's org before serving; flush tenant cache on any security event |
| I-6 | S3 archived data exposed via misconfigured bucket | S3 Archive | Low | Critical | None currently (not yet implemented) | Enforce S3 bucket policies with org-id prefix restrictions; enable S3 access logging; use server-side encryption (SSE-S3 or SSE-KMS); block public access |
| I-7 | Employee PII exposed in logs | Application logs | High | High | None currently | Implement PII scrubbing in log pipeline; never log employee names, emails, phone numbers, or pay rates; use employee_id references only |

### 3.5 Denial of Service

| ID | Threat | Component | Likelihood | Impact | Existing Mitigation | Recommended Controls |
|---|---|---|---|---|---|---|
| D-1 | Optimization solver abuse — submit extremely large problems | Edge Functions (optimizer) | Medium | High | `max_sites` and `max_employees` limits on Organization | Enforce problem-size limits at API level (max sites per run, max employees, max date range); implement optimizer timeout (60s hard limit); queue-based processing with per-tenant concurrency limits |
| D-2 | WebSocket connection exhaustion | Real-time subscriptions | Medium | Medium | Supabase manages connection pooling | Limit WebSocket connections per user (max 5); per-tenant connection quotas; implement connection idle timeouts |
| D-3 | Bulk import flooding | CSV upload, integration sync | Medium | Medium | None currently | Rate limit imports: max 1 concurrent import per org, max 100K rows per import; implement upload size limits (50MB); queue imports for async processing |
| D-4 | API rate limiting bypass | tRPC endpoints | Medium | Medium | None currently | Implement tiered rate limiting: 100 req/min per user, 1000 req/min per org; use sliding window with Redis; differentiate read vs. write limits |
| D-5 | Database connection pool exhaustion | PostgreSQL (Supabase) | Low | Critical | Supabase PgBouncer connection pooling | Set per-tenant connection limits; implement query timeout (30s for API, 120s for reports); kill long-running queries automatically |
| D-6 | Report/export abuse | CSV/Excel export endpoints | Medium | Medium | None currently | Limit export size (max 100K rows per export); queue large exports; limit concurrent exports per user (1) and per org (3) |

### 3.6 Elevation of Privilege

| ID | Threat | Component | Likelihood | Impact | Existing Mitigation | Recommended Controls |
|---|---|---|---|---|---|---|
| E-1 | Role escalation via JWT claim manipulation | Supabase Auth | Low | Critical | JWT signed by Supabase; claims set server-side | Validate `user_role` claim against database on every request (not just JWT); implement role change audit logging; require re-authentication for role elevation |
| E-2 | Tenant admin accessing other tenants | Supabase Auth + RLS | Medium | Critical | RLS filters by `organization_id` from JWT | Never accept `organization_id` from client input; always derive from authenticated session; automated cross-tenant access testing |
| E-3 | API key leakage (Supabase anon key, service role key) | Client-side code, logs, git | High | Critical | Anon key is public by design; service role key should be server-only | Rotate service role keys quarterly; scan codebase and CI/CD logs for key exposure; use Supabase Vault for edge function secrets; alert on service role key usage from unexpected IPs |
| E-4 | Vertical privilege escalation — viewer to planner | Application layer | Medium | High | RLS policies check `auth.user_role()` | Implement role validation at both RLS and application layer; separate Supabase policies per role; log all role-based access denials |
| E-5 | Edge Function escape — accessing other tenants' data via server-side code | Supabase Edge Functions | Low | Critical | Edge Functions use service role key | Always set `organization_id` context from JWT, never from request body; implement middleware that enforces tenant scoping for all database queries in Edge Functions |

---

## 4. Attack Surface Map

### 4.1 Vercel Frontend (Next.js)

| Vector | Risk | Mitigation |
|---|---|---|
| Cross-Site Scripting (XSS) | Injected scripts steal JWTs or session data | Content Security Policy headers; React's built-in XSS protection; sanitize all user-generated content (notification bodies, plan notes, scenario descriptions) |
| Cross-Site Request Forgery (CSRF) | Unauthorized actions via forged requests | SameSite cookie attributes; CSRF tokens for state-changing operations; verify Origin header |
| Open Redirects | Phishing via trusted domain redirects | Whitelist allowed redirect URLs; validate redirect targets server-side |
| Dependency Vulnerabilities | Compromised npm packages | Automated dependency scanning (Dependabot/Snyk); lock file integrity checks; review transitive dependencies |

### 4.2 Supabase Edge Functions

| Vector | Risk | Mitigation |
|---|---|---|
| Injection (SQL, NoSQL, LDAP) | Unauthorized data access or modification | Use parameterized queries exclusively; never concatenate user input into SQL; validate all inputs against schemas |
| Server-Side Request Forgery (SSRF) | Edge Function makes requests to internal services | Restrict outbound network access; whitelist allowed external URLs; never pass user-controlled URLs to fetch() |
| Insecure Deserialization | Code execution via crafted payloads | Validate JSON schemas before deserialization; limit payload sizes; reject unexpected types |
| Secret Exposure | Environment variables logged or returned in responses | Use Supabase Vault for secrets; never log environment variables; strip secrets from error responses |

### 4.3 Supabase Auth

| Vector | Risk | Mitigation |
|---|---|---|
| Credential Stuffing | Account takeover using breached password lists | MFA enforcement for privileged roles; progressive rate limiting; breached password detection; account lockout after 10 failures |
| Token Theft | Stolen JWTs used for unauthorized access | Short-lived access tokens (15 min); refresh token rotation; bind to device fingerprint |
| OAuth/SSO Misconfiguration | Authorization bypass | Validate ID token issuer and audience; enforce PKCE for OAuth flows; test each SSO provider |

### 4.4 PostgreSQL (via Supabase)

| Vector | Risk | Mitigation |
|---|---|---|
| SQL Injection via RLS bypass | Cross-tenant data access | All queries use parameterized statements via Supabase client; never use raw SQL with user input; periodic RLS penetration tests |
| Connection Pool Poisoning | Prepared statement cache pollution | Use PgBouncer in transaction mode (Supabase default); rotate connections periodically |
| Privilege Escalation via Functions | Database functions executing with elevated privileges | Review all database functions for SECURITY DEFINER usage; prefer SECURITY INVOKER; audit function permissions |

### 4.5 Claude API (Anthropic)

| Vector | Risk | Mitigation |
|---|---|---|
| Prompt Injection | Attacker crafts input that overrides system prompt to extract data | Separate user content from system instructions; validate AI inputs; sanitize employee names and descriptions that could contain injection payloads |
| Data Exfiltration via Crafted Prompts | Tricking the AI into including other tenants' data in responses | Never include cross-tenant data in prompts; scope all data retrieval to current tenant before prompt construction; implement output filtering |
| Excessive Data in Prompts | Sending more PII than necessary to Claude | Minimize data sent to AI — use IDs and aggregates instead of raw PII; pseudonymize employee names in prompts; document what data is sent and why |

### 4.6 File Uploads (CSV/Excel Import)

| Vector | Risk | Mitigation |
|---|---|---|
| Malicious File Content | CSV injection (formula injection in Excel), malware | Strip leading `=`, `+`, `-`, `@` from cell values; scan uploaded files; validate against expected schema before processing |
| Path Traversal | File names containing `../` used to write outside upload directory | Sanitize file names; use UUIDs for stored file names; never use user-supplied file names for storage |
| Oversized Uploads | DoS via extremely large files | Enforce file size limits (50MB); stream processing instead of loading entire file into memory |
| Data Validation Bypass | Importing invalid/malicious data that passes schema validation | Implement business rule validation (FK reference checks, range checks) in staging table before inserting into production tables |

### 4.7 WebSocket (Supabase Realtime)

| Vector | Risk | Mitigation |
|---|---|---|
| Message Injection | Sending crafted messages to other subscribers | Supabase Realtime enforces RLS on broadcast channels; validate all incoming messages |
| Connection Hijacking | Stealing WebSocket connection tokens | WebSocket auth uses same JWT as REST; enforce token refresh; close stale connections |
| Channel Enumeration | Discovering valid organization/site IDs via channel names | Use opaque channel names; validate channel access via RLS; never expose internal IDs in channel names |

---

## 5. Top 10 Security Controls for Pre-Launch

| Priority | Control | Threat(s) Addressed | Effort | Category |
|---|---|---|---|---|
| 1 | **Enforce MFA for admin, owner, and planner roles** | S-5, E-1, E-4 | Medium | Authentication |
| 2 | **Automated RLS bypass testing in CI/CD** — unit tests that attempt cross-tenant access with manipulated JWT claims | I-1, E-2, E-5 | Medium | Authorization |
| 3 | **Implement API rate limiting** — per-user and per-org sliding window with Redis | D-1, D-3, D-4, D-6 | Medium | Availability |
| 4 | **PII scrubbing in logs and error responses** — never log employee names, emails, pay rates, or phone numbers | I-4, I-7 | Low | Data Protection |
| 5 | **Field-level access control on API responses** — strip compensation data unless caller has HR/admin role | I-3 | Medium | Authorization |
| 6 | **AI prompt isolation** — tenant-scoped prompt construction, PII pseudonymization before sending to Claude, output filtering | I-2 | High | Data Protection |
| 7 | **Optimizer problem-size limits and timeouts** — max sites, employees, date range per run; 60-second hard timeout | D-1 | Low | Availability |
| 8 | **CSV import sanitization** — formula injection prevention, schema validation, anomaly detection on imported volumes | T-3, File Upload vectors | Medium | Input Validation |
| 9 | **Service role key rotation and monitoring** — quarterly rotation, alert on usage from unexpected IPs, scan for key exposure | E-3 | Low | Key Management |
| 10 | **Cryptographic plan approval signing** — hash of plan content + approver ID + timestamp stored with approval | R-2 | Medium | Non-Repudiation |

---

## 6. Compliance Readiness Assessment

### 6.1 GDPR

| Requirement | Status | Gap | Remediation |
|---|---|---|---|
| Lawful basis for processing | Partial | No documented legal basis per data category | Create data processing register with legal basis per entity |
| Data subject rights (access, rectification, erasure, portability) | Not implemented | No API endpoints or procedures for data subject requests | Implement DSR procedures (see `gdpr-compliance.md`) |
| Data Protection Impact Assessment | Not started | Required for large-scale processing of employee data | Conduct DPIA before launch |
| Data Processing Agreements | Not signed | Need DPAs with Supabase, Vercel, Anthropic, Fly.io | Negotiate and sign DPAs with all sub-processors |
| Cross-border data transfers | Partial | `data_residency_region` field exists but not enforced at infrastructure level | Implement region-aware data routing; establish SCCs with sub-processors |
| Breach notification (72-hour) | Not implemented | No incident response procedure | Define and rehearse breach notification workflow |
| Privacy by design | Partial | RLS provides tenant isolation; no PII minimization strategy | Implement pseudonymization for AI processing; minimize PII in logs |

### 6.2 SOC 2 Type II

| Trust Service Criteria | Status | Gap |
|---|---|---|
| Security (CC) | Partial | Need formal access control policy, vulnerability management program, incident response plan |
| Availability (A) | Partial | Need SLA definitions, disaster recovery plan, business continuity plan |
| Processing Integrity (PI) | Partial | Need input validation documentation, optimizer output verification |
| Confidentiality (C) | Partial | Need data classification policy, encryption key management documentation |
| Privacy (P) | Not started | Need privacy policy, data retention enforcement, consent management |

### 6.3 ISO 27001

| Domain | Status | Key Actions |
|---|---|---|
| Information Security Policy | Not started | Draft ISMS policy and scope statement |
| Risk Assessment | Partial | This threat model covers technical risks; need organizational risk assessment |
| Access Control | Partial | RLS and role-based access exist; need formal access control policy and periodic reviews |
| Cryptography | Partial | TLS in transit, Supabase encryption at rest; need key management policy |
| Operations Security | Not started | Need change management, capacity management, logging and monitoring procedures |
| Incident Management | Not started | Need incident response plan with defined severity levels and escalation paths |
| Business Continuity | Not started | Need BCP and disaster recovery procedures |
| Supplier Relationships | Not started | Need vendor security assessment process and ongoing monitoring |

---

## 7. Risk Heat Map Summary

```
                        Impact
                Low     Medium     High     Critical
           ┌─────────┬──────────┬─────────┬──────────┐
  High     │         │ I-3      │ S-5     │          │
           │         │ I-7      │         │          │
           │         │ E-3      │         │          │
Likelihood ├─────────┼──────────┼─────────┼──────────┤
  Medium   │         │ T-2, T-5 │ T-1,T-3 │ I-1, I-2 │
           │         │ D-2, D-3 │ D-1     │ E-2, S-3 │
           │         │ R-1      │ D-4     │          │
           ├─────────┼──────────┼─────────┼──────────┤
  Low      │ I-4     │ R-3, R-4 │ T-4     │ D-5, E-5 │
           │         │          │         │ I-6, E-1 │
           │         │          │         │ S-1      │
           └─────────┴──────────┴─────────┴──────────┘
```

**Immediate action required** (High likelihood + High/Critical impact): S-5 (credential stuffing), I-3 (API over-fetching), I-7 (PII in logs), E-3 (API key leakage).

**Priority attention** (Medium likelihood + Critical impact): I-1 (RLS bypass), I-2 (AI prompt injection), E-2 (cross-tenant access), S-3 (SSO misconfiguration).

---

## 8. Review Cadence

| Activity | Frequency | Owner |
|---|---|---|
| Threat model review and update | Quarterly | Security Lead |
| Penetration testing (external) | Annually + after major releases | Third-party vendor |
| RLS bypass testing | Every schema migration (CI/CD) | Engineering |
| Dependency vulnerability scan | Continuous (automated) | DevOps |
| Access review (role assignments) | Quarterly | Security Lead + Org Admins |
| Incident response drill | Semi-annually | Engineering + Security |
| Key rotation (service role, API keys) | Quarterly | DevOps |
| SOC 2 / compliance audit | Annually | Compliance / External Auditor |
