"use strict";
// src/parser/Token.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenType = exports.Token = void 0;
/**
 * Represents a lexical token.
 */
class Token {
    constructor(type, value, line, column) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
    }
}
exports.Token = Token;
/**
 * Enum for token types.
 */
var TokenType;
(function (TokenType) {
    TokenType[TokenType["TAG_OPEN"] = 0] = "TAG_OPEN";
    TokenType[TokenType["TAG_CLOSE"] = 1] = "TAG_CLOSE";
    TokenType[TokenType["ATTRIBUTE_NAME"] = 2] = "ATTRIBUTE_NAME";
    TokenType[TokenType["ATTRIBUTE_VALUE"] = 3] = "ATTRIBUTE_VALUE";
    TokenType[TokenType["TEXT_CONTENT"] = 4] = "TEXT_CONTENT";
    TokenType[TokenType["EOF"] = 5] = "EOF";
    // ... add other token types as needed
})(TokenType = exports.TokenType || (exports.TokenType = {}));
