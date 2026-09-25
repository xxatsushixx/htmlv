/**
 * Compiles an htmlv AST into Timeline IR.
 */
import { DocumentNode } from '../parser/ASTNode';
import { TimelineIR } from './ir';
/** Decode common HTML entities in text nodes (e.g. &lt;sequence&gt; → <sequence>). */
export declare function decodeHtmlEntities(s: string): string;
export interface CompileOptions {
    /** Resolve linked CSS / nested htmlv relative to this directory */
    baseDir?: string;
    /** Read file contents for linked resources */
    readFile?: (path: string) => string | null;
    /** Compile nested iframe documents */
    compileNested?: (source: string, baseDir: string) => TimelineIR | null;
}
export declare class Compiler {
    private cssRules;
    private scripts;
    private stylesheets;
    private meta;
    private options;
    private idCounter;
    compile(ast: DocumentNode, options?: CompileOptions): TimelineIR;
    private wrapAsHtml;
    private ingestHead;
    /** Collect `<script>` elements that are direct children of body (not inside scenes). */
    private ingestBodyScripts;
    private ingestScript;
    private resolvePath;
    private compileScene;
    private compileChildren;
    private compileSequence;
    private compileIframe;
    private compileAi;
    private makeLeaf;
    private resolveLocalStart;
    private findElement;
    private collectText;
}
