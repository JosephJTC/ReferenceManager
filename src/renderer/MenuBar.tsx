import { useEffect, useRef, useState } from 'react';

export type MenuItem = { label: string; shortcut?: string; action?: () => void; disabled?: boolean; checked?: boolean; separator?: false } | { separator: true };
export type Menu = { label: string; items: MenuItem[] };

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number>();
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === undefined) return;
    const close = (event: MouseEvent) => { if (!bar.current?.contains(event.target as Node)) setOpen(undefined); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(undefined);
      if (event.key === 'ArrowRight') setOpen(value => ((value ?? 0) + 1) % menus.length);
      if (event.key === 'ArrowLeft') setOpen(value => ((value ?? 0) - 1 + menus.length) % menus.length);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [open, menus.length]);
  useEffect(() => { if (open !== undefined) bar.current?.querySelector<HTMLButtonElement>('.menu-popup button:not(:disabled)')?.focus(); }, [open]);
  return <div className="menubar" ref={bar} role="menubar" aria-label="Menú principal">
    {menus.map((menu, index) => <div className="menu" key={menu.label}>
      <button role="menuitem" aria-haspopup="menu" aria-expanded={open === index} className={open === index ? 'open' : ''} onClick={() => setOpen(open === index ? undefined : index)} onMouseEnter={() => { if (open !== undefined) setOpen(index); }}>{menu.label}</button>
      {open === index && <div className="menu-popup" role="menu" aria-label={menu.label} onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const position = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(position + 1) % buttons.length]?.focus(); }
        if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(position - 1 + buttons.length) % buttons.length]?.focus(); }
      }}>
        {menu.items.map((item, itemIndex) => item.separator ? <div className="menu-separator" role="separator" key={itemIndex} /> :
          <button role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked} key={item.label} disabled={item.disabled} onClick={() => { setOpen(undefined); item.action?.(); }}>
            <span className="menu-check">{item.checked ? '✓' : ''}</span><span className="menu-label">{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>)}
      </div>}
    </div>)}
  </div>;
}

export type ContextItem = { label: string; action: () => void; disabled?: boolean; danger?: boolean; shortcut?: string };
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextItem[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return <div className="menu-popup context-menu" role="menu" ref={menu} style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - items.length * 30 - 16) }}>
    {items.map(item => <button role="menuitem" key={item.label} disabled={item.disabled} className={item.danger ? 'danger' : ''} onClick={() => { onClose(); item.action(); }}><span className="menu-check" /><span className="menu-label">{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}
  </div>;
}
