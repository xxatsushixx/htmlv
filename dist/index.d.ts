/**
 * htmlv library entry + default CLI when run as node dist/index.js
 */
export { Token, TokenType } from './parser/Token';
export { Tokenizer } from './parser/Tokenizer';
export { Parser } from './parser/Parser';
export { ASTNode, ASTNodeType, ElementNode, TextNode, AttributeNode, DocumentNode, DoctypeNode, CommentNode, } from './parser/ASTNode';
export { Compiler } from './compiler/Compiler';
export type { CompileOptions } from './compiler/Compiler';
export type { TimelineIR, TimelineNode, DocumentMeta } from './compiler/ir';
export { Runtime } from './runtime/Runtime';
export { parseSource, compileSource, compileFile } from './pipeline';
export { main as cli, build, serve } from './cli';
