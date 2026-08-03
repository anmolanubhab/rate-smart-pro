-- Removes the Order Control Center demo/test data seeded for development
-- verification (30-50 orders across every pending bucket, 5 dedicated demo
-- parties, plus any picking lists/dispatches created against them while
-- testing bulk pick-list generation and bulk dispatch). Safe to run any
-- time — nothing here touches real business data:
--   - orders are tagged order_number LIKE 'DEMO-%' and notes = '[DEMO SEED DATA]'
--   - parties are tagged name LIKE 'DEMO - Customer%'
-- Referenced products are real (read-only reference) — but bulk-dispatch
-- testing against demo orders DID decrement real products.stock, same as a
-- real dispatch would. Deleting dispatch rows with a raw DELETE does not
-- reverse that (stock reversal only happens through the app's own
-- cancelDispatch/deleteDispatch JS code, not a DB trigger), so this script
-- restores the stock it consumed before removing the dispatch records.

-- Restore stock consumed by dispatches against DEMO orders.
update products p
set stock = p.stock + consumed.qty
from (
  select oi.product_id, sum(coalesce(di.stock_dispatched_qty, di.dispatched_qty)) as qty
  from dispatch_items di
  join dispatches d on d.id = di.dispatch_id
  join orders o on o.id = d.order_id
  join order_items oi on oi.id = di.order_item_id
  where o.order_number like 'DEMO-%'
  group by oi.product_id
) consumed
where p.id = consumed.product_id;

delete from dispatch_items
  where dispatch_id in (
    select d.id from dispatches d
    join orders o on o.id = d.order_id
    where o.order_number like 'DEMO-%'
  );

delete from dispatches
  where order_id in (select id from orders where order_number like 'DEMO-%');

delete from picking_list_items
  where picking_list_id in (
    select pl.id from picking_lists pl
    join orders o on o.id = pl.order_id
    where o.order_number like 'DEMO-%'
  );

delete from picking_lists
  where order_id in (select id from orders where order_number like 'DEMO-%');

delete from order_items
  where order_id in (select id from orders where order_number like 'DEMO-%');

delete from orders
  where order_number like 'DEMO-%' and notes = '[DEMO SEED DATA]';

delete from parties
  where name like 'DEMO - Customer%';
