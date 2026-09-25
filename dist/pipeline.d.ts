/**
 * High-level compile pipeline: source → tokens → AST → Timeline IR.
 */
import { CompileOptions } from './compiler/Compiler';
import { TimelineIR } from './compiler/ir';
import { DocumentNode } from './parser/ASTNode';
export declare function parseSource(source: string): DocumentNode;
export declare function compileSource(source: string, options?: CompileOptions): TimelineIR;
export declare function compileFile(filePath: string): TimelineIR;
