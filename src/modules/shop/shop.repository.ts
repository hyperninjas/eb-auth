import { prisma } from "../../infra/prisma";
import type { UserCommerceProfile } from "../../generated/prisma/client";

/**
 * Repository for the shop module's only persistent state — the
 * `user_commerce_profile` mapping table that links a Better Auth user.id
 * to a Medusa customer.id.
 *
 * Why a 1:1 mapping table at all (instead of relying on
 * `metadata.external_user_id` on the Medusa customer):
 *   1. Indexed lookups. We hit this table on every authenticated /shop
 *      request to attach the customer to a cart server-side. JSONB
 *      metadata queries are slower and not unique-enforced.
 *   2. Single source of truth lives in OUR database. If Medusa is down
 *      we can still tell whether a user has been provisioned.
 *   3. Strict ownership boundary. The `external_user_id` on Medusa's
 *      side is a redundant safety net for recovery, not the lookup key.
 */

export const shopRepository = {
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
