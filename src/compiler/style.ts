/**
 * Style and time-value parsing for htmlv.
 */

import { TransitionEffect, TransitionIR, TimeRule } from './ir';

const ALIASES: Record<string, string> = {
  start: 'time-start',
  end: 'time-end',
};

export function canonicalizeProp(name: string): string {
  const lower = name.trim().toLowerCase();
  return ALIASES[lower] ?? lower;
}

export function parseStyleAttribute(style: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!style) return result;
  for (const part of style.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = canonicalizeProp(trimmed.slice(0, colon));
    const value = trimmed.slice(colon + 1).trim();
    result[key] = value;
  }
  return result;
}

export interface ParsedTime {
  kind: 'ms' | 'percent';
  value: number;
}

/** Parse "10s", "500ms", "50%", "0" into ms or percent. */
export function parseTimeValue(raw: string | undefined): ParsedTime | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    if (Number.isNaN(n)) return null;
    return { kind: 'percent', value: n / 100 };
  }
  if (s.endsWith('ms')) {
    const n = parseFloat(s.slice(0, -2));
    if (Number.isNaN(n)) return null;
    return { kind: 'ms', value: n };
  }
  if (s.endsWith('s')) {
    const n = parseFloat(s.slice(0, -1));
    if (Number.isNaN(n)) return null;
    return { kind: 'ms', value: n * 1000 };
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  // bare number treated as seconds if plausible, else ms if large — spec: seconds for bare? README says 0 is ok. Treat bare as seconds.
  return { kind: 'ms', value: n * 1000 };
}

export function resolveTimeMs(
  raw: string | undefined,
  parentDurationMs: number,
  fallbackMs?: number
): number | undefined {
  const parsed = parseTimeValue(raw);
  if (!parsed) return fallbackMs;
  if (parsed.kind === 'percent') return parentDurationMs * parsed.value;
  return parsed.value;
}

export function parseTransition(raw: string | undefined): TransitionIR | undefined {
  if (!raw) return undefined;
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 0) return undefined;
  const effect = parts[0].toLowerCase() as TransitionEffect;
  let durationMs = 0;
  if (parts[1]) {
    const t = parseTimeValue(parts[1]);
    if (t && t.kind === 'ms') durationMs = t.value;
  }
  const allowed: TransitionEffect[] = [
    'fade',
    'zoom',
    'dissolve',
    'flip3d',
    'iris',
    'wipe',
    'slide',
  ];
  const finalEffect = allowed.includes(effect) ? effect : 'fade';
  return { effect: finalEffect, durationMs };
}

export interface CssRule {
  selector: string;
  styles: Record<string, string>;
  timeRange?: { start: string; end: string };
}

/** Very small CSS parser: selectors { decls } and :time(a, b). */
export function parseStylesheet(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleRe = /([^{]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(cleaned))) {
    let selector = match[1].trim();
    const body = match[2];
    const styles = parseStyleAttribute(body.replace(/\n/g, ';'));
    let timeRange: CssRule['timeRange'];
    const timeMatch = selector.match(/:time\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
    if (timeMatch) {
      timeRange = { start: timeMatch[1].trim(), end: timeMatch[2].trim() };
      selector = selector.replace(/:time\(\s*[^)]+\)/i, '').trim();
    }
    if (selector) {
      rules.push({ selector, styles, timeRange });
    }
  }
  return rules;
}

export function selectorMatches(
  selector: string,
  tag: string,
  className: string | null,
  id: string | null
): boolean {
  const parts = selector.split(/\s*,\s*/);
  return parts.some((sel) => matchSimpleSelector(sel.trim(), tag, className, id));
}

function matchSimpleSelector(
  sel: string,
  tag: string,
  className: string | null,
  id: string | null
): boolean {
  if (!sel) return false;
  // tag.class#id combinations (simple)
  let rest = sel;
  let wantTag: string | null = null;
  let wantId: string | null = null;
  const wantClasses: string[] = [];

  const idIdx = rest.indexOf('#');
  if (idIdx !== -1) {
    const after = rest.slice(idIdx + 1);
    const m = after.match(/^([A-Za-z0-9_-]+)/);
    if (m) wantId = m[1];
    rest = rest.slice(0, idIdx) + after.slice(wantId?.length ?? 0);
  }

  const classParts = rest.split('.');
  if (classParts[0] && classParts[0] !== '') {
    wantTag = classParts[0].toLowerCase();
  }
  for (let i = 1; i < classParts.length; i++) {
    const c = classParts[i].match(/^([A-Za-z0-9_-]+)/);
    if (c) wantClasses.push(c[1]);
  }

  if (wantTag && wantTag !== tag.toLowerCase()) return false;
  if (wantId && wantId !== id) return false;
  if (wantClasses.length) {
    const classes = new Set((className ?? '').split(/\s+/).filter(Boolean));
    for (const c of wantClasses) {
      if (!classes.has(c)) return false;
    }
  }
  return true;
}

export function collectMatchingStyles(
  rules: CssRule[],
  tag: string,
  className: string | null,
  id: string | null,
  parentDurationMs: number
): { base: Record<string, string>; timeRules: TimeRule[] } {
  const base: Record<string, string> = {};
  const timeRules: TimeRule[] = [];
  for (const rule of rules) {
    if (!selectorMatches(rule.selector, tag, className, id)) continue;
    if (rule.timeRange) {
      const startMs = resolveTimeMs(rule.timeRange.start, parentDurationMs, 0) ?? 0;
      const endMs =
        resolveTimeMs(rule.timeRange.end, parentDurationMs, parentDurationMs) ??
        parentDurationMs;
      timeRules.push({ startMs, endMs, styles: { ...rule.styles } });
    } else {
      Object.assign(base, rule.styles);
    }
  }
  return { base, timeRules };
}

export function parseFramerate(content: string | undefined): number {
  if (!content) return 30;
  const m = content.trim().toLowerCase().match(/^([\d.]+)\s*fps$/);
  if (m) return parseFloat(m[1]);
  const n = parseFloat(content);
  return Number.isNaN(n) ? 30 : n;
}
