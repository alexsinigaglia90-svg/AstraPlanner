-- Smart Join: domain-based organization matching with admin approval
CREATE TABLE join_request (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  email           VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  assigned_role   VARCHAR(50),
  decided_by      UUID,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_join_request_user UNIQUE (user_id, organization_id)
);

-- Enable realtime for live status updates on the waiting screen
ALTER PUBLICATION supabase_realtime ADD TABLE join_request;
