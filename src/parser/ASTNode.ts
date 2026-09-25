/**
 * Base class for all AST nodes.
 */
export abstract class ASTNode {
  constructor(public type: ASTNodeType, public children: ASTNode[] = []) {}
}

/**
 * Enum for AST node types.
 */
export enum ASTNodeType {
  Document,
  Element,
  Text,
  Attribute,
  Doctype,
  Comment,
}

/**
 * Represents an element node in the AST.
 */
export class ElementNode extends ASTNode {
  constructor(
    public tagName: string,
    public attributes: AttributeNode[],
    public children: ASTNode[]
  ) {
    super(ASTNodeType.Element, children);
  }

  getAttribute(name: string): string | undefined {
    const attr = this.attributes.find((a) => a.name === name);
    return attr?.value;
  }
}

/**
 * Represents a text node in the AST.
 */
export class TextNode extends ASTNode {
  constructor(public content: string) {
    super(ASTNodeType.Text);
  }
}

/**
 * Represents an attribute node in the AST.
 */
export class AttributeNode extends ASTNode {
  constructor(public name: string, public value: string) {
    super(ASTNodeType.Attribute);
  }
}

/**
 * Represents the root document node in the AST.
 */
export class DocumentNode extends ASTNode {
  constructor(
    public children: ASTNode[],
    public doctype: string | null = null
  ) {
    super(ASTNodeType.Document, children);
  }
}

export class DoctypeNode extends ASTNode {
  constructor(public value: string) {
    super(ASTNodeType.Doctype);
  }
}

export class CommentNode extends ASTNode {
  constructor(public value: string) {
    super(ASTNodeType.Comment);
  }
}

/** HTML void / self-closing style tags (no children expected). */
export const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
