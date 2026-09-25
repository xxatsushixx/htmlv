"use strict";
/**
 * Style and time-value parsing for htmlv.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeProp = canonicalizeProp;
exports.parseStyleAttribute = parseStyleAttribute;
exports.parseTimeValue = parseTimeValue;
exports.resolveTimeMs = resolveTimeMs;
exports.parseTransition = parseTransition;
exports.parseStylesheet = parseStylesheet;
exports.selectorMatches = selectorMatches;
exports.collectMatchingStyles = collectMatchingStyles;
exports.parseFramerate = parseFramerate;
const ALIASES = {
    start: 'time-start',
    end: 'time-end',
};
function canonicalizeProp(name) {
    var _a;
    const lower = name.trim().toLowerCase();
    return (_a = ALIASES[lower]) !== null && _a !== void 0 ? _a : lower;
}
function parseStyleAttribute(style) {
    const result = {};
    if (!style)
        return result;
    for (const part of style.split(';')) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        const colon = trimmed.indexOf(':');
        if (colon === -1)
            continue;
        const key = canonicalizeProp(trimmed.slice(0, colon));
        const value = trimmed.slice(colon + 1).trim();
        result[key] = value;
    }
    return result;
}
/** Parse "10s", "500ms", "50%", "0" into ms or percent. */
function parseTimeValue(raw) {
    if (raw === undefined || raw === null)
        return null;
    const s = String(raw).trim().toLowerCase();
    if (!s)
        return null;
    if (s.endsWith('%')) {
        const n = parseFloat(s.slice(0, -1));
        if (Number.isNaN(n))
            return null;
        return { kind: 'percent', value: n / 100 };
    }
    if (s.endsWith('ms')) {
        const n = parseFloat(s.slice(0, -2));
        if (Number.isNaN(n))
            return null;
        return { kind: 'ms', value: n };
    }
    if (s.endsWith('s')) {
        const n = parseFloat(s.slice(0, -1));
        if (Number.isNaN(n))
            return null;
        return { kind: 'ms', value: n * 1000 };
    }
    const n = parseFloat(s);
    if (Number.isNaN(n))
        return null;
    // bare number treated as seconds if plausible, else ms if large — spec: seconds for bare? README says 0 is ok. Treat bare as seconds.
    return { kind: 'ms', value: n * 1000 };
}
function resolveTimeMs(raw, parentDurationMs, fallbackMs) {
    const parsed = parseTimeValue(raw);
    if (!parsed)
        return fallbackMs;
    if (parsed.kind === 'percent')
        return parentDurationMs * parsed.value;
    return parsed.value;
}
function parseTransition(raw) {
    if (!raw)
        return undefined;
    const parts = raw.trim().split(/\s+/);
    if (parts.length === 0)
        return undefined;
    const effect = parts[0].toLowerCase();
    let durationMs = 0;
    if (parts[1]) {
        const t = parseTimeValue(parts[1]);
        if (t && t.kind === 'ms')
            durationMs = t.value;
    }
    const allowed = [
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
/** Very small CSS parser: selectors { decls } and :time(a, b). */
function parseStylesheet(css) {
    const rules = [];
    const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const ruleRe = /([^{]+)\{([^}]*)\}/g;
    let match;
    while ((match = ruleRe.exec(cleaned))) {
        let selector = match[1].trim();
        const body = match[2];
        const styles = parseStyleAttribute(body.replace(/\n/g, ';'));
        let timeRange;
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
function selectorMatches(selector, tag, className, id) {
    const parts = selector.split(/\s*,\s*/);
    return parts.some((sel) => matchSimpleSelector(sel.trim(), tag, className, id));
}
function matchSimpleSelector(sel, tag, className, id) {
    var _a;
    if (!sel)
        return false;
    // tag.class#id combinations (simple)
    let rest = sel;
    let wantTag = null;
    let wantId = null;
    const wantClasses = [];
    const idIdx = rest.indexOf('#');
    if (idIdx !== -1) {
        const after = rest.slice(idIdx + 1);
        const m = after.match(/^([A-Za-z0-9_-]+)/);
        if (m)
            wantId = m[1];
        rest = rest.slice(0, idIdx) + after.slice((_a = wantId === null || wantId === void 0 ? void 0 : wantId.length) !== null && _a !== void 0 ? _a : 0);
    }
    const classParts = rest.split('.');
    if (classParts[0] && classParts[0] !== '') {
        wantTag = classParts[0].toLowerCase();
    }
    for (let i = 1; i < classParts.length; i++) {
        const c = classParts[i].match(/^([A-Za-z0-9_-]+)/);
        if (c)
            wantClasses.push(c[1]);
    }
    if (wantTag && wantTag !== tag.toLowerCase())
        return false;
    if (wantId && wantId !== id)
        return false;
    if (wantClasses.length) {
        const classes = new Set((className !== null && className !== void 0 ? className : '').split(/\s+/).filter(Boolean));
        for (const c of wantClasses) {
            if (!classes.has(c))
                return false;
        }
    }
    return true;
}
function collectMatchingStyles(rules, tag, className, id, parentDurationMs) {
    var _a, _b;
    const base = {};
    const timeRules = [];
    for (const rule of rules) {
        if (!selectorMatches(rule.selector, tag, className, id))
            continue;
        if (rule.timeRange) {
            const startMs = (_a = resolveTimeMs(rule.timeRange.start, parentDurationMs, 0)) !== null && _a !== void 0 ? _a : 0;
            const endMs = (_b = resolveTimeMs(rule.timeRange.end, parentDurationMs, parentDurationMs)) !== null && _b !== void 0 ? _b : parentDurationMs;
            timeRules.push({ startMs, endMs, styles: { ...rule.styles } });
        }
        else {
            Object.assign(base, rule.styles);
        }
    }
    return { base, timeRules };
}
function parseFramerate(content) {
    if (!content)
        return 30;
    const m = content.trim().toLowerCase().match(/^([\d.]+)\s*fps$/);
    if (m)
        return parseFloat(m[1]);
    const n = parseFloat(content);
    return Number.isNaN(n) ? 30 : n;
}
