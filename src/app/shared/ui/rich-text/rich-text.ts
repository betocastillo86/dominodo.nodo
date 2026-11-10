/**
 * The small HTML dialect the portal stores in free-text policy fields (an
 * amenity's "reglas de uso" / "servicios adicionales") and renders back to
 * residents.
 *
 * Why a dialect and not "whatever the editor produced": the value travels to
 * places that have no editor CSS — the resident's booking page inside
 * WhatsApp's WebView — so what we store has to be plain semantic markup that
 * renders correctly on its own. Quill's own output is not: it marks bullets as
 * `<ol><li data-list="bullet">`, which without `quill.snow.css` reads as a
 * numbered list. {@link sanitizeRichText} is what closes that gap, and it runs
 * on the way IN (before saving) as well as on the way OUT (before rendering),
 * because the field already holds values written before this existed.
 *
 * It is a normalizer first and a sanitizer second: the server stores the string
 * verbatim and Angular sanitizes again at every `[innerHTML]` binding, so this
 * is defence in depth, not the only line of it.
 */

/** Source tag → the tag we keep it as. Anything else is unwrapped or dropped. */
const ALLOWED_TAGS: Readonly<Record<string, string>> = {
  P: 'p',
  DIV: 'p',
  // Headings are not offered by the editor; pasted ones become plain paragraphs
  // rather than disappearing with their text.
  H1: 'p',
  H2: 'p',
  H3: 'p',
  H4: 'p',
  H5: 'p',
  H6: 'p',
  BR: 'br',
  STRONG: 'strong',
  B: 'strong',
  EM: 'em',
  I: 'em',
  UL: 'ul',
  OL: 'ol',
  LI: 'li',
  A: 'a',
};

/** Dropped with their contents — unwrapping these would surface code as text. */
const DROPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'TITLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'MATH',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
]);

const SAFE_LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Every run of whitespace — tabs and the NON-BREAKING space included — becomes
 * one ordinary space.
 *
 * This is not tidying, it is a correctness fix. Text pasted from Word arrives
 * with every space as `&nbsp;`, and a non-breaking space is exactly that: the
 * browser may not wrap there. A whole rule then becomes one unbreakable word,
 * so it is pushed to its own line and broken mid-word at the container's edge.
 */
const WHITESPACE_RUN = /[\s\u00A0]+/g;

/**
 * A paragraph that merely BEGINS with a bullet glyph is a list item someone
 * pasted as text — Word writes its lists that way, marker and tab and all.
 * Only unambiguous glyphs count: `-` and `*` open too many Spanish sentences to
 * be read as markup.
 */
const BULLET_MARKER = /^[\s\u00A0]*[\u2022\u00B7\u25E6\u25AA\u25AB\u25CF\u25CB\u2023\u2219\u2043]+[\s\u00A0]*/;

/** Does this string already carry markup, or is it a plain-text value from before? */
export function looksLikeHtml(value: string): boolean {
  return /<(\/?)(p|br|div|ul|ol|li|strong|b|em|i|u|a|h[1-6])\b[^>]*>/i.test(value);
}

/**
 * Normalizes a value coming from the editor (or from the API) into the stored
 * dialect. Returns `''` for anything that carries no text — including Quill's
 * `<p><br></p>` idle state, which must not be saved as content.
 */
export function sanitizeRichText(value: string | null | undefined): string {
  if (!value) return '';

  const source = new DOMParser().parseFromString(value, 'text/html').body;
  const target = document.createElement('div');
  copyBlocks(source, target);

  return hasContent(target) ? target.innerHTML : '';
}

/**
 * The value as HTML, whatever it was stored as: markup is normalized, and a
 * legacy plain-text value becomes paragraphs so its line breaks survive — the
 * bug that motivated the editor in the first place.
 */
export function richTextToHtml(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  return looksLikeHtml(value) ? sanitizeRichText(value) : plainTextToHtml(value);
}

/**
 * Same, plus the attributes a link needs once it is rendered outside the
 * editor. They are added here and not stored so they do not eat into the
 * field's 2 000-character budget.
 */
export function richTextToRenderedHtml(value: string | null | undefined): string {
  const html = richTextToHtml(value);
  if (!html.includes('<a ')) return html;

  const holder = document.createElement('div');
  holder.innerHTML = html;
  for (const link of Array.from(holder.querySelectorAll('a'))) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
  return holder.innerHTML;
}

/** Blank-line-separated blocks become paragraphs; single breaks become `<br>`. */
function plainTextToHtml(value: string): string {
  const holder = document.createElement('div');

  for (const block of value.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    if (!block.trim()) continue;
    const paragraph = document.createElement('p');
    block.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.appendChild(document.createElement('br'));
      paragraph.appendChild(document.createTextNode(collapse(line)));
    });
    holder.appendChild(paragraph);
  }

  return holder.innerHTML;
}

/**
 * Walks a fragment at BLOCK level: text and inline elements accumulate into a
 * paragraph, and a block element closes it. Going through a single paragraph
 * cursor like this is what keeps pasted markup (`<div><span>a</span><h2>b</h2>`)
 * from producing a `<p>` nested inside another one.
 *
 * A paragraph with no text is dropped, Quill's `<p><br></p>` idle line
 * included: paragraphs already carry their own spacing, and every character
 * saved is one left of the field's budget.
 */
