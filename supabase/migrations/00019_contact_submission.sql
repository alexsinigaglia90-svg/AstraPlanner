-- =============================================================================
-- Migration 00019: Persist contact form submissions
-- =============================================================================
--
-- Context
-- -------
-- /api/contact previously only wrote to console.log (see
-- src/app/api/contact/route.ts before this commit), which meant:
--   1. Submissions were lost after the Vercel function instance recycled.
--   2. PII (user email) was written to server logs — an AVG violation.
--   3. There was no way for the AstraPlanner team to review incoming leads.
--
-- This migration introduces a persistence-only table for contact submissions.
-- Submissions originate from unauthenticated visitors and do not belong to any
-- customer organization, so the standard multi-tenant RLS pattern does not
-- apply: `organization_id` is intentionally absent. Instead, RLS is locked
-- down to deny all direct client access; reads go through the super_admin
-- path (service-role only).
--
-- Retention
-- ---------
-- Contact submissions are kept for **one year** after creation. A scheduled
-- cleanup job (added separately) will delete rows older than this cut-off
-- automatically. This aligns with AVG art. 5(1)(e) storage limitation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_submission (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(200)  NOT NULL,
    company          VARCHAR(200)  NOT NULL,
    user_email       VARCHAR(320),                                  -- RFC 5321 max
    message          TEXT          NOT NULL CHECK (char_length(message) <= 5000),
    ip_address       INET,                                          -- captured for abuse triage
    user_agent       TEXT,
    status           VARCHAR(20)   NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'triaged', 'contacted', 'spam', 'archived')),
    triaged_by       UUID,                                          -- AstraPlanner staff user id
    triaged_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE contact_submission IS
  'Leads submitted via the public /api/contact form. Not tenant-scoped — '
  'these come from prospects and are owned by AstraPlanner, not by any '
  'customer organization. Retention: 1 year from created_at.';

COMMENT ON COLUMN contact_submission.user_email IS
  'Optional — only populated when the submitter happened to be logged in '
  'to an existing AstraPlanner account at the time of submission.';

CREATE INDEX idx_contact_submission_created_at
  ON contact_submission (created_at DESC);

CREATE INDEX idx_contact_submission_status
  ON contact_submission (status, created_at DESC)
  WHERE status IN ('new', 'triaged');

-- RLS: deny all client access. The table is only touched by the
-- server-side service-role client in /api/contact (insert) and via the
-- admin tRPC path guarded by super_admin checks (select).
ALTER TABLE contact_submission ENABLE ROW LEVEL SECURITY;

-- No policies are created, so:
--   - authenticated users cannot read their own or anyone else's submissions
--   - anon cannot read submissions
--   - Only the service_role (which bypasses RLS) can read/write.
-- This is the strongest possible posture for a table that should never be
-- exposed via PostgREST to end users.


-- ---------------------------------------------------------------------------
-- Cleanup function: delete submissions older than 1 year.
-- This is meant to be called by a pg_cron job or by the application's
-- daily maintenance route. Kept as a separate function so it can be
-- reviewed and scheduled independently.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_old_contact_submissions()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM contact_submission
    WHERE created_at < now() - INTERVAL '1 year'
      AND status NOT IN ('triaged', 'contacted');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION purge_old_contact_submissions() IS
  'Delete contact submissions older than 1 year, unless they have been '
  'triaged or contacted (which we keep for CRM continuity). Returns the '
  'number of rows deleted.';

-- Only the service_role and postgres may call this cleanup function.
REVOKE EXECUTE ON FUNCTION purge_old_contact_submissions() FROM public;
GRANT EXECUTE ON FUNCTION purge_old_contact_submissions() TO service_role;
