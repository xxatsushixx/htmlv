// src/parser/Parser.ts

import { Token, TokenType } from './Token';
import {
  ASTNode,
  ElementNode,
  TextNode,
  AttributeNode,
  DocumentNode,
  CommentNode,
  DoctypeNode,
  VOID_TAGS,
} from './ASTNode';

/**
 * Parser class that converts tokens into an Abstract Syntax Tree (AST).
 */
export class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parses the token list and returns the root AST node.
   */
  public parse(): DocumentNode {
    const nodes: ASTNode[] = [];
    let doctype: string | null = null;

    while (!this.isAtEnd()) {
      if (this.match(TokenType.DOCTYPE)) {
        doctype = this.previous().value;
        nodes.push(new DoctypeNode(doctype));
        continue;
      }
      if (this.match(TokenType.COMMENT)) {
        nodes.push(new CommentNode(this.previous().value));
        continue;
      }
      const node = this.parseNode();
      if (node) {
        nodes.push(node);
      }
    }

    return new DocumentNode(nodes, doctype);
  }

  private parseNode(): ASTNode | null {
    if (this.match(TokenType.TAG_OPEN)) {
      return this.parseElement();
    }
    if (this.match(TokenType.TEXT_CONTENT)) {
      return this.parseText();
    }
    if (this.match(TokenType.COMMENT)) {
      return new CommentNode(this.previous().value);
    }
    if (this.match(TokenType.DOCTYPE)) {
      return new DoctypeNode(this.previous().value);
    }
    // Skip unexpected tokens
    if (!this.isAtEnd()) {
      this.advance();
    }
    return null;
  }

  private parseElement(): ElementNode {
    const tagName = this.previous().value;
    const attributes: AttributeNode[] = [];

    while (this.match(TokenType.ATTRIBUTE_NAME)) {
      const name = this.previous().value;
      let value = '';
      if (this.match(TokenType.ATTRIBUTE_VALUE)) {
        value = this.previous().value;
      }
      attributes.push(new AttributeNode(name, value));
    }

    if (this.match(TokenType.TAG_SELF_CLOSE)) {
      return new ElementNode(tagName, attributes, []);
    }

    this.consume(TokenType.TAG_END, `Expected ">" after <${tagName}>.`);

    if (VOID_TAGS.has(tagName)) {
      return new ElementNode(tagName, attributes, []);
    }

    const children: ASTNode[] = [];
    while (!this.isAtEnd()) {
      if (this.check(TokenType.TAG_CLOSE_OPEN)) {
        break;
      }
      const child = this.parseNode();
      if (child) {
        children.push(child);
      }
    }

    if (this.match(TokenType.TAG_CLOSE_OPEN)) {
      const closingName = this.previous().value;
      if (closingName !== tagName) {
        throw new Error(
          `Expected closing tag </${tagName}> but found </${closingName}>.`
        );
      }
      this.consume(TokenType.TAG_END, `Expected ">" after </${tagName}>.`);
    } else if (!this.isAtEnd()) {
      throw new Error(`Unclosed tag <${tagName}>.`);
    }

    return new ElementNode(tagName, attributes, children);
  }

  private parseText(): TextNode {
    return new TextNode(this.previous().value);
  }

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
