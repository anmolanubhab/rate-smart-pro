-- Universal Document Output Center, Phase 1: per-user "Default Print Action"
-- preference (Ask Every Time / Always Preview / Always Direct Print). This is
-- genuinely per-user, not per-business — unlike every other print setting in
-- this app (print_profiles, print_copy_types, accounting_settings), which are
-- all business-scoped. No existing table fits; a new one is warranted.

CREATE TABLE IF NOT EXISTS public.user_print_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_print_action text NOT NULL DEFAULT 'ask'
    CHECK (default_print_action IN ('ask', 'preview', 'direct_print')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_print_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_print_preferences_own ON public.user_print_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
