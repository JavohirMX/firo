import React, { useLayoutEffect } from "react";

import { useTunnels } from "../../context/tunnels";
import { atom } from "../../editor-jotai";

export const withInternalFallback = <P,>(
  componentName: string,
  Component: React.FC<P>,
) => {
  const renderAtom = atom(0);

  const WrapperComponent: React.FC<
    P & {
      __fallback?: boolean;
    }
  > = (props) => {
    const {
      tunnelsJotai: { useAtom },
      fallbackRegistry,
    } = useTunnels();
    // for rerenders
    const [, setCounter] = useAtom(renderAtom);
    // Tracked per editor-instance in fallbackRegistry (on TunnelsContext)
    // so host and fallback coordinate within the instance without leaking
    // to other Excalidraw instances.
    if (!fallbackRegistry[componentName]) {
      fallbackRegistry[componentName] = {
        preferHost: false,
        counter: 0,
      };
    }
    const meta = fallbackRegistry[componentName];

    useLayoutEffect(() => {
      setCounter((c) => {
        const next = c + 1;
        meta.counter = next;

        return next;
      });
      return () => {
        if (!props.__fallback) {
          meta.preferHost = false;
        }
        setCounter((c) => {
          const next = c - 1;
          meta.counter = next;
          if (!next) {
            meta.preferHost = false;
          }
          return next;
        });
      };
    }, [setCounter, meta, props.__fallback]);

    if (!props.__fallback) {
      meta.preferHost = true;
    }

    // ensure we don't render fallback and host components at the same time
    if (
      // either before the counters are initialized
      (!meta.counter && props.__fallback && meta.preferHost) ||
      // or after the counters are initialized, and both are rendered
      // (this is the default when host renders as well)
      (meta.counter > 1 && props.__fallback)
    ) {
      return null;
    }

    return <Component {...props} />;
  };

  WrapperComponent.displayName = componentName;

  return WrapperComponent;
};
