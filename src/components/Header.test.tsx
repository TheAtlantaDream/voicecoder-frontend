import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Header } from "./Header";

describe("Header", () => {
  const renderHeader = () =>
    render(<Header micOn onToggleMic={() => {}} status="Listening" workspace="my-workspace" />);

  it("shows the brand, mic toggle, status and workspace", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "VoiceCoder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mic on/i })).toBeInTheDocument();
    expect(screen.getByText("Listening")).toBeInTheDocument();
    expect(screen.getByText("my-workspace")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderHeader();
    expect(await axe(container)).toHaveNoViolations();
  });
});
