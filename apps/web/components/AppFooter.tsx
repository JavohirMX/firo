import { Footer } from "@firo/editor/index";
import React from "react";

import { DebugFooter, isVisualDebuggerEnabled } from "./DebugCanvas";

/**
 * The footer.
 *
 * Upstream showed a shield icon here when the user was not signed in to
 * Excalidraw+, linking to that product's end-to-end-encryption write-up. It was
 * a marketing device for a paid service, so it is gone — and so is the
 * `isExcalidrawPlusSignedUser` check that gated it.
 *
 * Firo v1 has no server, so there is nothing here to encrypt: boards live in the
 * browser's own storage and never leave it. The v2 sync server brings its own
 * transport story, which belongs in its own ADR rather than a footer link.
 */
export const AppFooter = React.memo(
  ({ onChange }: { onChange: () => void }) => {
    return (
      <Footer>
        <div
          style={{
            display: "flex",
            gap: ".5rem",
            alignItems: "center",
          }}
        >
          {isVisualDebuggerEnabled() && <DebugFooter onChange={onChange} />}
        </div>
      </Footer>
    );
  },
);
