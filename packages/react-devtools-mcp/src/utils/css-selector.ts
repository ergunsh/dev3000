/**
 * CSS Selector Generator
 *
 * Generates CSS selectors for DOM elements, prioritizing specificity:
 * - tag#id (most specific)
 * - tag.class1.class2
 * - tag:nth-child(n) (fallback)
 */

// Patterns for CSS-in-JS generated class names that should be filtered out
const CSS_IN_JS_PATTERNS = [
  /^css-[\w-]+$/, // Emotion, styled-jsx
  /^sc-[\w-]+$/, // styled-components
  /^_[\w]+_[\w]+/, // CSS Modules pattern
  /^[\w]+-[\w]+-[\w]+-[\w]+-[\w]+$/, // UUID-like patterns
  /^[\w]{20,}$/, // Long hash-like strings
  /^jsx-[\w]+$/, // styled-jsx
  /^__[\w]+$/, // double underscore prefixed
];

/**
 * Filter out CSS-in-JS generated class names
 */
function filterClasses(classNames: string[]): string[] {
  return classNames.filter((className) => {
    // Keep classes that don't match any CSS-in-JS pattern
    return !CSS_IN_JS_PATTERNS.some((pattern) => pattern.test(className));
  });
}

/**
 * Escape special characters in CSS identifiers
 */
function escapeCssIdentifier(value: string): string {
  // Use CSS.escape if available (modern browsers)
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }

  // Fallback: manually escape special characters
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Get the nth-child index of an element among its siblings
 */
function getNthChildIndex(element: Element): number {
  const parent = element.parentElement;
  if (!parent) return 1;

  let index = 1;
  for (const child of parent.children) {
    if (child === element) return index;
    index++;
  }
  return index;
}

/**
 * Generate a selector part for a single element
 */
function getElementSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  // If element has an ID, use it (most specific)
  if (element.id) {
    return `${tagName}#${escapeCssIdentifier(element.id)}`;
  }

  // Get class names and filter out CSS-in-JS generated ones
  const classNames = Array.from(element.classList);
  const meaningfulClasses = filterClasses(classNames);

  if (meaningfulClasses.length > 0) {
    // Use up to 3 meaningful classes for readability
    const classSelector = meaningfulClasses
      .slice(0, 3)
      .map((c) => `.${escapeCssIdentifier(c)}`)
      .join('');
    return `${tagName}${classSelector}`;
  }

  // Fallback to nth-child
  const index = getNthChildIndex(element);
  return `${tagName}:nth-child(${index})`;
}

/**
 * Check if a selector uniquely identifies the element from its parent
 */
function isSelectorUniqueAmongSiblings(
  element: Element,
  selector: string
): boolean {
  const parent = element.parentElement;
  if (!parent) return true;

  try {
    const matches = parent.querySelectorAll(`:scope > ${selector}`);
    return matches.length === 1 && matches[0] === element;
  } catch {
    // If selector is invalid, consider it unique to avoid errors
    return true;
  }
}

/**
 * Generate a CSS selector for the given element
 * Returns a path like: div#app > main > section.content > button.submit
 */
export function generateCssSelector(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  // Walk up the DOM tree
  while (current && current !== document.documentElement) {
    let selector = getElementSelector(current);

    // If selector with classes isn't unique, add nth-child
    if (
      !selector.includes('#') &&
      !isSelectorUniqueAmongSiblings(current, selector)
    ) {
      const index = getNthChildIndex(current);
      selector = `${selector}:nth-child(${index})`;
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}
