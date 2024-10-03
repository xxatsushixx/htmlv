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
     * @returns The root node of the AST.
     */
    parse() {
        const nodes = [];
        while (!this.isAtEnd()) {
            const node = this.parseNode();
            if (node) {
                nodes.push(node);
            }
        }
        return new ASTNode_1.DocumentNode(nodes);
    }
    parseNode() {
        if (this.match(Token_1.TokenType.TAG_OPEN)) {
            return this.parseElement();
        }
        else if (this.match(Token_1.TokenType.TEXT_CONTENT)) {
            return this.parseText();
        }
        else {
            this.advance();
            return null;
        }
    }
    parseElement() {
        const tagToken = this.previous();
        const tagName = tagToken.value;
        const attributes = [];
        while (this.match(Token_1.TokenType.ATTRIBUTE_NAME)) {
            const nameToken = this.previous();
            let value = '';
            if (this.match(Token_1.TokenType.ATTRIBUTE_VALUE)) {
                value = this.previous().value;
            }
            attributes.push(new ASTNode_1.AttributeNode(nameToken.value, value));
        }
        this.consume(Token_1.TokenType.TAG_CLOSE, 'Expected ">" after tag.');
        const children = [];
        while (!this.check(Token_1.TokenType.TAG_OPEN) && !this.isAtEnd()) {
            const child = this.parseNode();
            if (child) {
                children.push(child);
            }
        }
        // Handle closing tag if necessary
        if (this.match(Token_1.TokenType.TAG_OPEN)) {
            if (this.match(Token_1.TokenType.TAG_CLOSE)) {
                const closingTagName = this.previous().value;
                if (closingTagName !== tagName) {
                    throw new Error(`Expected closing tag </${tagName}> but found </${closingTagName}>.`);
                }
                this.consume(Token_1.TokenType.TAG_CLOSE, 'Expected ">" after closing tag.');
            }
        }
        return new ASTNode_1.ElementNode(tagName, attributes, children);
    }
    parseText() {
        const textToken = this.previous();
        return new ASTNode_1.TextNode(textToken.value);
    }
    // Utility parsing methods
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
