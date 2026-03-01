# Payment module – test scenarios

When a test runner (Jest/Vitest) and test DB are configured, add integration tests for:

1. **Дедупликация транзакций**  
   Import the same `(bankAccountId, externalId)` twice; expect a single `BankTransaction` row (upsert by unique).

2. **Автопривязка по номеру заказа**  
   Create `Order` with `orderNumber: "ORD-12345"`. Create `BankTransaction` with `direction: IN`, `description: "Оплата заказ 12345"`. Run `MatchEngineService.run()`. Expect one `Payment` with `orderId` and `bankTransactionId`, and `Order.paidAmount` updated.

3. **Наличная оплата и paymentStatus**  
   Create `Order` with `totalAmount: 100`. Call `PaymentsService.createCash({ orderId, amount: 50, paidAt, ... })`. Expect `Payment` with `sourceType: CASH`; `Order.paidAmount === 50`, `debtAmount === 50`, and response `paymentStatus: PARTIALLY_PAID`. Add another cash payment 50; expect `paymentStatus: PAID`, `debtAmount: 0`.
