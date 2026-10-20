import { useEffect, useState, type DependencyList } from 'react';

interface LoadState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/** Загружает данные при изменении deps; reload() — повторная загрузка. */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<LoadState<T>>({ loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => alive && setState({ data, loading: false }),
      (err: unknown) => alive && setState({ loading: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
