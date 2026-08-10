import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.DOMParser = dom.window.DOMParser;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
global.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };

const { default: mermaid } = await import('mermaid');
const file = 'app/(app)/documents/code/database/page.tsx';
const text = readFileSync(file, 'utf8');
const m = text.match(/erDiagram[\s\S]*?`/);
if (!m) { console.error('diagram not found'); process.exit(1); }
const diagram = m[0].replace(/`$/, '');
mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
try {
  await mermaid.parse(diagram);
  console.log('OK mermaid parse passed');
} catch (e) {
  console.error('PARSE ERROR:', e.message || e);
  if (e.hash) console.error('hash:', JSON.stringify(e.hash));
  process.exit(1);
}
