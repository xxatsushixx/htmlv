"use strict";
// src/index.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Parser_1 = require("./parser/Parser");
const Compiler_1 = require("./compiler/Compiler");
const Runtime_1 = require("./runtime/Runtime");
const Token_1 = require("./parser/Token");
const fs = __importStar(require("fs"));
// 読み込むhtmlvファイルのパス
const filePath = 'examples/example.htmlv';
// ファイルの内容を読み込む
const code = fs.readFileSync(filePath, 'utf-8');
// トークンのリストを生成する（ここでは仮のトークンを使用）
const tokens = [
    // TODO: Implement a tokenizer to generate real tokens
    new Token_1.Token(Token_1.TokenType.EOF, '', 0, 0),
];
// パーサーを初期化してASTを生成
const parser = new Parser_1.Parser(tokens);
const ast = parser.parse();
// コンパイラでコードを生成
const compiler = new Compiler_1.Compiler();
const compiledCode = compiler.compile(ast);
// ランタイムで実行
const runtime = new Runtime_1.Runtime();
runtime.execute(compiledCode);
console.log('Execution completed.');
