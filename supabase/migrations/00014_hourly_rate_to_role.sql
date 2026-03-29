-- 00014_hourly_rate_to_role.sql
-- Move hourly_rate from employee-level to job_role-level
-- Employee.hourly_rate becomes an optional individual override

-- Add hourly_rate to job_role (the primary source for rate)
ALTER TABLE job_role ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(8,2);
COMMENT ON COLUMN job_role.hourly_rate IS 'Default hourly rate for this role. Employees inherit this unless they have an individual override.';

-- Employee.hourly_rate remains but is now an override
COMMENT ON COLUMN employee.hourly_rate IS 'Individual hourly rate override. If NULL, inherits from job_role.hourly_rate.';
