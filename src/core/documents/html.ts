import type { DocumentModel } from './model.js';
import { escapeHtml } from './model.js';
import { codeFontFamilies } from '../../shared/document.js';

export function documentHtml(model: DocumentModel) {
  const s = model.settings;
  const [portraitWidth, portraitHeight] = s.paper === 'A4' ? [210, 297] : s.paper === 'A5' ? [148, 210] : [215.9, 279.4];
  const [width, height] = s.orientation === 'landscape' ? [portraitHeight, portraitWidth] : [portraitWidth, portraitHeight];
  const mono = codeFontFamilies[s.codeFont || 'consolas'];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src 'none'; font-src 'none'"><title>${escapeHtml(s.title)}</title><style>
  @page{size:${width}mm ${height}mm;margin:0}
  .visualization{margin:2mm 0 3mm;text-align:center}.visualization svg{max-width:100%;height:auto}.visualization figcaption{font-size:.85em;color:#52606d}.complexity td,.complexity th{border:1px solid #c9d2dc;padding:1mm 2mm;text-align:left}.complexity{border-collapse:collapse;margin:1mm 0 2mm}.notes table{border-collapse:collapse}.notes th,.notes td{border:1px solid #c9d2dc;padding:.8mm 2mm}
  *{box-sizing:border-box}html,body{margin:0;padding:0;color:#17202a;background:white;font-family:Arial,'Segoe UI',sans-serif;font-size:${s.fontSize}pt;line-height:${s.lineHeight};-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #source{display:none}.sheet{position:relative;width:${width}mm;height:${height}mm;break-after:page;overflow:hidden;background:white}.sheet:last-child{break-after:auto}
  .page-body{position:absolute;top:${s.margin + 9}mm;bottom:${s.margin + 8}mm;left:${s.margin}mm;right:${s.margin}mm;display:grid;grid-template-columns:repeat(${s.columns},minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:7mm}
  .column{min-width:0;min-height:0;height:100%;display:flow-root;overflow:visible;overflow-wrap:anywhere}
  header,footer{position:absolute;left:${s.margin}mm;right:${s.margin}mm;font-size:8pt;line-height:1.1;color:#52606d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  header{top:${s.margin}mm;height:6mm;border-bottom:.2mm solid #a6aeb6;padding-bottom:2mm}footer{bottom:${s.margin}mm;height:5mm;border-top:.2mm solid #a6aeb6;padding-top:1.5mm;display:flex;justify-content:space-between;gap:5mm}footer>span:first-child{overflow:hidden;text-overflow:ellipsis}.page-number{white-space:nowrap;flex-shrink:0}
  h1,h2,h3,h4,h5,h6{line-height:1.2;margin:3mm 0 2mm;font-weight:700;color:#142c46}h1{font-size:1.6em}h2{font-size:1.35em}h3{font-size:1.17em}h4,h5,h6{font-size:1.05em}.section-heading{border-bottom:.2mm solid #a9b4bf;padding-bottom:1.3mm}
  p{margin:0 0 2mm}.subtitle{font-size:1.1em;color:#455568;margin-bottom:3mm}.introduction{color:#52606d;font-size:.9em;margin:0 0 5mm}
  .metadata{margin:0 0 2mm;font-size:.94em;white-space:pre-wrap}.metadata strong{display:block;color:#34495e}.missing{font-style:italic;color:#637181;font-size:.9em}
  .file-title{font:700 ${s.codeFontSize + 1}pt ${mono};border-bottom:.2mm solid #b8c1ca;margin:3mm 0 1mm;padding-bottom:1mm;overflow-wrap:anywhere}
  .code-line{display:flex;align-items:baseline;gap:2mm;font:${s.codeFontSize}pt/${s.lineHeight} ${mono};min-height:${s.codeFontSize * s.lineHeight}pt;margin:0;padding:0 .4mm;tab-size:4;background:#fafbfc}
  .code-line code{display:block;min-width:0;flex:1;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}.line-number{flex:0 0 4ch;text-align:right;color:#687583;font-size:.85em;user-select:none}
  pre,code{font-family:${mono};white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4}pre{font-size:${s.codeFontSize}pt;margin:1mm 0 2mm}ul,ol{padding-left:5mm;margin:0 0 2mm}li{margin:0 0 1mm}blockquote{border-left:.6mm solid #b7c3d0;margin:1mm 0 2mm;padding-left:3mm}table{border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:2mm}th,td{border:.2mm solid #aaa;padding:1mm;overflow-wrap:anywhere}hr{border:0;border-top:.2mm solid #aaa}
  .toc-row{display:flex;align-items:baseline;gap:2mm;padding-top:1mm;padding-bottom:1mm;font-size:.95em}.toc-row>span:first-child{min-width:0;overflow-wrap:anywhere}.toc-row>span:last-child{flex-shrink:0}.toc-leader{flex:1;min-width:3mm;border-bottom:.2mm dotted #aaa}
  .hljs-keyword,.hljs-selector-tag,.hljs-type{color:#6a237d;font-weight:600}.hljs-string,.hljs-regexp{color:#17603d}.hljs-number,.hljs-literal{color:#8b390c}.hljs-comment{color:#596773;font-style:italic}.hljs-title,.hljs-built_in{color:#184f87}.hljs-meta{color:#684222}
  </style></head><body><div id="source">${model.blocks.map(block => `<div data-keep="${!!block.keepNext}" data-break="${!!block.pageBreak}">${block.html}</div>`).join('')}</div><div id="pages"></div></body></html>`;
}
