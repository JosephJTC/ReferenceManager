import { useEffect, useState } from 'react';
import { Icon } from '../icons.js';

export function useStepPlayer(total: number) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => { setIndex(0); setPlaying(false); }, [total]);
  useEffect(() => {
    if (!playing) return;
    if (index >= total - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setIndex(value => Math.min(total - 1, value + 1)), 900 / speed);
    return () => clearTimeout(timer);
  }, [playing, index, total, speed]);
  return {
    index, playing, speed, total, setSpeed,
    setIndex: (value: number) => setIndex(Math.max(0, Math.min(total - 1, value))),
    next: () => setIndex(value => Math.min(total - 1, value + 1)),
    prev: () => setIndex(value => Math.max(0, value - 1)),
    reset: () => { setPlaying(false); setIndex(0); },
    toggle: () => { if (index >= total - 1) setIndex(0); setPlaying(value => !value); }
  };
}
export type StepPlayer = ReturnType<typeof useStepPlayer>;

export function PlayerControls({ player }: { player: StepPlayer }) {
  return <div className="player-controls" role="group" aria-label="Controles de la animación">
    <button className="icon-button" aria-label="Reiniciar" title="Reiniciar (Inicio)" onClick={player.reset}><Icon name="reset" /></button>
    <button className="icon-button" aria-label="Paso anterior" title="Paso anterior (←)" disabled={player.index === 0} onClick={player.prev}><Icon name="prev" /></button>
    <button className="icon-button primary" aria-label={player.playing ? 'Pausar' : 'Reproducir'} title="Reproducir / pausar (Espacio)" onClick={player.toggle}><Icon name={player.playing ? 'pause' : 'play'} /></button>
    <button className="icon-button" aria-label="Paso siguiente" title="Paso siguiente (→)" disabled={player.index >= player.total - 1} onClick={player.next}><Icon name="next" /></button>
    <input aria-label="Paso actual" type="range" min={0} max={Math.max(0, player.total - 1)} value={player.index} onChange={event => player.setIndex(Number(event.target.value))} />
    <span className="step-counter">Paso {player.index + 1} / {player.total}</span>
    <label className="speed">Velocidad<select value={player.speed} onChange={event => player.setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
  </div>;
}
