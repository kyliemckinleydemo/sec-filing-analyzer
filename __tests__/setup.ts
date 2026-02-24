/**
 * @module __tests__/setup
 * @description Configures Vitest test environment by setting required environment variables and clearing mock state between tests
 *
 * PURPOSE:
 * - Set environment variables for JWT authentication, database connections, email service, and application URLs
 * - Clear all Vitest mocks before each test to prevent state leakage between test cases
 * - Provide consistent test environment configuration for PostgreSQL database and Resend email service
 * - Enable isolated test execution with fresh mock state and predictable environment values
 *
 * DEPENDENCIES:
 * - vitest - Provides beforeEach hook for test lifecycle management and vi.clearAllMocks() for mock cleanup
 *
 * PATTERNS:
 * - Import this file in vitest.config.ts setupFiles array to apply globally before all tests run
 * - Environment variables are automatically available in all test files via process.env
 * - Mocks cleared automatically before each test - no manual cleanup needed in individual test files
 *
 * CLAUDE NOTES:
 * - Uses hardcoded test credentials ('test-jwt-secret-key-for-testing', 'postgresql://test:test@localhost:5432/test') that are safe for CI/CD environments
 * - Sets NODE_ENV to 'test' which may trigger conditional behavior in application code like disabling analytics or using mock services
 * - CRON_SECRET and ALERT_EMAIL suggest the application has scheduled jobs and monitoring that need test configuration
 * - Both NEXT_PUBLIC_BASE_URL and VERCEL_URL set to localhost, supporting local development testing and Vercel deployment preview environments
 */
import { beforeEach, vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.RESEND_API_KEY = 're_test_key';
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.ALERT_EMAIL = 'test@example.com';
process.env.VERCEL_URL = 'localhost:3000';

beforeEach(() => {
  vi.clearAllMocks();
});
