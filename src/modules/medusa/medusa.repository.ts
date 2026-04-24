import { prisma } from "../../infra/prisma";
import type { UserCommerceProfile } from "../../generated/prisma/client";

/**
 * Repository for the medusa module's only persistent state — the
 * `user_commerce_profile` mapping table that links a Better Auth user.id
 * to a Medusa customer.id.
 *
 * Why a 1:1 mapping table instead of relying only on Medusa's
 * metadata.external_user_id:
 *   1. Indexed lookups. We hit this table on every authenticated request
 *      after provisioning. JSONB metadata queries are slower and not
 *      unique-enforced.
 *   2. Single source of truth lives in OUR database. If Medusa is down
 *      we can still tell whether a user has been provisioned.
 *   3. Strict ownership boundary. The `external_user_id` on Medusa's
 *      side is a redundant safety net for recovery, not the lookup key.
 */

export const medusaRepository = {
  findByUserId: (userId: string): Promise<UserCommerceProfile | null> =>
    prisma.userCommerceProfile.findUnique({ where: { userId } }),

  findByMedusaCustomerId: (medusaCustomerId: string): Promise<UserCommerceProfile | null> =>
    prisma.userCommerceProfile.findUnique({ where: { medusaCustomerId } }),

  /**
   * Idempotent upsert. Used by the provisioning flow so a retry after
   * a partial failure converges instead of inserting duplicates.
   */
  upsert: (userId: string, medusaCustomerId: string): Promise<UserCommerceProfile> =>
    prisma.userCommerceProfile.upsert({
      where: { userId },
      create: { userId, medusaCustomerId },
      update: { medusaCustomerId },
    }),
};
