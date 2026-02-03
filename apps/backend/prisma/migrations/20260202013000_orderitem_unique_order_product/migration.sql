CREATE UNIQUE INDEX "OrderItem_orderId_productId_key"
ON "OrderItem" ("orderId", "productId");
