import { beforeEach, vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.RESEND_API_KEY = 're_test_key';
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';

beforeEach(() => {
  vi.clearAllMocks();
});
