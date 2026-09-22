/**
 * ShortForge Creator ↔ FactoryOS Product Boundary Test Suite
 *
 * Verifies:
 * 1. Explicit Route Classification (isInternalFactoryRoute)
 * 2. Role-Based Navigation Generation (getNavigationForRole)
 * 3. Server-Side Middleware Route Authorization
 * 4. Internal API Authorization Gates
 * 5. Creator-Safe /api/factory-state Projection
 */

import { describe, it, expect } from 'vitest';
import {
  isInternalFactoryRoute,
  getNavigationForRole,
  ROUTE_SECTIONS,
} from '../lib/core/RouteRegistry';
import { createSignedSessionToken } from '../lib/auth/jwt-session';
import { middleware } from '../middleware';
import { NextRequest } from 'next/server';

describe('ShortForge ↔ FactoryOS Product Boundary Suite', () => {
  // =========================================================================
  // 1. ROUTE CLASSIFICATION TESTS
  // =========================================================================
  describe('Route Classification: isInternalFactoryRoute', () => {
    it('classifies internal FactoryOS operator routes correctly', () => {
      expect(isInternalFactoryRoute('/factory/workflows')).toBe(true);
      expect(isInternalFactoryRoute('/factory/queue')).toBe(true);
      expect(isInternalFactoryRoute('/factory/scheduler')).toBe(true);
      expect(isInternalFactoryRoute('/ai/models')).toBe(true);
      expect(isInternalFactoryRoute('/ai/marketplace')).toBe(true);
      expect(isInternalFactoryRoute('/ai/capability-registry')).toBe(true);
      expect(isInternalFactoryRoute('/ai/runtime')).toBe(true);
      expect(isInternalFactoryRoute('/ai/benchmarks')).toBe(true);
      expect(isInternalFactoryRoute('/ai/events')).toBe(true);
      expect(isInternalFactoryRoute('/dashboard/ai-hospital')).toBe(true);
      expect(isInternalFactoryRoute('/dashboard/voice-registry')).toBe(true);
      expect(isInternalFactoryRoute('/dashboard/profiler')).toBe(true);
      expect(isInternalFactoryRoute('/dashboard/workers')).toBe(true);
      expect(isInternalFactoryRoute('/dashboard/simulation')).toBe(true);
      expect(isInternalFactoryRoute('/settings/api')).toBe(true);
      expect(isInternalFactoryRoute('/admin')).toBe(true);
      expect(isInternalFactoryRoute('/admin/users')).toBe(true);
      expect(isInternalFactoryRoute('/overseer')).toBe(true);
    });

    it('guarantees creator routes are NEVER flagged as internal (No blanket /factory/* rule)', () => {
      // CRITICAL CORRECTION 2: /factory/templates and /factory/jobs are creator surfaces
      expect(isInternalFactoryRoute('/factory/templates')).toBe(false);
      expect(isInternalFactoryRoute('/factory/jobs')).toBe(false);
      expect(isInternalFactoryRoute('/dashboard')).toBe(false);
      expect(isInternalFactoryRoute('/engines')).toBe(false);
      expect(isInternalFactoryRoute('/engines/quiz')).toBe(false);
      expect(isInternalFactoryRoute('/engines/facts')).toBe(false);
      expect(isInternalFactoryRoute('/media/assets')).toBe(false);
      expect(isInternalFactoryRoute('/media/library')).toBe(false);
      expect(isInternalFactoryRoute('/publishing/youtube')).toBe(false);
      expect(isInternalFactoryRoute('/analytics/heatmaps')).toBe(false);
      expect(isInternalFactoryRoute('/settings')).toBe(false);
      expect(isInternalFactoryRoute('/pricing')).toBe(false);
    });
  });

  // =========================================================================
  // 2. NAVIGATION ISOLATION TESTS
  // =========================================================================
  describe('Navigation Isolation: getNavigationForRole', () => {
    it('produces pure creator navigation for BASIC / USER without any FactoryOS controls', () => {
      const nav = getNavigationForRole('USER');

      // 1. Must not contain any factory-surface section
      const factorySections = nav.filter((s) => s.surface === 'factory');
      expect(factorySections).toHaveLength(0);

      // 2. Must not contain any admin-only route
      const allRoutes = nav.flatMap((s) => s.routes);
      const adminRoutes = allRoutes.filter((r) => r.minRole === 'ADMIN');
      expect(adminRoutes).toHaveLength(0);

      // 3. Prohibited internal routes must NOT be present
      const hrefs = allRoutes.map((r) => r.href);
      expect(hrefs).not.toContain('/factory/workflows');
      expect(hrefs).not.toContain('/factory/queue');
      expect(hrefs).not.toContain('/factory/scheduler');
      expect(hrefs).not.toContain('/ai/models');
      expect(hrefs).not.toContain('/ai/capability-registry');
      expect(hrefs).not.toContain('/ai/runtime');
      expect(hrefs).not.toContain('/ai/benchmarks');
      expect(hrefs).not.toContain('/ai/events');
      expect(hrefs).not.toContain('/settings/api');
      expect(hrefs).not.toContain('/dashboard/ai-hospital');
      expect(hrefs).not.toContain('/dashboard/workers');
      expect(hrefs).not.toContain('/admin/users');

      // 4. Legitimate creator routes MUST be present
      expect(hrefs).toContain('/factory/templates'); // Templates
      expect(hrefs).toContain('/factory/jobs');      // My Videos
      expect(hrefs).toContain('/engines');           // Content engines
      expect(hrefs).toContain('/publishing/youtube'); // Publishing
      expect(hrefs).toContain('/analytics/heatmaps'); // Analytics
      expect(hrefs).toContain('/settings');           // Account settings
    });

    it('provides both Creator and FactoryOS Control Plane navigation to ADMIN / OWNER', () => {
      const nav = getNavigationForRole('ADMIN');

      // 1. Creator sections remain accessible to Admin
      const creatorSections = nav.filter((s) => s.surface === 'creator');
      expect(creatorSections.length).toBeGreaterThan(0);

      // 2. FactoryOS Control Plane sections are present and distinctly marked
      const factorySections = nav.filter((s) => s.surface === 'factory');
      expect(factorySections.length).toBeGreaterThan(0);

      const sectionIds = factorySections.map((s) => s.id);
      expect(sectionIds).toContain('factory-ops');
      expect(sectionIds).toContain('factory-intel');
      expect(sectionIds).toContain('factory-obs');
      expect(sectionIds).toContain('factory-admin');

      // 3. Admin can access internal operational routes
      const hrefs = nav.flatMap((s) => s.routes).map((r) => r.href);
      expect(hrefs).toContain('/factory/workflows');
      expect(hrefs).toContain('/factory/queue');
      expect(hrefs).toContain('/ai/models');
      expect(hrefs).toContain('/ai/capability-registry');
      expect(hrefs).toContain('/ai/runtime');
      expect(hrefs).toContain('/ai/benchmarks');
      expect(hrefs).toContain('/ai/events');
      expect(hrefs).toContain('/settings/api');
      expect(hrefs).toContain('/dashboard/ai-hospital');
      expect(hrefs).toContain('/admin/users');
    });
  });

  // =========================================================================
  // 3. SERVER-SIDE MIDDLEWARE ROUTE PROTECTION TESTS
  // =========================================================================
  describe('Middleware Server-Side Enforcement', () => {
    const basicUserToken = createSignedSessionToken('user_basic_01', 'creator@example.com', 'USER', 3600000);
    const adminUserToken = createSignedSessionToken('user_admin_01', 'operator@example.com', 'ADMIN', 3600000);

    it('redirects basic user attempting direct access to /factory/workflows to /dashboard (307)', () => {
      const req = new NextRequest('http://localhost:3000/factory/workflows', {
        headers: {
          cookie: `__session=${basicUserToken}`,
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/dashboard');
      expect(res.headers.get('location')).toContain('denied=operator_access');
    });

    it('redirects basic user attempting direct access to /ai/models to /dashboard (307)', () => {
      const req = new NextRequest('http://localhost:3000/ai/models', {
        headers: {
          cookie: `__session=${basicUserToken}`,
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/dashboard');
    });

    it('redirects basic user attempting direct access to /settings/api to /dashboard (307)', () => {
      const req = new NextRequest('http://localhost:3000/settings/api', {
        headers: {
          cookie: `__session=${basicUserToken}`,
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/dashboard');
    });

    it('allows basic user access to creator surfaces (/factory/templates & /factory/jobs)', () => {
      const reqTemplates = new NextRequest('http://localhost:3000/factory/templates', {
        headers: {
          cookie: `__session=${basicUserToken}`,
        },
      });
      const resTemplates = middleware(reqTemplates);
      expect(resTemplates.status).toBe(200); // NextResponse.next() is status 200

      const reqJobs = new NextRequest('http://localhost:3000/factory/jobs', {
        headers: {
          cookie: `__session=${basicUserToken}`,
        },
      });
      const resJobs = middleware(reqJobs);
      expect(resJobs.status).toBe(200);
    });

    it('allows admin user full access to internal FactoryOS operator routes', () => {
      const reqWorkflows = new NextRequest('http://localhost:3000/factory/workflows', {
        headers: {
          cookie: `__session=${adminUserToken}`,
        },
      });
      const resWorkflows = middleware(reqWorkflows);
      expect(resWorkflows.status).toBe(200);

      const reqModels = new NextRequest('http://localhost:3000/ai/models', {
        headers: {
          cookie: `__session=${adminUserToken}`,
        },
      });
      const resModels = middleware(reqModels);
      expect(resModels.status).toBe(200);
    });
  });

  // =========================================================================
  // 4. INTERNAL API AUTHORIZATION GATES
  // =========================================================================
  describe('Internal API Authorization Gates', () => {
    const basicUserToken = createSignedSessionToken('user_basic_02', 'creator2@example.com', 'USER', 3600000);
    const adminUserToken = createSignedSessionToken('user_admin_02', 'operator2@example.com', 'ADMIN', 3600000);

    it('rejects unauthenticated and basic users from /api/models with 401/403', async () => {
      const { GET } = await import('../app/api/models/route');

      // Unauthenticated
      const reqUnauth = new NextRequest('http://localhost:3000/api/models');
      const resUnauth = await GET(reqUnauth);
      expect([401, 403]).toContain(resUnauth.status);

      // Basic User
      const reqBasic = new NextRequest('http://localhost:3000/api/models', {
        headers: { cookie: `__session=${basicUserToken}` },
      });
      const resBasic = await GET(reqBasic);
      expect(resBasic.status).toBe(403);
      const dataBasic = await resBasic.json();
      expect(dataBasic.success).toBe(false);
    });

    it('rejects basic users from /api/settings/api GET and POST with 403', async () => {
      const { GET, POST } = await import('../app/api/settings/api/route');

      const reqBasic = new NextRequest('http://localhost:3000/api/settings/api', {
        headers: { cookie: `__session=${basicUserToken}` },
      });
      const resGet = await GET(reqBasic);
      expect(resGet.status).toBe(403);

      const reqPost = new NextRequest('http://localhost:3000/api/settings/api', {
        method: 'POST',
        headers: { cookie: `__session=${basicUserToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'discover_models' }),
      });
      const resPost = await POST(reqPost);
      expect(resPost.status).toBe(403);
    });

    it('rejects basic users from /api/providers GET and POST with 403', async () => {
      const { GET, POST } = await import('../app/api/providers/route');

      const reqBasic = new NextRequest('http://localhost:3000/api/providers', {
        headers: { cookie: `__session=${basicUserToken}` },
      });
      const resGet = await GET(reqBasic);
      expect(resGet.status).toBe(403);

      const reqPost = new NextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        headers: { cookie: `__session=${basicUserToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'test', name: 'Test', baseUrl: 'http://localhost' }),
      });
      const resPost = await POST(reqPost);
      expect(resPost.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. CREATOR-SAFE /api/factory-state PROJECTION (Correction 4)
  // =========================================================================
  describe('Creator-Safe /api/factory-state Projection', () => {
    const basicUserToken = createSignedSessionToken('user_basic_03', 'creator3@example.com', 'USER', 3600000);
    const adminUserToken = createSignedSessionToken('user_admin_03', 'operator3@example.com', 'ADMIN', 3600000);

    it('returns creator-safe projection for basic user without leaking internal state', async () => {
      const { GET } = await import('../app/api/factory-state/route');

      const req = new NextRequest('http://localhost:3000/api/factory-state', {
        headers: { cookie: `__session=${basicUserToken}` },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.surface).toBe('creator');

      // Creator metrics MUST be present
      expect(data.jobs).toBeDefined();
      expect(data.jobsSummary).toBeDefined();
      expect(data.activeEngines).toBeDefined();

      // FactoryOS operator internals MUST NOT be present
      expect(data.activeProviders).toBeUndefined();
      expect(data.events).toBeUndefined();
      expect(data.queues).toBeUndefined();
      expect(data.factoryOS).toBeUndefined();
      expect(data.system).toBeUndefined();
    });

    it('returns complete FactoryOS control plane telemetry for admin user', async () => {
      const { GET } = await import('../app/api/factory-state/route');

      const req = new NextRequest('http://localhost:3000/api/factory-state', {
        headers: { cookie: `__session=${adminUserToken}` },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.surface).toBe('factory');

      // Operator internals MUST be present
      expect(data.system).toBeDefined();
      expect(data.queues).toBeDefined();
      expect(data.activeProviders).toBeDefined();
      expect(data.events).toBeDefined();
    });
  });
});
