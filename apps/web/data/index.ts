/**
 * Reading scenes from a shareable link.
 *
 * ## Why this file is small
 *
 * Upstream's version of this module was ~240 lines and mostly collaboration
 * plumbing: room-id generation, `#room=` link parsing, link generation, and the
 * "is this element small enough to sync" predicates. All of that died with
 * `collab/` in Phase 0 — realtime collaboration arrives in v2 with the
 * self-hosted sync server (ADR-0002, docs/plans/phase-9-sync-server.md).
 *
 * What remains is the read side of the `#json=<id>,<key>` shareable-link
 * format, used by `App.initializeScene`.
 *
 * ## No backend in v1
 *
 * `VITE_APP_BACKEND_V2_GET_URL` is unset in a default Firo build, so a
 * `#json=` link cannot resolve and `importFromBackend` alerts and returns an
 * empty state. That is honest: Firo v1 has no server at all. Share links return
 * in v2, served by the board's own server rather than a vendor's
 * (ADR-0008, docs/trd/08-server-and-auth.md).
 *
 * Opening a `.firo` file from disk does **not** go through here — that is
 * `loadFromBlob` in `@firo/editor/data/blob`, and it works with no network.
 */
import { decompressData } from "@firo/editor/data/encode";
import { decryptData, IV_LENGTH_BYTES } from "@firo/editor/data/encryption";
import { t } from "@firo/editor/i18n";

import type { ImportedDataState } from "@firo/editor/data/types";

const BACKEND_V2_GET = import.meta.env.VITE_APP_BACKEND_V2_GET_URL;

/**
 * Decodes shareLink data using the legacy buffer format, which prefixed the
 * payload with the IV. The current format carries the IV out of band.
 *
 * @deprecated Kept so that links created by older builds still open. The
 * fixed-all-zero-IV fallback is a last resort for the oldest format only.
 */
const legacy_decodeFromBackend = async ({
  buffer,
  decryptionKey,
}: {
  buffer: ArrayBuffer;
  decryptionKey: string;
}) => {
  let decrypted: ArrayBuffer;

  try {
    // Buffer should contain both the IV (fixed length) and encrypted data
    const iv = buffer.slice(0, IV_LENGTH_BYTES);
    const encrypted = buffer.slice(IV_LENGTH_BYTES, buffer.byteLength);
    decrypted = await decryptData(new Uint8Array(iv), encrypted, decryptionKey);
  } catch (error: any) {
    // Fixed IV (old format, backward compatibility)
    const fixedIv = new Uint8Array(IV_LENGTH_BYTES);
    decrypted = await decryptData(fixedIv, buffer, decryptionKey);
  }

  // We need to convert the decrypted array buffer to a string
  const string = new window.TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  const data: ImportedDataState = JSON.parse(string);

  return {
    elements: data.elements || null,
    appState: data.appState || null,
  };
};

export const importFromBackend = async (
  id: string,
  decryptionKey: string,
): Promise<ImportedDataState> => {
  try {
    const response = await fetch(`${BACKEND_V2_GET}${id}`);

    if (!response.ok) {
      window.alert(t("alerts.importBackendFailed"));
      return {};
    }
    const buffer = await response.arrayBuffer();

    try {
      const { data: decodedBuffer } = await decompressData(
        new Uint8Array(buffer),
        {
          decryptionKey,
        },
      );
      const data: ImportedDataState = JSON.parse(
        new TextDecoder().decode(decodedBuffer),
      );

      return {
        elements: data.elements || null,
        appState: data.appState || null,
      };
    } catch (error: any) {
      console.warn(
        "error when decoding shareLink data using the new format:",
        error,
      );
      return legacy_decodeFromBackend({ buffer, decryptionKey });
    }
  } catch (error: any) {
    window.alert(t("alerts.importBackendFailed"));
    console.error(error);
    return {};
  }
};
