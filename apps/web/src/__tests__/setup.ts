/**
 * Test setup for apps/web.
 *
 * Mocks Prisma client and Clerk auth so unit tests can run
 * without a database or auth service.
 */

import { vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// ─── Prisma mock ─────────────────────────────────────────────

// Create a deep mock of PrismaClient
export const prismaMock = mockDeep<PrismaClient>();

// Mock the db module so all imports of `@/lib/db` get the mock
vi.mock("../lib/db", () => ({
  db: prismaMock,
}));

// Also mock the @/ alias version (used by source files)
vi.mock("@/lib/db", () => ({
  db: prismaMock,
}));

// Reset all mocks between tests
beforeEach(() => {
  mockReset(prismaMock);
});

// ─── Clerk mock ──────────────────────────────────────────────

// Mock @clerk/nextjs for any test that imports it
vi.mock("@clerk/nextjs", () => ({
  auth: vi.fn(() => ({ userId: "test-user-id" })),
  currentUser: vi.fn(() => ({
    id: "test-user-id",
    firstName: "Test",
    lastName: "User",
    emailAddresses: [{ emailAddress: "test@example.com" }],
  })),
  clerkMiddleware: vi.fn(() => (req: unknown, res: unknown, next: unknown) => {}),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => ({ userId: "test-user-id" })),
  currentUser: vi.fn(() => ({
    id: "test-user-id",
    firstName: "Test",
    lastName: "User",
    emailAddresses: [{ emailAddress: "test@example.com" }],
  })),
}));
