-- A bulk purchase records several differently priced units at one server
-- instant. Random UUID order must not decide which cost is resold first.
-- Preserve the existing tie order of historical holdings, then issue a durable
-- sequence for new acquisitions. No prices, quantities or payment clocks change.
CREATE SEQUENCE land_purchase_sequence AS bigint;
ALTER TABLE land_holdings ADD COLUMN purchase_order bigint;
WITH ordered AS (
  SELECT id,row_number() OVER (ORDER BY acquired_at,id) AS n FROM land_holdings
)
UPDATE land_holdings h SET purchase_order=o.n FROM ordered o WHERE h.id=o.id;
SELECT setval('land_purchase_sequence',COALESCE(MAX(purchase_order),0)+1,false) FROM land_holdings;
ALTER TABLE land_holdings ALTER COLUMN purchase_order SET DEFAULT nextval('land_purchase_sequence');
ALTER TABLE land_holdings ALTER COLUMN purchase_order SET NOT NULL;
ALTER SEQUENCE land_purchase_sequence OWNED BY land_holdings.purchase_order;
CREATE UNIQUE INDEX land_purchase_order_unique ON land_holdings(purchase_order);
