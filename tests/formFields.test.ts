import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// CI gate: every native form field must carry an id or name attribute — and
// every id must be paired with a <label>, aria-label, aria-labelledby, or
// implicit <label> wrapper.
//
// The HTML validator emits two warnings we want to keep quiet:
//
//   [issue] A form field element should have an id or name attribute.
//   [issue] A <label> element should associate a control by `for` and `id`,
//           or wrap the control directly.
//
// We walk the JSX AST via the TypeScript compiler (already a project dep) so
// strings, comments, expressions, self-closing elements, and nested tags are
// handled correctly without a fragile regex. Three fails-fast assertions:
//
//   1. The codebase contains form fields (canary so an empty repo trips).
//   2. Every literal native form field (<input>, <textarea>, <select>) has
//      `id` and/or `name`.
//   3. All declared ids are paired with a label. Every literal
//      <label htmlFor="X"> must reference a real id; every id must be
//      reached by some <label htmlFor="X">, by aria-label, by
//      aria-labelledby, or by being wrapped inside a <label>...</label>.
//      Hidden controls (file pickers, type="hidden") are exempt.
//
// Scope: literal lowercase JSX tags (`<input>`, `<textarea>`, `<select>`,
// `<label>`). Custom components that mount native fields internally are out
// of scope — the component owns the label contract on its own root element.
//
// @remarks Blind spots:
//  • A wrapper like <Field> that renders <input> but doesn't forward
//    `id` / `name` won't be caught here. Mitigation is a separate runtime
//    DOM scan when a wrapping component is introduced.
//  • A <input {...rest} /> where `id`/`name` arrive via spread cannot be
//    statically verified — the audit walks named attributes only.
//  • Only static string-literal ids / htmlFor values are checked; dynamic
//    `id={variable}` is treated as "no declared id" and is documented as a
//    known limitation in the @remarks block above. aria-label is exempt.
//  • `isHiddenField` matches the *literal text* of the style expression.
//    Computed styles that resolve to "none" at runtime but contain a literal
//    "none" string in source (e.g. `display: isHidden() ? 'none' : ''`) are
//    exempt based on source alone — known false-positive boundary.
//  • On id or htmlFor collisions across files, the label↔id pairing test
//    (test 3) uses first-declaration-wins deterministically (alphabetical,
//    because `collectTsx` sorts). Duplicate ids are caught separately by the
//    duplicate-id sweep (test 4) and surfaced with per-cluster severity.
//  • Severity classification in test 4 inspects BOTH call-site origin AND
//    receiver shape. A cluster is 'low' only when every declaration shares
//    one `.map()`, `.flatMap()` callback site AND every receiver is
//    classified 'safe' (array literal of primitive literals, or
//    `Object.keys`/`values`/`entries`). Object-array literals (`{...}`),
//    identifiers, member access, and other unknown call chains are
//    'risky'/'unknown' and downgrade 'low' to 'medium'. The audit is
//    conservative by design: when in doubt the receiver is treated as
//    'risky' so 'low' is reserved for clearly safe patterns.
//  • Even within a 'risky' cluster the audit does NOT verify that the
//    receiver array's element values are non-conflicting at runtime. An
//    array of objects with duplicate `sku` fields is just 'risky' — the
//    duplicates are intrinsic to source data and the audit makes that
//    distinction explicit rather than treating it as a guaranteed single-
//    line fix.
//  • The receiver classifier only governs STATIC `id="…"` duplicates. A
//    JSX element with `id={i.sku}` (dynamic) is not recorded in the
//    duplicateIds map at all, so the receiver verdict is never applied to
//    such elements. Extending coverage to dynamic ids would require
//    tracking `id={<expr>}` separately and evaluating `<expr>` against the
//    iterator variable's element type at the call site.
// ---------------------------------------------------------------------------

// ESM-safe, normalized path resolution (vitest test files may run as ESM or CJS).
const HERE = fileURLToPath(import.meta.url);
const TESTS_DIR = dirname(HERE);
const SRC_DIR = resolve(TESTS_DIR, '..', 'src');

