-- Link call centre accounts to calls and add a caller/admin role.
-- Run once against the existing application database before deploying this
-- version of the caller service.

ALTER TABLE public.call_centre_user
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'caller';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'call_centre_user_role_check'
          AND conrelid = 'public.call_centre_user'::regclass
    ) THEN
        ALTER TABLE public.call_centre_user
            ADD CONSTRAINT call_centre_user_role_check
            CHECK (role IN ('caller', 'admin'));
    END IF;
END $$;

ALTER TABLE public."call"
    ADD COLUMN IF NOT EXISTS caller_pid BIGINT
        REFERENCES public.call_centre_user(pid);

CREATE INDEX IF NOT EXISTS idx_call_caller_created_at
    ON public."call" (caller_pid, created_at DESC)
    WHERE caller_pid IS NOT NULL;
