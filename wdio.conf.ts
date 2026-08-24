/**
 * WebdriverIO configuration for AISpur E2E tests.
 *
 * Uses @wdio/tauri-service to drive the Tauri application binary directly.
 * The app must be built in debug mode before running:
 *   source ~/.cargo/env && npm run tauri -- dev &   # or build debug
 *
 * Run:
 *   npx wdio run wdio.conf.ts
 */
import type { Options } from '@wdio/types';
import * as path from 'path';

// The debug binary produced by `tauri dev` / `cargo tauri dev`.
// Name comes from `mainBinaryName` in tauri.conf.json (branded uppercase),
// not the lowercase Cargo package name.
const APP_BINARY = path.resolve(
  __dirname,
  'src-tauri/target/debug/AISpur'
);

export const config: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: 'tsconfig.json',
    },
  },

  specs: ['./tests/e2e/**/*.spec.ts'],
  exclude: [],

  maxInstances: 1,

  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        application: APP_BINARY,
      },
    },
  ],

  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  services: ['@wdio/tauri-service'],

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 30_000,
  },
};