const FIELD_TAGS = new Set(['input', 'textarea', 'select']);
const SNIPPET_MAX = 240;

/** Per-cluster severity classification for the duplicate-id sweep. */
type Severity = 'high' | 'medium' | 'low';

/** Statically-derived verdict about whether a .map() receiver array is
 *  guaranteed to yield non-conflicting ids. Used by `clusterSeverity` to
 *  gate the 'low' roll-up. */
type ReceiverClass = 'safe' | 'risky' | 'unknown';

interface FieldOffense {
  file: string;
  line: number;
  column: number;
  tag: string;
  missing: string[];
  snippet: string;
}

interface IdDeclaration {
  file: string;
  line: number;
  column: number;
  snippet: string;
  tagName: string;
  /** `aria-label` is present (literal or expression — both qualify). */
  hasAriaLabel: boolean;
  /** `aria-labelledby` is present (literal or expression). */
  hasAriaLabelledBy: boolean;
  /** Input is a descendant of an enclosing <label>...</label>. */
  isImplicitLabelChild: boolean;
  /** `display:none` / `visibility:hidden` / `type="hidden"`. */
  isHidden: boolean;
  /** Origin info for declarations inside a `.map()`/`.flatMap()` callback.
   *  `null` if the node is not inside such an iterator. The `receiver`
   *  field is the static verdict about whether the receiver is
   *  guaranteed non-conflicting — used to gate the 'low' roll-up. */
  mapCallSite: { file: string; line: number; receiver: ReceiverClass } | null;
}

interface HtmlForRef {
  file: string;
  line: number;
  column: number;
  snippet: string;
}

interface LabelOffense {
  kind: 'unmatched-htmlFor' | 'orphaned-id';
  file: string;
  line: number;
  column: number;
  id: string;
  snippet: string;
  reason: string;
}

interface ScanResult {
  fieldOffenses: FieldOffense[];
  totalFields: number;
  ids: Map<string, IdDeclaration>;
  htmlFors: Map<string, HtmlForRef>;
  /** Every declaration of a given id (length > 1 → duplicate violation).
   *  Distinct from `ids`, which records only the first occurrence for the
   *  label↔id pairing test. */
  duplicateIds: Map<string, IdDeclaration[]>;
}

// ---------------------------------------------------------------------------
// File-system + JSX helpers
// ---------------------------------------------------------------------------

function collectTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectTsx(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out.sort();
}

function fmtPath(file: string): string {
  return relative(SRC_DIR, file).split(sep).join('/');
}

/** One-line, whitespace-collapsed snippet — always shows the closing tag. */
function snippet(node: ts.Node, sf: ts.SourceFile): string {
  // Pass `sf` explicitly so this still works if the caller drops the
  // `setParentNodes: true` flag from `createSourceFile`.
  const flat = node.getText(sf).replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_MAX ? flat.slice(0, SNIPPET_MAX - 1) + '…' : flat;
}

/**
 * Returns the literal string value of an attribute, or null if the attribute
 * value is dynamic (`{expr}`, template literals, etc.). Both `"x"` and
 * `{'x'}` literal forms are recognized.
 */
function literalAttr(prop: ts.JsxAttribute, sf: ts.SourceFile): string | null {
  const init = prop.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (
    ts.isJsxExpression(init) &&
    init.expression &&
    ts.isStringLiteral(init.expression)
  ) {
    return init.expression.text;
  }
  return null;
}

/**
 * True if a JSX boolean attribute is set in a way React will render the HTML
 * attribute as present — i.e. Boolean shorthand (`<input hidden />`) or
 * literal `true` (`<input hidden={true} />`). Dynamic values, identifiers,
 * and explicit `false` deliberately do NOT match, so callers can use this
 * to detect "developer meant hidden" without accidentally exempting visible
 * controls. Matches the React semantics for HTML Boolean attributes.
 */
function jsxBoolTrue(prop: ts.JsxAttribute): boolean {
  if (prop.initializer === undefined) return true;
  if (
    prop.initializer &&
    ts.isJsxExpression(prop.initializer) &&
    prop.initializer.expression
  ) {
    return prop.initializer.expression.kind === ts.SyntaxKind.TrueKeyword;
  }
  return false;
}

