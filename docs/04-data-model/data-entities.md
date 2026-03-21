# AstraPlanner Data Entity Catalog

This document defines every core data entity in the AstraPlanner platform. Each entity includes a description, full attribute table with types, relationships, constraints, and an example record. All entities exist within a multi-tenant schema where `organization_id` is the root partition key.

---

## 1. Organization

**Description:** The root tenant entity. Every piece of data in AstraPlanner belongs to exactly one Organization. Represents a customer company — a logistics operator, 3PL, retailer, or manufacturer. Holds global configuration, subscription details, and default settings that cascade to child entities.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `name` | `varchar(255)` | No | — | Legal entity name |
| `slug` | `varchar(100)` | No | — | URL-safe unique identifier (e.g., `acme-logistics`) |
| `subscription_tier` | `enum('starter','professional','enterprise')` | No | `'starter'` | Controls feature gates and volume limits |
| `billing_email` | `varchar(255)` | No | — | Primary billing contact |
| `primary_contact_name` | `varchar(255)` | Yes | — | Account owner name |
| `primary_contact_phone` | `varchar(50)` | Yes | — | Account owner phone |
| `logo_url` | `text` | Yes | — | Organization logo for white-label UI |
| `default_timezone` | `varchar(50)` | No | `'UTC'` | Fallback timezone when sites do not specify one |
| `default_locale` | `varchar(10)` | No | `'en-US'` | Fallback locale for formatting |
| `default_currency` | `char(3)` | No | `'USD'` | ISO 4217 currency code |
| `settings_json` | `jsonb` | No | `'{}'` | Org-wide config overrides (planning horizons, approval workflows, AI parameters) |
| `feature_flags` | `jsonb` | No | `'{}'` | Feature gate overrides keyed by flag name |
| `max_sites` | `integer` | No | `10` | Subscription-enforced site limit |
| `max_employees` | `integer` | No | `500` | Subscription-enforced employee limit |
| `data_residency_region` | `varchar(20)` | No | `'us-east'` | Region constraint for data storage (GDPR compliance) |
| `sso_provider` | `varchar(50)` | Yes | — | SSO integration type (`okta`, `azure_ad`, `google`) |
| `sso_config_json` | `jsonb` | Yes | — | SSO connection parameters (encrypted at rest) |
| `status` | `enum('active','suspended','cancelled','trial')` | No | `'trial'` | Account lifecycle state |
| `trial_ends_at` | `timestamptz` | Yes | — | Trial expiry; null for paid accounts |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(slug)` — globally unique across all tenants.
- `CHECK(max_sites > 0)`.
- `CHECK(max_employees > 0)`.
- `CHECK(subscription_tier IN ('starter','professional','enterprise'))`.

### Relationships

- **1:many** to `Site`
- **1:many** to `DemandType` (org-configurable demand types)
- **1:many** to `IntegrationConfig`
- **1:many** to `LaborRule`
- **1:many** to all other entities via `organization_id` foreign key

### Example Record

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Acme Logistics Inc.",
  "slug": "acme-logistics",
  "subscription_tier": "enterprise",
  "billing_email": "billing@acmelogistics.com",
  "primary_contact_name": "Sarah Chen",
  "primary_contact_phone": "+1-555-0142",
  "logo_url": "https://cdn.astraplanner.io/orgs/acme/logo.png",
  "default_timezone": "America/Chicago",
  "default_locale": "en-US",
  "default_currency": "USD",
  "settings_json": {
    "planning_horizon_days": 28,
    "approval_workflow_enabled": true,
    "ai_auto_plan_enabled": true,
    "overtime_alert_threshold_pct": 15
  },
  "feature_flags": {
    "scenario_simulation": true,
    "ai_demand_forecasting": true,
    "multi_site_transfer": true
  },
  "max_sites": 5000,
  "max_employees": 500000,
  "data_residency_region": "us-east",
  "sso_provider": "okta",
  "status": "active",
  "trial_ends_at": null,
  "created_at": "2025-01-15T08:00:00Z",
  "updated_at": "2026-03-01T14:22:00Z"
}
```

---

## 2. Site

**Description:** A physical or virtual operational location — a warehouse, distribution center, fulfillment hub, cross-dock, or store. Sites are the primary organizational unit for demand, workforce, and planning. Each site operates in a specific timezone and has defined operating hours and capacity ceilings.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id`; partition key for RLS |
| `name` | `varchar(255)` | No | — | Human-readable site name |
| `code` | `varchar(20)` | No | — | Short code (e.g., `CHI-DC-01`) |
| `site_type` | `enum('warehouse','distribution_center','fulfillment_center','cross_dock','store','manufacturing','office')` | No | — | Determines which processes are applicable |
| `address_line1` | `varchar(255)` | No | — | Street address |
| `address_line2` | `varchar(255)` | Yes | — | Suite, unit, dock |
| `city` | `varchar(100)` | No | — | City |
| `state_province` | `varchar(100)` | Yes | — | State or province |
| `postal_code` | `varchar(20)` | No | — | Postal/ZIP code |
| `country_code` | `char(2)` | No | — | ISO 3166-1 alpha-2 |
| `latitude` | `decimal(10,7)` | Yes | — | GPS latitude for map display |
| `longitude` | `decimal(10,7)` | Yes | — | GPS longitude |
| `timezone` | `varchar(50)` | No | — | IANA timezone (e.g., `America/Chicago`) |
| `operating_hours_json` | `jsonb` | No | — | Weekly operating schedule (see example) |
| `capacity_sqft` | `integer` | Yes | — | Total usable square footage |
| `max_headcount` | `integer` | Yes | — | Maximum people allowed on-site concurrently |
| `labor_market_zone` | `varchar(50)` | Yes | — | Regional labor classification for wage benchmarks |
| `cost_center_code` | `varchar(50)` | Yes | — | Financial cost center for billing |
| `settings_json` | `jsonb` | No | `'{}'` | Site-level config overrides |
| `status` | `enum('active','inactive','onboarding','decommissioned')` | No | `'onboarding'` | Site lifecycle state |
| `go_live_date` | `date` | Yes | — | Date site began using AstraPlanner |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, code)` — site code unique within tenant.
- `CHECK(max_headcount > 0 OR max_headcount IS NULL)`.
- FK on `organization_id` references `Organization(id) ON DELETE CASCADE`.

### Relationships

- **many:1** to `Organization`
- **1:many** to `Department`
- **1:many** to `DemandForecast`
- **1:many** to `ProcessProductivityStandard`
- **1:many** to `ShiftAssignment`
- **many:many** to `Employee` (home site + assigned sites)

