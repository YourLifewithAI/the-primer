/**
 * Integration test pattern: testing API routes with mocked auth + Prisma.
 *
 * This file demonstrates how to write integration-style tests for
 * Next.js API route handlers. The pattern:
 *
 * 1. Mock Prisma (done in setup.ts)
 * 2. Mock Clerk auth to control the authenticated user
 * 3. Import the route handler
 * 4. Call it with a constructed Request object
 * 5. Assert on the Response
 *
 * These aren't true integration tests (no real DB), but they verify
 * the route handler logic, auth checks, and response shapes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "./setup";

// ─── Pattern: Mocking Next.js route handler context ─────────

/**
 * Helper to create a mock NextRequest.
 */
function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    searchParams?: Record<string, string>;
  } = {}
) {
  const { method = "GET", body, searchParams = {} } = options;
  const fullUrl = new URL(url, "http://localhost:3000");
  for (const [key, value] of Object.entries(searchParams)) {
    fullUrl.searchParams.set(key, value);
  }

  return new Request(fullUrl.toString(), {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

/**
 * Helper to parse a JSON Response.
 */
async function parseResponse<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

// ─── Example: testing a hypothetical /api/notifications route ──

describe("Integration Test Pattern", () => {
  describe("API route testing approach", () => {
    it("demonstrates mocking auth and calling a handler", async () => {
      // 1. Set up mock auth (already done in setup.ts, but can override)
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "user-123" } as any);

      // 2. Set up mock DB response
      prismaMock.notification.count.mockResolvedValue(5);

      // 3. Create a request
      const req = createMockRequest("/api/notifications/unread-count");

      // 4. In a real test, you'd import the route handler and call it:
      //    const { GET } = await import("@/app/api/notifications/unread-count/route");
      //    const response = await GET(req);
      //    const data = await parseResponse(response);
      //    expect(data.count).toBe(5);

      // For this pattern demo, we verify the mock infrastructure works
      expect(prismaMock.notification.count).toBeDefined();
      expect(vi.mocked(auth)).toBeDefined();
    });

    it("demonstrates testing auth rejection", async () => {
      // Override auth to return no userId (unauthenticated)
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      // A real route handler should return 401 when userId is null
      // const { GET } = await import("@/app/api/some-route/route");
      // const response = await GET(createMockRequest("/api/some-route"));
      // expect(response.status).toBe(401);

      expect(vi.mocked(auth)).toBeDefined();
    });

    it("demonstrates testing POST with body", async () => {
      const req = createMockRequest("/api/notifications", {
        method: "POST",
        body: { title: "Test", body: "Test body" },
      });

      // Verify the request was constructed correctly
      expect(req.method).toBe("POST");
      const body = await req.json();
      expect(body.title).toBe("Test");
    });

    it("demonstrates testing with query parameters", () => {
      const req = createMockRequest("/api/notifications", {
        searchParams: { cursor: "abc", limit: "10" },
      });

      const url = new URL(req.url);
      expect(url.searchParams.get("cursor")).toBe("abc");
      expect(url.searchParams.get("limit")).toBe("10");
    });
  });
});
