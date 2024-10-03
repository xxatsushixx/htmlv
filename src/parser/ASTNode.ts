// src/parser/ASTNode.ts

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
  // ... add other node types as needed
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
  constructor(public children: ASTNode[]) {
    super(ASTNodeType.Document, children);
  }
}


