import type { ConvexReactClient } from "convex/react";

let convexClient: ConvexReactClient | null = null;

export function setConvexClient(client: ConvexReactClient) {
  convexClient = client;
}

/**
 * Fire-and-forget a Convex mutation from outside React (e.g. from Zustand stores).
 * Errors are logged but never thrown — local state is the source of truth.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function syncToConvex(mutation: any, args: any) {
  if (!convexClient) return;
  convexClient.mutation(mutation, args).catch((err: unknown) => {
    console.warn("[ConvexSync] Mutation failed:", err);
  });
}
