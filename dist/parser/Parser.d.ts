import { Token } from './Token';
import { DocumentNode } from './ASTNode';
/**
 * Parser class that converts tokens into an Abstract Syntax Tree (AST).
 */
export declare class Parser {
    private tokens;
    private current;
    constructor(tokens: Token[]);
    /**
     * Parses the token list and returns the root AST node.
     */
    parse(): DocumentNode;
    private parseNode;
    private parseElement;
    private parseText;
    private match;
    private consume;
    private check;
    private advance;
    private isAtEnd;
    private peek;
    private previous;
}
