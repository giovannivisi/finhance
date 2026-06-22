-- CreateTable
CREATE TABLE "auth_authenticators" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "credential_public_key" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credential_device_type" TEXT NOT NULL,
    "credential_backed_up" BOOLEAN NOT NULL,
    "transports" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_authenticators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_authenticators_credential_id_key" ON "auth_authenticators"("credential_id");

-- CreateIndex
CREATE INDEX "auth_authenticators_user_id_idx" ON "auth_authenticators"("user_id");

-- CreateIndex
CREATE INDEX "auth_authenticators_provider_account_id_idx" ON "auth_authenticators"("provider_account_id");

-- AddForeignKey
ALTER TABLE "auth_authenticators" ADD CONSTRAINT "auth_authenticators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
