import { useEffect, useReducer } from 'react';
import { Icon } from '../../renderer/icons.js';
import { initialPlayer, playerReducer, speeds, stepDuration } from './engine.js';

/** Estado del reproductor en React; toda la lógica está en `playerReducer` (engine.ts). */
/** `source` identifica la ejecución actual: al cambiar, el reproductor vuelve al primer paso. */
export function useStepPlayer(total: number, source?: unknown) {
  const [state, dispatch] = useReducer(playerReducer, total, initialPlayer);
  useEffect(() => { dispatch({ type: 'load', total }); }, [total, source]);
  useEffect(() => {
    if (!state.playing) return;
    const timer = setTimeout(() => dispatch({ type: 'tick' }), stepDuration(state.speed));
    return () => clearTimeout(timer);
  }, [state.playing, state.index, state.speed]);
  return {
    ...state, index: Math.min(state.index, Math.max(0, total - 1)), durationMs: stepDuration(state.speed),
    setIndex: (index: number) => dispatch({ type: 'seek', index }),
    setSpeed: (speed: number) => dispatch({ type: 'speed', speed }),
    next: () => dispatch({ type: 'next' }), prev: () => dispatch({ type: 'prev' }),
    reset: () => dispatch({ type: 'reset' }), toggle: () => dispatch({ type: 'toggle' })
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
    <label className="speed">Velocidad<select value={player.speed} onChange={event => player.setSpeed(Number(event.target.value))}>{speeds.map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
  </div>;
}