### Example Record

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Chicago Distribution Center 1",
  "code": "CHI-DC-01",
  "site_type": "distribution_center",
  "address_line1": "4500 W Industrial Ave",
  "city": "Chicago",
  "state_province": "Illinois",
  "postal_code": "60632",
  "country_code": "US",
  "latitude": 41.8140530,
  "longitude": -87.7227780,
  "timezone": "America/Chicago",
  "operating_hours_json": {
    "monday": {"open": "05:00", "close": "23:00"},
    "tuesday": {"open": "05:00", "close": "23:00"},
    "wednesday": {"open": "05:00", "close": "23:00"},
    "thursday": {"open": "05:00", "close": "23:00"},
    "friday": {"open": "05:00", "close": "23:00"},
    "saturday": {"open": "06:00", "close": "18:00"},
    "sunday": null
  },
  "capacity_sqft": 250000,
  "max_headcount": 350,
  "labor_market_zone": "midwest-urban",
  "cost_center_code": "CC-CHI-OPS-01",
  "status": "active",
  "go_live_date": "2025-03-01"
}
```

---

## 3. Department

**Description:** An organizational subdivision within a Site. Departments represent functional areas such as Receiving, Picking, Packing, Shipping, Returns, or Quality Control. Each department has a budget center, a manager, and groups related processes.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id`; RLS partition key |
| `site_id` | `uuid` | No | — | FK to `Site.id` |
| `name` | `varchar(100)` | No | — | Department name (e.g., `Outbound`, `Inbound`) |
| `code` | `varchar(20)` | No | — | Short code (e.g., `OB`, `IB`, `QC`) |
| `budget_center` | `varchar(50)` | Yes | — | Financial budget center reference |
| `manager_employee_id` | `uuid` | Yes | — | FK to `Employee.id` — department manager |
| `parent_department_id` | `uuid` | Yes | — | FK to self for nested departments |
| `headcount_target` | `integer` | Yes | — | Planned headcount for budgeting |
| `description` | `text` | Yes | — | Free-text description of department function |
| `status` | `enum('active','inactive')` | No | `'active'` | Department lifecycle state |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, site_id, code)`.
- FK `site_id` references `Site(id) ON DELETE CASCADE`.
- FK `manager_employee_id` references `Employee(id) ON DELETE SET NULL`.
- FK `parent_department_id` references `Department(id) ON DELETE SET NULL`.

### Relationships

- **many:1** to `Site`
- **1:many** to `Process`
- **self-referential** via `parent_department_id` (hierarchical departments)
- **many:1** to `Employee` (manager)

### Example Record

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "site_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "name": "Outbound Operations",
  "code": "OB",
  "budget_center": "BC-CHI-OB-2026",
  "manager_employee_id": "e5f6a7b8-9012-3456-7890-abcdef123456",
  "parent_department_id": null,
  "headcount_target": 120,
  "description": "Pick, pack, and ship operations for outbound order fulfillment.",
  "status": "active"
}
```

---

## 4. Process

**Description:** A discrete operational activity performed at a site — the atomic unit of work in AstraPlanner's demand-to-workforce chain. Processes are linked to site types (e.g., `pick` applies to warehouses but not offices) and serve as the join point between demand, productivity standards, employee skills, and shift assignments.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `department_id` | `uuid` | Yes | — | FK to `Department.id`; null for org-wide processes |
| `name` | `varchar(100)` | No | — | Process name (e.g., `Case Pick`, `Pallet Receive`) |
| `code` | `varchar(30)` | No | — | Short code (e.g., `CASE_PICK`, `PAL_RCV`) |
| `category` | `enum('inbound','outbound','value_added','support','returns')` | No | — | Process category for grouping |
| `applicable_site_types` | `text[]` | No | — | Array of `site_type` values where this process applies |
| `unit_of_measure` | `varchar(30)` | No | — | What is counted (e.g., `cases`, `pallets`, `lines`, `units`) |
| `requires_certification` | `boolean` | No | `false` | Whether employees need active certification |
| `min_skill_level` | `smallint` | No | `1` | Minimum proficiency (1-5) required to perform |
| `hazard_level` | `enum('none','low','medium','high')` | No | `'none'` | Safety classification |
| `equipment_required` | `text[]` | Yes | — | Equipment needed (e.g., `['forklift','RF_scanner']`) |
| `description` | `text` | Yes | — | Detailed description of the process |
| `display_order` | `smallint` | No | `0` | UI sort order within department |
| `is_active` | `boolean` | No | `true` | Soft-delete flag |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, code)`.
- `CHECK(min_skill_level BETWEEN 1 AND 5)`.
- FK `department_id` references `Department(id) ON DELETE SET NULL`.

### Relationships

- **many:1** to `Department` (optional; org-level processes exist)
- **1:many** to `ProcessProductivityStandard`
- **1:many** to `EmployeeSkill`
- **many:many** to `DemandType` via `demand_type_process_mapping` join table
- **1:many** to `ShiftAssignment`

### Example Record

```json
{
  "id": "d4e5f6a7-b890-1234-5678-9abcdef01234",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "department_id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
  "name": "Case Pick",
  "code": "CASE_PICK",
  "category": "outbound",
  "applicable_site_types": ["warehouse", "distribution_center", "fulfillment_center"],
  "unit_of_measure": "cases",
  "requires_certification": false,
  "min_skill_level": 2,
  "hazard_level": "low",
  "equipment_required": ["RF_scanner", "pallet_jack"],
  "description": "Selecting individual cases from racking for outbound order fulfillment.",
  "display_order": 1,
  "is_active": true
}
```

---

## 5. ProcessProductivityStandard

**Description:** Defines the expected throughput rate for a given process, segmented by skill level and optionally by site. This is the critical conversion factor in AstraPlanner's demand-to-workload calculation: `hours_needed = demand_volume / units_per_hour`. Standards vary because a Level 5 picker is faster than a Level 1, and site layout affects throughput.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `process_id` | `uuid` | No | — | FK to `Process.id` |
| `site_id` | `uuid` | Yes | — | FK to `Site.id`; null means org-wide default |
| `skill_level` | `smallint` | No | — | Proficiency level 1-5 this standard applies to |
| `units_per_hour` | `decimal(10,2)` | No | — | Expected throughput rate |
| `unit_of_measure` | `varchar(30)` | No | — | Must match `Process.unit_of_measure` |
| `effective_date` | `date` | No | — | When this standard takes effect |
| `expiry_date` | `date` | Yes | — | When this standard is superseded; null = current |
| `source` | `enum('engineered','historical','ai_estimated','manual')` | No | `'manual'` | How this standard was derived |
| `confidence_score` | `decimal(3,2)` | Yes | — | AI/statistical confidence (0.00-1.00) |
| `sample_size` | `integer` | Yes | — | Number of observations used for historical/AI source |
| `notes` | `text` | Yes | — | Justification or context |
| `created_by` | `uuid` | No | — | FK to user who created this record |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, process_id, site_id, skill_level, effective_date)` — one standard per process/site/skill/date combo.
- `CHECK(skill_level BETWEEN 1 AND 5)`.
- `CHECK(units_per_hour > 0)`.
- `CHECK(expiry_date IS NULL OR expiry_date > effective_date)`.
- FK `process_id` references `Process(id) ON DELETE CASCADE`.
- FK `site_id` references `Site(id) ON DELETE CASCADE`.

