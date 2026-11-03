-- Migration: Add audit log table for Sampark Sutra operations and update call FK
CREATE TABLE IF NOT EXISTS public.sampark_sutra_audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    sid BIGINT,
    action TEXT NOT NULL, -- 'CREATED', 'UPDATED', 'DELETED'
    caller_pid BIGINT,
    username TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    ac_no BIGINT,
    village_id BIGINT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ss_audit_sid ON public.sampark_sutra_audit_log (sid);
CREATE INDEX IF NOT EXISTS idx_ss_audit_created ON public.sampark_sutra_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ss_audit_action ON public.sampark_sutra_audit_log (action);

-- Ensure call records remain preserved when a contact is removed
ALTER TABLE public."call" DROP CONSTRAINT IF EXISTS problems_sid_fkey;
ALTER TABLE public."call" ADD CONSTRAINT problems_sid_fkey 
    FOREIGN KEY (sid) REFERENCES public.sampark_sutra(sid) ON DELETE SET NULL;
