# Firo editor features wave (task agent: editor-feature workstream)

Base: integration/firo-combined @ 14e63fa (PR #50 head). Branch: feat/editor-features. PR stacked on integration/firo-combined; no merges/deploys.

Scope (grounded in docs/research/miro-parity-matrix.md):

1. Row 20 (C5): sticky S/M/L size presets + Bulk create mode.
   - STICKY_NOTE_SIZES s=150/m=250/l=400 in packages/common constants; default stays 250.
   - appState.currentItemStickynoteSize ("s"|"m"|"l", browser-persisted).
   - Creation points read it: App.tsx ~10783 click, App.toolDrag.ts:91, App.miroSticky.ts:45.
   - Sticky rail options flyout gains Size group + "Bulk create…" action (RailOptionItem kind:"action").
   - New host dialog BulkStickyDialog: one note per line, grid at viewport center, cap 100, select+fit after create.
2. Row 34 (C7): timer setup dialog (presets from TIMER_PRESETS + custom minutes stepper + Start; no music per matrix).
   - timerControls gains setDurationMs; new action "Set up timer…" opens dialog via a small pub/sub bridge in board/facilitator.ts (registration happens outside React in board.ts).
   - Host TimerSetupDialog (useFocusTrap pattern like TemplateModal).
3. Row 9 (C2, scoped): Help dialog gains host-injected extra sections; host supplies facilitation chords generated from the registered facilitator action definitions (labels + ALT_CODES), not hardcoded dupes.
   - Editor: HelpDialog accepts extraSections prop; Excalidraw prop renderHelpDialogExtra plumbed through LayerUI.

Deferred (report to main): reactions (row 33), voting panel (row 35), ⌘K palette move (row 8), full registry-generated help rewrite, shape libraries (C1), selection toolbar depth (row 14).

Overlap guards: do NOT touch packages/ui ExportModal.scss, AISettingsModal.scss, ImportModal.scss, ActivityFeed.scss (design owner). Do NOT touch BoardHome (home/library worker). Visual styling: minimal, reuse existing classes/tokens; design owner leads aesthetics.

Verify: yarn test:typecheck, targeted vitest per touched package, eslint, real-browser desktop+mobile screenshots of flyout/dialogs before reporting done.
