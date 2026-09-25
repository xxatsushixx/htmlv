/**
 * Base class for all AST nodes.
 */
export declare abstract class ASTNode {
    type: ASTNodeType;
    children: ASTNode[];
    constructor(type: ASTNodeType, children?: ASTNode[]);
}
/**
 * Enum for AST node types.
 */
export declare enum ASTNodeType {
    Document = 0,
    Element = 1,
    Text = 2,
    Attribute = 3,
    Doctype = 4,
    Comment = 5
}
/**
 * Represents an element node in the AST.
 */
export declare class ElementNode extends ASTNode {
    tagName: string;
    attributes: AttributeNode[];
    children: ASTNode[];
    constructor(tagName: string, attributes: AttributeNode[], children: ASTNode[]);
    getAttribute(name: string): string | undefined;
}
/**
 * Represents a text node in the AST.
 */
export declare class TextNode extends ASTNode {
    content: string;
    constructor(content: string);
}
/**
 * Represents an attribute node in the AST.
 */
export declare class AttributeNode extends ASTNode {
    name: string;
    value: string;
    constructor(name: string, value: string);
}
/**
 * Represents the root document node in the AST.
 */
export declare class DocumentNode extends ASTNode {
    children: ASTNode[];
    doctype: string | null;
    constructor(children: ASTNode[], doctype?: string | null);
}
export declare class DoctypeNode extends ASTNode {
    value: string;
    constructor(value: string);
}
export declare class CommentNode extends ASTNode {
    value: string;
    constructor(value: string);
}
/** HTML void / self-closing style tags (no children expected). */
export declare const VOID_TAGS: Set<string>;
