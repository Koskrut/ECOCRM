-- Allow multiple Payment rows per BankTransaction (split allocation)
DROP INDEX IF EXISTS "Payment_bankTransactionId_key";
