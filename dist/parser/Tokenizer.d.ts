/**
 * HTML-like tokenizer for htmlv source.
 */
import { Token } from './Token';
export declare class Tokenizer {
    private source;
    private pos;
    private line;
    private column;
    private tokens;
    constructor(source: string);
    tokenize(): Token[];
    private scanToken;
    private scanComment;
    private scanDoctype;
    private scanTag;
    private scanText;
    private readName;
    private readAttributeValue;
    private skipWhitespace;
    private matchLiteral;
    private matchLiteralIgnoreCase;
    private peek;
    private peekAhead;
    private advance;
    private isAtEnd;
}