### Relationships

- **many:1** to `Process`
- **many:1** to `Site` (optional)
- Used in `WorkloadPlan` computation

### Example Record

```json
{
  "id": "e5f6a7b8-9012-3456-ef01-23456789abcd",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "process_id": "d4e5f6a7-b890-1234-5678-9abcdef01234",
  "site_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "skill_level": 3,
  "units_per_hour": 145.50,
  "unit_of_measure": "cases",
  "effective_date": "2026-01-01",
  "expiry_date": null,
  "source": "historical",
  "confidence_score": 0.92,
  "sample_size": 2400,
  "notes": "Based on Q4 2025 time-study data for CHI-DC-01 case pick area.",
  "created_by": "f6a7b890-1234-5678-9abc-def012345678"
}
```

---

## 6. DemandForecast

**Description:** A time-series record representing forecasted or actual demand volume for a specific site and demand type on a given date. This is the top of the planning chain: demand drives workload, which drives FTE requirements, which drives shift assignments. Forecasts can come from integrated WMS/OMS systems, uploaded CSVs, or AstraPlanner's AI forecasting engine.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `site_id` | `uuid` | No | — | FK to `Site.id` |
| `demand_type_id` | `uuid` | No | — | FK to `DemandType.id` |
| `forecast_date` | `date` | No | — | The date this forecast applies to |
| `volume` | `decimal(12,2)` | No | — | Forecasted quantity in demand type's UOM |
| `volume_lower_bound` | `decimal(12,2)` | Yes | — | Lower bound of confidence interval |
| `volume_upper_bound` | `decimal(12,2)` | Yes | — | Upper bound of confidence interval |
| `confidence_interval` | `decimal(3,2)` | Yes | — | Confidence level (e.g., 0.95 for 95%) |
| `source` | `enum('wms_import','oms_import','csv_upload','ai_forecast','manual_entry')` | No | — | How this forecast was generated |
| `source_reference` | `varchar(255)` | Yes | — | External system ID or import batch ID |
| `is_actual` | `boolean` | No | `false` | True when replaced with actual demand data |
| `plan_version_id` | `uuid` | Yes | — | FK to `PlanVersion.id` if part of a scenario |
| `granularity` | `enum('daily','weekly','monthly')` | No | `'daily'` | Time granularity |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, site_id, demand_type_id, forecast_date, plan_version_id)` — one forecast per site/type/date/version.
- `CHECK(volume >= 0)`.
- `CHECK(volume_lower_bound IS NULL OR volume_lower_bound <= volume)`.
- `CHECK(volume_upper_bound IS NULL OR volume_upper_bound >= volume)`.
- FK `site_id` references `Site(id) ON DELETE CASCADE`.
- FK `demand_type_id` references `DemandType(id) ON DELETE RESTRICT`.

### Relationships

- **many:1** to `Site`
- **many:1** to `DemandType`
- **many:1** to `PlanVersion` (optional; null = baseline forecast)
- **1:many** to `WorkloadPlan` (demand is decomposed into workload)

### Example Record

```json
{
  "id": "f6a7b890-1234-5678-abcd-ef0123456789",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "site_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "demand_type_id": "a7b89012-3456-7890-abcd-ef1234567890",
  "forecast_date": "2026-03-25",
  "volume": 12500.00,
  "volume_lower_bound": 10800.00,
  "volume_upper_bound": 14200.00,
  "confidence_interval": 0.90,
  "source": "ai_forecast",
  "source_reference": "forecast_batch_20260320_001",
  "is_actual": false,
  "plan_version_id": null,
  "granularity": "daily"
}
```

---

## 7. DemandType

**Description:** An organization-configurable classification of demand. Different businesses measure demand in different units — an e-commerce fulfillment center tracks orders and lines, a grocery DC tracks cases and pallets. Each demand type has a unit of measure and maps to one or more processes (e.g., `orders` demand drives `pick`, `pack`, and `ship` processes).

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `name` | `varchar(100)` | No | — | Demand type name (e.g., `Outbound Orders`) |
| `code` | `varchar(30)` | No | — | Short code (e.g., `OB_ORDERS`, `IB_PALLETS`) |
| `unit_of_measure` | `varchar(30)` | No | — | UOM for volume (e.g., `orders`, `units`, `pallets`, `cases`, `lines`) |
| `category` | `enum('inbound','outbound','returns','internal')` | No | — | Demand direction |
| `conversion_factors_json` | `jsonb` | Yes | — | Ratios to convert between UOMs (e.g., 1 order = 3.2 lines avg) |
| `description` | `text` | Yes | — | Explanation of this demand type |
| `is_active` | `boolean` | No | `true` | Soft-delete flag |
| `display_order` | `smallint` | No | `0` | UI sort order |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Join Table: `demand_type_process_mapping`

| Attribute | Type | Description |
|---|---|---|
| `demand_type_id` | `uuid` | FK to `DemandType.id` |
| `process_id` | `uuid` | FK to `Process.id` |
| `organization_id` | `uuid` | FK to `Organization.id` |
| `conversion_ratio` | `decimal(8,4)` | Units of process work per unit of demand (e.g., 1 order = 1.0 picks) |
| `is_primary` | `boolean` | Whether this is the primary process for the demand type |

### Constraints

- `UNIQUE(organization_id, code)`.
- PK on join table: `(demand_type_id, process_id)`.

### Relationships

- **many:1** to `Organization`
- **many:many** to `Process` via `demand_type_process_mapping`
- **1:many** to `DemandForecast`

### Example Record

```json
{
  "id": "a7b89012-3456-7890-abcd-ef1234567890",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Outbound Orders",
  "code": "OB_ORDERS",
  "unit_of_measure": "orders",
  "category": "outbound",
  "conversion_factors_json": {
    "lines_per_order": 3.2,
    "units_per_order": 5.8,
    "cases_per_order": 1.4
  },
  "description": "Customer orders flowing to outbound fulfillment processes.",
  "is_active": true,
  "display_order": 1
}
```

---

## 8. WorkloadPlan

**Description:** A computed record representing the number of labor hours needed for a specific process at a specific site on a specific date. This is the output of the demand-to-workload calculation: `hours_needed = demand_volume * conversion_ratio / weighted_avg_units_per_hour`. The optimization engine uses workload plans to generate shift assignments.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `site_id` | `uuid` | No | — | FK to `Site.id` |
| `process_id` | `uuid` | No | — | FK to `Process.id` |
| `plan_date` | `date` | No | — | Date this workload applies to |
| `plan_version_id` | `uuid` | No | — | FK to `PlanVersion.id` |
| `demand_forecast_id` | `uuid` | Yes | — | FK to the source `DemandForecast` record |
| `demand_volume` | `decimal(12,2)` | No | — | Input demand volume used in calculation |
| `conversion_ratio` | `decimal(8,4)` | No | — | Demand-to-process conversion ratio applied |
| `process_volume` | `decimal(12,2)` | No | — | `demand_volume * conversion_ratio` |
| `weighted_uph` | `decimal(10,2)` | No | — | Weighted average units-per-hour based on available skill mix |
| `hours_needed` | `decimal(8,2)` | No | — | Computed labor hours (`process_volume / weighted_uph`) |
| `fte_needed` | `decimal(6,2)` | No | — | FTE equivalent (`hours_needed / standard_shift_hours`) |
| `hours_assigned` | `decimal(8,2)` | No | `0` | Hours actually assigned after optimization |
| `fte_assigned` | `decimal(6,2)` | No | `0` | FTE actually assigned |
| `coverage_pct` | `decimal(5,2)` | No | `0` | `hours_assigned / hours_needed * 100` |
| `status` | `enum('draft','computed','optimized','approved','locked')` | No | `'draft'` | Workflow state |
| `computed_at` | `timestamptz` | Yes | — | When the calculation engine last ran |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, site_id, process_id, plan_date, plan_version_id)`.
- `CHECK(hours_needed >= 0)`.
- `CHECK(coverage_pct >= 0)`.
- FK `process_id` references `Process(id)`.
- FK `plan_version_id` references `PlanVersion(id) ON DELETE CASCADE`.

