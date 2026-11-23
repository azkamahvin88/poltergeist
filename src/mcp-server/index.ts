/**
 * index.ts — Minimal MCP stdio transport for Poltergeist.
 * JSON-RPC 2.0, newline-delimited over stdin/stdout.
 * Logging goes to stderr only.
 */

import * as readline from 'node:readline';
import {
  TOOL_SCHEMAS,
  handleAnalyzeRepo,
  handleListGhosts,
  handleGetFileHaunting,
  handleAskSeance,
} from './tools.js';

function log(msg: string, data?: unknown): void {
  const line = data !== undefined
    ? `[poltergeist-mcp] ${msg} ${JSON.stringify(data)}`
    : `[poltergeist-mcp] ${msg}`;
  process.stderr.write(line + '\n');
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function sendResponse(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function ok(id: string | number | null, result: unknown): void {
  sendResponse({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: string | number | null, code: number, message: string): void {
  sendResponse({ jsonrpc: '2.0', id, error: { code, message } });
}

const E_PARSE    = -32700;
const E_METHOD   = -32601;
const E_PARAMS   = -32602;
const E_INTERNAL = -32603;

function handleInitialize(id: string | number | null): void {
  ok(id, {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'poltergeist', version: '0.1.0' },
  });
}

function handleToolsList(id: string | number | null): void {
  ok(id, { tools: TOOL_SCHEMAS });
}

async function handleToolsCall(id: string | number | null, params: unknown): Promise<void> {
  const p = params as { name?: string; arguments?: Record<string, unknown> };
  if (!p?.name) { rpcErr(id, E_PARAMS, 'Missing tool name'); return; }

  const args = p.arguments ?? {};
  log(`tool call: ${p.name}`, args);

  try {
    let result: unknown;
    switch (p.name) {
      case 'analyze_repo':
        result = await handleAnalyzeRepo(args as Parameters<typeof handleAnalyzeRepo>[0]);
        break;
      case 'list_ghosts':
        result = await handleListGhosts(args as Parameters<typeof handleListGhosts>[0]);
        break;
      case 'get_file_haunting':
        result = await handleGetFileHaunting(args as Parameters<typeof handleGetFileHaunting>[0]);
        break;
      case 'ask_seance':
        result = await handleAskSeance(args as Parameters<typeof handleAskSeance>[0]);
        break;
      default:
        rpcErr(id, E_METHOD, `Unknown tool: ${p.name}`); return;
    }
    ok(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log('tool error', { tool: p.name, error: msg });
    rpcErr(id, E_INTERNAL, msg);
  }
}

async function dispatch(raw: string): Promise<void> {
  let msg: JsonRpcRequest;
  try { msg = JSON.parse(raw) as JsonRpcRequest; }
  catch { rpcErr(null, E_PARSE, 'Parse error'); return; }

  const id = msg.id ?? null;
  const method = msg.method ?? '';
  log(`<- ${method}`, id !== null ? { id } : undefined);

  switch (method) {
    case 'initialize':
      handleInitialize(id); break;
    case 'notifications/initialized':
      break; // notification, no response
    case 'ping':
      ok(id, {}); break;
    case 'tools/list':
      handleToolsList(id); break;
    case 'tools/call':
      await handleToolsCall(id, msg.params); break;
    default:
      rpcErr(id, E_METHOD, `Method not found: ${method}`);
  }
}

export function startMcpServer(): void {
  log('Poltergeist MCP server starting on stdio');

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    void dispatch(trimmed);
  });

  rl.on('close', () => {
    log('stdin closed, exiting');
    process.exit(0);
  });
}
