/**
 * Represents a lexical token.
 */
export declare class Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
    constructor(type: TokenType, value: string, line: number, column: number);
}
/**
 * Enum for token types.
 */
export declare enum TokenType {
    DOCTYPE = 0,
    COMMENT = 1,
    TAG_OPEN = 2,// "<name" — value is tag name
    TAG_CLOSE_OPEN = 3,// "</name" — value is tag name
    TAG_END = 4,// ">"
    TAG_SELF_CLOSE = 5,// "/>"
    ATTRIBUTE_NAME = 6,
    ATTRIBUTE_VALUE = 7,
    TEXT_CONTENT = 8,
    EOF = 9
}
