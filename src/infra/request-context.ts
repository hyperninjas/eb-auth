import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context propagated through async boundaries via
 * Node's AsyncLocalStorage. Any code path can read the current
 * request id without threading it through function arguments.
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setUserId(userId: string): void {
  const store = storage.getStore();
  if (store) store.userId = userId;
}
