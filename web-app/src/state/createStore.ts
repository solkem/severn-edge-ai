import { useSyncExternalStore } from 'react';

type Listener = () => void;

type StateUpdater<TState> =
  | Partial<TState>
  | ((state: TState) => Partial<TState>);

export type StoreSetState<TState> = (
  update: StateUpdater<TState>,
  replace?: boolean,
) => void;

export type StoreGetState<TState> = () => TState;

export interface StoreHook<TState> {
  (): TState;
  <TSelected>(selector: (state: TState) => TSelected): TSelected;
  getState: StoreGetState<TState>;
  setState: StoreSetState<TState>;
  subscribe: (listener: Listener) => () => void;
}

export function createStore<TState>(
  initializer: (set: StoreSetState<TState>, get: StoreGetState<TState>) => TState,
): StoreHook<TState> {
  const listeners = new Set<Listener>();
  let state: TState;

  const getState: StoreGetState<TState> = () => state;

  const setState: StoreSetState<TState> = (update, replace = false) => {
    const partial = typeof update === 'function' ? update(state) : update;
    const nextState = replace
      ? (partial as TState)
      : { ...state, ...partial };

    if (Object.is(nextState, state)) {
      return;
    }

    state = nextState;
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  state = initializer(setState, getState);

  function useStore<TSelected>(selector?: (snapshot: TState) => TSelected) {
    const select =
      selector ??
      ((snapshot: TState) => snapshot as unknown as TSelected);
    return useSyncExternalStore(
      subscribe,
      () => select(getState()),
      () => select(getState()),
    );
  }

  const hook = useStore as StoreHook<TState>;
  hook.getState = getState;
  hook.setState = setState;
  hook.subscribe = subscribe;
  return hook;
}
