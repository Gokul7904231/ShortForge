import { describe, expect, it } from "vitest";
import { AgentWorkforceStore } from "../core/agent/AgentWorkforceStore";
import { DurableEventBus } from "../core/events/DurableEventBus";

describe("Wave 3 Agent Workforce", () => {
  function setup() {
    const eventBus = new DurableEventBus();
    const store = new AgentWorkforceStore({
      workspaceId: "workspace_test",
      eventBus,
    });
    return { store, eventBus };
  }

  it("creates a durable team agent with creator ownership", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Research Lead",
      role: "RESEARCH",
      specialization: "Evidence synthesis",
      allowedCapabilities: ["CAP_NET_READ", "CAP_RESEARCH_EXEC"],
      allowedToolIds: ["research.search"],
      preferredModel: { providerId: "gemini", modelId: "gemini-fast" },
    }, "alice");

    expect(agent.agentId).toMatch(/^agent_/);
    expect(agent.creatorId).toBe("alice");
    expect(agent.members).toEqual([
      expect.objectContaining({ principalId: "alice", role: "OWNER", active: true }),
    ]);
    expect(agent.preferredModel?.modelId).toBe("gemini-fast");
  });

  it("lets an owner co-manage an agent and lets the granted user use it", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Creative Lead",
      role: "CREATIVE",
    }, "alice");

    const updated = await store.grant(agent.agentId, {
      principalId: "bob",
      role: "EDITOR",
    }, "alice");

    expect(updated.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ principalId: "bob", role: "EDITOR", active: true }),
    ]));
    expect(await store.canUse(agent.agentId, "bob")).toBe(true);
    expect(await store.canEdit(agent.agentId, "bob")).toBe(true);
  });

  it("allows workspace admins to manage fleet agents without being copied into each agent membership", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Ops Agent",
      role: "OPS",
    }, "alice");

    const updated = await store.update(agent.agentId, {
      description: "Updated by workspace admin",
    }, "admin", "ADMIN");

    expect(updated.description).toBe("Updated by workspace admin");
  });

  it("redacts agent system prompts and connection references from regular users", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Finance Agent",
      role: "FINANCE",
      systemPrompt: "PRIVATE_AGENT_POLICY",
    }, "alice");

    await store.grant(agent.agentId, { principalId: "bob", role: "USER" }, "alice");
    await store.bindIntegration(agent.agentId, {
      integrationId: "finance-ledger",
      provider: "gdrive",
      connectionRef: "secret-connection-ref",
      scope: "finance/read",
    }, "alice");

    const userView = await store.get(agent.agentId, {
      principalId: "bob",
      workspaceRole: "EDITOR",
    });

    expect(userView?.systemPrompt).toBeUndefined();
    expect(userView?.integrations[0]?.connectionRef).toBe("REDACTED");

    const ownerView = await store.get(agent.agentId, {
      principalId: "alice",
      workspaceRole: "OWNER",
    });

    expect(ownerView?.systemPrompt).toBe("PRIVATE_AGENT_POLICY");
    expect(ownerView?.integrations[0]?.connectionRef).toBe("secret-connection-ref");
  });

  it("rejects non-manager configuration edits", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Locked Agent",
      role: "SPECIALIST",
    }, "alice");
    await store.grant(agent.agentId, { principalId: "bob", role: "USER" }, "alice");

    await expect(
      store.update(agent.agentId, { name: "Tampered" }, "bob"),
    ).rejects.toThrow("AGENT_EDIT_PERMISSION_REQUIRED");
  });

  it("preserves optimistic concurrency and prevents stale settings writes", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Concurrent Agent",
      role: "SPECIALIST",
    }, "alice");

    const saved = await store.update(agent.agentId, {
      description: "First write",
      expectedVersion: agent.version,
    }, "alice");

    await expect(
      store.update(agent.agentId, {
        description: "Stale write",
        expectedVersion: agent.version,
      }, "alice"),
    ).rejects.toThrow("AGENT_WORKFORCE_VERSION_CONFLICT");

    expect(saved.description).toBe("First write");
  });

  it("emits durable workforce events without embedding secret credentials", async () => {
    const { store, eventBus } = setup();

    const agent = await store.create({
      name: "Event Agent",
      role: "SPECIALIST",
    }, "alice");

    await store.grant(agent.agentId, { principalId: "bob", role: "EDITOR" }, "alice");
    await store.bindIntegration(agent.agentId, {
      integrationId: "slack",
      provider: "slack",
      connectionRef: "vault:slack/team-alpha",
      scope: "workspace/messages",
    }, "alice");

    const events = await eventBus.replay();
    expect(events.some((event) => event.topic === "AGENT_WORKFORCE_CREATED")).toBe(true);
    expect(events.some((event) => event.topic === "AGENT_WORKFORCE_MEMBER_GRANTED")).toBe(true);
    expect(events.some((event) => event.topic === "AGENT_WORKFORCE_INTEGRATION_BOUND")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("api_key");
    expect(JSON.stringify(events)).not.toContain("password");
  });
});
