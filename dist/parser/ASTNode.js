"use strict";
// src/parser/ASTNode.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentNode = exports.AttributeNode = exports.TextNode = exports.ElementNode = exports.ASTNodeType = exports.ASTNode = void 0;
/**
 * Base class for all AST nodes.
 */
class ASTNode {
    constructor(type, children = []) {
        this.type = type;
        this.children = children;
    }
}
exports.ASTNode = ASTNode;
/**
 * Enum for AST node types.
 */
var ASTNodeType;
(function (ASTNodeType) {
    ASTNodeType[ASTNodeType["Document"] = 0] = "Document";
    ASTNodeType[ASTNodeType["Element"] = 1] = "Element";
    ASTNodeType[ASTNodeType["Text"] = 2] = "Text";
    ASTNodeType[ASTNodeType["Attribute"] = 3] = "Attribute";
    // ... add other node types as needed
})(ASTNodeType = exports.ASTNodeType || (exports.ASTNodeType = {}));
/**
 * Represents an element node in the AST.
 */
class ElementNode extends ASTNode {
    constructor(tagName, attributes, children) {
        super(ASTNodeType.Element, children);
        this.tagName = tagName;
        this.attributes = attributes;
        this.children = children;
    }
}
exports.ElementNode = ElementNode;
/**
 * Represents a text node in the AST.
 */
class TextNode extends ASTNode {
    constructor(content) {
        super(ASTNodeType.Text);
        this.content = content;
    }
}
exports.TextNode = TextNode;
/**
 * Represents an attribute node in the AST.
 */
class AttributeNode extends ASTNode {
    constructor(name, value) {
        super(ASTNodeType.Attribute);
        this.name = name;
        this.value = value;
    }
}
exports.AttributeNode = AttributeNode;
/**
 * Represents the root document node in the AST.
 */
class DocumentNode extends ASTNode {
    constructor(children) {
        super(ASTNodeType.Document, children);
        this.children = children;
    }
}
exports.DocumentNode = DocumentNode;
