-- CreateTable
CREATE TABLE "user_commerce_profile" (
    "user_id" TEXT NOT NULL,
    "medusa_customer_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_commerce_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_commerce_profile_medusa_customer_id_key" ON "user_commerce_profile"("medusa_customer_id");

-- AddForeignKey
ALTER TABLE "user_commerce_profile" ADD CONSTRAINT "user_commerce_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
