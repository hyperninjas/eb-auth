/**
 * Database operations for the grants module.
 * Reads and writes UserGrantProfile and related data.
 */

import { prisma } from "../../infra/prisma";
import type { UpdateGrantProfileInput } from "./grants.schema";

export const grantsRepository = {
  /**
   * Get user's grant profile (eligibility answers).
   * Returns null if no profile exists yet (user hasn't answered any questions).
   */
  async findGrantProfileByUserId(userId: string) {
    return prisma.userGrantProfile.findUnique({
      where: { userId },
    });
  },

  /**
   * Create a new grant profile for a user.
   */
  async createGrantProfile(userId: string, data: Partial<UpdateGrantProfileInput>) {
    return prisma.userGrantProfile.create({
      data: {
        userId,
        isHomeowner: data.isHomeowner ?? null,
        householdIncome: data.householdIncome ?? null,
        hasVulnerableOccupant: data.hasVulnerableOccupant ?? null,
        solarMcsRegistered: data.solarMcsRegistered ?? null,
        mcsInstallerId: data.mcsInstallerId ?? null,
      },
    });
  },

  /**
   * Update an existing grant profile.
   * Only updates fields that are provided (null is ignored).
   */
  async updateGrantProfile(userId: string, data: Partial<UpdateGrantProfileInput>) {
    const updateData: Record<string, unknown> = {};

    if (data.isHomeowner !== undefined) updateData["isHomeowner"] = data.isHomeowner;
    if (data.householdIncome !== undefined) updateData["householdIncome"] = data.householdIncome;
    if (data.hasVulnerableOccupant !== undefined)
      updateData["hasVulnerableOccupant"] = data.hasVulnerableOccupant;
    if (data.solarMcsRegistered !== undefined)
      updateData["solarMcsRegistered"] = data.solarMcsRegistered;
    if (data.mcsInstallerId !== undefined) updateData["mcsInstallerId"] = data.mcsInstallerId;

    // Always update lastAssessedAt
    updateData["lastAssessedAt"] = new Date();

    return prisma.userGrantProfile.update({
      where: { userId },
      data: updateData,
    });
  },

  /**
   * Upsert grant profile (create if not exists, update if exists).
   */
  async upsertGrantProfile(userId: string, data: Partial<UpdateGrantProfileInput>) {
    const existing = await this.findGrantProfileByUserId(userId);

    if (existing) {
      return this.updateGrantProfile(userId, data);
    } else {
      return this.createGrantProfile(userId, data);
    }
  },

  /**
   * Delete grant profile.
   */
  async deleteGrantProfile(userId: string) {
    return prisma.userGrantProfile.delete({
      where: { userId },
    });
  },
};
