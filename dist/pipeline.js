"use strict";
/**
 * High-level compile pipeline: source → tokens → AST → Timeline IR.
 */
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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSource = parseSource;
exports.compileSource = compileSource;
exports.compileFile = compileFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const Tokenizer_1 = require("./parser/Tokenizer");
const Parser_1 = require("./parser/Parser");
const Compiler_1 = require("./compiler/Compiler");
function parseSource(source) {
    const tokens = new Tokenizer_1.Tokenizer(source).tokenize();
    return new Parser_1.Parser(tokens).parse();
}
function compileSource(source, options = {}) {
    var _a, _b;
    const ast = parseSource(source);
    const compiler = new Compiler_1.Compiler();
    const opts = {
        ...options,
        readFile: (_a = options.readFile) !== null && _a !== void 0 ? _a : ((filePath) => {
            try {
                return fs.readFileSync(filePath, 'utf-8');
            }
            catch {
                return null;
            }
        }),
        compileNested: (_b = options.compileNested) !== null && _b !== void 0 ? _b : ((nestedSource, baseDir) => compileSource(nestedSource, { ...options, baseDir })),
    };
    return compiler.compile(ast, opts);
}
function compileFile(filePath) {
    const abs = path.resolve(filePath);
    const source = fs.readFileSync(abs, 'utf-8');
    return compileSource(source, { baseDir: path.dirname(abs) });
}
