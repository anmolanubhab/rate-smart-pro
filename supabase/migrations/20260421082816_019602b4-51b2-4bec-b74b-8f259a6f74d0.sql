-- Discount type enum
DO $$ BEGIN
  CREATE TYPE public.discount_type AS ENUM ('RD', 'CD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PARTIES
CREATE TABLE public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  address text,
  default_discount numeric NOT NULL DEFAULT 0,
  discount_type public.discount_type NOT NULL DEFAULT 'RD',
  agreed_discount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own parties" ON public.parties FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own parties" ON public.parties FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own parties" ON public.parties FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own parties" ON public.parties FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_parties_user ON public.parties(user_id);

-- SEGMENTS (shared defaults + per-user customs)
CREATE TABLE public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads default segments or own"
  ON public.segments FOR SELECT
  USING (is_default = true OR auth.uid() = user_id);
CREATE POLICY "Users insert own segments"
  ON public.segments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_default = false);
CREATE POLICY "Users update own segments"
  ON public.segments FOR UPDATE USING (auth.uid() = user_id AND is_default = false);
CREATE POLICY "Users delete own segments"
  ON public.segments FOR DELETE USING (auth.uid() = user_id AND is_default = false);

-- Seed default segments
INSERT INTO public.segments (id, user_id, name, is_default) VALUES
  (gen_random_uuid(), NULL, 'Accessories', true),
  (gen_random_uuid(), NULL, 'Spare Parts', true),
  (gen_random_uuid(), NULL, 'Lubricants', true);

-- PARTY DISCOUNTS (per segment)
CREATE TABLE public.party_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  discount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(party_id, segment_id)
);
ALTER TABLE public.party_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own party_discounts" ON public.party_discounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own party_discounts" ON public.party_discounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own party_discounts" ON public.party_discounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own party_discounts" ON public.party_discounts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_pd_party ON public.party_discounts(party_id);

-- Extend calculations
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES public.segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mode public.discount_type,
  ADD COLUMN IF NOT EXISTS cd_discount numeric,
  ADD COLUMN IF NOT EXISTS total_benefit numeric;

-- updated_at trigger for parties
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_parties_updated ON public.parties;
CREATE TRIGGER trg_parties_updated BEFORE UPDATE ON public.parties
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();