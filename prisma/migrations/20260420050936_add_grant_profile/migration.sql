-- CreateTable
CREATE TABLE "user_grant_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "is_homeowner" BOOLEAN,
    "household_income" VARCHAR(20),
    "has_vulnerable_occupant" BOOLEAN,
    "solar_mcs_registered" BOOLEAN,
    "mcs_installer_id" VARCHAR(100),
    "last_assessed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_grant_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_grant_profile_user_id_key" ON "user_grant_profile"("user_id");

-- CreateIndex
CREATE INDEX "user_grant_profile_user_id_idx" ON "user_grant_profile"("user_id");

-- AddForeignKey
ALTER TABLE "user_grant_profile" ADD CONSTRAINT "user_grant_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
