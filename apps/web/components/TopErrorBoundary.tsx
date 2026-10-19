import Trans from "@firo/editor/components/Trans";
import {
  EditorJotaiProvider,
  editorJotaiStore,
} from "@firo/editor/editor-jotai";
import { t } from "@firo/editor/i18n";
import React from "react";

interface TopErrorBoundaryState {
  hasError: boolean;
  message: string;
  localStorage: string;
}

/**
 * Catches a render error and shows a recoverable splash.
 *
 * ## Nothing leaves the browser
 *
 * Upstream's version of this component called `Sentry.captureException` on every
 * crash and rendered "tracked to Sentry" with an event id, then offered to open
 * a pre-filled issue on `github.com/excalidraw/excalidraw`. Both are gone.
 *
 * This matters more than it looks. Firo is self-hosted and local-first: a team
 * running it on their own infrastructure should not have a whiteboard crash
 * report an outbound request to a third party, and
 * [`docs/prd/05-non-functional-requirements.md`](../docs/prd/05-non-functional-requirements.md)
 * (NFR-3) requires zero network traffic in the single-player path. There is no
 * telemetry service to point it at, so the crash data is shown to the user and
 * they decide what to do with it.
 *
 * The scene is still dumped into the textarea below, because losing an
 * unsaved board to an unrecoverable crash with no way to recover it is worse
 * than a long error message.
 */
export class TopErrorBoundary extends React.Component<
  React.PropsWithChildren,
  TopErrorBoundaryState
> {
  state: TopErrorBoundaryState = {
    hasError: false,
    message: "",
    localStorage: "",
  };

  render() {
    return this.state.hasError ? (
      <EditorJotaiProvider store={editorJotaiStore}>
        {this.errorSplash()}
      </EditorJotaiProvider>
    ) : (
      this.props.children
    );
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const _localStorage: Record<string, unknown> = {};
    for (const [key, value] of Object.entries({ ...localStorage })) {
      try {
        _localStorage[key] = JSON.parse(value);
      } catch {
        // not JSON — keep the raw string rather than losing the entry
        _localStorage[key] = value;
      }
    }

    this.setState({
      hasError: true,
      message: [error.message, errorInfo?.componentStack]
        .filter(Boolean)
        .join("\n\n"),
      localStorage: JSON.stringify(_localStorage, null, 2),
    });
  }

  private selectTextArea(event: React.MouseEvent<HTMLTextAreaElement>) {
    if (event.target !== document.activeElement) {
      event.preventDefault();
      const target = event.target as HTMLTextAreaElement;
      target.select();
    }
  }

  private copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(
        `${this.state.message}\n\n--- local storage ---\n${this.state.localStorage}`,
      );
      this.setState({ message: t("errorSplash.copied") });
    } catch {
      // clipboard access can be denied; the textarea is still selectable
    }
  };

  private errorSplash() {
    return (
      <div className="ErrorSplash excalidraw">
        <div className="ErrorSplash-messageContainer">
          <div className="ErrorSplash-paragraph bigger align-center">
            <Trans
              i18nKey="errorSplash.headingMain"
              button={(el) => (
                <button onClick={() => window.location.reload()}>{el}</button>
              )}
            />
          </div>
          <div className="ErrorSplash-paragraph align-center">
            <Trans
              i18nKey="errorSplash.clearCanvasMessage"
              button={(el) => (
                <button
                  onClick={() => {
                    try {
                      localStorage.clear();
                      window.location.reload();
                    } catch (error: any) {
                      console.error(error);
                    }
                  }}
                >
                  {el}
                </button>
              )}
            />
            <br />
            <div className="smaller">
              <span role="img" aria-label="warning">
                ⚠️
              </span>
              {t("errorSplash.clearCanvasCaveat")}
              <span role="img" aria-hidden="true">
                ⚠️
              </span>
            </div>
          </div>

          <div className="ErrorSplash-paragraph">
            {/*
              No bug-report link: there is no issue tracker to file into yet, and
              pointing users at the upstream Excalidraw repository would be
              actively wrong. The details below are theirs to copy out.
            */}
            <button onClick={this.copyToClipboard}>
              {t("errorSplash.copyDetails")}
            </button>
          </div>

          <div className="ErrorSplash-paragraph">
            <div className="ErrorSplash-details">
              <label>{t("errorSplash.sceneContent")}</label>
              <textarea
                rows={10}
                onPointerDown={this.selectTextArea}
                readOnly={true}
                value={`${this.state.message}\n\n--- local storage ---\n${this.state.localStorage}`}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
