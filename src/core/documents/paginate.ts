import type { DocumentSettings, TocEntry } from '../../shared/document.js';

export function paginateDocument(settings: DocumentSettings, doc: Document = document): { pages: number; toc: TocEntry[]; warnings: string[] } {
  const view = doc.defaultView!;
  const warnings: string[] = [];
  const host = doc.getElementById('pages')!;
  type Item = { element: HTMLElement; keep: boolean; pageBreak: boolean };
  function page(singleColumn = false) {
    const sheet = doc.createElement('section');
    sheet.className = 'sheet';
    const header = doc.createElement('header');
    header.textContent = settings.header;
    sheet.append(header);
    const body = doc.createElement('div');
    body.className = 'page-body';
    if (singleColumn) body.style.gridTemplateColumns = '1fr';
    const columns = Array.from({ length: singleColumn ? 1 : settings.columns }, () => {
      const column = doc.createElement('div');
      column.className = 'column'; body.append(column); return column;
    });
    sheet.append(body);
    const footer = doc.createElement('footer');
    const caption = doc.createElement('span'); caption.textContent = settings.footer;
    const number = doc.createElement('span'); number.className = 'page-number';
    footer.append(caption, number); sheet.append(footer); host.append(sheet);
    return { sheet, columns };
  }
  function splitAt(element: HTMLElement, offset: number): [HTMLElement, HTMLElement] {
    const walker = doc.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let remaining = offset;
    while (node && remaining > (node.textContent?.length || 0)) { remaining -= node.textContent?.length || 0; node = walker.nextNode(); }
    const before = element.cloneNode(false) as HTMLElement;
    const after = element.cloneNode(false) as HTMLElement;
    if (!node) { before.append(...Array.from(element.cloneNode(true).childNodes)); return [before, after]; }
    const range = doc.createRange();
    range.selectNodeContents(element); range.setEnd(node, remaining); before.append(range.cloneContents());
    range.selectNodeContents(element); range.setStart(node, remaining); after.append(range.cloneContents());
    after.removeAttribute('data-section');
    after.querySelectorAll('[data-section]').forEach(heading => heading.removeAttribute('data-section'));
    return [before, after];
  }
  const fits = (column: HTMLElement) => {
    const last = column.lastElementChild as HTMLElement | null;
    return !last || last.getBoundingClientRect().bottom + parseFloat(view.getComputedStyle(last).marginBottom || '0') <= Math.min(column.getBoundingClientRect().bottom, column.parentElement!.getBoundingClientRect().bottom) - 1;
  };
  function layout(items: Item[], singleColumn = false) {
    const output: HTMLElement[] = [];
    let current = page(singleColumn); output.push(current.sheet);
    let index = 0;
    const advance = (forcePage = false) => {
      if (!forcePage && index + 1 < current.columns.length) index++;
      else { current = page(singleColumn); output.push(current.sheet); index = 0; }
      if (host.children.length > 500) throw new Error('El documento supera el límite de 500 páginas. Reduce la selección.');
    };
    const append = (element: HTMLElement) => {
      let column = current.columns[index];
      const hadContent = !!column.children.length;
      column.append(element);
      if (fits(column)) return;
      element.remove();
      if (hadContent) { advance(); column = current.columns[index]; column.append(element); if (fits(column)) return; element.remove(); }
      if (element.classList.contains('keep-group')) {
        for (const child of Array.from(element.children)) append(child as HTMLElement);
        return;
      }
      if (/^(UL|OL)$/.test(element.tagName) && element.children.length > 1) {
        const start = Number(element.getAttribute('start')) || 1;
        for (const [index, child] of Array.from(element.children).entries()) {
          const list = element.cloneNode(false) as HTMLElement;
          if (element.tagName === 'OL') list.setAttribute('start', String(start + index));
          list.append(child); append(list);
        }
        return;
      }
      const length = element.textContent?.length || 0;
      if (length < 2) throw new Error('Un bloque no cabe en la página. Aumenta el papel o reduce márgenes y tipografía.');
      let low = 1, high = length - 1, best = 0;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const [prefix] = splitAt(element, middle); column.append(prefix);
        const fit = fits(column); prefix.remove();
        if (fit) { best = middle; low = middle + 1; } else high = middle - 1;
      }
      if (!best) throw new Error('El tamaño de letra no cabe en el área imprimible.');
      const [prefix, suffix] = splitAt(element, best);
      column.append(prefix); advance();
      warnings.push('Se dividió un bloque de texto o una línea excepcionalmente larga entre páginas o columnas.');
      append(suffix);
    };
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const group: Item[] = [items[itemIndex]];
      while (group[group.length - 1].keep && itemIndex + 1 < items.length) group.push(items[++itemIndex]);
      if (group.some(item => item.pageBreak) && current.columns.some(column => column.children.length)) advance(true);
      if (group.length === 1) append(group[0].element);
      else {
        const wrapper = doc.createElement('div'); wrapper.className = 'keep-group';
        group.forEach(item => wrapper.append(item.element)); append(wrapper);
      }
    }
    return output;
  }
  const items: Item[] = [];
  for (const wrapper of Array.from(doc.querySelectorAll<HTMLElement>('#source > div'))) {
    const element = wrapper.firstElementChild!.cloneNode(true) as HTMLElement;
    if (element.classList.contains('notes')) {
      for (const child of Array.from(element.children)) items.push({ element: child as HTMLElement, keep: /^H[1-6]$/.test(child.tagName), pageBreak: false });
    } else items.push({ element, keep: wrapper.dataset.keep === 'true', pageBreak: wrapper.dataset.break === 'true' });
  }
  const bodyPages = layout(items);
  const headings = bodyPages.flatMap((sheet, pageIndex) => Array.from(sheet.querySelectorAll<HTMLElement>('[data-section]')).map(heading => ({ id: heading.dataset.section!, title: heading.dataset.label!, depth: Number(heading.dataset.depth), page: pageIndex + 1 })));
  let frontPages: HTMLElement[] = [];
  let frontCount = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    frontPages.forEach(sheet => sheet.remove());
    const frontItems: Item[] = [];
    const title = doc.createElement('h1'); title.textContent = settings.title;
    frontItems.push({ element: title, keep: true, pageBreak: false });
    for (const value of [settings.subtitle, settings.author]) if (value) {
      const paragraph = doc.createElement('p'); paragraph.className = 'subtitle'; paragraph.textContent = value;
      frontItems.push({ element: paragraph, keep: true, pageBreak: false });
    }
    const introduction = doc.createElement('p'); introduction.className = 'introduction'; introduction.textContent = 'Colección personal de algoritmos, soluciones y apuntes';
    frontItems.push({ element: introduction, keep: false, pageBreak: false });
    if (settings.toc) {
      const title = doc.createElement('h2'); title.textContent = 'Índice';
      frontItems.push({ element: title, keep: true, pageBreak: false });
      for (const heading of headings) {
        const row = doc.createElement('div'); row.className = 'toc-row'; row.style.paddingLeft = `${Math.min(heading.depth, 8) * 4}mm`;
        const label = doc.createElement('span'); label.textContent = heading.title;
        const leader = doc.createElement('span'); leader.className = 'toc-leader';
        const number = doc.createElement('span'); number.textContent = String(heading.page + frontCount);
        row.append(label, leader, number); frontItems.push({ element: row, keep: false, pageBreak: false });
      }
    }
    frontPages = layout(frontItems, true);
    if (frontPages.length === frontCount) break;
    frontCount = frontPages.length;
    if (attempt === 7) throw new Error('No se pudo estabilizar la paginación del índice.');
  }
  const allPages = [...frontPages, ...bodyPages];
  if (allPages.length > 500) throw new Error('El documento supera el límite de 500 páginas. Reduce la selección.');
  allPages.forEach((sheet, index) => {
    host.append(sheet);
    sheet.dataset.page = String(index + 1);
    sheet.querySelector('.page-number')!.textContent = settings.pageNumbers ? `${index + 1} / ${allPages.length}` : '';
  });
  doc.getElementById('source')!.remove();
  for (const column of Array.from(doc.querySelectorAll<HTMLElement>('.column'))) {
    if (!fits(column) || column.scrollWidth > column.clientWidth + 2) throw new Error('Se detectó contenido fuera del área imprimible. Ajusta el diseño.');
  }
  for (const caption of Array.from(doc.querySelectorAll<HTMLElement>('header, footer > span:first-child'))) {
    if (caption.scrollWidth > caption.clientWidth + 1) warnings.push('El encabezado o el pie de página es demasiado largo y se muestra abreviado.');
  }
  return { pages: allPages.length, toc: headings.map(heading => ({ ...heading, page: heading.page + frontPages.length })), warnings: [...new Set(warnings)] };
}
