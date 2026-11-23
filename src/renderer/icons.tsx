import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  explorer: <path d="M3 4h6l2 2h10v13H3z" />,
  libraries: <><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="m16 5 4-1 3 15-4 1z" /></>,
  document: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h8M9 17h8" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01" /></>,
  folder: <path d="M3 5h6l2 2h10v12H3z" />,
  folderOpen: <path d="M3 5h6l2 2h8v3H7l-4 9zM7 10h15l-4 9H3z" />,
  book: <><path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4z" /></>,
  file: <><path d="M6 2h8l5 5v15H6z" /><path d="M14 2v5h5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  play: <path d="M7 4v16l13-8z" />,
  pause: <path d="M7 4h4v16H7zM14 4h4v16h-4z" />,
  next: <path d="M5 4v16l10-8zM17 4h3v16h-3z" />,
  prev: <path d="M19 4v16L9 12zM4 4h3v16H4z" />,
  reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v5h5" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V4h12" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />,
  refresh: <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v5h-5" /></>
};
export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
const fileBadges: Record<string, [string, string]> = {
  cpp: ['C++', 'cpp'], cc: ['C++', 'cpp'], cxx: ['C++', 'cpp'], h: ['H', 'cpp'], hpp: ['H', 'cpp'], c: ['C', 'cpp'],
  py: ['PY', 'py'], java: ['JV', 'java'], kt: ['KT', 'java'], rs: ['RS', 'rs'], go: ['GO', 'go'], js: ['JS', 'js'], ts: ['TS', 'js'],
  cs: ['C#', 'java'], rb: ['RB', 'rs'], swift: ['SW', 'rs'], md: ['MD', 'md'], txt: ['TXT', 'txt'], tex: ['TEX', 'md'],
  yaml: ['YML', 'cfg'], yml: ['YML', 'cfg'], json: ['{}', 'cfg'], png: ['IMG', 'img'], jpg: ['IMG', 'img'], jpeg: ['IMG', 'img'], gif: ['IMG', 'img'], webp: ['IMG', 'img'], svg: ['SVG', 'img']
};
export function FileBadge({ name }: { name: string }) {
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const [label, kind] = fileBadges[extension] || ['·', 'txt'];
  return <span className={`file-badge badge-${kind}`} aria-hidden="true">{label}</span>;
}
