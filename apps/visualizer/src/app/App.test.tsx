import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VISUALIZER_TEST_IDS } from "../test-ids";
import { App } from "./App";

describe("App", () => {
  it("монтирует provider, tooltip boundary и visualizer shell", () => {
    render(<App />);

    expect(screen.getByTestId(VISUALIZER_TEST_IDS.shell.root)).toBeTruthy();
  });
});
