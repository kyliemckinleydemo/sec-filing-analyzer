/**
 * @module __tests__/mocks/prisma
 * @description Vitest mock factory providing stubbed Prisma client with spies for all database models and CRUD operations used in test environments
 *
 * PURPOSE:
 * - Mock all Prisma database models (filing, company, user, prediction, analystActivity, paperPortfolio, paperTrade, portfolioSnapshot, magicLinkToken, cronJobRun, companySnapshot, macroIndicators, stockPrice) with Vitest spy functions
 * - Replace @/lib/prisma module with prismaMock during test execution to prevent real database calls
 * - Enable test assertions on database method calls like findUnique, create, update, delete without touching actual database
 * - Provide consistent mock structure matching Prisma client API for isolated unit testing
 *
 * DEPENDENCIES:
 * - vitest - Provides vi.fn() for creating spy functions and vi.mock() for module interception
 *
 * EXPORTS:
 * - prismaMock (const) - Mock Prisma client object with 13 model namespaces, each containing 8-10 spied CRUD methods (findUnique, findFirst, findMany, create, update, updateMany, upsert, delete, deleteMany, count)
 *
 * PATTERNS:
 * - Import prismaMock in test files: import { prismaMock } from '@/__tests__/mocks/prisma'
 * - Stub return values before test: prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: 'test@example.com' })
 * - Assert method calls after test: expect(prismaMock.filing.create).toHaveBeenCalledWith({ data: { ... } })
 * - Reset mocks between tests: vi.clearAllMocks() or prismaMock.user.findUnique.mockReset()
 *
 * CLAUDE NOTES:
 * - Auto-mocks @/lib/prisma module via vi.mock() at bottom - imported prisma instance in application code automatically uses prismaMock during tests
 * - Some models like filing and cronJobRun include updateMany, while prediction and companySnapshot have deleteMany - reflects actual Prisma schema operations used
 * - All spy functions return undefined by default - tests must explicitly mock return values with mockResolvedValue/mockReturnValue before assertions
 * - Covers financial domain models (filing, company, stockPrice, macroIndicators), user authentication (user, magicLinkToken), trading simulation (paperPortfolio, paperTrade), and analytics (prediction, analystActivity, portfolioSnapshot, companySnapshot)
 */
import { vi } from 'vitest';

export const prismaMock = {
  filing: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  company: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  prediction: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  analystActivity: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  paperPortfolio: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  paperTrade: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  portfolioSnapshot: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  magicLinkToken: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  cronJobRun: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  companySnapshot: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  macroIndicators: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  stockPrice: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));
