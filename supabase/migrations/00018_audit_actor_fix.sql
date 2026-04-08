-- =============================================================================
-- Migration 00018: Accurate actor_id in audit_log for service-role mutations
-- =============================================================================
--
-- Context
-- -------
-- The existing fn_audit_trigger() (see 00001_initial_schema.sql) resolves the
-- acting user from `request.jwt.claims ->> 'sub'`. This works for mutations
-- that flow through PostgREST with an end-user JWT (our normal tRPC path),
-- but it fails for mutations executed via the Supabase service-role client
-- because the service-role connection does not propagate the end-user JWT
-- into the database session. The result is audit_log rows with
-- actor_id = NULL, which breaks the "who did what" property of the audit
-- trail for any change made through the AI chat tools or admin HTTP routes.
--
-- Fix
-- ---
-- PostgREST already exposes the incoming HTTP headers as a JSONB setting via
-- `current_setting('request.headers', true)`. The Supabase JS client allows
-- custom `global.headers` on a client instance, so we can attach an
-- `x-actor-id: <uuid>` header to every request made by a user-scoped admin
-- client and read it back from the trigger function. This approach is
-- stateless (no transaction / session coupling), and the header is set
-- per-client, not per-request, which makes the wiring at call sites trivial.
--
-- Preference order for resolving the actor in the trigger:
--   1. request.headers ->> 'x-actor-id'   (service-role path with user header)
--   2. request.jwt.claims ->> 'sub'       (end-user JWT via PostgREST)
--   3. NULL                                (system / background jobs)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_action VARCHAR(50);
    v_org_id UUID;
    v_entity_id UUID;
    v_actor_id UUID;
    v_raw TEXT;
BEGIN
    v_action := TG_OP;

    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
        v_org_id := OLD.organization_id;
        v_entity_id := OLD.id;
    ELSIF TG_OP = 'INSERT' THEN
        v_old := NULL;
        v_new := to_jsonb(NEW);
        v_org_id := NEW.organization_id;
        v_entity_id := NEW.id;
    ELSE -- UPDATE
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_org_id := NEW.organization_id;
        v_entity_id := NEW.id;
    END IF;

    -- 1. Prefer the explicit x-actor-id header attached by the server-side
    --    admin client (src/lib/supabase/admin.ts createAdminClientForUser).
    v_raw := current_setting('request.headers', true);
    IF v_raw IS NOT NULL AND v_raw <> '' THEN
        BEGIN
            v_actor_id := NULLIF(v_raw::json ->> 'x-actor-id', '')::UUID;
        EXCEPTION WHEN others THEN
            v_actor_id := NULL;
        END;
    END IF;

    -- 2. Fall back to the JWT sub claim (normal tRPC path via PostgREST).
    IF v_actor_id IS NULL THEN
        v_raw := current_setting('request.jwt.claims', true);
        IF v_raw IS NOT NULL AND v_raw <> '' THEN
            BEGIN
                v_actor_id := NULLIF(v_raw::json ->> 'sub', '')::UUID;
            EXCEPTION WHEN others THEN
                v_actor_id := NULL;
            END;
        END IF;
    END IF;

    INSERT INTO audit_log (
        organization_id, actor_id, actor_type, action,
        entity_type, entity_id, before_state, after_state
    ) VALUES (
        v_org_id,
        v_actor_id,
        'user',
        v_action,
        TG_TABLE_NAME,
        v_entity_id,
        v_old,
        v_new
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_audit_trigger() IS
  'Generic audit trigger. Resolves actor_id from request.headers.x-actor-id '
  '(preferred, used by service-role admin client) or request.jwt.claims.sub '
  '(fallback, used by the normal tRPC path via PostgREST).';
