// Las dependencias de react-markdown usan document.createElement para decodificar
// entidades HTML con nombre; en el worker se sustituye por un decodificador propio.
if (typeof document === 'undefined') {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
    ccedil: 'ç', Ccedil: 'Ç', iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»',
    hellip: '…', mdash: '—', ndash: '–', copy: '©', reg: '®', deg: '°', middot: '·', plusmn: '±'
  };
  const decode = (html: string) => html.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (entity, body) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return named[body] ?? entity;
  });
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      const element: { innerHTML: string; textContent?: string } = { innerHTML: '' };
      Object.defineProperty(element, 'textContent', {
        get() { return decode(element.innerHTML); },
        set(value: string) { element.innerHTML = String(value); }
      });
      return element;
    }
  };
}
export {};
