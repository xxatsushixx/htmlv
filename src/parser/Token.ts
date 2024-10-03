// src/parser/Token.ts

/**
 * Represents a lexical token.
 */
export class Token {
  constructor(
    public type: TokenType,
    public value: string,
    public line: number,
    public column: number
  ) {}
}

/**
 * Enum for token types.
 */
export enum TokenType {
  TAG_OPEN,
  TAG_CLOSE,
  ATTRIBUTE_NAME,
  ATTRIBUTE_VALUE,
  TEXT_CONTENT,
  EOF,
  // ... add other token types as needed
}

