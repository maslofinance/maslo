-- ============================================================
-- MASLO FINANCE — SUPABASE POSTGRESQL SCHEMA
-- Version 1.0
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- trigram similarity for merchant fuzzy matching


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE budget_style        AS ENUM ('liberal', 'moderate', 'aggressive');
CREATE TYPE income_frequency    AS ENUM ('weekly', 'biweekly', 'semimonthly', 'monthly');
CREATE TYPE notification_tone   AS ENUM ('gentle', 'sarcastic', 'drill_sergeant', 'shaman');
CREATE TYPE vault_category      AS ENUM ('essentials', 'debt', 'future', 'lifestyle');
CREATE TYPE lock_type           AS ENUM ('hard_lock', 'soft_lock', 'flexible');
CREATE TYPE allocation_rule_type AS ENUM ('percentage', 'fixed', 'remainder');
CREATE TYPE transaction_status  AS ENUM ('approved', 'warned', 'denied', 'pending', 'uncategorized');
CREATE TYPE goal_status         AS ENUM ('active', 'completed', 'paused', 'cancelled');
CREATE TYPE account_type        AS ENUM ('checking', 'savings', 'credit', 'loan', 'investment', 'other');
CREATE TYPE ledger_entry_type   AS ENUM ('allocation', 'spend', 'transfer', 'adjustment', 'income_distribution');


