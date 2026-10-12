import { defineConfig } from 'vitest/config';

// 서버 규칙(firestore.rules) 테스트. Firestore 에뮬레이터 안에서만 돈다: npm run test:rules
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.rules.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
