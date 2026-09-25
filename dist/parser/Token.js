"use strict";
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
    TokenType[TokenType["DOCTYPE"] = 0] = "DOCTYPE";
    TokenType[TokenType["COMMENT"] = 1] = "COMMENT";
    TokenType[TokenType["TAG_OPEN"] = 2] = "TAG_OPEN";
    TokenType[TokenType["TAG_CLOSE_OPEN"] = 3] = "TAG_CLOSE_OPEN";
    TokenType[TokenType["TAG_END"] = 4] = "TAG_END";
    TokenType[TokenType["TAG_SELF_CLOSE"] = 5] = "TAG_SELF_CLOSE";
    TokenType[TokenType["ATTRIBUTE_NAME"] = 6] = "ATTRIBUTE_NAME";
    TokenType[TokenType["ATTRIBUTE_VALUE"] = 7] = "ATTRIBUTE_VALUE";
    TokenType[TokenType["TEXT_CONTENT"] = 8] = "TEXT_CONTENT";
    TokenType[TokenType["EOF"] = 9] = "EOF";
})(TokenType || (exports.TokenType = TokenType = {}));
