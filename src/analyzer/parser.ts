/**
 * parser.ts — TypeScript compiler API AST parser.
 * Extracts per-file metrics from JS/TS source text.
 * Never throws: parse errors are captured in FileMetrics.parseError.
 * Never executes user code (parse mode only via ts.createSourceFile).
 */

import ts from 'typescript';
import type {
  FileMetrics,
  FunctionInfo,
  TodoComment,
  ImportInfo,
  ExportInfo,
} from './types.js';

const BRANCH_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.ConditionalExpression,  // ternary
  ts.SyntaxKind.BinaryExpression,       // && || ?? counted below
]);

const NESTING_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.CatchClause,
]);

/**
 * Extension candidates to try when mapping a compiled/runtime specifier back to a source file.
 * TypeScript ESM projects import `./foo.js` at the source level, but the actual file is `foo.ts`.
 * We normalise to the TS source extension so the rest of the pipeline can match paths consistently.
 *
 * Order matters: more specific first (.tsx before .ts, .mts before .ts).
 */
const EXT_REMAP: Array<[from: string, to: string]> = [
  ['.jsx', '.tsx'],
  ['.js',  '.ts'],
  ['.mjs', '.mts'],
  ['.cjs', '.cts'],
];

/**
 * Resolve a relative import specifier against the containing file's path.
 * Returns a normalised project-relative path with the source extension (.ts/.tsx/…),
 * or null if the specifier is not relative (bare package or Node built-in).
 *
 * Handles:
 *   - No extension    → try appending .ts (then .tsx)
 *   - .js extension   → remap to .ts
 *   - .jsx extension  → remap to .tsx
 *   - Directory index → append /index.ts
 */
export function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;

  // Build the directory of the importing file
  const parts = fromFile.split('/');
  parts.pop(); // drop filename
  const dir = [...parts];

  for (const part of specifier.split('/')) {
    if (part === '..') {
      dir.pop();
    } else if (part !== '.') {
      dir.push(part);
    }
  }

  let resolved = dir.join('/');

  // Case 1: specifier already has a remappable extension (e.g. .js → .ts)
  for (const [from, to] of EXT_REMAP) {
    if (resolved.endsWith(from)) {
      return resolved.slice(0, -from.length) + to;
    }
  }

  // Case 2: specifier has no extension — assume .ts source file
  if (!/\.[^./]+$/.test(resolved)) {
    return resolved + '.ts';
  }

  // Case 3: already has a source extension (.ts, .tsx, .mts, …) — use as-is
  return resolved;
}

/** Count nesting depth of control-flow blocks, starting from a given node */
function countNestingDepth(node: ts.Node): number {
  let maxDepth = 0;
  function walk(n: ts.Node, depth: number): void {
    const nextDepth = NESTING_KINDS.has(n.kind) ? depth + 1 : depth;
    if (nextDepth > maxDepth) maxDepth = nextDepth;
    ts.forEachChild(n, (child) => walk(child, nextDepth));
  }
  ts.forEachChild(node, (child) => walk(child, 0));
  return maxDepth;
}

/** Count cyclomatic complexity of a function body (1 + branches) */
function countCyclomaticComplexity(node: ts.Node): number {
  let count = 1; // base complexity
  function walk(n: ts.Node): void {
    if (BRANCH_KINDS.has(n.kind)) {
      if (n.kind === ts.SyntaxKind.BinaryExpression) {
        const bin = n as ts.BinaryExpression;
        const op = bin.operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          count++;
        }
      } else {
        count++;
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(node);
  return count;
}

/** Get the name of a function-like declaration */
function getFunctionName(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    if (node.name) return node.name.getText(sourceFile);
  }
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return node.name.getText(sourceFile);
  }
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  // Arrow function: look at parent for variable name
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }
  if (parent && ts.isPropertyDeclaration(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }
  return '<anonymous>';
}

/** Count non-blank, non-comment lines in source text */
function countSourceLines(source: string): { loc: number; sloc: number } {
  const lines = source.split('\n');
  let loc = 0;
  let inBlockComment = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;

    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*') || line.startsWith('*')) {
      if (line.startsWith('/*') && !line.includes('*/')) inBlockComment = true;
      continue;
    }
    loc++;
  }

  return { loc, sloc: loc };
}

