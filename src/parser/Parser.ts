// src/parser/Parser.ts

import { Token, TokenType } from './Token';
import {
  ASTNode,
  ASTNodeType,
  ElementNode,
  TextNode,
  AttributeNode,
  DocumentNode,
} from './ASTNode';

/**
 * Parser class that converts tokens into an Abstract Syntax Tree (AST).
 */
export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parses the token list and returns the root AST node.
   * @returns The root node of the AST.
   */
  public parse(): ASTNode {
    const nodes: ASTNode[] = [];

    while (!this.isAtEnd()) {
      const node = this.parseNode();
      if (node) {
        nodes.push(node);
      }
    }

    return new DocumentNode(nodes);
  }

  private parseNode(): ASTNode | null {
    if (this.match(TokenType.TAG_OPEN)) {
      return this.parseElement();
    } else if (this.match(TokenType.TEXT_CONTENT)) {
      return this.parseText();
    } else {
      this.advance();
      return null;
    }
  }

  private parseElement(): ElementNode {
    const tagToken = this.previous();
    const tagName = tagToken.value;

    const attributes: AttributeNode[] = [];
    while (this.match(TokenType.ATTRIBUTE_NAME)) {
      const nameToken = this.previous();
      let value = '';
      if (this.match(TokenType.ATTRIBUTE_VALUE)) {
        value = this.previous().value;
      }
      attributes.push(new AttributeNode(nameToken.value, value));
    }

    this.consume(TokenType.TAG_CLOSE, 'Expected ">" after tag.');

    const children: ASTNode[] = [];
    while (!this.check(TokenType.TAG_OPEN) && !this.isAtEnd()) {
      const child = this.parseNode();
      if (child) {
        children.push(child);
      }
    }

    // Handle closing tag if necessary
    if (this.match(TokenType.TAG_OPEN)) {
      if (this.match(TokenType.TAG_CLOSE)) {
        const closingTagName = this.previous().value;
        if (closingTagName !== tagName) {
          throw new Error(
            `Expected closing tag </${tagName}> but found </${closingTagName}>.`
          );
        }
        this.consume(TokenType.TAG_CLOSE, 'Expected ">" after closing tag.');
      }
    }

    return new ElementNode(tagName, attributes, children);
  }

  private parseText(): TextNode {
    const textToken = this.previous();
    return new TextNode(textToken.value);
  }

  // Utility parsing methods

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(message);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}