function copyBlocks(source: Node, container: HTMLElement): void {
  let paragraph: HTMLElement | null = null;
  /** The `<ul>` currently gathering pasted bullet glyphs, while they keep coming. */
  let bullets: HTMLElement | null = null;

  const open = (): HTMLElement => (paragraph ??= document.createElement('p'));

  const emit = (block: HTMLElement): void => {
    if (!(block.textContent ?? '').trim()) return;

    if (stripBulletMarker(block)) {
      if (!(block.textContent ?? '').trim()) return;
      if (!bullets) {
        bullets = document.createElement('ul');
        container.appendChild(bullets);
      }
      const entry = document.createElement('li');
      while (block.firstChild) entry.appendChild(block.firstChild);
      bullets.appendChild(entry);
      return;
    }

    // Anything else ends the run: the <ul> is no longer the last child.
    bullets = null;
    container.appendChild(block);
  };

  const flush = (): void => {
    if (paragraph) emit(paragraph);
    paragraph = null;
  };

  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = collapse(child.textContent ?? '');
      // Whitespace BETWEEN blocks is layout, not content.
      if (!text.trim() && !paragraph) continue;
      open().appendChild(document.createTextNode(text));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    if (DROPPED_TAGS.has(element.tagName)) continue;

    const tag = ALLOWED_TAGS[element.tagName];

    // Unknown wrapper (`<span>`, `<font>`, Quill's `<span class="ql-ui">`): it
    // loses itself, but its contents are re-read at the level they belong to.
    if (!tag) {
      if (containsBlock(element)) {
        flush();
        copyBlocks(element, container);
      } else {
        copyInline(element, open());
      }
      continue;
    }

    if (tag === 'p') {
      flush();
      if (containsBlock(element)) {
        copyBlocks(element, container);
      } else {
        const block = document.createElement('p');
        copyInline(element, block);
        emit(block);
      }
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      flush();
      bullets = null;
      copyList(element, tag, container);
      continue;
    }

    if (tag === 'br') {
      open().appendChild(document.createElement('br'));
      continue;
    }

    // A stray <li> outside any list, plus every inline tag.
    copyInline(element, open());
  }

  flush();
}

/** Copies one node's CONTENTS into an inline context (never opens a block). */
function copyInline(source: Node, target: HTMLElement): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(collapse(child.textContent ?? '')));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    if (DROPPED_TAGS.has(element.tagName)) continue;

    const tag = ALLOWED_TAGS[element.tagName];
    if (!tag || tag === 'p' || tag === 'li') {
      copyInline(element, target);
      continue;
    }
    if (tag === 'br') {
      target.appendChild(document.createElement('br'));
      continue;
    }
    // A list nested inside a list item — valid HTML, so it is kept as is.
    if (tag === 'ul' || tag === 'ol') {
      copyList(element, tag, target);
      continue;
    }

    const copy = document.createElement(tag);
    if (tag === 'a') {
      const href = safeHref(element.getAttribute('href'));
      if (!href) {
        copyInline(element, target);
        continue;
      }
      copy.setAttribute('href', href);
    }

    copyInline(element, copy);
    target.appendChild(copy);
  }
}

/**
 * Rebuilds a list by what each item actually is. Quill 2 emits every list as
 * `<ol>` and tells bullets apart with `data-list="bullet"` on the item, so a
 * single source list can turn into several here — one per run of same-kind
 * items. Indentation (Quill's `ql-indent-*`) flattens: the editor does not
 * offer it, and a real nested `<ul>` is kept by {@link copyInline}.
 */
function copyList(source: Element, fallback: 'ul' | 'ol', target: HTMLElement): void {
  let list: HTMLElement | null = null;

  for (const item of Array.from(source.children)) {
    if (item.tagName !== 'LI') continue;

    const marker = item.getAttribute('data-list');
    const kind = marker === 'bullet' ? 'ul' : marker === 'ordered' ? 'ol' : fallback;
    if (!list || list.tagName.toLowerCase() !== kind) {
      list = document.createElement(kind);
      target.appendChild(list);
    }

    const entry = document.createElement('li');
    copyInline(item, entry);
    list.appendChild(entry);
  }

  if (list && !list.childNodes.length) list.remove();
}

/** Collapses every whitespace run — {@link WHITESPACE_RUN} says why it matters. */
function collapse(text: string): string {
  return text.replace(WHITESPACE_RUN, ' ');
}

/**
 * Removes a leading bullet glyph from a paragraph, reporting whether there was
 * one — the caller then re-homes the paragraph's contents into a real `<li>`.
 * The marker may be wrapped (`<strong>•</strong> texto`), so whatever held it
 * is dropped too once empty: dead markup that would only spend characters.
 */
function stripBulletMarker(block: HTMLElement): boolean {
  const first = firstTextNode(block);
  const text = first?.textContent ?? '';
  if (!first || !BULLET_MARKER.test(text)) return false;

  first.textContent = text.replace(BULLET_MARKER, '');

  let wrapper = first.parentElement;
  while (wrapper && wrapper !== block && !(wrapper.textContent ?? '').trim()) {
    const parent = wrapper.parentElement;
    wrapper.remove();
    wrapper = parent;
  }

  return true;
}

function firstTextNode(node: Node): Text | null {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) return child as Text;
      continue;
    }
    const nested = firstTextNode(child);
    if (nested) return nested;
  }
  return null;
}

function containsBlock(element: Element): boolean {
  return !!element.querySelector('p, div, h1, h2, h3, h4, h5, h6, ul, ol');
}

function safeHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, document.baseURI);
    return SAFE_LINK_SCHEMES.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function hasContent(target: HTMLElement): boolean {
  return !!(target.textContent ?? '').trim() || !!target.querySelector('li');
}
