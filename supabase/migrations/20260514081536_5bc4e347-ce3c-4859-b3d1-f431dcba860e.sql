
CREATE OR REPLACE FUNCTION public.next_order_number(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-';
  next_seq int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT COALESCE(MAX( (regexp_replace(order_number, '^.*-', ''))::int ), 0) + 1
    INTO next_seq
  FROM public.orders
  WHERE user_id = _user_id AND order_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_order_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO authenticated;
