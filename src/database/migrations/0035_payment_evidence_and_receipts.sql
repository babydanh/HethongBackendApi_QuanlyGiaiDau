CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_key" varchar(255) NOT NULL UNIQUE,
  "payment_id" uuid REFERENCES "payments"("id") ON DELETE SET NULL,
  "provider_order_code" varchar(50) NOT NULL,
  "provider_transaction_id" varchar(255),
  "status_code" varchar(20) NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "signature_verified" boolean NOT NULL DEFAULT false,
  "payload" jsonb NOT NULL,
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payment_webhook_events_order_code_idx"
  ON "payment_webhook_events" ("provider_order_code");

CREATE TABLE IF NOT EXISTS "payment_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" uuid NOT NULL UNIQUE REFERENCES "payments"("id") ON DELETE RESTRICT,
  "receipt_number" varchar(50) NOT NULL UNIQUE,
  "service_name" varchar(255) NOT NULL,
  "purpose" varchar(50) NOT NULL,
  "tournament_id" uuid REFERENCES "tournaments"("id") ON DELETE SET NULL,
  "buyer_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "subtotal" numeric(12, 2) NOT NULL,
  "platform_fee_amount" numeric(12, 2) NOT NULL DEFAULT 0.00,
  "tax_amount" numeric(12, 2) NOT NULL DEFAULT 0.00,
  "total_amount" numeric(12, 2) NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'VND',
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "snapshot" jsonb NOT NULL
);