### Relationships

- **many:1** to `Site`
- **many:1** to `Process`
- **many:1** to `PlanVersion`
- **many:1** to `DemandForecast` (source)
- Consumed by the optimization engine to generate `ShiftAssignment` records

### Example Record

```json
{
  "id": "b8901234-5678-9abc-def0-123456789abc",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "site_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "process_id": "d4e5f6a7-b890-1234-5678-9abcdef01234",
  "plan_date": "2026-03-25",
  "plan_version_id": "01234567-89ab-cdef-0123-456789abcdef",
  "demand_forecast_id": "f6a7b890-1234-5678-abcd-ef0123456789",
  "demand_volume": 12500.00,
  "conversion_ratio": 1.0000,
  "process_volume": 12500.00,
  "weighted_uph": 132.75,
  "hours_needed": 94.16,
  "fte_needed": 11.77,
  "hours_assigned": 88.00,
  "fte_assigned": 11.00,
  "coverage_pct": 93.46,
  "status": "optimized",
  "computed_at": "2026-03-20T06:30:00Z"
}
```

---

## 9. Employee

**Description:** A worker associated with the organization. Employees are the workforce supply side of the planning equation. Each employee has a home site, a contract type, availability constraints, and a set of skills. The planning engine matches employees to workload requirements based on skills, availability, and labor rules.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `employee_number` | `varchar(30)` | No | — | Organization-assigned employee ID |
| `first_name` | `varchar(100)` | No | — | Legal first name |
| `last_name` | `varchar(100)` | No | — | Legal last name |
| `email` | `varchar(255)` | Yes | — | Work email |
| `phone` | `varchar(50)` | Yes | — | Contact phone |
| `home_site_id` | `uuid` | No | — | FK to `Site.id` — primary work location |
| `department_id` | `uuid` | Yes | — | FK to `Department.id` |
| `contract_type` | `enum('full_time','part_time','temporary','seasonal','contractor')` | No | — | Employment type |
| `hire_date` | `date` | No | — | Date of hire |
| `termination_date` | `date` | Yes | — | Date of termination; null = active |
| `status` | `enum('active','on_leave','suspended','terminated')` | No | `'active'` | Employment status |
| `weekly_hours_contracted` | `decimal(4,1)` | No | — | Contracted hours per week (e.g., 40.0, 20.0) |
| `hourly_rate` | `decimal(8,2)` | Yes | — | Base hourly pay rate |
| `pay_grade` | `varchar(20)` | Yes | — | Pay grade classification |
| `seniority_date` | `date` | Yes | — | Date for seniority calculations (may differ from hire_date) |
| `is_multi_site_eligible` | `boolean` | No | `false` | Can be assigned to sites other than home site |
| `preferences_json` | `jsonb` | No | `'{}'` | Shift preferences, days-off preferences |
| `metadata_json` | `jsonb` | No | `'{}'` | Custom fields from HR integration |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, employee_number)`.
- FK `home_site_id` references `Site(id) ON DELETE RESTRICT`.
- FK `department_id` references `Department(id) ON DELETE SET NULL`.
- `CHECK(weekly_hours_contracted > 0 AND weekly_hours_contracted <= 168)`.
- `CHECK(hourly_rate > 0 OR hourly_rate IS NULL)`.

### Relationships

- **many:1** to `Organization`
- **many:1** to `Site` (home site)
- **many:1** to `Department`
- **1:many** to `EmployeeSkill`
- **1:many** to `ShiftAssignment`

### Example Record

```json
{
  "id": "e5f6a7b8-9012-3456-7890-abcdef123456",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employee_number": "EMP-041892",
  "first_name": "Marcus",
  "last_name": "Johnson",
  "email": "mjohnson@acmelogistics.com",
  "phone": "+1-555-0198",
  "home_site_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "department_id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
  "contract_type": "full_time",
  "hire_date": "2023-06-15",
  "termination_date": null,
  "status": "active",
  "weekly_hours_contracted": 40.0,
  "hourly_rate": 22.50,
  "pay_grade": "W3",
  "seniority_date": "2023-06-15",
  "is_multi_site_eligible": true,
  "preferences_json": {
    "preferred_shift": "morning",
    "days_off_preferred": ["sunday"],
    "max_overtime_hours_weekly": 10
  }
}
```

---

## 10. EmployeeSkill

**Description:** Maps an employee to a process with a proficiency level (1-5 scale). This is the bridge between workforce supply and workload demand. The optimization engine uses skill mappings to determine which employees can be assigned to which processes, and the proficiency level feeds into weighted UPH calculations.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `employee_id` | `uuid` | No | — | FK to `Employee.id` |
| `process_id` | `uuid` | No | — | FK to `Process.id` |
| `proficiency_level` | `smallint` | No | — | Skill level 1-5 |
| `certification_date` | `date` | Yes | — | Date of last certification/training completion |
| `expiry_date` | `date` | Yes | — | Certification expiry; null = no expiry |
| `is_primary_skill` | `boolean` | No | `false` | Employee's primary/preferred process |
| `training_hours_completed` | `decimal(6,1)` | Yes | — | Total training hours logged |
| `assessed_by` | `uuid` | Yes | — | FK to `Employee.id` of the assessor |
| `assessment_notes` | `text` | Yes | — | Notes from skill assessment |
| `status` | `enum('active','expired','suspended','in_training')` | No | `'active'` | Skill status |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, employee_id, process_id)` — one skill record per employee per process.
- `CHECK(proficiency_level BETWEEN 1 AND 5)`.
- `CHECK(expiry_date IS NULL OR expiry_date > certification_date)`.
- FK `employee_id` references `Employee(id) ON DELETE CASCADE`.
- FK `process_id` references `Process(id) ON DELETE CASCADE`.

