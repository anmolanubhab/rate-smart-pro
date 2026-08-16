-- Pricing & Promotion Engine — Sales Order/Invoice integration trace columns.
--
-- Additive only: every new column is nullable (or has a safe default) so
-- existing order_items/sales_invoice_items rows and every existing
-- query/report against these tables are unaffected. Records how a line's
-- price was resolved (price list, matched rule(s), legacy party-discount
-- fallback, or a manual override) without touching the pricing/GST/total
-- columns that already exist and remain the single source of truth for
-- those numbers.

alter table public.order_items
  add column if not exists price_list_id uuid references public.price_lists(id) on delete set null,
  add column if not exists pricing_rule_ids jsonb not null default '[]'::jsonb,
  add column if not exists price_source text,
  add column if not exists is_manual_override boolean not null default false;

alter table public.sales_invoice_items
  add column if not exists price_list_id uuid references public.price_lists(id) on delete set null,
  add column if not exists pricing_rule_ids jsonb not null default '[]'::jsonb,
  add column if not exists price_source text,
  add column if not exists is_manual_override boolean not null default false;

comment on column public.order_items.price_source is
  'How this line''s mrp/discount_pct were resolved: price_list | pricing_rule | legacy_party_discount | product_fallback | manual_override. Informational trace only — never read by pricing/GST/total calculation.';
comment on column public.sales_invoice_items.price_source is
  'Copied verbatim from the source order_items row at invoice generation — see order_items.price_source.';
