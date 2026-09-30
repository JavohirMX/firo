import {
  EXPORT_DATA_TYPES,
  getExportSource,
  IMPORT_DATA_TYPES,
  IMPORT_LIBRARY_DATA_TYPES,
  MIME_TYPES,
  VERSIONS,
} from "@firo/common";

import type { ExcalidrawElement } from "@firo/element/types";

import type { MaybePromise } from "@firo/common/utility-types";

import { cleanAppStateForExport, clearAppStateForDatabase } from "../appState";

import { isImageFileHandle, loadFromBlob } from "./blob";
import { fileOpen, fileSave } from "./filesystem";

import type { AppState, BinaryFiles, LibraryItems } from "../types";
import type {
  ExportedDataState,
  ImportedDataState,
  ExportedLibraryData,
  ImportedLibraryData,
} from "./types";

export type JSONExportData = {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
};

/**
 * Strips out files which are only referenced by deleted elements
 */
const filterOutDeletedFiles = (
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
) => {
  const nextFiles: BinaryFiles = {};
  for (const element of elements) {
    if (
      !element.isDeleted &&
      "fileId" in element &&
      element.fileId &&
      files[element.fileId]
    ) {
      nextFiles[element.fileId] = files[element.fileId];
    }
  }
  return nextFiles;
};

export const serializeAsJSON = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  type: "local" | "database",
): string => {
  const data: ExportedDataState = {
    type: EXPORT_DATA_TYPES.firo,
    version: VERSIONS.firo,
    source: getExportSource(),
    elements,
    appState:
      type === "local"
        ? cleanAppStateForExport(appState)
        : clearAppStateForDatabase(appState),
    files:
      type === "local"
        ? filterOutDeletedFiles(elements, files)
        : // will be stripped from JSON
          undefined,
  };

  return JSON.stringify(data, null, 2);
};

export const saveAsJSON = async ({
  data,
  filename,
  fileHandle,
}: {
  data: MaybePromise<JSONExportData>;
  filename: string;
  fileHandle: AppState["fileHandle"];
}) => {
  const blob = Promise.resolve(data).then(({ elements, appState, files }) => {
    const serialized = serializeAsJSON(elements, appState, files, "local");
    return new Blob([serialized], {
      type: MIME_TYPES.firo,
    });
  });

  const savedFileHandle = await fileSave(blob, {
    name: filename,
    extension: "firo",
    description: "Excalidraw file",
    fileHandle: isImageFileHandle(fileHandle) ? null : fileHandle,
  });
  return { fileHandle: savedFileHandle };
};

export const loadFromJSON = async (
  localAppState: AppState,
  localElements: readonly ExcalidrawElement[] | null,
) => {
  const file = await fileOpen({
    description: "Excalidraw files",
    // ToDo: Be over-permissive until https://bugs.webkit.org/show_bug.cgi?id=34442
    // gets resolved. Else, iOS users cannot open `.excalidraw` files.
    // extensions: ["json", "excalidraw", "png", "svg"],
  });
  return loadFromBlob(file, localAppState, localElements, file.handle);
};

export const isValidExcalidrawData = (data?: {
  type?: any;
  elements?: any;
  appState?: any;
}): data is ImportedDataState => {
  if (!data) {
    return false;
  }
  // Firo writes `firo`; `excalidraw` is accepted so that files written by the
  // upstream project still open (AC-9).
  const isKnownType = (IMPORT_DATA_TYPES as readonly unknown[]).includes(
    data.type,
  );
  return (
    isKnownType &&
    (!data.elements ||
      (Array.isArray(data.elements) &&
        (!data.appState || typeof data.appState === "object")))
  );
};

export const isValidLibrary = (json: any): json is ImportedLibraryData => {
  return (
    typeof json === "object" &&
    json &&
    // Firo writes `firolib`; `excalidrawlib` is accepted for upstream libraries.
    (IMPORT_LIBRARY_DATA_TYPES as readonly unknown[]).includes(json.type) &&
    (json.version === 1 || json.version === 2)
  );
};

export const serializeLibraryAsJSON = (libraryItems: LibraryItems) => {
  const data: ExportedLibraryData = {
    type: EXPORT_DATA_TYPES.firoLibrary,
    version: VERSIONS.firoLibrary,
    source: getExportSource(),
    libraryItems,
  };
  return JSON.stringify(data, null, 2);
};

export const saveLibraryAsJSON = async (libraryItems: LibraryItems) => {
  const serialized = serializeLibraryAsJSON(libraryItems);
  await fileSave(
    new Blob([serialized], {
      type: MIME_TYPES.firolib,
    }),
    {
      name: "library",
      extension: "firolib",
      description: "Excalidraw library file",
    },
  );
};
