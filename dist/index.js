"use strict";
/**
 * htmlv library entry + default CLI when run as node dist/index.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.serve = exports.build = exports.cli = exports.compileFile = exports.compileSource = exports.parseSource = exports.Runtime = exports.Compiler = exports.CommentNode = exports.DoctypeNode = exports.DocumentNode = exports.AttributeNode = exports.TextNode = exports.ElementNode = exports.ASTNodeType = exports.ASTNode = exports.Parser = exports.Tokenizer = exports.TokenType = exports.Token = void 0;
var Token_1 = require("./parser/Token");
Object.defineProperty(exports, "Token", { enumerable: true, get: function () { return Token_1.Token; } });
Object.defineProperty(exports, "TokenType", { enumerable: true, get: function () { return Token_1.TokenType; } });
var Tokenizer_1 = require("./parser/Tokenizer");
Object.defineProperty(exports, "Tokenizer", { enumerable: true, get: function () { return Tokenizer_1.Tokenizer; } });
var Parser_1 = require("./parser/Parser");
Object.defineProperty(exports, "Parser", { enumerable: true, get: function () { return Parser_1.Parser; } });
var ASTNode_1 = require("./parser/ASTNode");
Object.defineProperty(exports, "ASTNode", { enumerable: true, get: function () { return ASTNode_1.ASTNode; } });
Object.defineProperty(exports, "ASTNodeType", { enumerable: true, get: function () { return ASTNode_1.ASTNodeType; } });
Object.defineProperty(exports, "ElementNode", { enumerable: true, get: function () { return ASTNode_1.ElementNode; } });
Object.defineProperty(exports, "TextNode", { enumerable: true, get: function () { return ASTNode_1.TextNode; } });
Object.defineProperty(exports, "AttributeNode", { enumerable: true, get: function () { return ASTNode_1.AttributeNode; } });
Object.defineProperty(exports, "DocumentNode", { enumerable: true, get: function () { return ASTNode_1.DocumentNode; } });
Object.defineProperty(exports, "DoctypeNode", { enumerable: true, get: function () { return ASTNode_1.DoctypeNode; } });
Object.defineProperty(exports, "CommentNode", { enumerable: true, get: function () { return ASTNode_1.CommentNode; } });
var Compiler_1 = require("./compiler/Compiler");
Object.defineProperty(exports, "Compiler", { enumerable: true, get: function () { return Compiler_1.Compiler; } });
var Runtime_1 = require("./runtime/Runtime");
Object.defineProperty(exports, "Runtime", { enumerable: true, get: function () { return Runtime_1.Runtime; } });
var pipeline_1 = require("./pipeline");
Object.defineProperty(exports, "parseSource", { enumerable: true, get: function () { return pipeline_1.parseSource; } });
Object.defineProperty(exports, "compileSource", { enumerable: true, get: function () { return pipeline_1.compileSource; } });
Object.defineProperty(exports, "compileFile", { enumerable: true, get: function () { return pipeline_1.compileFile; } });
var cli_1 = require("./cli");
Object.defineProperty(exports, "cli", { enumerable: true, get: function () { return cli_1.main; } });
Object.defineProperty(exports, "build", { enumerable: true, get: function () { return cli_1.build; } });
Object.defineProperty(exports, "serve", { enumerable: true, get: function () { return cli_1.serve; } });
const cli_2 = require("./cli");
// When executed directly, run CLI (default: serve example if no args — keep help)
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        (0, cli_2.main)(['serve', 'examples/showcase.htmlv']);
    }
    else {
        (0, cli_2.main)(args);
    }
}
