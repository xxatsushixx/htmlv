"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tokenizer = void 0;
/**
 * HTML-like tokenizer for htmlv source.
 */
const Token_1 = require("./Token");
class Tokenizer {
    constructor(source) {
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
        this.source = source;
    }
    tokenize() {
        this.tokens = [];
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        while (!this.isAtEnd()) {
            this.scanToken();
        }
        this.tokens.push(new Token_1.Token(Token_1.TokenType.EOF, '', this.line, this.column));
        return this.tokens;
    }
    scanToken() {
        if (this.peek() === '<' && this.peekAhead(1) === '!') {
            if (this.matchLiteral('<!--')) {
                this.scanComment();
                return;
            }
            if (this.matchLiteralIgnoreCase('<!DOCTYPE')) {
                this.scanDoctype();
                return;
            }
        }
        if (this.peek() === '<') {
            this.scanTag();
            return;
        }
        this.scanText();
    }
    scanComment() {
        const startLine = this.line;
        const startCol = this.column - 4; // after matching <!--
        let value = '';
        while (!this.isAtEnd() && !this.matchLiteral('-->')) {
            value += this.advance();
        }
        this.tokens.push(new Token_1.Token(Token_1.TokenType.COMMENT, value, startLine, startCol));
    }
    scanDoctype() {
        const startLine = this.line;
        const startCol = this.column;
        this.skipWhitespace();
        let value = '';
        while (!this.isAtEnd() && this.peek() !== '>') {
            value += this.advance();
        }
        if (this.peek() === '>')
            this.advance();
        this.tokens.push(new Token_1.Token(Token_1.TokenType.DOCTYPE, value.trim(), startLine, startCol));
    }
    scanTag() {
        const startLine = this.line;
        const startCol = this.column;
        this.advance(); // <
        let isClose = false;
        if (this.peek() === '/') {
            isClose = true;
            this.advance();
        }
        const name = this.readName();
        if (!name) {
            // Malformed — treat as text remnant
            this.tokens.push(new Token_1.Token(Token_1.TokenType.TEXT_CONTENT, '<', startLine, startCol));
            return;
        }
        this.tokens.push(new Token_1.Token(isClose ? Token_1.TokenType.TAG_CLOSE_OPEN : Token_1.TokenType.TAG_OPEN, name.toLowerCase(), startLine, startCol));
        if (isClose) {
            this.skipWhitespace();
            if (this.peek() === '>') {
                this.advance();
                this.tokens.push(new Token_1.Token(Token_1.TokenType.TAG_END, '>', this.line, this.column));
            }
            return;
        }
        // Attributes
        while (!this.isAtEnd()) {
            this.skipWhitespace();
            if (this.peek() === '>' || (this.peek() === '/' && this.peekAhead(1) === '>')) {
                break;
            }
            const attrStartLine = this.line;
            const attrStartCol = this.column;
            const attrName = this.readName();
            if (!attrName)
                break;
            this.tokens.push(new Token_1.Token(Token_1.TokenType.ATTRIBUTE_NAME, attrName.toLowerCase(), attrStartLine, attrStartCol));
            this.skipWhitespace();
            if (this.peek() === '=') {
                this.advance();
                this.skipWhitespace();
                const val = this.readAttributeValue();
                this.tokens.push(new Token_1.Token(Token_1.TokenType.ATTRIBUTE_VALUE, val, this.line, this.column));
            }
        }
        this.skipWhitespace();
        if (this.peek() === '/' && this.peekAhead(1) === '>') {
            this.advance();
            this.advance();
            this.tokens.push(new Token_1.Token(Token_1.TokenType.TAG_SELF_CLOSE, '/>', this.line, this.column));
        }
        else if (this.peek() === '>') {
            this.advance();
            this.tokens.push(new Token_1.Token(Token_1.TokenType.TAG_END, '>', this.line, this.column));
        }
    }
    scanText() {
        const startLine = this.line;
        const startCol = this.column;
        let value = '';
        while (!this.isAtEnd() && this.peek() !== '<') {
            value += this.advance();
        }
        // Preserve text but skip pure-whitespace between tags for cleaner trees
        // while still allowing intentional whitespace in <text>
        if (value.length > 0) {
            this.tokens.push(new Token_1.Token(Token_1.TokenType.TEXT_CONTENT, value, startLine, startCol));
        }
    }
    readName() {
        let name = '';
        while (!this.isAtEnd() && /[A-Za-z0-9:_-]/.test(this.peek())) {
            name += this.advance();
        }
        return name;
    }
    readAttributeValue() {
        if (this.peek() === '"' || this.peek() === "'") {
            const quote = this.advance();
            let value = '';
            while (!this.isAtEnd() && this.peek() !== quote) {
                value += this.advance();
            }
            if (this.peek() === quote)
                this.advance();
            return value;
        }
        let value = '';
        while (!this.isAtEnd() && !/\s/.test(this.peek()) && this.peek() !== '>' && this.peek() !== '/') {
            value += this.advance();
        }
        return value;
    }
    skipWhitespace() {
        while (!this.isAtEnd() && /\s/.test(this.peek())) {
            this.advance();
        }
    }
    matchLiteral(literal) {
        if (this.source.startsWith(literal, this.pos)) {
            for (let i = 0; i < literal.length; i++)
                this.advance();
            return true;
        }
        return false;
    }
    matchLiteralIgnoreCase(literal) {
        const slice = this.source.slice(this.pos, this.pos + literal.length);
        if (slice.toLowerCase() === literal.toLowerCase()) {
            for (let i = 0; i < literal.length; i++)
                this.advance();
            return true;
        }
        return false;
    }
    peek() {
        var _a;
        return (_a = this.source[this.pos]) !== null && _a !== void 0 ? _a : '';
    }
    peekAhead(n) {
        var _a;
        return (_a = this.source[this.pos + n]) !== null && _a !== void 0 ? _a : '';
    }
    advance() {
        const ch = this.source[this.pos++];
        if (ch === '\n') {
            this.line++;
            this.column = 1;
        }
        else {
            this.column++;
        }
        return ch;
    }
    isAtEnd() {
        return this.pos >= this.source.length;
    }
}
exports.Tokenizer = Tokenizer;
