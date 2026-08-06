-- Universal Document Output Center, Phase 4: CreateQuotation.tsx's
-- pre-migration toggle-mode print always showed MRP, per-line Discount %,
-- and a Rack column (via the print_profiles show_mrp/show_discount_column/
-- show_warehouse flags this table already has, added in the original Print
-- Engine Phase 3) -- but the seeded default Quotation profile has all three
-- off. Flip them on for existing default Quotation profiles so migrating
-- onto the shared engine doesn't drop columns businesses already saw.
-- Still fully toggleable per-business afterwards via Settings > Print Profiles.

UPDATE public.print_profiles
SET show_mrp = true, show_discount_column = true, show_warehouse = true
WHERE document_type = 'quotation' AND is_default = true;