### Proficiency Level Scale

| Level | Label | Description | Typical UPH % of Standard |
|---|---|---|---|
| 1 | Novice | Recently trained, requires supervision | 60-70% |
| 2 | Basic | Can perform independently with occasional guidance | 75-85% |
| 3 | Competent | Solid performer, meets standard consistently | 90-100% |
| 4 | Proficient | Exceeds standard, can train others | 105-115% |
| 5 | Expert | Top performer, process improvement contributor | 115-130% |

### Relationships

- **many:1** to `Employee`
- **many:1** to `Process`
- Drives `weighted_uph` in `WorkloadPlan`

### Example Record

```json
{
  "id": "90123456-789a-bcde-f012-3456789abcde",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e5f6a7b8-9012-3456-7890-abcdef123456",
  "process_id": "d4e5f6a7-b890-1234-5678-9abcdef01234",
  "proficiency_level": 4,
  "certification_date": "2025-11-20",
  "expiry_date": "2026-11-20",
  "is_primary_skill": true,
  "training_hours_completed": 24.0,
  "assessed_by": "f6a7b890-1234-5678-9abc-def012345678",
  "assessment_notes": "Exceeded productivity benchmarks in Q4 evaluation. Approved as peer trainer.",
  "status": "active"
}
```

---

## 11. ShiftPattern

**Description:** A reusable template defining a type of shift — its start time, end time, break rules, and applicable days of the week. Shift patterns are assigned to employees via `ShiftAssignment`. Organizations can define unlimited shift patterns (e.g., `Morning`, `Afternoon`, `Night`, `Split`, `Flex-4x10`).

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `name` | `varchar(100)` | No | — | Shift name (e.g., `Morning A`, `Night Shift`) |
| `code` | `varchar(20)` | No | — | Short code (e.g., `MOR_A`, `NGT`) |
| `start_time` | `time` | No | — | Shift start time (local to site timezone) |
| `end_time` | `time` | No | — | Shift end time |
| `duration_hours` | `decimal(4,2)` | No | — | Total shift duration including breaks |
| `paid_hours` | `decimal(4,2)` | No | — | Productive paid hours (excluding unpaid breaks) |
| `break_rules_json` | `jsonb` | No | — | Array of break definitions (see example) |
| `days_of_week` | `smallint[]` | No | — | ISO days (1=Mon, 7=Sun) this pattern applies to |
| `is_overnight` | `boolean` | No | `false` | Whether shift crosses midnight |
| `shift_type` | `enum('regular','overtime','on_call','training','flex')` | No | `'regular'` | Shift classification |
| `color_hex` | `char(7)` | Yes | — | UI display color (e.g., `#2196F3`) |
| `min_staffing` | `integer` | Yes | — | Minimum required staffing for this shift type |
| `is_active` | `boolean` | No | `true` | Soft-delete flag |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, code)`.
- `CHECK(duration_hours > 0 AND duration_hours <= 24)`.
- `CHECK(paid_hours > 0 AND paid_hours <= duration_hours)`.

### Relationships

- **many:1** to `Organization`
- **1:many** to `ShiftAssignment`

### Example Record

```json
{
  "id": "12345678-9abc-def0-1234-56789abcdef0",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Morning A",
  "code": "MOR_A",
  "start_time": "06:00:00",
  "end_time": "14:30:00",
  "duration_hours": 8.50,
  "paid_hours": 8.00,
  "break_rules_json": [
    {"type": "paid", "duration_minutes": 15, "after_hours": 2.0},
    {"type": "unpaid", "duration_minutes": 30, "after_hours": 4.0, "label": "lunch"},
    {"type": "paid", "duration_minutes": 15, "after_hours": 6.5}
  ],
  "days_of_week": [1, 2, 3, 4, 5],
  "is_overnight": false,
  "shift_type": "regular",
  "color_hex": "#4CAF50",
  "min_staffing": 25,
  "is_active": true
}
```

---

## 12. ShiftAssignment

**Description:** The core output of the AstraPlanner optimization engine. Assigns a specific employee to work a specific shift pattern at a specific site performing a specific process on a specific date. This is the most granular and highest-volume entity in the system.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `employee_id` | `uuid` | No | — | FK to `Employee.id` |
| `shift_pattern_id` | `uuid` | No | — | FK to `ShiftPattern.id` |
| `site_id` | `uuid` | No | — | FK to `Site.id` |
| `process_id` | `uuid` | No | — | FK to `Process.id` |
| `department_id` | `uuid` | Yes | — | FK to `Department.id` |
| `assignment_date` | `date` | No | — | The calendar date of this assignment |
| `plan_version_id` | `uuid` | No | — | FK to `PlanVersion.id` |
| `start_time` | `timestamptz` | No | — | Actual start time (may override pattern) |
| `end_time` | `timestamptz` | No | — | Actual end time |
| `scheduled_hours` | `decimal(4,2)` | No | — | Planned working hours |
| `actual_hours` | `decimal(4,2)` | Yes | — | Actual hours worked (post-attendance) |
| `overtime_hours` | `decimal(4,2)` | No | `0` | Hours classified as overtime |
| `assignment_type` | `enum('scheduled','overtime','on_call','training','transfer')` | No | `'scheduled'` | Nature of the assignment |
| `assignment_source` | `enum('optimizer','manual','swap','ai_suggested')` | No | `'optimizer'` | How this assignment was created |
| `status` | `enum('draft','published','confirmed','in_progress','completed','cancelled','no_show')` | No | `'draft'` | Assignment lifecycle state |
| `employee_acknowledged` | `boolean` | No | `false` | Employee has seen and accepted |
| `override_reason` | `text` | Yes | — | Reason for manual override of optimizer output |
| `cost_estimate` | `decimal(8,2)` | Yes | — | Estimated labor cost for this assignment |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, employee_id, assignment_date, plan_version_id, start_time)` — no double-booking.
- `CHECK(scheduled_hours > 0)`.
- `CHECK(end_time > start_time OR shift crosses midnight)`.
- FK `employee_id` references `Employee(id) ON DELETE CASCADE`.
- FK `shift_pattern_id` references `ShiftPattern(id) ON DELETE RESTRICT`.
- FK `site_id` references `Site(id) ON DELETE RESTRICT`.
- FK `process_id` references `Process(id) ON DELETE RESTRICT`.
- FK `plan_version_id` references `PlanVersion(id) ON DELETE CASCADE`.

