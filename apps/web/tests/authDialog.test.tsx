import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AuthDialog } from "../components/AuthDialog";
import { SyncApiError } from "../sync/api";

const setup = (
  overrides: Partial<React.ComponentProps<typeof AuthDialog>> = {},
) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onSignIn: vi.fn().mockResolvedValue(undefined),
    onRegister: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<AuthDialog {...props} />);
  return props;
};

const fill = (username: string, password: string) => {
  fireEvent.change(screen.getByTestId("auth-username"), {
    target: { value: username },
  });
  fireEvent.change(screen.getByTestId("auth-password"), {
    target: { value: password },
  });
};

describe("AuthDialog", () => {
  it("renders nothing when closed", () => {
    setup({ isOpen: false });
    expect(screen.queryByTestId("auth-dialog")).toBeNull();
  });

  it("signs in with trimmed username and closes on success", async () => {
    const props = setup();
    fill("  ann ", "secret1");
    fireEvent.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onSignIn).toHaveBeenCalledWith("ann", "secret1");
    expect(props.onRegister).not.toHaveBeenCalled();
  });

  it("switches to create-account mode and registers", async () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("auth-switch-mode"));
    expect(
      screen.getByRole("heading", { name: "Create account" }),
    ).toBeTruthy();

    fill("ann", "secret1");
    fireEvent.click(screen.getByTestId("auth-submit"));
    await waitFor(() =>
      expect(props.onRegister).toHaveBeenCalledWith("ann", "secret1"),
    );
  });

  it("shows the server error, stays open, and lets the user retry", async () => {
    const props = setup({
      onSignIn: vi
        .fn()
        .mockRejectedValue(
          new SyncApiError(401, "Invalid username or password."),
        ),
    });
    fill("ann", "wrong-pw");
    fireEvent.click(screen.getByTestId("auth-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid username or password.");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByTestId("auth-submit") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows a generic message when the server cannot be reached", async () => {
    setup({
      onSignIn: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    fill("ann", "secret1");
    fireEvent.click(screen.getByTestId("auth-submit"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not reach the sync server.",
    );
  });

  it("closes on Escape", () => {
    const props = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });
});
