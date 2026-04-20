/**
 * HTTP handlers for the grants module.
 * Controllers are thin adapters — business logic is in the service.
 */

import type { Request, Response } from "express";
import type { ValidatedRequest } from "../../middleware/validate";
import { createGrantsService } from "./grants.service";
import type { UpdateGrantProfileInput } from "./grants.schema";
import type { GrantEligibilityResponse, UserGrantProfileDTO } from "./grants.dto";

const service = createGrantsService();

type UpdateProfileReq = ValidatedRequest<UpdateGrantProfileInput>;

export const grantsController = {
  /**
   * GET /api/grants/profile
   * Get user's current grant profile (eligibility answers).
   */
  async getProfile(req: Request, res: Response<UserGrantProfileDTO>): Promise<void> {
    const userId = req.user!.id;
    const profile = await service.getGrantProfile(userId);
    res.json(profile);
  },

  /**
   * PATCH /api/grants/profile
   * Update user's grant profile answers.
   */
  async updateProfile(req: Request, res: Response<UserGrantProfileDTO>): Promise<void> {
    const userId = req.user!.id;
    const input = (req as UpdateProfileReq).validated.body;
    const profile = await service.updateGrantProfile(userId, input);
    res.json(profile);
  },

  /**
   * GET /api/grants/eligibility
   * Check all grant eligibility for the user.
   */
  async checkEligibility(req: Request, res: Response<GrantEligibilityResponse>): Promise<void> {
    const userId = req.user!.id;
    const eligibility = await service.checkEligibility(userId);
    res.json(eligibility);
  },
};
