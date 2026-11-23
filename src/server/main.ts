/**
 * main.ts — Entry point for the HTTP server.
 * Reads PORT from environment and starts the server.
 * Separated from index.ts so tests can import the factory without auto-starting.
 */

import { startServer } from './index.js';

const port = parseInt(process.env['PORT'] ?? '3000', 10);
startServer(port);
