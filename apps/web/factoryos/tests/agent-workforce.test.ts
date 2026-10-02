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

  it("lets the creator co-own an agent but blocks ownership transfer by an editor", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Shared Agent",
      role: "SPECIALIST",
    }, "alice");

    const shared = await store.grant(agent.agentId, {
      principalId: "bob",
      role: "OWNER",
    }, "alice");

    expect(shared.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ principalId: "bob", role: "OWNER", active: true }),
    ]));

    await expect(
      store.grant(agent.agentId, { principalId: "carol", role: "OWNER" }, "bob"),
    ).rejects.toThrow("Only the original creator may transfer agent ownership.");
  });

  it("blocks capability escalation and live integration binding for non-owners", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Secure Agent",
      role: "SPECIALIST",
    }, "alice");
    await store.grant(agent.agentId, { principalId: "bob", role: "EDITOR" }, "alice");

    await expect(
      store.update(agent.agentId, {
        allowedCapabilities: ["CAP_RENDER_DISPATCH"],
      }, "bob"),
    ).rejects.toThrow("AGENT_CAPABILITY_MANAGEMENT_REQUIRED");

    await expect(
      store.bindIntegration(agent.agentId, {
        integrationId: "youtube",
        provider: "youtube",
        connectionRef: "vault:youtube/channel",
        scope: "publish",
      }, "bob"),
    ).rejects.toThrow("AGENT_INTEGRATION_MANAGEMENT_REQUIRED");
  });

  it("rejects credential-shaped integration references", async () => {
    const { store } = setup();

    const agent = await store.create({
      name: "Connection Guard",
      role: "SPECIALIST",
    }, "alice");

    await expect(
      store.bindIntegration(agent.agentId, {
        integrationId: "provider",
        provider: "test",
        connectionRef: "sk-live-secret-value",
        scope: "read",
      }, "alice"),
    ).rejects.toThrow("AGENT_INTEGRATION_SECRET_FORBIDDEN");
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
