-- Removes the Order Control Center Phase 1 demo/test data seeded for
-- development verification (30-50 orders across every pending bucket,
-- 5 dedicated demo parties). Safe to run any time — nothing here touches
-- real business data:
--   - orders are tagged order_number LIKE 'DEMO-%' and notes = '[DEMO SEED DATA]'
--   - parties are tagged name LIKE 'DEMO - Customer%'
-- Referenced products are real (read-only reference, never mutated by the seed).

delete from order_items
  where order_id in (select id from orders where order_number like 'DEMO-%');

delete from orders
  where order_number like 'DEMO-%' and notes = '[DEMO SEED DATA]';

delete from parties
  where name like 'DEMO - Customer%';