/** True if a form field is hidden via the Boolean `hidden` attribute,
 * `type="hidden"`, or visually hidden by style. */
function isHiddenField(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sf: ts.SourceFile,
): boolean {
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const attr = prop.name.getText(sf);
    if (attr === 'hidden' && jsxBoolTrue(prop)) return true;
    if (attr === 'type' && literalAttr(prop, sf) === 'hidden') return true;
    if (
      attr === 'style' &&
      prop.initializer &&
      ts.isJsxExpression(prop.initializer) &&
      prop.initializer.expression
    ) {
      const text = prop.initializer.expression.getText(sf);
      if (/display\s*:\s*['"]?none/i.test(text)) return true;
      if (/visibility\s*:\s*['"]?hidden/i.test(text)) return true;
    }
  }
  return false;
}

/** Returns the nearest enclosing <label>...</label> element, or null. */
function findEnclosingLabel(node: ts.Node): ts.JsxElement | null {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isJsxElement(p)) {
      const t = p.openingElement.tagName.getText().toLowerCase();
      if (t === 'label') return p;
    }
    p = p.parent;
  }
  return null;
}

/**
 * Array iterator methods that produce per-item JSX. `flatMap` is
 * structurally a `.map` with a flattened result — duplicates inside the
 * same `flatMap` callback also share a single source-of-truth.
 */
const ITERATOR_METHODS = new Set(['map', 'flatMap']);

/**
 * Classify the receiver of a .map() / .flatMap() call.
 *
 *   'safe'    — ArrayLiteral whose elements are all primitive literals
 *               (strings, numbers, bigints, booleans, null), or
 *               `Object.keys`/`Object.values`/`Object.entries`
 *               (mathematically unique).
 *   'risky'   — ArrayLiteral containing object literals (duplicates are
 *               statically visible in the same source); or identifier /
 *               member / element access to an unknown array.
 *   'unknown' — Any other CallExpression whose receiver we cannot classify
 *               without type info (custom hooks, data fetches,
 *               `Array.from`, etc.).
 *
 * The check is intentionally conservative: when in doubt the receiver is
 * marked 'risky' so the cluster is downgraded away from 'low'.
 */
function classifyReceiver(callExpr: ts.CallExpression): ReceiverClass {
  if (!ts.isPropertyAccessExpression(callExpr.expression)) return 'unknown';
  const receiver = callExpr.expression.expression;

  if (ts.isArrayLiteralExpression(receiver)) {
    if (receiver.elements.length === 0) return 'safe';
    const allPrimitives = receiver.elements.every(
      (el) =>
        ts.isStringLiteral(el) ||
        ts.isNoSubstitutionTemplateLiteral(el) ||
        ts.isNumericLiteral(el) ||
        ts.isBigIntLiteral(el) ||
        el.kind === ts.SyntaxKind.TrueKeyword ||
        el.kind === ts.SyntaxKind.FalseKeyword ||
        el.kind === ts.SyntaxKind.NullKeyword,
    );
    return allPrimitives ? 'safe' : 'risky';
  }

  if (ts.isCallExpression(receiver)) {
    if (ts.isPropertyAccessExpression(receiver.expression)) {
      const target = receiver.expression.expression;
      const method = receiver.expression.name.text;
      if (
        ts.isIdentifier(target) &&
        target.text === 'Object' &&
        (method === 'keys' || method === 'values' || method === 'entries')
      ) {
        return 'safe';
      }
    }
    return 'unknown';
  }

  if (
    ts.isIdentifier(receiver) ||
    ts.isPropertyAccessExpression(receiver) ||
    ts.isElementAccessExpression(receiver)
  ) {
    return 'risky';
  }

  return 'unknown';
}

/**
 * Returns the {file, line, receiver} of the nearest enclosing `.map()` /
 * `.flatMap()` callback, or null if the node isn't inside one. The
 * `receiver` field carries the verdict from `classifyReceiver`: a single-
 * source-of-truth 'low' cluster requires every declaration to share the
 * same call site AND every receiver to be 'safe'.
 *
 * Note: optional-chained access like `arr?.map(fn)` is supported because
 * `ts.isPropertyAccessExpression` matches both `a.b` and `a?.b` (the latter
 * carries a `questionDotToken`).
 */
function findEnclosingMapCall(
  node: ts.Node,
  sf: ts.SourceFile,
): { file: string; line: number; receiver: ReceiverClass } | null {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (
      ts.isCallExpression(p) &&
      ts.isPropertyAccessExpression(p.expression) &&
      ITERATOR_METHODS.has(p.expression.name.text)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(p.getStart(sf));
      return {
        file: sf.fileName,
        line: line + 1,
        receiver: classifyReceiver(p),
      };
    }
    p = p.parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-element audits
// ---------------------------------------------------------------------------

/** Audit a JSX opening element for the "form field must have id or name" rule. */
function auditField(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sf: ts.SourceFile,
): FieldOffense | null {
  const tagRaw = node.tagName.getText(sf).toLowerCase();
  if (!FIELD_TAGS.has(tagRaw)) return null;

  let hasId = false;
  let hasName = false;
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    // Require an explicit value (`id="x"` or `id={x}`); a bare `id` shorthand
    // is invalid JSX so this branch is defensive. (Spread-attribute handling
    // is documented once at the top of the file.)
    if (prop.initializer === undefined) continue;
    const attr = prop.name.getText(sf);
    if (attr === 'id') hasId = true;
    else if (attr === 'name') hasName = true;
  }
  const missing: string[] = [];
  if (!hasId) missing.push('id');
  if (!hasName) missing.push('name');
  if (missing.length === 0) return null;

  const start = node.getStart(sf);
  const { line, character } = sf.getLineAndCharacterOfPosition(start);
  return {
    file: sf.fileName,
    line: line + 1,
    column: character + 1,
    tag: tagRaw,
    missing,
    snippet: snippet(node, sf),
  };
}

// ---------------------------------------------------------------------------
// Source-file scan: parse once, walk once, return everything the three
// assertions need.
// ---------------------------------------------------------------------------

function scanFile(file: string): ScanResult {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );

  const fieldOffenses: FieldOffense[] = [];
  let totalFields = 0;
  const ids = new Map<string, IdDeclaration>();
  const htmlFors = new Map<string, HtmlForRef>();
  const duplicateIds = new Map<string, IdDeclaration[]>();

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagRaw = node.tagName.getText(sf).toLowerCase();

      // <label htmlFor="...">  → record htmlFor target.
      if (tagRaw === 'label') {
        for (const prop of node.attributes.properties) {
          if (!ts.isJsxAttribute(prop)) continue;
          if (prop.name.getText(sf) !== 'htmlFor') continue;
          const val = literalAttr(prop, sf);
          if (val && !htmlFors.has(val)) {
            const start = node.getStart(sf);
            const { line, character } = sf.getLineAndCharacterOfPosition(start);
            htmlFors.set(val, {
              file,
              line: line + 1,
              column: character + 1,
              snippet: snippet(node, sf),
            });
          }
        }
      }

      // <input|textarea|select>  → audit id/name + record id declaration.
      if (FIELD_TAGS.has(tagRaw)) {
        totalFields += 1;
        const offense = auditField(node, sf);
        if (offense) fieldOffenses.push(offense);

        let idVal: string | null = null;
        let hasAriaLabel = false;
        let hasAriaLabelledBy = false;
        for (const prop of node.attributes.properties) {
          if (!ts.isJsxAttribute(prop)) continue;
          if (prop.initializer === undefined) continue;
          const attr = prop.name.getText(sf);
          if (attr === 'id') idVal = literalAttr(prop, sf);
          else if (attr === 'aria-label') hasAriaLabel = true;
          else if (attr === 'aria-labelledby') hasAriaLabelledBy = true;
        }

        if (idVal) {
          const start = node.getStart(sf);
          const { line, character } = sf.getLineAndCharacterOfPosition(start);
          const decl: IdDeclaration = {
            file,
            line: line + 1,
            column: character + 1,
            snippet: snippet(node, sf),
            tagName: tagRaw,
            hasAriaLabel,
            hasAriaLabelledBy,
            isImplicitLabelChild: findEnclosingLabel(node) !== null,
            isHidden: isHiddenField(node, sf),
            mapCallSite: findEnclosingMapCall(node, sf),
          };
          // Track EVERY declaration (intra- and inter-file) for the
          // duplicate-id sweep in test 4.
          const dupList = duplicateIds.get(idVal) ?? [];
          dupList.push(decl);
          duplicateIds.set(idVal, dupList);
          // First-declaration-wins for the label↔id pairing test (existing).
          if (!ids.has(idVal)) ids.set(idVal, decl);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);

  return { fieldOffenses, totalFields, ids, htmlFors, duplicateIds };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('a11y: form fields and label↔id pairing', () => {
  const files = collectTsx(SRC_DIR);
  // Scan once per file at describe-block scope so the three `it(...)` blocks
  // share AST walks. (Per-test re-scanning triples work; for larger
  // codebases the cache matters.)
  const scans = files.map(scanFile);

  it('discovers .tsx files under src/ and has form fields present', () => {
    expect(files.length).toBeGreaterThan(0);
    // Canary: if every section were deleted, this trips first. The lower
    // bound is the smallest defensible number — debug by reading the actual
    // value in the failure message rather than guessing a higher one.
    const totals = scans.reduce((acc, s) => acc + s.totalFields, 0);
    expect(totals, `actual form-field count (informational): ${totals}`).toBeGreaterThanOrEqual(10);
  });

  it('reports zero form fields missing id or name across all .tsx files', () => {
    const all: FieldOffense[] = [];
    for (const s of scans) all.push(...s.fieldOffenses);

    if (all.length > 0) {
      const lines = all.map(
        (o) =>
          `  ${fmtPath(o.file)}:${o.line}:${o.column}` +
          `  <${o.tag}> missing: ${o.missing.join(' + ')}` +
          `\n      ${o.snippet}`,
      );
      throw new Error(
        `${all.length} form field(s) lack id/name attribute(s):\n${lines.join('\n')}\n` +
          `\nFix: add id="…" and/or name="…" to every <input>, <textarea>, <select>.`,
      );
    }
    expect(all).toEqual([]);
  });

  it('pairs every <label htmlFor> with a matching input id, and vice versa', () => {
    // Aggregate across the whole codebase — labels and ids don't have to live
    // in the same file (a page can wire up a field defined in a shared
    // component file). First declaration wins on collision so the error
    // message stays stable.
    const ids = new Map<string, IdDeclaration>();
    const htmlFors = new Map<string, HtmlForRef>();
    for (const s of scans) {
      for (const [k, v] of s.ids) if (!ids.has(k)) ids.set(k, v);
      for (const [k, v] of s.htmlFors) if (!htmlFors.has(k)) htmlFors.set(k, v);
    }

    const offenses: LabelOffense[] = [];

    // (a) Every <label htmlFor="X"> finds a real id="X".
    for (const [id, ref] of htmlFors.entries()) {
      if (ids.has(id)) continue;
      offenses.push({
        kind: 'unmatched-htmlFor',
        file: ref.file,
        line: ref.line,
        column: ref.column,
        id,
        snippet: ref.snippet,
        reason: `<label htmlFor="${id}"> has no matching <input|textarea|select id="${id}">.`,
      });
    }

    // (b) Every id is reachable — via htmlFor, aria-label, aria-labelledby,
    // an implicit <label>...</label> wrapper, or hidden-file-picker pattern.
    for (const [id, decl] of ids.entries()) {
      if (htmlFors.has(id)) continue;
      if (decl.hasAriaLabel) continue;
      if (decl.hasAriaLabelledBy) continue;
      if (decl.isImplicitLabelChild) continue;
      if (decl.isHidden) continue;
      offenses.push({
        kind: 'orphaned-id',
        file: decl.file,
        line: decl.line,
        column: decl.column,
        id,
        snippet: decl.snippet,
        reason:
          `<${decl.tagName} id="${id}"> has no <label htmlFor="${id}">, ` +
          `no aria-label, no aria-labelledby, and is not wrapped in a <label>.`,
      });
    }

    if (offenses.length > 0) {
      const lines = offenses.map((o) => {
        const kind =
          o.kind === 'unmatched-htmlFor' ? 'LABEL FOR→NO INPUT' : 'INPUT ID→NO LABEL';
        return (
          `  [${kind}] ${fmtPath(o.file)}:${o.line}:${o.column}` +
          `\n      id="${o.id}"` +
          `\n      ${o.snippet}` +
          `\n      ${o.reason}`
        );
      });
      throw new Error(
        `${offenses.length} label↔id pairing offense(s):\n${lines.join('\n')}\n` +
          `\nFix: ensure every <label htmlFor> targets a real id, and every id is ` +
          `paired with a <label htmlFor>, an aria-label, an aria-labelledby, ` +
          `or an enclosing <label> wrapper.`,
      );
    }

    expect(offenses).toEqual([]);
  });

  it('reports zero duplicate ids across all .tsx files', () => {
    // Each scan result already records every id declaration in
    // `duplicateIds`. Across the codebase, merge on collision; ids whose
    // merged array has length > 1 are HTML violations (a DOM tree must
    // contain unique ids).
    const merged = new Map<string, IdDeclaration[]>();
    for (const s of scans) {
      for (const [k, decls] of s.duplicateIds) {
        const list = merged.get(k) ?? [];
        list.push(...decls);
        merged.set(k, list);
      }
    }

    // Per-cluster severity roll-up:
    //   'low'    — all declarations share one non-null `.map()` call site
    //               (single source-of-truth, single-line fix).
    //   'medium' — declarations in the same file but at different call
    //               sites or with mixed null/non-null origins.
    //   'high'   — declarations span multiple files (cross-render clashes).
    function clusterSeverity(decls: IdDeclaration[]): Severity {
      const sites = new Set<string>();
      const receivers = new Set<ReceiverClass>();
      for (const d of decls) {
        if (d.mapCallSite) {
          sites.add(`${d.mapCallSite.file}:${d.mapCallSite.line}`);
          receivers.add(d.mapCallSite.receiver);
        } else {
          sites.add('null');
        }
      }
      // 'low' requires all decls to share one .map() call site AND every
      // receiver to be classified 'safe'. Any 'risky' (object array
      // literal, identifier, member access) or 'unknown' (custom hook,
      // data fetch, Array.from, etc.) receiver downgrades to 'medium'.
      if (
        sites.size === 1 &&
        !sites.has('null') &&
        receivers.size === 1 &&
        receivers.has('safe')
      ) {
        return 'low';
      }
      const files = new Set(decls.map((d) => d.file));
      if (files.size === 1) return 'medium';
      return 'high';
    }

    const offenders: {
      id: string;
      decls: IdDeclaration[];
      severity: Severity;
    }[] = [];
    for (const [id, decls] of merged.entries()) {
      if (decls.length > 1) {
        offenders.push({ id, decls, severity: clusterSeverity(decls) });
      }
    }

    if (offenders.length > 0) {
      const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
      for (const o of offenders) bySeverity[o.severity] += 1;
      const sections = offenders.map(({ id, decls, severity }) => {
        const declLines = decls.map(
          (d) =>
            `      [DUPLICATE] ${fmtPath(d.file)}:${d.line}:${d.column}` +
            `\n        <${d.tagName} id="${id}"> … ${d.snippet}`,
        );
        return (
          `  [Severity: ${severity}] id="${id}" (${decls.length} declarations):\n` +
          declLines.join('\n')
        );
      });
      throw new Error(
        `${offenders.length} duplicate id(s) — ` +
          `${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low:\n` +
          `${sections.join('\n')}\n` +
          `\nFix: ids must be unique across the rendered DOM tree. Rename ` +
          `duplicates with a section-specific prefix (e.g., ` +
          `'sql-importFile' vs 'backup-restoreFile').`,
      );
    }

    expect(offenders).toEqual([]);
  });
});