### Relationships

- **many:1** to `Employee`
- **many:1** to `ShiftPattern`
- **many:1** to `Site`
- **many:1** to `Process`
- **many:1** to `PlanVersion`
- **many:1** to `Department`

### Example Record

```json
{
  "id": "23456789-abcd-ef01-2345-6789abcdef01",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e5f6a7b8-9012-3456-7890-abcdef123456",
  "shift_pattern_id": "12345678-9abc-def0-1234-56789abcdef0",
  "site_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "process_id": "d4e5f6a7-b890-1234-5678-9abcdef01234",
  "department_id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
  "assignment_date": "2026-03-25",
  "plan_version_id": "01234567-89ab-cdef-0123-456789abcdef",
  "start_time": "2026-03-25T06:00:00-05:00",
  "end_time": "2026-03-25T14:30:00-05:00",
  "scheduled_hours": 8.00,
  "actual_hours": null,
  "overtime_hours": 0,
  "assignment_type": "scheduled",
  "assignment_source": "optimizer",
  "status": "published",
  "employee_acknowledged": true,
  "override_reason": null,
  "cost_estimate": 180.00
}
```

---

## 13. LaborRule

**Description:** Encodes labor regulations, union rules, and company policies that constrain the optimization engine. Rules are scoped by jurisdiction (country, state, or site) and enforce limits on working hours, rest periods, overtime thresholds, consecutive days, and other compliance requirements. The optimizer treats these as hard constraints that cannot be violated.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `name` | `varchar(255)` | No | — | Rule name (e.g., `California Daily Overtime`) |
| `code` | `varchar(50)` | No | — | Short code (e.g., `CA_DAILY_OT`) |
| `rule_type` | `enum('max_daily_hours','max_weekly_hours','min_rest_between_shifts','max_consecutive_days','overtime_threshold_daily','overtime_threshold_weekly','mandatory_break','min_age','certification_required','union_seniority')` | No | — | Type of constraint |
| `jurisdiction_country` | `char(2)` | Yes | — | ISO country code; null = all countries |
| `jurisdiction_state` | `varchar(50)` | Yes | — | State/province; null = entire country |
| `jurisdiction_site_id` | `uuid` | Yes | — | FK to `Site.id`; null = all sites in jurisdiction |
| `parameters_json` | `jsonb` | No | — | Rule parameters (see example) |
| `applies_to_contract_types` | `text[]` | No | `'{full_time,part_time,temporary,seasonal,contractor}'` | Which contract types this rule affects |
| `severity` | `enum('hard_constraint','soft_constraint','warning')` | No | `'hard_constraint'` | How the optimizer handles violations |
| `penalty_score` | `decimal(6,2)` | Yes | — | Penalty for soft-constraint violations (used in optimizer cost function) |
| `effective_date` | `date` | No | — | When rule takes effect |
| `expiry_date` | `date` | Yes | — | When rule expires; null = indefinite |
| `source` | `varchar(100)` | Yes | — | Legal citation or policy reference |
| `is_active` | `boolean` | No | `true` | Soft-delete flag |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, code)`.
- `CHECK(penalty_score >= 0 OR penalty_score IS NULL)`.
- FK `jurisdiction_site_id` references `Site(id) ON DELETE CASCADE`.

### Relationships

- **many:1** to `Organization`
- **many:1** to `Site` (optional — site-specific rules)
- Consumed by the optimization engine during shift assignment generation

### Example Record

```json
{
  "id": "34567890-abcd-ef01-2345-6789abcdef02",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "California Daily Overtime After 8 Hours",
  "code": "CA_DAILY_OT_8H",
  "rule_type": "overtime_threshold_daily",
  "jurisdiction_country": "US",
  "jurisdiction_state": "California",
  "jurisdiction_site_id": null,
  "parameters_json": {
    "threshold_hours": 8.0,
    "overtime_multiplier": 1.5,
    "double_time_threshold_hours": 12.0,
    "double_time_multiplier": 2.0
  },
  "applies_to_contract_types": ["full_time", "part_time", "temporary"],
  "severity": "hard_constraint",
  "penalty_score": null,
  "effective_date": "2020-01-01",
  "expiry_date": null,
  "source": "California Labor Code Section 510",
  "is_active": true
}
```

---

## 14. Scenario

**Description:** A what-if container that allows planners to explore alternative futures without modifying the baseline plan. Scenarios fork from a parent plan version and carry a set of assumptions (e.g., "20% demand increase", "new site opens", "hiring freeze"). Each scenario can contain its own demand forecasts, workload plans, and shift assignments through an associated `PlanVersion`.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `name` | `varchar(255)` | No | — | Scenario name (e.g., `Q2 Peak + Hiring Freeze`) |
| `description` | `text` | Yes | — | Detailed description of the scenario |
| `parent_plan_version_id` | `uuid` | No | — | FK to `PlanVersion.id` — the baseline this forks from |
| `assumptions_json` | `jsonb` | No | `'{}'` | Structured assumptions (see example) |
| `status` | `enum('draft','running','completed','approved','rejected','archived')` | No | `'draft'` | Scenario lifecycle state |
| `created_by` | `uuid` | No | — | FK to user who created the scenario |
| `comparison_metrics_json` | `jsonb` | Yes | — | Computed KPI comparison vs baseline |
| `tags` | `text[]` | Yes | — | Labels for filtering (e.g., `['peak','cost_reduction']`) |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- FK `parent_plan_version_id` references `PlanVersion(id) ON DELETE RESTRICT`.
- At least one `PlanVersion` must be created for the scenario to be runnable.

### Relationships

- **many:1** to `PlanVersion` (parent baseline)
- **1:many** to `PlanVersion` (scenario-specific versions)
- **many:1** to `Organization`

### Example Record

```json
{
  "id": "45678901-bcde-f012-3456-789abcdef012",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Q2 Peak Season with 20% Demand Surge",
  "description": "Models the impact of a 20% increase in outbound orders during April-June with current staffing levels.",
  "parent_plan_version_id": "01234567-89ab-cdef-0123-456789abcdef",
  "assumptions_json": {
    "demand_adjustments": [
      {"demand_type_code": "OB_ORDERS", "multiplier": 1.20, "date_range": ["2026-04-01", "2026-06-30"]}
    ],
    "staffing_changes": [],
    "process_changes": [],
    "notes": "No additional hiring assumed. Overtime budget capped at 15% of regular hours."
  },
  "status": "completed",
  "created_by": "f6a7b890-1234-5678-9abc-def012345678",
  "comparison_metrics_json": {
    "baseline_total_fte": 1250.0,
    "scenario_total_fte": 1250.0,
    "baseline_coverage_pct": 98.2,
    "scenario_coverage_pct": 82.1,
    "overtime_hours_increase_pct": 47.3,
    "estimated_cost_delta_usd": 284000
  },
  "tags": ["peak", "stress_test", "q2_2026"]
}
```

---

## 15. PlanVersion

**Description:** A versioned, immutable snapshot of a workforce plan. Every planning cycle produces a new version. Versions track approval workflow status and whether they were generated by the AI optimizer, manually created, or represent a scenario fork. All workload plans and shift assignments belong to exactly one plan version.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `site_id` | `uuid` | Yes | — | FK to `Site.id`; null for multi-site plans |
| `version_number` | `integer` | No | — | Sequential version within scope |
| `name` | `varchar(255)` | No | — | Version label (e.g., `Week 13 Plan v3`) |
| `plan_period_start` | `date` | No | — | First date covered by this plan |
| `plan_period_end` | `date` | No | — | Last date covered by this plan |
| `scenario_id` | `uuid` | Yes | — | FK to `Scenario.id`; null for baseline plans |
| `generated_by` | `enum('ai_optimizer','manual','hybrid','import','clone')` | No | — | How this version was created |
| `optimizer_config_json` | `jsonb` | Yes | — | Parameters used by the optimizer for this run |
| `approval_status` | `enum('draft','pending_review','approved','rejected','superseded')` | No | `'draft'` | Workflow state |
| `approved_by` | `uuid` | Yes | — | FK to user who approved |
| `approved_at` | `timestamptz` | Yes | — | Approval timestamp |
| `is_published` | `boolean` | No | `false` | Whether assignments are visible to employees |
| `is_locked` | `boolean` | No | `false` | Prevents further modifications |
| `summary_metrics_json` | `jsonb` | Yes | — | Aggregate KPIs for this plan version |
| `notes` | `text` | Yes | — | Planner notes |
| `parent_version_id` | `uuid` | Yes | — | FK to self — the version this was cloned/forked from |
| `created_by` | `uuid` | No | — | FK to user who created |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, site_id, version_number)` per site scope.
- `CHECK(plan_period_end >= plan_period_start)`.
- FK `scenario_id` references `Scenario(id) ON DELETE SET NULL`.
- FK `parent_version_id` references `PlanVersion(id) ON DELETE SET NULL`.

