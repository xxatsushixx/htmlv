"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOID_TAGS = exports.CommentNode = exports.DoctypeNode = exports.DocumentNode = exports.AttributeNode = exports.TextNode = exports.ElementNode = exports.ASTNodeType = exports.ASTNode = void 0;
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
    ASTNodeType[ASTNodeType["Doctype"] = 4] = "Doctype";
    ASTNodeType[ASTNodeType["Comment"] = 5] = "Comment";
})(ASTNodeType || (exports.ASTNodeType = ASTNodeType = {}));
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
    getAttribute(name) {
        const attr = this.attributes.find((a) => a.name === name);
        return attr === null || attr === void 0 ? void 0 : attr.value;
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
    constructor(children, doctype = null) {
        super(ASTNodeType.Document, children);
        this.children = children;
        this.doctype = doctype;
    }
}
exports.DocumentNode = DocumentNode;
class DoctypeNode extends ASTNode {
    constructor(value) {
        super(ASTNodeType.Doctype);
        this.value = value;
    }
}
exports.DoctypeNode = DoctypeNode;
class CommentNode extends ASTNode {
    constructor(value) {
        super(ASTNodeType.Comment);
        this.value = value;
    }
}
exports.CommentNode = CommentNode;
/** HTML void / self-closing style tags (no children expected). */
exports.VOID_TAGS = new Set([
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
