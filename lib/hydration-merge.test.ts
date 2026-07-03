import { describe, it, expect } from "vitest";
import { mergeQueueAware, type MergeInput } from "@/lib/hydration-merge";

// Characterization + regression tests for the shared queue-aware hydration
// merge (plan 036). Toy shapes: local `{ id, v }`, server `{ clientId, v }`.
// Cases mirror the four store policies (history, meal-log, plan, template)
// plus the in-flight-delete fix that motivated the extraction.

interface Local {
  id: string;
  v: string;
  updatedAt?: number;
}

interface Server {
  clientId: string;
  v: string;
  updatedAt?: number;
}

function toLocal(s: Server): Local {
  return { id: s.clientId, v: s.v, updatedAt: s.updatedAt };
}

function baseInput(overrides: Partial<MergeInput<Local, Server>> = {}): MergeInput<Local, Server> {
  return {
    local: [],
    server: [],
    localId: (l) => l.id,
    serverId: (s) => s.clientId,
    toLocal,
    pending: new Set(),
    queueKnown: true,
    dropLocalOnly: () => true,
    ...overrides,
  };
}

describe("mergeQueueAware", () => {
  it("1. server-only item is mapped in", () => {
    const result = mergeQueueAware(
      baseInput({ server: [{ clientId: "a", v: "server-a" }] })
    );
    expect(result).toEqual([{ id: "a", v: "server-a", updatedAt: undefined }]);
  });

  it("2a. both sides, no pending -> server wins by default", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a" }],
        server: [{ clientId: "a", v: "server-a" }],
      })
    );
    expect(result).toEqual([{ id: "a", v: "server-a", updatedAt: undefined }]);
  });

  it("2b. both sides, no pending -> resolveConflict invoked when provided", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a" }],
        server: [{ clientId: "a", v: "server-a" }],
        resolveConflict: (local) => local,
      })
    );
    expect(result).toEqual([{ id: "a", v: "local-a" }]);
  });

  it("3. both sides, pending id -> local kept even when server differs", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a" }],
        server: [{ clientId: "a", v: "server-a" }],
        pending: new Set(["a"]),
      })
    );
    expect(result).toEqual([{ id: "a", v: "local-a" }]);
  });

  it("4. both sides, queueKnown=false -> local kept regardless of pending", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a" }],
        server: [{ clientId: "a", v: "server-a" }],
        queueKnown: false,
      })
    );
    expect(result).toEqual([{ id: "a", v: "local-a" }]);
  });

  it("5. local-only, pending -> kept", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a" }],
        pending: new Set(["a"]),
      })
    );
    expect(result).toEqual([{ id: "a", v: "local-a" }]);
  });

  it("6. local-only, not pending, dropLocalOnly=true -> dropped", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a" }],
        dropLocalOnly: () => true,
      })
    );
    expect(result).toEqual([]);
  });

  it("7. local-only, not pending, dropLocalOnly=false -> kept (history's out-of-range case)", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a" }],
        dropLocalOnly: () => false,
      })
    );
    expect(result).toEqual([{ id: "a", v: "local-a" }]);
  });

  it("8. in-flight delete: server has clientId with no local copy and it's pending -> not resurrected", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [],
        server: [{ clientId: "x", v: "server-x" }],
        pending: new Set(["x"]),
      })
    );
    expect(result.find((l) => l.id === "x")).toBeUndefined();
    expect(result).toEqual([]);
  });

  it("8b. server item with no local copy and NOT pending is still added (not a delete)", () => {
    const result = mergeQueueAware(
      baseInput({
        local: [],
        server: [{ clientId: "x", v: "server-x" }],
        pending: new Set(),
      })
    );
    expect(result).toEqual([{ id: "x", v: "server-x", updatedAt: undefined }]);
  });

  it("9. LWW policy via resolveConflict comparing updatedAt (tie -> server)", () => {
    const resolveConflict = (local: Local, server: Server): Local =>
      local.updatedAt !== undefined &&
      server.updatedAt !== undefined &&
      local.updatedAt > server.updatedAt
        ? local
        : toLocal(server);

    // Local newer -> local wins.
    const newer = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a", updatedAt: 20 }],
        server: [{ clientId: "a", v: "server-a", updatedAt: 10 }],
        resolveConflict,
      })
    );
    expect(newer).toEqual([{ id: "a", v: "local-a", updatedAt: 20 }]);

    // Tie -> server wins.
    const tie = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a", updatedAt: 10 }],
        server: [{ clientId: "a", v: "server-a", updatedAt: 10 }],
        resolveConflict,
      })
    );
    expect(tie).toEqual([{ id: "a", v: "server-a", updatedAt: 10 }]);

    // Server newer -> server wins.
    const olderLocal = mergeQueueAware(
      baseInput({
        local: [{ id: "a", v: "local-a", updatedAt: 5 }],
        server: [{ clientId: "a", v: "server-a", updatedAt: 10 }],
        resolveConflict,
      })
    );
    expect(olderLocal).toEqual([{ id: "a", v: "server-a", updatedAt: 10 }]);
  });

  it("10. metadata-guard policy via resolveConflict (server copy without content must not replace full local)", () => {
    interface MetaLocal {
      id: string;
      contentLen: number;
    }
    interface MetaServer {
      clientId: string;
      content?: string[];
    }
    const metaToLocal = (s: MetaServer): MetaLocal => ({
      id: s.clientId,
      contentLen: s.content?.length ?? 0,
    });
    const resolveConflict = (local: MetaLocal, server: MetaServer): MetaLocal =>
      !(server.content && server.content.length > 0) && local.contentLen > 0
        ? local
        : metaToLocal(server);

    // Metadata-only server payload (no content) must not replace full local.
    const metaOnly = mergeQueueAware<MetaLocal, MetaServer>({
      local: [{ id: "a", contentLen: 3 }],
      server: [{ clientId: "a" }],
      localId: (l) => l.id,
      serverId: (s) => s.clientId,
      toLocal: metaToLocal,
      pending: new Set(),
      queueKnown: true,
      resolveConflict,
      dropLocalOnly: () => true,
    });
    expect(metaOnly).toEqual([{ id: "a", contentLen: 3 }]);

    // Full server payload with content DOES replace local.
    const fullPayload = mergeQueueAware<MetaLocal, MetaServer>({
      local: [{ id: "a", contentLen: 3 }],
      server: [{ clientId: "a", content: ["x", "y"] }],
      localId: (l) => l.id,
      serverId: (s) => s.clientId,
      toLocal: metaToLocal,
      pending: new Set(),
      queueKnown: true,
      resolveConflict,
      dropLocalOnly: () => true,
    });
    expect(fullPayload).toEqual([{ id: "a", contentLen: 2 }]);
  });
});