### Relationships

- **many:1** to `Organization`
- **many:1** to `Site` (optional)
- **many:1** to `Scenario` (optional)
- **1:many** to `WorkloadPlan`
- **1:many** to `ShiftAssignment`
- **1:many** to `DemandForecast` (scenario-specific forecasts)
- **self-referential** via `parent_version_id` (version lineage)

### Example Record

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "site_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "version_number": 3,
  "name": "Week 13 Plan v3 — Optimized",
  "plan_period_start": "2026-03-23",
  "plan_period_end": "2026-03-29",
  "scenario_id": null,
  "generated_by": "ai_optimizer",
  "optimizer_config_json": {
    "objective": "minimize_cost",
    "constraints": ["labor_rules", "skill_match", "availability"],
    "max_iterations": 10000,
    "convergence_threshold": 0.001
  },
  "approval_status": "approved",
  "approved_by": "f6a7b890-1234-5678-9abc-def012345678",
  "approved_at": "2026-03-20T14:00:00Z",
  "is_published": true,
  "is_locked": true,
  "summary_metrics_json": {
    "total_hours_needed": 2840.0,
    "total_hours_assigned": 2790.0,
    "coverage_pct": 98.2,
    "overtime_pct": 6.1,
    "total_labor_cost": 62800.00,
    "unfilled_shifts": 3
  },
  "notes": "Approved after minor adjustments to Tuesday night shift.",
  "parent_version_id": null,
  "created_by": "f6a7b890-1234-5678-9abc-def012345678"
}
```

---

## 16. AuditLog

**Description:** Immutable, append-only record of every significant state change in the system. Captures who performed an action, what changed, when it happened, and the before/after state. Critical for compliance, debugging, and accountability. AuditLog records are never updated or deleted — only inserted.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `actor_id` | `uuid` | Yes | — | FK to user who performed the action; null for system actions |
| `actor_type` | `enum('user','system','api_integration','ai_optimizer')` | No | — | Type of actor |
| `actor_ip_address` | `inet` | Yes | — | Source IP address |
| `action` | `varchar(50)` | No | — | Action verb (e.g., `create`, `update`, `delete`, `approve`, `publish`) |
| `entity_type` | `varchar(50)` | No | — | Table/entity name (e.g., `ShiftAssignment`, `PlanVersion`) |
| `entity_id` | `uuid` | No | — | PK of the affected record |
| `before_state` | `jsonb` | Yes | — | Snapshot of record before change; null for creates |
| `after_state` | `jsonb` | Yes | — | Snapshot of record after change; null for deletes |
| `changes_json` | `jsonb` | Yes | — | Diff of changed fields only |
| `metadata_json` | `jsonb` | Yes | — | Additional context (request_id, user_agent, etc.) |
| `created_at` | `timestamptz` | No | `now()` | Immutable timestamp |

### Constraints

- No `UPDATE` or `DELETE` operations permitted (enforced via RLS policy and trigger).
- Indexed on `(organization_id, entity_type, entity_id)` for entity history lookups.
- Indexed on `(organization_id, created_at)` for time-range queries.
- Indexed on `(organization_id, actor_id)` for user activity audits.

### Relationships

- **many:1** to `Organization`
- References any entity by `entity_type` + `entity_id` (polymorphic)

### Example Record

```json
{
  "id": "56789abc-def0-1234-5678-9abcdef01234",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "actor_id": "f6a7b890-1234-5678-9abc-def012345678",
  "actor_type": "user",
  "actor_ip_address": "203.0.113.42",
  "action": "update",
  "entity_type": "ShiftAssignment",
  "entity_id": "23456789-abcd-ef01-2345-6789abcdef01",
  "before_state": {"process_id": "aaa...", "status": "draft"},
  "after_state": {"process_id": "bbb...", "status": "published"},
  "changes_json": {"process_id": ["aaa...", "bbb..."], "status": ["draft", "published"]},
  "metadata_json": {
    "request_id": "req_abc123",
    "user_agent": "AstraPlanner-Web/2.1.0",
    "reason": "Reassigned from pack to pick due to skill availability"
  },
  "created_at": "2026-03-20T15:42:18Z"
}
```

---

## 17. Notification

**Description:** A notification record targeting a specific user. Notifications are generated by system events (plan published, assignment changed, approval needed, labor rule violation detected) and delivered via in-app, email, or push channels. Supports read/dismiss tracking.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `target_user_id` | `uuid` | No | — | FK to the receiving user |
| `type` | `varchar(50)` | No | — | Notification type (e.g., `plan_published`, `assignment_changed`, `approval_required`) |
| `severity` | `enum('info','warning','critical','action_required')` | No | `'info'` | Urgency level |
| `title` | `varchar(255)` | No | — | Short headline |
| `body` | `text` | No | — | Notification content (supports markdown) |
| `payload_json` | `jsonb` | Yes | — | Structured data for deep-linking (entity_type, entity_id, action_url) |
| `channels` | `text[]` | No | `'{in_app}'` | Delivery channels (`in_app`, `email`, `push`, `sms`) |
| `read_status` | `boolean` | No | `false` | Whether the user has read this notification |
| `read_at` | `timestamptz` | Yes | — | When the user read it |
| `dismissed_at` | `timestamptz` | Yes | — | When the user dismissed it |
| `expires_at` | `timestamptz` | Yes | — | Auto-expire time for transient notifications |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |

### Constraints

- Indexed on `(organization_id, target_user_id, read_status, created_at)` for inbox queries.
- FK `target_user_id` references user table.

### Relationships

- **many:1** to `Organization`
- **many:1** to target user
- Polymorphic reference to source entity via `payload_json`

### Example Record

```json
{
  "id": "6789abcd-ef01-2345-6789-abcdef012345",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "target_user_id": "f6a7b890-1234-5678-9abc-def012345678",
  "type": "approval_required",
  "severity": "action_required",
  "title": "Week 13 Plan Needs Approval",
  "body": "The AI optimizer has completed Week 13 Plan v3 for CHI-DC-01. Coverage is 98.2% with 6.1% overtime. Please review and approve.",
  "payload_json": {
    "entity_type": "PlanVersion",
    "entity_id": "01234567-89ab-cdef-0123-456789abcdef",
    "action_url": "/plans/01234567-89ab-cdef-0123-456789abcdef/review"
  },
  "channels": ["in_app", "email"],
  "read_status": false,
  "read_at": null,
  "dismissed_at": null,
  "expires_at": "2026-03-27T00:00:00Z"
}
```

---

## 18. IntegrationConfig

**Description:** Configuration record for external system integrations — WMS, OMS, HRIS, payroll, time-and-attendance, and ERP systems. Stores connection parameters (encrypted), sync schedules, field mappings, and last sync status. Each integration can push demand data in or pull assignment data out.

### Attributes

| Attribute | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid` | No | — | FK to `Organization.id` |
| `name` | `varchar(255)` | No | — | Integration name (e.g., `Manhattan WMS - CHI-DC-01`) |
| `source_system` | `varchar(50)` | No | — | System type (e.g., `manhattan_wms`, `sap_ewm`, `workday_hris`, `adp_payroll`) |
| `integration_type` | `enum('inbound','outbound','bidirectional')` | No | — | Data flow direction |
| `connection_params_encrypted` | `bytea` | No | — | Encrypted connection config (URL, credentials, API keys) |
| `sync_schedule_cron` | `varchar(100)` | No | — | Cron expression for sync frequency (e.g., `0 */2 * * *` for every 2h) |
| `field_mapping_json` | `jsonb` | No | — | Maps external fields to AstraPlanner fields |
| `transform_rules_json` | `jsonb` | Yes | — | Data transformation rules applied during sync |
| `site_scope` | `uuid[]` | Yes | — | Array of `Site.id` values this integration applies to; null = all sites |
| `entity_scope` | `text[]` | No | — | Which entities are synced (e.g., `['DemandForecast','Employee']`) |
| `last_sync_at` | `timestamptz` | Yes | — | Timestamp of last successful sync |
| `last_sync_status` | `enum('success','partial_success','failed','never_run')` | No | `'never_run'` | Result of last sync |
| `last_sync_records_processed` | `integer` | Yes | — | Number of records in last sync |
| `last_sync_error_message` | `text` | Yes | — | Error details if last sync failed |
| `retry_count` | `smallint` | No | `0` | Consecutive failures |
| `max_retries` | `smallint` | No | `3` | Max consecutive failures before alerting |
| `is_active` | `boolean` | No | `true` | Enabled/disabled flag |
| `created_at` | `timestamptz` | No | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | No | `now()` | Last modification timestamp |

