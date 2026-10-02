/**
 * Registered element types.
 *
 * This module exists purely for its import side effect: importing a type
 * registers it. The registry starts empty otherwise, and every load would fail
 * with `UnknownElementTypeError` — which is the correct failure, but an
 * unhelpful one when the real mistake is a missing import.
 *
 * Add new types here, in the order they were introduced.
 */
import "./freedraw.js";
import "./linear.js";
import "./shape.js";
import "./stickynote.js";

export { FREEDRAW_SPEC } from "./freedraw.js";
export { STICKY_NOTE_SPEC } from "./stickynote.js";
