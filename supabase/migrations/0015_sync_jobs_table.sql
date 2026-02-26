-- Create the sync_jobs table to track background workflow progress from n8n
CREATE TABLE IF NOT EXISTS public.sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 0,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own sync jobs" ON public.sync_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert sync jobs" ON public.sync_jobs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update sync jobs" ON public.sync_jobs
    FOR UPDATE USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER sync_jobs_updated_at
    BEFORE UPDATE ON public.sync_jobs
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();
