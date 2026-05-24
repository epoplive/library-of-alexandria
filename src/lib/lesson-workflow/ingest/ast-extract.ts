import ts from 'typescript';
import type { ExistingSection, JsonObject, JsonValue } from './types';

export type AstExtractionIssueCode =
  | 'missing-prop'
  | 'invalid-prop'
  | 'invalid-discoveries'
  | 'unsupported-child';

export interface AstExtractionIssue {
  code: AstExtractionIssueCode;
  message: string;
}

export interface AstExtractedSection {
  section: ExistingSection;
  issues: AstExtractionIssue[];
}

export interface AstExtractResult {
  sections: AstExtractedSection[];
  imported_game_refs: Array<{ component_id: string; file_ref: string }>;
}

export function extractExistingLessonSections(args: {
  slug: string;
  filePath: string;
  sourceText: string;
}): AstExtractResult {
  const sourceFile = ts.createSourceFile(
    args.filePath,
    args.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const importedGameRefs = extractImportedGameRefs(sourceFile);
  const sections: AstExtractedSection[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxElement(node) && tagNameText(node.openingElement.tagName) === 'LessonShell') {
      for (const child of node.children) {
        if (ts.isJsxElement(child) && tagNameText(child.openingElement.tagName) === 'Section') {
          sections.push(extractSection(args.slug, sourceFile, child, sections.length));
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    sections,
    imported_game_refs: importedGameRefs,
  };
}

function extractImportedGameRefs(sourceFile: ts.SourceFile): Array<{ component_id: string; file_ref: string }> {
  const refs: Array<{ component_id: string; file_ref: string }> = [];
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;
    const modulePath = node.moduleSpecifier.text;
    if (!modulePath.startsWith('./games/')) return;
    const importClause = node.importClause;
    if (importClause === undefined) return;
    const namedBindings = importClause.namedBindings;
    if (namedBindings === undefined) return;
    if (!ts.isNamedImports(namedBindings)) return;
    for (const element of namedBindings.elements) {
      refs.push({
        component_id: element.name.text,
        file_ref: normalizeGameFileRef(modulePath),
      });
    }
  });
  return refs;
}

function normalizeGameFileRef(modulePath: string): string {
  const withoutDot = modulePath.startsWith('./') ? modulePath.slice(2) : modulePath;
  if (withoutDot.endsWith('.tsx')) return withoutDot;
  return `${withoutDot}.tsx`;
}

function extractSection(
  slug: string,
  sourceFile: ts.SourceFile,
  node: ts.JsxElement,
  index: number,
): AstExtractedSection {
  const issues: AstExtractionIssue[] = [];
  const eyebrow = readStringAttribute(node.openingElement.attributes, 'eyebrow');
  const title = readStringAttribute(node.openingElement.attributes, 'title');
  const narration = readStringAttribute(node.openingElement.attributes, 'narration');
  const discoveries = readDiscoveries(node.openingElement.attributes);
  const child = readChildComponent(node);

  if (!nonEmpty(eyebrow)) issues.push({ code: 'missing-prop', message: 'Section is missing non-empty eyebrow' });
  if (!nonEmpty(title)) issues.push({ code: 'missing-prop', message: 'Section is missing non-empty title' });
  if (!nonEmpty(narration)) issues.push({ code: 'missing-prop', message: 'Section is missing non-empty narration' });
  if (discoveries === undefined) issues.push({ code: 'invalid-discoveries', message: 'Section discoveries must be an object literal' });
  if (child.issue !== undefined) issues.push(child.issue);

  const safeEyebrow = eyebrow === undefined ? '' : eyebrow;
  const safeTitle = title === undefined ? '' : title;
  const safeNarration = narration === undefined ? '' : narration;
  const safeDiscoveries = discoveries === undefined ? {} : discoveries;
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  const sourceSectionId = `section_${String(index + 1).padStart(2, '0')}`;

  const section: ExistingSection = {
    index,
    // Section identity follows JSX order so narration edits do not churn downstream parity.
    source_section_id: sourceSectionId,
    eyebrow: safeEyebrow,
    title: safeTitle,
    narration: safeNarration,
    discoveries: safeDiscoveries,
    source_offset: {
      start_line: start.line + 1,
      end_line: end.line + 1,
    },
  };

  if (child.component_id !== undefined) {
    section.child_component_ref = child.component_id;
  }
  if (child.props !== undefined && Object.keys(child.props).length > 0) {
    section.child_props = child.props;
  }

  return { section, issues };
}

function readStringAttribute(attributes: ts.JsxAttributes, name: string): string | undefined {
  const attribute = findJsxAttribute(attributes, name);
  if (attribute === undefined) return undefined;
  const initializer = attribute.initializer;
  if (initializer === undefined) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer)) {
    const expression = initializer.expression;
    if (expression === undefined) return undefined;
    return stringFromExpression(expression);
  }
  return undefined;
}

function readDiscoveries(
  attributes: ts.JsxAttributes,
): { [key: string]: { brief: string; deep?: string } } | undefined {
  const attribute = findJsxAttribute(attributes, 'discoveries');
  if (attribute === undefined) return {};
  const initializer = attribute.initializer;
  if (initializer === undefined) return undefined;
  if (!ts.isJsxExpression(initializer)) return undefined;
  const expression = initializer.expression;
  if (expression === undefined) return undefined;
  const value = jsonFromExpression(expression);
  if (value === undefined) return undefined;
  return discoveryMapFromJson(value);
}

