-- CreateTable
CREATE TABLE "property_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "uprn" VARCHAR(20),
    "lmk_key" VARCHAR(100) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "postcode" VARCHAR(10) NOT NULL,
    "property_type" VARCHAR(50) NOT NULL,
    "built_form" VARCHAR(50) NOT NULL,
    "total_floor_area" DOUBLE PRECISION NOT NULL,
    "latest_epc_data" JSONB NOT NULL,
    "hardware" JSONB,
    "user_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "property_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_epc_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "lmk_key" VARCHAR(100) NOT NULL,
    "inspection_date" DATE NOT NULL,
    "lodgement_date" DATE NOT NULL,
    "mainheat_description" TEXT,
    "photo_supply" VARCHAR(20),
    "space_heating_demand" DOUBLE PRECISION,
    "energy_consumption_current" DOUBLE PRECISION,
    "certificate_data" JSONB NOT NULL,

    CONSTRAINT "property_epc_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_provider" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "energy_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_tariff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tariff_type" VARCHAR(20) NOT NULL,
    "flat_rate_pence" INTEGER,
    "peak_rate_pence" INTEGER,
    "off_peak_rate_pence" INTEGER,
    "peak_start_hour" INTEGER,
    "peak_end_hour" INTEGER,
    "standing_charge_pence" INTEGER NOT NULL,
    "seg_export_rate_pence" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "source" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "energy_tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_load_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "tariff_id" UUID NOT NULL,
    "monthly_bill_pence" INTEGER NOT NULL,
    "daily_kwh" DOUBLE PRECISION NOT NULL,
    "hourly_distribution" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_load_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvgis_irradiance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "monthly_irradiance" JSONB NOT NULL,
    "optimal_angle" DOUBLE PRECISION,
    "annual_yield_kwh_per_kwp" DOUBLE PRECISION NOT NULL,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvgis_irradiance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_profile_user_id_key" ON "property_profile"("user_id");

-- CreateIndex
CREATE INDEX "property_profile_postcode_idx" ON "property_profile"("postcode");

-- CreateIndex
CREATE INDEX "property_profile_uprn_idx" ON "property_profile"("uprn");

-- CreateIndex
CREATE INDEX "property_epc_history_profile_id_inspection_date_idx" ON "property_epc_history"("profile_id", "inspection_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "property_epc_history_profile_id_lmk_key_key" ON "property_epc_history"("profile_id", "lmk_key");

-- CreateIndex
CREATE UNIQUE INDEX "energy_provider_name_key" ON "energy_provider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "energy_provider_slug_key" ON "energy_provider"("slug");

-- CreateIndex
CREATE INDEX "energy_tariff_provider_id_idx" ON "energy_tariff"("provider_id");

-- CreateIndex
CREATE INDEX "energy_tariff_tariff_type_idx" ON "energy_tariff"("tariff_type");

-- CreateIndex
CREATE UNIQUE INDEX "energy_tariff_provider_id_name_valid_from_key" ON "energy_tariff"("provider_id", "name", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "user_load_profile_profile_id_key" ON "user_load_profile"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "pvgis_irradiance_latitude_longitude_key" ON "pvgis_irradiance"("latitude", "longitude");

-- AddForeignKey
ALTER TABLE "property_profile" ADD CONSTRAINT "property_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_epc_history" ADD CONSTRAINT "property_epc_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "property_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_tariff" ADD CONSTRAINT "energy_tariff_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "energy_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_load_profile" ADD CONSTRAINT "user_load_profile_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "property_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_load_profile" ADD CONSTRAINT "user_load_profile_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "energy_provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_load_profile" ADD CONSTRAINT "user_load_profile_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "energy_tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
