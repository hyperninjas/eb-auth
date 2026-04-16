/**
 * Prisma repository for the energy-profile module.
 *
 * Thin wrapper over Prisma calls — no business logic. The service
 * layer orchestrates reads/writes through this interface.
 */

import { prisma } from "../../infra/prisma";
import type {
  PropertyProfile,
  PropertyEpcHistory,
  EnergyProvider,
  EnergyTariff,
  UserLoadProfile,
  PvgisIrradiance,
  Prisma,
} from "../../generated/prisma/client";

export const energyProfileRepository = {
  // ── PropertyProfile ─────────────────────────────────────────────

  createProfile(data: Prisma.PropertyProfileCreateInput): Promise<PropertyProfile> {
    return prisma.propertyProfile.create({ data });
  },

  findProfileByUserId(userId: string): Promise<PropertyProfile | null> {
    return prisma.propertyProfile.findUnique({ where: { userId } });
  },

  findProfileWithRelations(userId: string) {
    return prisma.propertyProfile.findUnique({
      where: { userId },
      include: { history: { orderBy: { inspectionDate: "asc" } }, loadProfile: true },
    });
  },

  updateProfile(id: string, data: Prisma.PropertyProfileUpdateInput): Promise<PropertyProfile> {
    return prisma.propertyProfile.update({ where: { id }, data });
  },

  deleteProfile(userId: string): Promise<PropertyProfile> {
    return prisma.propertyProfile.delete({ where: { userId } });
  },

  // ── PropertyEpcHistory ──────────────────────────────────────────

  upsertHistory(
    profileId: string,
    lmkKey: string,
    data: Omit<Prisma.PropertyEpcHistoryCreateInput, "profile">,
  ): Promise<PropertyEpcHistory> {
    return prisma.propertyEpcHistory.upsert({
      where: { profileId_lmkKey: { profileId, lmkKey } },
      create: { ...data, profile: { connect: { id: profileId } } },
      update: { ...data },
    });
  },

  findHistoryByProfileId(profileId: string): Promise<PropertyEpcHistory[]> {
    return prisma.propertyEpcHistory.findMany({
      where: { profileId },
      orderBy: { inspectionDate: "asc" },
    });
  },

  deleteHistoryByProfileId(profileId: string) {
    return prisma.propertyEpcHistory.deleteMany({ where: { profileId } });
  },

  // ── EnergyProvider ──────────────────────────────────────────────

  upsertProvider(slug: string, name: string): Promise<EnergyProvider> {
    return prisma.energyProvider.upsert({
      where: { slug },
      create: { name, slug },
      update: { name },
    });
  },

  findProviderById(id: string): Promise<EnergyProvider | null> {
    return prisma.energyProvider.findUnique({ where: { id } });
  },

  findProviderBySlug(slug: string): Promise<EnergyProvider | null> {
    return prisma.energyProvider.findUnique({ where: { slug } });
  },

  listProviders(): Promise<EnergyProvider[]> {
    return prisma.energyProvider.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  },

  listProvidersWithCount() {
    return prisma.energyProvider.findMany({
      where: { isActive: true },
      include: { _count: { select: { tariffs: true } } },
      orderBy: { name: "asc" },
    });
  },

  // ── EnergyTariff ────────────────────────────────────────────────

  upsertTariff(
    providerId: string,
    name: string,
    validFrom: Date,
    data: Omit<Prisma.EnergyTariffCreateInput, "provider">,
  ): Promise<EnergyTariff> {
    return prisma.energyTariff.upsert({
      where: { providerId_name_validFrom: { providerId, name, validFrom } },
      create: { ...data, provider: { connect: { id: providerId } } },
      update: { ...data },
    });
  },

  findTariffById(id: string): Promise<EnergyTariff | null> {
    return prisma.energyTariff.findUnique({ where: { id } });
  },

  listTariffsByProvider(providerId: string): Promise<EnergyTariff[]> {
    return prisma.energyTariff.findMany({
      where: { providerId },
      orderBy: { validFrom: "desc" },
    });
  },

  listAllTariffs(): Promise<(EnergyTariff & { provider: EnergyProvider })[]> {
    return prisma.energyTariff.findMany({
      include: { provider: true },
      orderBy: [{ provider: { name: "asc" } }, { validFrom: "desc" }],
    });
  },

  async listTariffsFiltered(query: {
    providerId?: string | undefined;
    type?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ data: (EnergyTariff & { provider: EnergyProvider })[]; total: number }> {
    const where: Prisma.EnergyTariffWhereInput = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.type) where.tariffType = query.type;

    const [data, total] = await prisma.$transaction([
      prisma.energyTariff.findMany({
        where,
        include: { provider: true },
        orderBy: [{ provider: { name: "asc" } }, { validFrom: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.energyTariff.count({ where }),
    ]);

    return { data, total };
  },

  // ── UserLoadProfile ─────────────────────────────────────────────

  createLoadProfile(data: Prisma.UserLoadProfileCreateInput): Promise<UserLoadProfile> {
    return prisma.userLoadProfile.create({ data });
  },

  findLoadProfileByProfileId(profileId: string): Promise<UserLoadProfile | null> {
    return prisma.userLoadProfile.findUnique({ where: { profileId } });
  },

  updateLoadProfile(
    profileId: string,
    data: Prisma.UserLoadProfileUpdateInput,
  ): Promise<UserLoadProfile> {
    return prisma.userLoadProfile.update({ where: { profileId }, data });
  },

  deleteLoadProfile(profileId: string) {
    return prisma.userLoadProfile.deleteMany({ where: { profileId } });
  },

  // ── PvgisIrradiance ─────────────────────────────────────────────

  findIrradiance(latitude: number, longitude: number): Promise<PvgisIrradiance | null> {
    return prisma.pvgisIrradiance.findUnique({
      where: { latitude_longitude: { latitude, longitude } },
    });
  },

  upsertIrradiance(
    latitude: number,
    longitude: number,
    data: Omit<Prisma.PvgisIrradianceCreateInput, "latitude" | "longitude">,
  ): Promise<PvgisIrradiance> {
    return prisma.pvgisIrradiance.upsert({
      where: { latitude_longitude: { latitude, longitude } },
      create: { latitude, longitude, ...data },
      update: { ...data, fetchedAt: new Date() },
    });
  },
};
