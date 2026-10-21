import { readHomePrefs, writeHomePrefs } from "../homePrefs";
import { STORAGE_KEYS } from "../../app_constants";

beforeEach(() => {
  window.localStorage.clear();
});

describe("home view preferences", () => {
  it("defaults to the grid, last-opened home", () => {
    expect(readHomePrefs()).toEqual({
      viewMode: "grid",
      sortBy: "lastOpened",
    });
  });

  it("round-trips a stored preference", () => {
    writeHomePrefs({ viewMode: "list", sortBy: "name" });
    expect(readHomePrefs()).toEqual({ viewMode: "list", sortBy: "name" });
  });

  it("tolerates corrupt and partial storage as defaults", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_HOME_VIEW,
      "not json",
    );
    expect(readHomePrefs()).toEqual({
      viewMode: "grid",
      sortBy: "lastOpened",
    });

    window.localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_HOME_VIEW,
      JSON.stringify({ viewMode: "list", sortBy: "bogus" }),
    );
    expect(readHomePrefs()).toEqual({
      viewMode: "list",
      sortBy: "lastOpened",
    });
  });
});