### Constraints

- `UNIQUE(organization_id, name)`.
- FK `organization_id` references `Organization(id) ON DELETE CASCADE`.
- `connection_params_encrypted` uses AES-256-GCM with per-tenant encryption keys.

### Relationships

- **many:1** to `Organization`
- Optional scope to specific `Site` records via `site_scope` array

### Example Record

```json
{
  "id": "789abcde-f012-3456-789a-bcdef0123456",
  "organization_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Manhattan WMS - Chicago DC",
  "source_system": "manhattan_wms",
  "integration_type": "inbound",
  "connection_params_encrypted": "<encrypted bytes>",
  "sync_schedule_cron": "0 */4 * * *",
  "field_mapping_json": {
    "order_count": "demand_forecast.volume",
    "ship_date": "demand_forecast.forecast_date",
    "facility_code": "site.code"
  },
  "transform_rules_json": {
    "date_format": "YYYY-MM-DD",
    "timezone_conversion": "UTC",
    "volume_aggregation": "sum_by_date"
  },
  "site_scope": ["b2c3d4e5-f6a7-8901-bcde-f23456789012"],
  "entity_scope": ["DemandForecast"],
  "last_sync_at": "2026-03-20T12:00:00Z",
  "last_sync_status": "success",
  "last_sync_records_processed": 847,
  "last_sync_error_message": null,
  "retry_count": 0,
  "max_retries": 3,
  "is_active": true
}
```
