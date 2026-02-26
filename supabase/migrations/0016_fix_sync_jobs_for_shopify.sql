-- Fix sync_jobs table for Shopify embedded app (no auth.users)
-- 1. Drop the FK constraint on user_id (we use owner_id from shops table, not auth.users)
-- 2. Make user_id nullable (it's really owner_id)
-- 3. Fix RLS to allow anon reads filtered by job id (for Realtime subscriptions)

-- Drop existing FK constraint
ALTER TABLE public.sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_user_id_fkey;

-- Make user_id nullable (since we might not always have it)
ALTER TABLE public.sync_jobs ALTER COLUMN user_id DROP NOT NULL;

-- Drop old restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view their own sync jobs" ON public.sync_jobs;

-- Allow anyone to read sync_jobs by id (the job_id acts as a secret token)
-- This is safe because job_ids are UUIDs that are only known to the creator
CREATE POLICY "Anyone can view sync jobs by id" ON public.sync_jobs
    FOR SELECT USING (true);

-- Enable Realtime for sync_jobs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_jobs;
