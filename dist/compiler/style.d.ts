/**
 * Style and time-value parsing for htmlv.
 */
import { TransitionIR, TimeRule } from './ir';
export declare function canonicalizeProp(name: string): string;
export declare function parseStyleAttribute(style: string | undefined): Record<string, string>;
export interface ParsedTime {
    kind: 'ms' | 'percent';
    value: number;
}
/** Parse "10s", "500ms", "50%", "0" into ms or percent. */
export declare function parseTimeValue(raw: string | undefined): ParsedTime | null;
export declare function resolveTimeMs(raw: string | undefined, parentDurationMs: number, fallbackMs?: number): number | undefined;
export declare function parseTransition(raw: string | undefined): TransitionIR | undefined;
export interface CssRule {
    selector: string;
    styles: Record<string, string>;
    timeRange?: {
        start: string;
        end: string;
    };
}
/** Very small CSS parser: selectors { decls } and :time(a, b). */
export declare function parseStylesheet(css: string): CssRule[];
export declare function selectorMatches(selector: string, tag: string, className: string | null, id: string | null): boolean;
export declare function collectMatchingStyles(rules: CssRule[], tag: string, className: string | null, id: string | null, parentDurationMs: number): {
    base: Record<string, string>;
    timeRules: TimeRule[];
};
export declare function parseFramerate(content: string | undefined): number;
