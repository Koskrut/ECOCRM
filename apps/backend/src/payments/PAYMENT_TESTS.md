# Payment module – test scenarios

When a test runner (Jest/Vitest) and test DB are configured, add integration tests for:

1. **Дедупликация транзакций**  
   Import the same bank operation twice with different `externalId` values (e.g. short numeric and long HS/JBKL), but same `REF+REFN`; expect a single `BankTransaction` row.

2. **Автопривязка по номеру заказа**  
   Create `Order` with `orderNumber: "12345"`. Create `BankTransaction` with `direction: IN`, `description: "Оплата заказ 12345"`. Run `MatchEngineService.run()` / `PaymentMatchingService.run()`. Expect one `Payment` with `orderId` and `bankTransactionId`, and `Order.paidAmount` updated. `matchStatus=AUTO_MATCHED`.

3. **Наличная оплата и paymentStatus**  
   Create `Order` with `totalAmount: 100`. Call `PaymentsService.createCash({ orderId, amount: 50, paidAt, ... })`. Expect `Payment` with `sourceType: CASH`; `Order.paidAmount === 50`, `debtAmount === 50`, and response `paymentStatus: PARTIALLY_PAID`. Add another cash payment 50; expect `paymentStatus: PAID`, `debtAmount: 0`.

4. **Multi-order auto (same client, debt sum)**  
   Orders `7001` / `7002` for contact C with debts 600 / 400 UAH. TX amount 1000, description `Оплата замовлення 7001, 7002`. With `BANK_MATCH_MULTI_ORDER_AUTO=true`, run matcher → two BANK payments, audit `decision=AUTO`, `matchReason=multi_order_debt_sum`, alias learned for IBAN if present.

5. **Multi-order reject different clients**  
   Orders `7001` / `7002` belong to different contacts. Description lists both. Auto-match must **not** allocate; suggestions API returns `warnings: ["different_clients"]`, `autoMatchEligible=false`.

6. **Multi-order reject amount mismatch / overpay**  
   Debts sum 1000, TX 1500 without explicit purpose amounts → no auto. With explicit `7001 - 900, 7002 - 600` totaling 1500 → auto with `purpose_amounts`.

7. **Suggestions + IBAN history**  
   After a manual allocate from IBAN X → contact C, a new unmatched TX with same IBAN (no order numbers) should surface C with reason `iban_history` and elevated score. Confirm via `GET /bank/transactions?unmatched=true&suggest=true` or `GET /payments/match-suggestions?transactionId=`.

8. **Residual unmatched**  
   Allocate partial amount (e.g. 300 of 1000) to one order. TX must remain in `unmatched=true` list with `remainingAmount=700`, `allocatedAmount=300`, `matchStatus=PARTIALLY_MATCHED`. Further allocate of 700 clears it (`MATCHED` / stays allocated tab).

9. **Parser noise**  
   Unit: dates, phones, `грн` amounts, MFO must not become order candidates; UA list `Оплата замовлення 7001, 7002` extracts both; explicit amounts parsed.

## Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `BANK_MATCH_MULTI_ORDER_AUTO` | `true` | After sync, auto allocate-split when ≥2 exact orderNumbers, same client, amounts fit |
| `BANK_MATCH_IBAN_AUTO` | `false` | Reserved — do **not** silent-auto on IBAN alone (suggestions only) |

## Amount tolerances

- Allocation residual / split equality: `0.01` (tx currency)
- Multi-order debt sum vs TX: absolute `1` (typically UAH)
- Single-order FX amount match: relative `1%`
