import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      SWAP_CONTRACT_ID: 'CA3D5KFYF6J7YJ4CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6',
      ORACLE_SECRET_KEY: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
    },
    testTimeout: 30000,
  },
})