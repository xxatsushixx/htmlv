"use strict";
// src/parser/Parser.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = void 0;
const Token_1 = require("./Token");
const ASTNode_1 = require("./ASTNode");
/**
 * Parser class that converts tokens into an Abstract Syntax Tree (AST).
 */
class Parser {
    constructor(tokens) {
        this.current = 0;
        this.tokens = tokens;
    }
    /**
     * Parses the token list and returns the root AST node.
     */
    parse() {
        const nodes = [];
        let doctype = null;
        while (!this.isAtEnd()) {
            if (this.match(Token_1.TokenType.DOCTYPE)) {
                doctype = this.previous().value;
                nodes.push(new ASTNode_1.DoctypeNode(doctype));
                continue;
            }
            if (this.match(Token_1.TokenType.COMMENT)) {
                nodes.push(new ASTNode_1.CommentNode(this.previous().value));
                continue;
            }
            const node = this.parseNode();
            if (node) {
                nodes.push(node);
            }
        }
        return new ASTNode_1.DocumentNode(nodes, doctype);
    }
    parseNode() {
        if (this.match(Token_1.TokenType.TAG_OPEN)) {
            return this.parseElement();
        }
        if (this.match(Token_1.TokenType.TEXT_CONTENT)) {
            return this.parseText();
        }
        if (this.match(Token_1.TokenType.COMMENT)) {
            return new ASTNode_1.CommentNode(this.previous().value);
        }
        if (this.match(Token_1.TokenType.DOCTYPE)) {
            return new ASTNode_1.DoctypeNode(this.previous().value);
        }
        // Skip unexpected tokens
        if (!this.isAtEnd()) {
            this.advance();
        }
        return null;
    }
    parseElement() {
        const tagName = this.previous().value;
        const attributes = [];
        while (this.match(Token_1.TokenType.ATTRIBUTE_NAME)) {
            const name = this.previous().value;
            let value = '';
            if (this.match(Token_1.TokenType.ATTRIBUTE_VALUE)) {
                value = this.previous().value;
            }
            attributes.push(new ASTNode_1.AttributeNode(name, value));
        }
        if (this.match(Token_1.TokenType.TAG_SELF_CLOSE)) {
            return new ASTNode_1.ElementNode(tagName, attributes, []);
        }
        this.consume(Token_1.TokenType.TAG_END, `Expected ">" after <${tagName}>.`);
        if (ASTNode_1.VOID_TAGS.has(tagName)) {
            return new ASTNode_1.ElementNode(tagName, attributes, []);
        }
        const children = [];
        while (!this.isAtEnd()) {
            if (this.check(Token_1.TokenType.TAG_CLOSE_OPEN)) {
                break;
            }
            const child = this.parseNode();
            if (child) {
                children.push(child);
            }
        }
        if (this.match(Token_1.TokenType.TAG_CLOSE_OPEN)) {
            const closingName = this.previous().value;
            if (closingName !== tagName) {
                throw new Error(`Expected closing tag </${tagName}> but found </${closingName}>.`);
            }
            this.consume(Token_1.TokenType.TAG_END, `Expected ">" after </${tagName}>.`);
        }
        else if (!this.isAtEnd()) {
            throw new Error(`Unclosed tag <${tagName}>.`);
        }
        return new ASTNode_1.ElementNode(tagName, attributes, children);
    }
    parseText() {
        return new ASTNode_1.TextNode(this.previous().value);
    }
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }
    consume(type, message) {
        if (this.check(type))
            return this.advance();
        throw new Error(message);
    }
    check(type) {
        if (this.isAtEnd())
            return false;
        return this.peek().type === type;
    }
    advance() {
        if (!this.isAtEnd())
            this.current++;
        return this.previous();
    }
    isAtEnd() {
        return this.peek().type === Token_1.TokenType.EOF;
    }
    peek() {
        return this.tokens[this.current];
    }
    previous() {
        return this.tokens[this.current - 1];
    }
}
exports.Parser = Parser;
