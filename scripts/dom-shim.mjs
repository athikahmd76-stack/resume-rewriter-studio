/**
 * Minimal DOMParser for Node so the browser-only DOCX parser can be exercised
 * from scripts. Backed by @xmldom/xmldom plus the tag-name-only selector and
 * element-only `children` support the app relies on.
 */
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

const elementChildren = (node) => {
  const out = [];
  const kids = node.childNodes;
  if (!kids) return out;
  for (let i = 0; i < kids.length; i += 1) {
    const c = kids.item ? kids.item(i) : kids[i];
    if (c && c.nodeType === 1) out.push(c);
  }
  return out;
};

const withChildren = (node) => {
  if (!node || node.nodeType !== 1) return node;
  if (!('children' in node)) {
    Object.defineProperty(node, 'children', { configurable: true, get: () => elementChildren(node) });
  }
  const kids = node.childNodes;
  for (let i = 0; kids && i < kids.length; i += 1) withChildren(kids.item ? kids.item(i) : kids[i]);
  return node;
};

const withSelectors = (node) => {
  if (node.querySelector) return node;
  const select = (all) => (selector) => {
    const found = [];
    for (const tag of String(selector).split(',').map((s) => s.trim()).filter(Boolean)) {
      const list = node.getElementsByTagName(tag);
      for (let i = 0; i < list.length; i += 1) found.push(list[i]);
    }
    if (!all) return found[0] || null;
    found.item = (i) => found[i] ?? null;
    return found;
  };
  node.querySelector = select(false);
  node.querySelectorAll = select(true);
  return node;
};

/** Install the shim on globalThis. Safe to call more than once. */
export const installDomParser = () => {
  globalThis.DOMParser = class NodeDomParser {
    parseFromString(xml) {
      const doc = new XmlDomParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
      withChildren(doc.documentElement);
      withChildren(doc);
      return withSelectors(doc);
    }
  };
  return globalThis.DOMParser;
};

export default installDomParser;
