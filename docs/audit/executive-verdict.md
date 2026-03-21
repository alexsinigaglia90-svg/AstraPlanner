# AstraPlanner Architecture Audit: Executive Verdict

> Audit Date: 2026-03-20
> Target Vision: "An ultra-scalable, enterprise-grade, AI-driven workforce planning platform for warehouse and logistics environments."
> Auditor Posture: Adversarial. No credit for intentions.

---

## The One-Sentence Verdict

AstraPlanner is a 1.9 MB architecture design document masquerading as a software platform. There is no platform. There is no software.

---

## What Exists

| Asset | Count | Status |
|-------|-------|--------|
| Markdown documentation files | 51 | Written, internally reviewed, structured across 11 sections |
| SQL schema file (DDL) | 1 | Written, never executed against a database |
| CLAUDE.md configuration | 1 | References `npm run build`, `npm run test`, `npm run lint` — none of which exist |
| .env file | 1 | Present (contents not audited for secrets) |
| .mcp.json | 1 | Claude-flow agent orchestration config |
| package.json | 0 | Does not exist |
| Source code files (.ts, .tsx, .js, .jsx, .py, etc.) | 0 | Zero |
| UI components | 0 | Zero |
| API routes | 0 | Zero |
| Test files | 0 | Zero |
| CI/CD pipeline | 0 | Zero |
| Deployment configuration | 0 | Zero |
| Supabase project | 0 | Not configured |
| node_modules | 0 | No dependencies installed |
| Build output | 0 | Nothing to build |

The only `.js` files in the repository are Claude-flow helper scripts in `.claude/helpers/` — agent orchestration tooling, not application code.

---

## What Does Not Exist

Everything that would make this a product:

- **No application runtime.** No Next.js app, no Supabase Edge Functions, no tRPC router, no API layer. The tech stack document specifies Next.js 14, Supabase, tRPC, Tailwind, Zustand, React Query — none are installed.

