-- Add Stripe IDs to profiles table
-- Run this in Supabase SQL editor: https://supabase.com/dashboard/project/iejatyndtjedqqfpufbq/sql

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_treasury_account_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_card_id TEXT UNIQUE;

-- Index for lookups by Stripe customer ID
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx ON profiles(stripe_customer_id);
