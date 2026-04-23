import { useEffect, useRef, useState, useTransition } from "react";

type RunningChangeHandler<Key extends string> = (
  key: Key,
  isRunning: boolean,
) => void;

export function createSingleFlightRegistry<Key extends string = string>(
  onRunningChange?: RunningChangeHandler<Key>,
) {
  const inFlight = new Map<Key, Promise<unknown>>();

  function isRunning(key: Key): boolean {
    return inFlight.has(key);
  }

  function run<T>(key: Key, action: () => Promise<T> | T): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    onRunningChange?.(key, true);

    const promise = Promise.resolve().then(action);
    const trackedPromise = promise.finally(() => {
      if (inFlight.get(key) === trackedPromise) {
        inFlight.delete(key);
        onRunningChange?.(key, false);
      }
    });

    inFlight.set(key, trackedPromise);
    return trackedPromise;
  }

  return {
    isRunning,
    run,
  };
}

export function useSingleFlightActions<Key extends string = string>() {
  const [runningKeys, setRunningKeys] = useState<Set<Key>>(() => new Set());
  const [registry] = useState(() =>
    createSingleFlightRegistry<Key>((key, isRunning) => {
      setRunningKeys((previous) => {
        const hasKey = previous.has(key);

        if (isRunning === hasKey) {
          return previous;
        }

        const next = new Set(previous);
        if (isRunning) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    }),
  );

  return {
    isRunning(key: Key): boolean {
      return runningKeys.has(key);
    },
    run: registry.run,
  };
}

export function useSingleFlightNavigation() {
  const lockRef = useRef(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) {
      lockRef.current = false;
    }
  }, [isPending]);

  function run(action: () => void) {
    if (lockRef.current) {
      return;
    }

    lockRef.current = true;
    startTransition(action);
  }

  return {
    isRunning: isPending,
    run,
  };
}
