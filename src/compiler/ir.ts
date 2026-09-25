/**
 * Timeline Intermediate Representation for htmlv.
 */

export type FramerateMode = 'slowdown' | 'drop-frames';
export type CompileMode = 'precompile' | 'compile-during-playback';
export type TimePosition = 'static' | 'relative' | 'absolute' | 'fixed';
export type LoopMode = 'none' | 'loop' | 'flipflap' | 'stretch';
export type TextDisplay = 'character' | 'word' | 'line' | 'block';
export type TransitionEffect =
  | 'fade'
  | 'zoom'
  | 'dissolve'
  | 'flip3d'
  | 'iris'
  | 'wipe'
  | 'slide';

export interface TimeRule {
  /** Element-local start in ms (or percent 0–1 if unit is percent — resolved to ms in IR). */
  startMs: number;
  endMs: number;
  styles: Record<string, string>;
}

export interface TransitionIR {
  effect: TransitionEffect;
  durationMs: number;
}

export interface AiHookIR {
  kind: 'generate' | 'filter' | 'subtitle';
  type?: string;
  prompt?: string;
  target?: string;
  seed?: string;
  api?: string;
  src?: string;
  language?: string;
}

export interface TimelineNode {
  id: string | null;
  tag: string;
  className: string | null;
  startMs: number;
  endMs: number;
  /** Natural content duration before loop/stretch fill (ms). */
  contentDurationMs?: number;
  /** When set (fixed positioning), only visible inside this clip window. */
  clipStartMs?: number;
  clipEndMs?: number;
  text?: string;
  src?: string;
  styles: Record<string, string>;
  timeRules: TimeRule[];
  transition?: TransitionIR;
  ai?: AiHookIR;
  children: TimelineNode[];
  /** Nested compiled document for iframe */
  nested?: TimelineIR;
}

export interface DocumentMeta {
  title: string;
  framerate: number;
  framerateMode: FramerateMode;
  compileMode: CompileMode;
  aspectRatio: string;
  width: number;
  seed: string | null;
  durationMs: number;
}

export interface TimelineIR {
  version: 1;
  meta: DocumentMeta;
  scenes: TimelineNode[];
  stylesheets: string[];
  scripts: string[];
}
