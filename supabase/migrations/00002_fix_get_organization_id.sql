-- Fix get_organization_id() to also check app_metadata in JWT claims
-- Supabase stores custom user data in app_metadata, which appears
-- nested inside the JWT claims object, not at the top level.

CREATE OR REPLACE FUNCTION public.get_organization_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    -- Try direct claim first
    (current_setting('request.jwt.claims', true)::json->>'organization_id')::uuid,
    -- Then try inside app_metadata (where Supabase puts custom data)
    ((current_setting('request.jwt.claims', true)::json->'app_metadata')->>'organization_id')::uuid,
    -- Fallback for service-role connections
    (current_setting('app.organization_id', true))::uuid
  );
$$ LANGUAGE sql STABLE;