-- ============================================================
-- SHARED TRIGGER: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- TABLE: profiles
-- One row per user. Extends auth.users.
-- Auto-created via trigger on signup.
-- ============================================================
CREATE TABLE profiles (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT,
  full_name           TEXT,
  avatar_url          TEXT,
  budget_style        budget_style,
  monthly_income      NUMERIC(12,2),
  income_frequency    income_frequency,
  notification_tone   notification_tone DEFAULT 'gentle',
  onboarding_complete BOOLEAN     DEFAULT FALSE,
  onboarding_step     INTEGER     DEFAULT 0,
  timezone            TEXT        DEFAULT 'America/New_York',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: plaid_items
-- One row per bank connection (one institution = one item).
-- SECURITY: plaid_access_token must NEVER be read from a
-- client-side query. Always use the service role key in
-- server-side API routes (app/api/*) when touching this column.
-- ============================================================
CREATE TABLE plaid_items (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plaid_item_id       TEXT        NOT NULL UNIQUE,
  plaid_access_token  TEXT        NOT NULL,     -- service role only, never SELECT from client
  institution_name    TEXT,
  institution_id      TEXT,
  institution_logo    TEXT,                     -- base64 or CDN URL
  institution_color   TEXT,
  is_active           BOOLEAN     DEFAULT TRUE,
  cursor              TEXT,                     -- Plaid sync cursor for incremental updates
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_plaid_items_updated_at
  BEFORE UPDATE ON plaid_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: bank_accounts
-- Individual accounts within a Plaid item.
-- ============================================================
CREATE TABLE bank_accounts (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plaid_item_id     UUID        NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id  TEXT        NOT NULL UNIQUE,
  name              TEXT        NOT NULL,
  official_name     TEXT,
  type              account_type NOT NULL,
  subtype           TEXT,
  mask              TEXT,                       -- last 4 digits for display
  current_balance   NUMERIC(12,2),
  available_balance NUMERIC(12,2),
  is_primary        BOOLEAN     DEFAULT FALSE,  -- primary income-receiving account
  is_active         BOOLEAN     DEFAULT TRUE,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_bank_accounts_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: merchants
-- Global normalized merchant lookup. Shared across all users.
-- Written by service role only. Read by all authenticated users.
-- ============================================================
CREATE TABLE merchants (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                  TEXT          NOT NULL UNIQUE,  -- e.g. "starbucks", "amazon"
  display_name          TEXT          NOT NULL,
  raw_name_patterns     TEXT[],                         -- raw strings that map to this merchant
  default_category      TEXT,                           -- e.g. "Dining"
  default_subcategory   TEXT,
  mcc                   TEXT,                           -- merchant category code
  default_vault_category vault_category,
  logo_url              TEXT,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

-- Trigram indexes for fuzzy matching in the normalization engine
CREATE INDEX merchants_display_name_trgm ON merchants USING GIN (display_name gin_trgm_ops);
CREATE INDEX merchants_slug_idx          ON merchants (slug);

CREATE TRIGGER set_merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: vaults
-- The core Maslo primitive. Priority-ordered spending containers.
--
-- Priority numbering convention:
--   Essentials  → 100–199  (bills, rent, groceries, insurance)
--   Debt        → 200–299  (credit cards, loans — highest interest first)
--   Future      → 300–399  (savings, investing, emergency fund)
--   Lifestyle   → 400–499  (dining, shopping, entertainment)
--
-- This gives 100 slots per category and allows precise ordering
-- within and across categories using a single integer.
-- ============================================================
CREATE TABLE vaults (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name              TEXT          NOT NULL,
  description       TEXT,
  category          vault_category NOT NULL,
  priority          INTEGER       NOT NULL,
  icon              TEXT,                       -- emoji e.g. "🏡"
  color             TEXT          DEFAULT '#6366f1',
  target_amount     NUMERIC(12,2),              -- monthly funding target
  current_balance   NUMERIC(12,2) DEFAULT 0,
  lock_type         lock_type     DEFAULT 'soft_lock',
  due_day           INTEGER       CHECK (due_day BETWEEN 1 AND 31),  -- bill due day of month
  due_amount        NUMERIC(12,2),              -- exact recurring bill amount
  autopay_enabled   BOOLEAN       DEFAULT FALSE,
  linked_account_id UUID          REFERENCES bank_accounts(id),      -- for savings tracking
  is_active         BOOLEAN       DEFAULT TRUE,
  is_system         BOOLEAN       DEFAULT FALSE, -- TRUE = created by Maslo onboarding engine
  created_at        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   DEFAULT NOW(),

  UNIQUE (user_id, priority)                    -- no two vaults share the same priority per user
);

CREATE INDEX vaults_user_id_idx       ON vaults (user_id);
CREATE INDEX vaults_user_category_idx ON vaults (user_id, category);
CREATE INDEX vaults_priority_idx      ON vaults (user_id, priority);

CREATE TRIGGER set_vaults_updated_at
  BEFORE UPDATE ON vaults
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: allocation_rules
-- Defines how income gets distributed into each vault.
-- One rule per vault per user.
--
-- Rule types:
--   percentage  → X% of gross income goes to this vault
--   fixed       → exactly $N goes to this vault per income event
--   remainder   → whatever is left after all other rules fire
--                 (only one remainder rule allowed per user)
-- ============================================================
CREATE TABLE allocation_rules (
  id            UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID                 NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vault_id      UUID                 NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  rule_type     allocation_rule_type NOT NULL,
  percentage    NUMERIC(5,2)         CHECK (percentage BETWEEN 0 AND 100),
  fixed_amount  NUMERIC(12,2),
  applies_to    TEXT                 DEFAULT 'all_income', -- 'all_income' | 'paycheck' | 'manual'
  is_active     BOOLEAN              DEFAULT TRUE,
  created_at    TIMESTAMPTZ          DEFAULT NOW(),
  updated_at    TIMESTAMPTZ          DEFAULT NOW(),

  UNIQUE (user_id, vault_id)
);

CREATE TRIGGER set_allocation_rules_updated_at
  BEFORE UPDATE ON allocation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: transactions
-- Every transaction synced from Plaid (or manually entered).
-- amount is positive for expenses, negative for income/refunds.
-- ============================================================
CREATE TABLE transactions (
  id                    UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID               NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_account_id       UUID               REFERENCES bank_accounts(id),
  plaid_transaction_id  TEXT               UNIQUE,         -- null for manual entries
  merchant_id           UUID               REFERENCES merchants(id),
  vault_id              UUID               REFERENCES vaults(id),
  amount                NUMERIC(12,2)      NOT NULL,        -- positive = expense, negative = income
  currency              TEXT               DEFAULT 'USD',
  description           TEXT,                              -- raw string from Plaid
  merchant_name         TEXT,                              -- normalized display name
  category              TEXT,
  subcategory           TEXT,
  status                transaction_status DEFAULT 'pending',
  maslo_decision_reason TEXT,                              -- why approved / warned / denied
  is_income             BOOLEAN            DEFAULT FALSE,
  is_transfer           BOOLEAN            DEFAULT FALSE,   -- internal bank transfer
  is_pending            BOOLEAN            DEFAULT FALSE,   -- Plaid pending flag
  date                  DATE               NOT NULL,
  posted_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ        DEFAULT NOW(),
  updated_at            TIMESTAMPTZ        DEFAULT NOW()
);

CREATE INDEX transactions_user_id_idx    ON transactions (user_id);
CREATE INDEX transactions_user_date_idx  ON transactions (user_id, date DESC);
CREATE INDEX transactions_vault_id_idx   ON transactions (vault_id);
CREATE INDEX transactions_plaid_id_idx   ON transactions (plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: vault_ledger
-- Immutable audit trail of every vault balance change.
-- Never UPDATE or DELETE rows here — append only.
-- This is the source of truth for vault balance history.
-- ============================================================
CREATE TABLE vault_ledger (
  id              UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  vault_id        UUID              NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id         UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id  UUID              REFERENCES transactions(id),
  entry_type      ledger_entry_type NOT NULL,
  amount          NUMERIC(12,2)     NOT NULL,   -- positive = funds in, negative = funds out
  balance_after   NUMERIC(12,2)     NOT NULL,   -- vault balance immediately after this entry
  note            TEXT,
  created_at      TIMESTAMPTZ       DEFAULT NOW()
  -- no updated_at — ledger rows are immutable by design
);

CREATE INDEX vault_ledger_vault_id_idx   ON vault_ledger (vault_id);
CREATE INDEX vault_ledger_user_id_idx    ON vault_ledger (user_id);
CREATE INDEX vault_ledger_created_at_idx ON vault_ledger (created_at DESC);


-- ============================================================
-- TABLE: income_events
-- Logged each time Plaid detects a deposit and Maslo distributes.
-- distribution_log is a snapshot of how funds were allocated.
-- ============================================================
CREATE TABLE income_events (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id   UUID        REFERENCES transactions(id),
  gross_amount     NUMERIC(12,2) NOT NULL,
  distribution_log JSONB,      -- [{vault_id, vault_name, amount_allocated}, ...]
  distributed_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX income_events_user_id_idx ON income_events (user_id);


-- ============================================================
-- TABLE: user_merchant_rules
-- User-defined overrides: merchant → vault assignment.
-- Takes precedence over the global merchant lookup table.
-- ============================================================
CREATE TABLE user_merchant_rules (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant_id       UUID        REFERENCES merchants(id),
  raw_description   TEXT,                     -- fallback for unrecognized merchants
  vault_id          UUID        NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  category_override TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, merchant_id)
);

CREATE TRIGGER set_user_merchant_rules_updated_at
  BEFORE UPDATE ON user_merchant_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: goals
-- Short and long-term financial goals.
-- Linked to a vault for funding tracking.
-- is_shared = TRUE surfaces the goal on the Maslo Exchange.
-- ============================================================
CREATE TABLE goals (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vault_id        UUID        REFERENCES vaults(id),     -- funding vault (optional)
  name            TEXT        NOT NULL,
  description     TEXT,
  emoji           TEXT,                                  -- e.g. "🏄" for surf trip
  color           TEXT,
  target_amount   NUMERIC(12,2) NOT NULL,
  current_amount  NUMERIC(12,2) DEFAULT 0,
  target_date     DATE,
  priority        INTEGER     DEFAULT 0,
  status          goal_status DEFAULT 'active',
  is_shared       BOOLEAN     DEFAULT FALSE,             -- Maslo Exchange
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX goals_user_id_idx ON goals (user_id);

CREATE TRIGGER set_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Rule: users can only access their own rows.
-- Exceptions:
--   - merchants: all authenticated users can read, service role writes
--   - plaid_items: client can read institution metadata but the
--     plaid_access_token column must only ever be queried from
--     a server-side route using SUPABASE_SERVICE_ROLE_KEY
-- ============================================================

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: select own"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE USING (auth.uid() = id);


-- PLAID ITEMS
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plaid_items: select own"
  ON plaid_items FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "plaid_items: insert own"
  ON plaid_items FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plaid_items: update own"
  ON plaid_items FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "plaid_items: delete own"
  ON plaid_items FOR DELETE USING (auth.uid() = user_id);


-- BANK ACCOUNTS
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_accounts: select own"
  ON bank_accounts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "bank_accounts: insert own"
  ON bank_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bank_accounts: update own"
  ON bank_accounts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "bank_accounts: delete own"
  ON bank_accounts FOR DELETE USING (auth.uid() = user_id);


-- MERCHANTS (global read, service-role write only)
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchants: authenticated read"
  ON merchants FOR SELECT TO authenticated USING (TRUE);


-- VAULTS
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vaults: select own"
  ON vaults FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "vaults: insert own"
  ON vaults FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vaults: update own"
  ON vaults FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "vaults: delete own"
  ON vaults FOR DELETE USING (auth.uid() = user_id);


-- ALLOCATION RULES
ALTER TABLE allocation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allocation_rules: select own"
  ON allocation_rules FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "allocation_rules: insert own"
  ON allocation_rules FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "allocation_rules: update own"
  ON allocation_rules FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "allocation_rules: delete own"
  ON allocation_rules FOR DELETE USING (auth.uid() = user_id);


-- TRANSACTIONS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions: select own"
  ON transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions: insert own"
  ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions: update own"
  ON transactions FOR UPDATE USING (auth.uid() = user_id);


-- VAULT LEDGER (append-only — no update or delete)
ALTER TABLE vault_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_ledger: select own"
  ON vault_ledger FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "vault_ledger: insert own"
  ON vault_ledger FOR INSERT WITH CHECK (auth.uid() = user_id);


-- INCOME EVENTS
ALTER TABLE income_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "income_events: select own"
  ON income_events FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "income_events: insert own"
  ON income_events FOR INSERT WITH CHECK (auth.uid() = user_id);


-- USER MERCHANT RULES
ALTER TABLE user_merchant_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_merchant_rules: select own"
  ON user_merchant_rules FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_merchant_rules: insert own"
  ON user_merchant_rules FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_merchant_rules: update own"
  ON user_merchant_rules FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_merchant_rules: delete own"
  ON user_merchant_rules FOR DELETE USING (auth.uid() = user_id);


-- GOALS
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals: select own"
  ON goals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "goals: insert own"
  ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "goals: update own"
  ON goals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "goals: delete own"
  ON goals FOR DELETE USING (auth.uid() = user_id);
