-- P1 remediation (3b/4): close a cross-tenant sales data leak via
-- mv_sales_summary.
--
-- Verified via pg_class.relacl (information_schema under-reports
-- materialized view grants): authenticated=arwdDxtm -- every logged-in
-- user, regardless of business, could SELECT * FROM mv_sales_summary
-- directly via the REST API and see EVERY business's daily sales totals
-- (business_id, sale_date, sales_value; SELECT business_id, invoice_date,
-- sum(grand_total) FROM sales_invoices GROUP BY business_id,
-- invoice_date -- no filtering at all). Materialized views cannot carry
-- RLS policies in Postgres, so there is no isolation mechanism available
-- other than revoking access outright. anon lacked the SELECT bit
-- specifically (only had insert/update/delete/truncate, which are no-ops
-- against a matview via DML -- not a working data path). Confirmed
-- unused by the frontend (zero references outside generated types), so
-- revoking is zero-regression.

REVOKE ALL ON public.mv_sales_summary FROM anon, authenticated;
