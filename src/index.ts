// src/index.ts

import { Parser } from './parser/Parser';
import { Compiler } from './compiler/Compiler';
import { Runtime } from './runtime/Runtime';
import { Token, TokenType } from './parser/Token';
import * as fs from 'fs';

// 読み込むhtmlvファイルのパス
const filePath = 'examples/example.htmlv';
// ファイルの内容を読み込む
const code = fs.readFileSync(filePath, 'utf-8');

// トークンのリストを生成する（ここでは仮のトークンを使用）
const tokens: Token[] = [
  // TODO: Implement a tokenizer to generate real tokens
  new Token(TokenType.EOF, '', 0, 0),
];

// パーサーを初期化してASTを生成
const parser = new Parser(tokens);
const ast = parser.parse();

// コンパイラでコードを生成
const compiler = new Compiler();
const compiledCode = compiler.compile(ast);

// ランタイムで実行
const runtime = new Runtime();
runtime.execute(compiledCode);

console.log('Execution completed.');

