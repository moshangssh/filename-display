/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests/performance'],
  setupFilesAfterEnv: ['<rootDir>/tests/performance/setup.ts'],
  testMatch: ['**/*.perf.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/mocks/obsidian.ts'
  },
  reporters: [
    'default',
    ['<rootDir>/tests/performance/reporters/performance-reporter.js', {}]
  ],
  maxWorkers: 1, // 强制串行执行以获得准确的性能指标
}; 