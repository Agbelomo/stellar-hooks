import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DevToolsPanel } from "./DevToolsPanel";
import type { HookActivitySnapshot } from "../types";

describe("DevToolsPanel", () => {
  const sampleEntries: HookActivitySnapshot[] = [
    {
      id: "hook-1",
      name: "useFreighter",
      status: "connected",
      lastError: null,
      updatedAt: new Date(1700000000000),
    },
    {
      id: "hook-2",
      name: "useStellarBalance",
      status: "loading",
      lastError: null,
      updatedAt: new Date(1700000001000),
    },
    {
      id: "hook-3",
      name: "useSorobanContract",
      status: "error",
      lastError: "Contract simulation failed: host_error",
      updatedAt: new Date(1700000002000),
    },
  ];

  it("renders panel header and active hook count", () => {
    render(<DevToolsPanel entries={sampleEntries} />);
    expect(screen.getByText("Stellar Hooks DevTools")).toBeInTheDocument();
    expect(screen.getByText("3 active")).toBeInTheDocument();
  });

  it("lists all active hook instances", () => {
    render(<DevToolsPanel entries={sampleEntries} />);
    expect(screen.getByText("useFreighter")).toBeInTheDocument();
    expect(screen.getByText("useStellarBalance")).toBeInTheDocument();
    expect(screen.getByText("useSorobanContract")).toBeInTheDocument();
  });

  it("displays the details of the selected hook instance", () => {
    const handleSelect = vi.fn();
    render(<DevToolsPanel entries={sampleEntries} onSelectInstance={handleSelect} />);

    // Click on useSorobanContract
    const contractItem = screen.getByText("useSorobanContract");
    fireEvent.click(contractItem);

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: "useSorobanContract", id: "hook-3" })
    );

    // Should show error banner
    expect(
      screen.getByText(/Contract simulation failed: host_error/)
    ).toBeInTheDocument();
  });

  it("filters hook instances by search query", () => {
    render(<DevToolsPanel entries={sampleEntries} />);
    const searchInput = screen.getByPlaceholderText("Filter hooks...");

    fireEvent.change(searchInput, { target: { value: "freighter" } });

    expect(screen.getByText("useFreighter")).toBeInTheDocument();
    expect(screen.queryByText("useStellarBalance")).not.toBeInTheDocument();
    expect(screen.queryByText("useSorobanContract")).not.toBeInTheDocument();
  });

  it("filters hook instances by status tabs", () => {
    render(<DevToolsPanel entries={sampleEntries} />);

    // Click 'error' filter button
    const errorTab = screen.getByRole("button", { name: /error/i });
    fireEvent.click(errorTab);

    expect(screen.getByText("useSorobanContract")).toBeInTheDocument();
    expect(screen.queryByText("useFreighter")).not.toBeInTheDocument();
    expect(screen.queryByText("useStellarBalance")).not.toBeInTheDocument();
  });

  it("renders empty state message when no instances match", () => {
    render(<DevToolsPanel entries={[]} />);
    expect(screen.getByText("0 active")).toBeInTheDocument();
    expect(
      screen.getByText("No matching hook instances found.")
    ).toBeInTheDocument();
  });
});
