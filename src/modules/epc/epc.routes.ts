import { Router, type Request, type Response } from "express";
import { authGuard } from "../../middleware/auth-guard";
import { asyncHandler } from "../../middleware/async-handler";
import { validate, type ValidatedRequest } from "../../middleware/validate";
import { badRequest } from "../../errors/app-error";
import { getLogger } from "../../infra/logger";
import type { EpcClient, EpcSearchResult, EpcCertificate } from "./epc.client";
import type { EpcCache } from "./epc.cache";
import {
  epcSearchQuerySchema,
  type EpcSearchQuery,
  epcCertParamSchema,
  type EpcCertParam,
  type EpcSearchResponse,
  type EpcCertificateResponse,
} from "./epc.openapi";

/**
 * EPC routes — typed endpoints (not a catch-all proxy).
 *
 * Only two upstream API calls exist, so typed routes with validation
 * and caching are simpler and more useful than a reverse proxy. Each
 * route checks Redis first and falls back to the live EPC API on miss.
 */

export interface CreateEpcRouterDeps {
  client: EpcClient;
  cache: EpcCache;
}

export function createEpcRouter(deps: CreateEpcRouterDeps): Router {
  const router = Router();

  // Every EPC route requires an authenticated user.
  router.use(authGuard);

  // ── GET /search?postcode=SW1A1AA&from=0&size=50 ────────────────────
  router.get(
    "/search",
    validate({ query: epcSearchQuerySchema }),
    asyncHandler(async (req: Request, res: Response<EpcSearchResponse>): Promise<void> => {
      const { postcode, from, size } = (req as ValidatedRequest<unknown, EpcSearchQuery>).validated
        .query;

      if (!postcode) {
        throw badRequest("postcode query parameter is required.");
      }

      // Check cache first.
      const cacheKey = `${postcode}:${from}:${size}`;
      const cached = await deps.cache.getCachedSearch(cacheKey);
      if (cached) {
        getLogger().debug({ postcode }, "EPC search cache hit");
        res.json(JSON.parse(cached) as EpcSearchResponse);
        return;
      }

      // Cache miss — call the EPC API.
      const result: EpcSearchResult = await deps.client.searchProperties(postcode, { from, size });

      const response: EpcSearchResponse = {
        rows: result.rows,
        totalResults: result.totalResults,
      };

      // Cache the response (fire-and-forget).
      void deps.cache.setCachedSearch(cacheKey, JSON.stringify(response));

      res.json(response);
    }),
  );

  // ── GET /certificate/:lmkKey ───────────────────────────────────────
  router.get(
    "/certificate/:lmkKey",
    validate({ params: epcCertParamSchema }),
    asyncHandler(async (req: Request, res: Response<EpcCertificateResponse>): Promise<void> => {
      const { lmkKey } = (req as ValidatedRequest<unknown, unknown, EpcCertParam>).validated.params;

      // Check cache first.
      const cached = await deps.cache.getCachedCertificate(lmkKey);
      if (cached) {
        getLogger().debug({ lmkKey }, "EPC certificate cache hit");
        res.json(JSON.parse(cached) as EpcCertificateResponse);
        return;
      }

      // Cache miss — call the EPC API.
      const cert: EpcCertificate | null = await deps.client.getCertificate(lmkKey);

      const response: EpcCertificateResponse = { certificate: cert };

      // Cache even null results to avoid hammering the API for
      // non-existent certificates.
      void deps.cache.setCachedCertificate(lmkKey, JSON.stringify(response));

      res.json(response);
    }),
  );

  return router;
}
