-- =============================================================================
-- Migration 00021: Enable RLS on join_request (security hardening)
-- =============================================================================
--
-- Context
-- -------
-- Migration 00012_join_request.sql created the `join_request` table and
-- added it to the supabase_realtime publication so the join-pending
-- client page can subscribe to live status updates. However, it never
-- enabled Row-Level Security on the table. The client-side filter
-- `user_id=eq.${user.id}` on the Realtime channel is a hint that
-- Supabase applies in the broadcast, but it does NOT protect the
-- underlying SELECT on `join_request` via the REST / PostgREST API.
--
-- Without RLS, any authenticated user can issue a SELECT on join_request
-- and observe other users' pending joins: the victim's email, full_name,
-- target organization_id, and status. This is a low-severity but
-- aantoonbare cross-user PII leak during the onboarding flow.
--
-- This migration closes the gap:
--   1. Enable RLS on the table.
--   2. Allow a user to see (and delete) only their OWN join_request.
--   3. Allow tenant_admins of the target organization to see pending
--      join_requests addressed to their org, so the approval flow
--      still works.
-- =============================================================================

ALTER TABLE join_request ENABLE ROW LEVEL SECURITY;

-- Policy 1: a user can read and delete their own join_request rows.
-- Cannot insert/update via policy — the onboarding flow creates rows
-- via the service-role client, which bypasses RLS.
CREATE POLICY join_request_self_select
    ON join_request
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY join_request_self_delete
    ON join_request
    FOR DELETE
    USING (user_id = auth.uid());

-- Policy 2: tenant_admins and above can see all pending join_requests
-- addressed to their own organization. This powers the admin approval
-- screen without ever exposing cross-org data.
--
-- The helper functions public.get_organization_id() and
-- public.get_user_role() are defined in migration 00001.
CREATE POLICY join_request_admin_select
    ON join_request
    FOR SELECT
    USING (
        organization_id = public.get_organization_id()
        AND public.get_user_role() IN ('tenant_admin', 'super_admin', 'owner', 'admin')
    );

-- Service-role writes (from the onboarding routes) bypass RLS, so we do
-- not need an INSERT or UPDATE policy. Anon has no access at all.