- **No database.** `schema.sql` exists as a file. It has never been executed. There is no Supabase project. There is no database. The schema contains 14 documented bugs (per the project's own internal review) including missing fields the optimizer needs, a UNIQUE constraint that allows double-booking, and materialized views that leak data across tenants.

- **No optimization engine.** The documents describe HiGHS WASM integration, 5 solver strategies, a constraint catalog with 30+ constraints, and a demand-to-assignment pipeline. Zero lines of solver code exist. HiGHS has not been imported. No WASM binary is present.

- **No AI integration.** Eleven documents describe an AI layer spanning natural language setup, recommendation engines, organizational intelligence, explainability, and a 4-phase evolution roadmap. Zero API calls to Claude or any LLM exist. No prompt templates are implemented. No Ruflo/claude-flow agent configuration targets the application.

- **No UI.** Seven Control Room widgets are specified. Five personas are defined. An 8-phase setup wizard is documented screen by screen. Zero React components exist. Zero CSS exists. Zero routes exist.

- **No tests.** The CLAUDE.md instructs developers to "ALWAYS run tests after making code changes." There are no tests. There is no test framework. There is no code to test.

- **No deployment.** No Vercel config. No Docker files. No IaC templates. No environment variable management beyond a bare `.env` file. No CI/CD pipeline of any kind.

---

## The Documentation Is Genuinely Exceptional

This must be stated clearly: the documentation quality is remarkable. Across 1.9 MB of structured prose, the knowledge base demonstrates:

- **Deep domain expertise.** The constraint catalog reflects real warehouse operations — min rest between shifts, max consecutive days, hazardous zone certifications, union seniority rules, jurisdiction-specific overtime thresholds. These are not generic HR concepts; they are logistics-specific.

- **Rigorous failure mode analysis.** 24 failure modes across 5 categories, each with severity, likelihood, detection difficulty, and mitigation strategy. The failure modes document reads like it was written by someone who has watched workforce planning systems fail in production.

- **Honest self-criticism.** The project's own internal reviews (REVIEW.md, REVIEW-FULL.md, SYSTEMS-REVIEW.md) identified 3 critical contradictions, 14 data model bugs, 6 legally incorrect specifications, 7 broken layer handoffs, and 19 documentation gaps. This level of self-awareness is rare.

- **Realistic scaling analysis.** Volume estimates, query cost projections, partitioning strategies, and honest assessments of where Supabase Edge Function limits will break (256 MB memory, 60-second timeout for HiGHS WASM).

- **Thoughtful domain modeling.** The entity relationship design, the 5-level proficiency model, the demand granularity taxonomy, the process categorization (inbound/outbound/value-added/support/returns) — these reflect genuine domain understanding.

None of this changes the fundamental fact: documentation is not a product.

---

## What Is Misleading

1. **The CLAUDE.md file.** It specifies `npm run build`, `npm run test`, `npm run lint` as standard commands. There is no `package.json`. These commands do not exist. A developer cloning this repo and following the setup instructions hits a wall immediately.

2. **The schema.sql header.** It says "Paste this entire file into the Supabase SQL Editor and execute." This implies a Supabase project exists. It does not. The schema also contains known bugs that would cause runtime failures if executed.

3. **The INDEX.md framing.** The index presents AstraPlanner as a "platform" with 51 documents organized into functional sections. The implied message is that these documents describe a system that exists. They describe a system that is imagined.

4. **The "rewritten" and "new" tags.** Several index entries say "(rewritten)" or "(new)", implying iterative development. These refer to documentation revisions, not code changes. No code has ever existed to be rewritten.

5. **The internal reviews.** REVIEW-FULL.md says "14 data model bugs" and "7 broken handoffs" — language that implies bugs in a running system. These are design document inconsistencies. You cannot have a bug in code that does not exist.

---

## What This Actually Is

AstraPlanner is a **pre-implementation architecture design document set**. It is:

- A comprehensive requirements specification
- A domain model and constraint catalog
- A technology selection rationale
- A risk assessment
- An honest self-critique of all of the above

It is not:

- A minimum viable product
- A prototype
- A proof of concept
- A deployable system
- A testable artifact

---

## The Gap Between Vision and Reality

The documentation describes a system that would take an experienced team of 5-7 engineers approximately 18-24 months to build to production quality. The current state of the repository represents Month 0 of that journey. Not Month 1. Month 0 — because no implementation decision has been validated by running code.

The internal reviews have already identified issues that may invalidate core architectural assumptions:

- HiGHS WASM may not fit in Edge Function memory for enterprise-scale problems (no benchmark exists)
- The 256 MB memory limit and 60-second timeout are untested against real problem sizes
- The multi-tenancy model (RLS-only) has a known data leakage vector via materialized views
- 6 labor law specifications are documented as legally incorrect
- The rate limiting design (30 writes/minute) breaks the core drag-and-drop scheduling UX

These are not theoretical risks. They are design document contradictions that would become blocking issues in Sprint 1.

---

## Honest Assessment

| Attribute | Score |
|-----------|-------|
| Vision quality | 8/10 |
| Domain understanding | 8/10 |
| Documentation thoroughness | 9/10 |
| Self-awareness of gaps | 8/10 |
| Implementation progress | 0/10 |
| Deployability | 0/10 |
| Enterprise readiness | 0/10 |
| Product-market fit evidence | 0/10 |

**Overall: This is a strong Month 0 of a 24-month journey.** The documentation provides a genuine head start — an implementation team would not be starting from a blank page. But they would also not be starting from a product. They would be starting from a vision document that contains known contradictions they must resolve before writing their first line of code.

---

## Recommendation

Stop writing documentation. Start writing code. Specifically:

1. **Week 1:** Execute `schema.sql` against a real Supabase project. Fix the 14 known bugs. Validate that RLS policies work.
2. **Week 2:** Initialize the Next.js project. Install dependencies. Create the first tRPC router. Connect to Supabase.
3. **Week 3:** Build one end-to-end vertical slice: create an organization, create a site, create a process. No AI. No optimization. Just CRUD.
4. **Week 4:** Integrate HiGHS WASM. Solve one toy problem (10 employees, 1 week, 3 processes). Benchmark memory and time. This single test will validate or invalidate the Edge Function strategy.

Until code exists, this is a thesis, not a product.
