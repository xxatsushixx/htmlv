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
  DOCTYPE,
  COMMENT,
  TAG_OPEN, // "<name" — value is tag name
  TAG_CLOSE_OPEN, // "</name" — value is tag name
  TAG_END, // ">"
  TAG_SELF_CLOSE, // "/>"
  ATTRIBUTE_NAME,
  ATTRIBUTE_VALUE,
  TEXT_CONTENT,
  EOF,
}