function readChildComponent(node: ts.JsxElement): {
  component_id?: string;
  props?: JsonObject;
  issue?: AstExtractionIssue;
} {
  for (const child of node.children) {
    if (ts.isJsxText(child) && child.getText().trim().length === 0) continue;
    if (ts.isJsxSelfClosingElement(child)) {
      return childComponentFromOpening(child.tagName, child.attributes);
    }
    if (ts.isJsxElement(child)) {
      return childComponentFromOpening(child.openingElement.tagName, child.openingElement.attributes);
    }
    if (ts.isJsxFragment(child)) {
      return {
        issue: { code: 'unsupported-child', message: 'Section child cannot be a JSX fragment' },
      };
    }
    if (ts.isJsxExpression(child)) {
      if (child.expression === undefined && child.getText().trim().length === 0) continue;
      return {
        issue: { code: 'unsupported-child', message: 'Section child cannot be a JSX expression' },
      };
    }
    return {
      issue: { code: 'unsupported-child', message: 'Section child is not a JSX component' },
    };
  }

  return {
    issue: { code: 'unsupported-child', message: 'Section is missing a child JSX component' },
  };
}

function childComponentFromOpening(
  tagName: ts.JsxTagNameExpression,
  attributes: ts.JsxAttributes,
): { component_id?: string; props?: JsonObject; issue?: AstExtractionIssue } {
  const componentId = tagNameText(tagName);
  if (componentId === undefined || !/^[A-Z]/.test(componentId)) {
    return {
      issue: { code: 'unsupported-child', message: 'Section child must be a component element' },
    };
  }
  return {
    component_id: componentId,
    props: literalPropsFromAttributes(attributes),
  };
}

function literalPropsFromAttributes(attributes: ts.JsxAttributes): JsonObject {
  const props: JsonObject = {};
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    const name = jsxAttributeNameText(property.name);
    if (name === undefined) continue;
    const initializer = property.initializer;
    if (initializer === undefined) {
      props[name] = true;
      continue;
    }
    if (ts.isStringLiteral(initializer)) {
      props[name] = initializer.text;
      continue;
    }
    if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
      const value = jsonFromExpression(initializer.expression);
      if (value !== undefined) props[name] = value;
    }
  }
  return props;
}

function findJsxAttribute(attributes: ts.JsxAttributes, name: string): ts.JsxAttribute | undefined {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    if (jsxAttributeNameText(property.name) === name) return property;
  }
  return undefined;
}

function jsxAttributeNameText(name: ts.JsxAttributeName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  return undefined;
}

function tagNameText(tagName: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) {
    const left = tagNameText(tagName.expression);
    if (left === undefined) return tagName.name.text;
    return `${left}.${tagName.name.text}`;
  }
  return undefined;
}

function stringFromExpression(expression: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expression)) return expression.text;
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const spanValue = primitiveStringFromExpression(span.expression);
      if (spanValue === undefined) return undefined;
      value += spanValue;
      value += span.literal.text;
    }
    return value;
  }
  return undefined;
}

function primitiveStringFromExpression(expression: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return expression.text;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  return undefined;
}

function jsonFromExpression(expression: ts.Expression): JsonValue | undefined {
  if (ts.isStringLiteral(expression)) return expression.text;
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(expression)) return numberFromPrefixUnary(expression);
  if (ts.isArrayLiteralExpression(expression)) return arrayFromExpression(expression);
  if (ts.isObjectLiteralExpression(expression)) return objectFromExpression(expression);
  return undefined;
}

function numberFromPrefixUnary(expression: ts.PrefixUnaryExpression): number | undefined {
  if (!ts.isNumericLiteral(expression.operand)) return undefined;
  const value = Number(expression.operand.text);
  if (expression.operator === ts.SyntaxKind.MinusToken) return -value;
  if (expression.operator === ts.SyntaxKind.PlusToken) return value;
  return undefined;
}

function arrayFromExpression(expression: ts.ArrayLiteralExpression): JsonValue[] | undefined {
  const values: JsonValue[] = [];
  for (const element of expression.elements) {
    const value = jsonFromExpression(element);
    if (value === undefined) return undefined;
    values.push(value);
  }
  return values;
}

function objectFromExpression(expression: ts.ObjectLiteralExpression): JsonObject | undefined {
  const value: JsonObject = {};
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) return undefined;
    const key = propertyNameText(property.name);
    if (key === undefined) return undefined;
    const propertyValue = jsonFromExpression(property.initializer);
    if (propertyValue === undefined) return undefined;
    value[key] = propertyValue;
  }
  return value;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function discoveryMapFromJson(value: JsonValue): { [key: string]: { brief: string; deep?: string } } | undefined {
  if (!isJsonObject(value)) return undefined;
  const discoveries: { [key: string]: { brief: string; deep?: string } } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isJsonObject(entry)) return undefined;
    const brief = entry.brief;
    const deep = entry.deep;
    if (typeof brief !== 'string') return undefined;
    if (deep !== undefined && typeof deep !== 'string') return undefined;
    const detail: { brief: string; deep?: string } = { brief };
    if (deep !== undefined) detail.deep = deep;
    discoveries[key] = detail;
  }
  return discoveries;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}