/** Extract all function-like nodes at any depth */
function extractFunctions(root: ts.Node, sourceFile: ts.SourceFile): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const sourceLines = sourceFile.text.split('\n');

  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      const fn = node as ts.FunctionLikeDeclaration;
      const start = sourceFile.getLineAndCharacterOfPosition(fn.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(fn.getEnd());
      const startLine = start.line + 1;
      const endLine = end.line + 1;
      const lengthLines = endLine - startLine + 1;

      // Count SLOC within the function body
      let bodySloc = 0;
      for (let i = start.line; i <= end.line; i++) {
        const l = (sourceLines[i] ?? '').trim();
        if (l !== '' && !l.startsWith('//') && !l.startsWith('*')) bodySloc++;
      }

      const nestingDepth = countNestingDepth(fn);
      const complexity = countCyclomaticComplexity(fn);

      functions.push({
        name: getFunctionName(fn, sourceFile),
        startLine,
        lengthLines,
        nestingDepth,
        cyclomaticComplexity: complexity,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(root);
  return functions;
}

/** Extract TODO/FIXME/HACK comments from full source text */
function extractTodos(source: string): TodoComment[] {
  const todos: TodoComment[] = [];
  const lines = source.split('\n');
  const pattern = /\b(TODO|FIXME|HACK)\b/i;

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    // Single-line comments
    const slMatch = line.match(/\/\/(.*)/);
    if (slMatch) {
      const comment = slMatch[1] ?? '';
      const m = comment.match(pattern);
      if (m) {
        todos.push({ text: comment.trim(), line: idx + 1, kind: m[1]!.toUpperCase() as TodoComment['kind'] });
      }
      return;
    }
    // Block comment content (simple scan)
    const blMatch = line.match(/\/\*(.*?)\*\//);
    if (blMatch) {
      const comment = blMatch[1] ?? '';
      const m = comment.match(pattern);
      if (m) {
        todos.push({ text: comment.trim(), line: idx + 1, kind: m[1]!.toUpperCase() as TodoComment['kind'] });
      }
    }
  });

  return todos;
}

/** Extract named imports from an import declaration */
function extractImports(root: ts.Node, filePath: string, sourceFile: ts.SourceFile): ImportInfo[] {
  const imports: ImportInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec)) {
        const specifier = spec.text;
        imports.push({
          specifier,
          resolvedPath: resolveRelativeImport(filePath, specifier),
        });
      }
    }
    // CommonJS require() — look for call expressions
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const specifier = arg.text;
        imports.push({
          specifier,
          resolvedPath: resolveRelativeImport(filePath, specifier),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(root);
  return imports;
}

/** Extract named exports from a source file */
function extractExports(root: ts.Node, sourceFile: ts.SourceFile): ExportInfo[] {
  const exports: ExportInfo[] = [];

  function visit(node: ts.Node): void {
    // export function foo() / export class Foo / export const foo
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (node.name) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        exports.push({ name: node.name.getText(sourceFile), line: pos.line + 1 });
      }
    }
    // export const / let / var
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          exports.push({ name: decl.name.text, line: pos.line + 1 });
        }
      }
    }
    // export { foo, bar }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        const pos = sourceFile.getLineAndCharacterOfPosition(el.getStart(sourceFile));
        exports.push({ name: el.name.text, line: pos.line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(root);
  return exports;
}

/** Parse a single source file and return FileMetrics. Never throws. */
export function parseFile(filePath: string, content: string): FileMetrics {
  try {
    const scriptKind =
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX :
      filePath.endsWith('.jsx') ? ts.ScriptKind.JSX :
      filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs') ? ts.ScriptKind.JS :
      ts.ScriptKind.TS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.ESNext,
      /* setParentNodes */ true,
      scriptKind,
    );

    const { loc, sloc } = countSourceLines(content);
    const functions = extractFunctions(sourceFile, sourceFile);
    const todos = extractTodos(content);
    const imports = extractImports(sourceFile, filePath, sourceFile);
    const exports = extractExports(sourceFile, sourceFile);

    const maxFunctionLength = functions.reduce((m, f) => Math.max(m, f.lengthLines), 0);
    const maxNestingDepth = functions.reduce((m, f) => Math.max(m, f.nestingDepth), 0);
    const cyclomaticComplexity = functions.reduce((m, f) => Math.max(m, f.cyclomaticComplexity), 1);

    return {
      path: filePath,
      loc,
      sloc,
      functions,
      maxFunctionLength,
      maxNestingDepth,
      cyclomaticComplexity,
      todos,
      exports,
      deadExports: [],       // filled in by analyzer.ts after cross-file analysis
      duplicateBlocks: 0,    // filled in by duplicates.ts
      imports,
      inCircularDependency: false, // filled in by graph.ts
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      path: filePath,
      loc: 0,
      sloc: 0,
      functions: [],
      maxFunctionLength: 0,
      maxNestingDepth: 0,
      cyclomaticComplexity: 1,
      todos: [],
      exports: [],
      deadExports: [],
      duplicateBlocks: 0,
      imports: [],
      inCircularDependency: false,
      parseError: msg,
    };
  }
}
