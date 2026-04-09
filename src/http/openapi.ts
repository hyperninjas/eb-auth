import { createDocument, type ZodOpenApiObject, type ZodOpenApiPathsObject } from "zod-openapi";
import { modules } from "../modules";

/**
 * Builds the OpenAPI 3.1 document for this service's own routes.
 *
 * Iterates the module registry in src/modules/index.ts and merges every
 * module's `openapi` paths object into a single document. This means
 * adding a new module = one line in the registry; the docs update for
 * free.
 *
 * Better Auth's own /api/auth/reference page documents the auth routes
 * separately, so they're intentionally absent from this document.
 *
 * Uses `zod-openapi` (samchungy), which works natively with Zod 4 via the
 * built-in `.meta()` method — no prototype patching, no init order quirks.
 */
export function buildOpenApiDocument(): ReturnType<typeof createDocument> {
  // Merge all module path objects into one. Modules without `openapi`
  // (like the health module) contribute nothing.
  const paths: ZodOpenApiPathsObject = modules.reduce<ZodOpenApiPathsObject>((acc, m) => {
    if (m.openapi) Object.assign(acc, m.openapi);
    return acc;
  }, {});

  const spec: ZodOpenApiObject = {
    openapi: "3.1.0",
    info: {
      title: "eb-auth API",
      version: "1.0.0",
      description:
        "Authentication & device management service. Auth routes are documented separately at /api/auth/reference.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths,
  };

  return createDocument(spec);
}
