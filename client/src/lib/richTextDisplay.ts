export const RICH_TEXT_DISPLAY_CLASS =
  'prose prose-sm max-w-none dark:prose-invert text-muted-foreground leading-relaxed prose-p:my-2 prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1 prose-headings:text-foreground prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg';

export const hasRichTextHtml = (value: string) =>
  /<(p|div|br|ul|ol|li|h[1-6]|strong|b|em|i|u|span|blockquote|hr)\b/i.test(value);

export const htmlToPlainText = (value: string) => {
  if (!value) return '';
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

export const sanitizeRichTextHtmlForDisplay = (input: string): string => {
  if (!input) return '';
  if (typeof DOMParser === 'undefined') return input.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');
  const allowedTags = new Set([
    'P',
    'BR',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'UL',
    'OL',
    'LI',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'SPAN',
    'DIV',
    'BLOCKQUOTE',
    'HR',
  ]);
  const allowedStyleProps = new Set([
    'color',
    'background-color',
    'font-size',
    'font-weight',
    'font-style',
    'text-decoration',
  ]);

  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const cleaned = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
      return cleaned ? doc.createTextNode(cleaned) : null;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();

    if (!allowedTags.has(tag)) {
      const fragment = doc.createDocumentFragment();
      element.childNodes.forEach((child) => {
        const cleaned = cleanNode(child);
        if (cleaned) fragment.appendChild(cleaned);
      });
      return fragment;
    }

    const safe = doc.createElement(tag.toLowerCase());

    if (element.hasAttribute('style')) {
      const safeStyle: string[] = [];
      element
        .getAttribute('style')
        ?.split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((declaration) => {
          const [rawProp, ...rawValueParts] = declaration.split(':');
          if (!rawProp || rawValueParts.length === 0) return;
          const prop = rawProp.trim().toLowerCase();
          const value = rawValueParts.join(':').trim();
          if (!allowedStyleProps.has(prop) || !value) return;
          safeStyle.push(`${prop}: ${value}`);
        });
      if (safeStyle.length > 0) {
        safe.setAttribute('style', safeStyle.join('; '));
      }
    }

    element.childNodes.forEach((child) => {
      const cleaned = cleanNode(child);
      if (cleaned) safe.appendChild(cleaned);
    });

    return safe;
  };

  const root = doc.createElement('div');
  doc.body.childNodes.forEach((child) => {
    const cleaned = cleanNode(child);
    if (cleaned) root.appendChild(cleaned);
  });

  return root.innerHTML.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
};
