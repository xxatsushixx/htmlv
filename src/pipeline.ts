/**
 * High-level compile pipeline: source → tokens → AST → Timeline IR.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tokenizer } from './parser/Tokenizer';
import { Parser } from './parser/Parser';
import { Compiler, CompileOptions } from './compiler/Compiler';
import { TimelineIR } from './compiler/ir';
import { DocumentNode } from './parser/ASTNode';

export function parseSource(source: string): DocumentNode {
  const tokens = new Tokenizer(source).tokenize();
  return new Parser(tokens).parse();
}

export function compileSource(
  source: string,
  options: CompileOptions = {}
): TimelineIR {
  const ast = parseSource(source);
  const compiler = new Compiler();

  const opts: CompileOptions = {
    ...options,
    readFile:
      options.readFile ??
      ((filePath: string) => {
        try {
          return fs.readFileSync(filePath, 'utf-8');
        } catch {
          return null;
        }
      }),
    compileNested:
      options.compileNested ??
      ((nestedSource: string, baseDir: string) =>
        compileSource(nestedSource, { ...options, baseDir })),
  };

  return compiler.compile(ast, opts);
}

export function compileFile(filePath: string): TimelineIR {
  const abs = path.resolve(filePath);
  const source = fs.readFileSync(abs, 'utf-8');
  return compileSource(source, { baseDir: path.dirname(abs) });
}
