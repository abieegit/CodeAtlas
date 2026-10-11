import { describe, it, expect, vi } from "vitest";

import { render, screen } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import UploadPanel from "./UploadPanel";

describe("UploadPanel", () => {

    it("enables Analyze after a file is chosen and triggers onAnalyze", async () => {
        const onAnalyze = vi.fn();
        const { container } = render(
            <UploadPanel busy={false} onAnalyze={onAnalyze} onLoad={() => {}} />
        );

        const analyze = screen.getByRole("button", {
            name: /Analyze repository/i
        });

        expect(analyze).toBeDisabled();

        const input = container.querySelector(
            'input[type="file"]'
        ) as HTMLInputElement;

        await userEvent.upload(
            input,
            new File(["PK"], "repo.zip", { type: "application/zip" })
        );

        expect(analyze).toBeEnabled();

        await userEvent.click(analyze);

        expect(onAnalyze).toHaveBeenCalledTimes(1);
        expect(onAnalyze.mock.calls[0][0]).toBeInstanceOf(File);
    });

    it("calls onLoad when Load stored graph is clicked", async () => {
        const onLoad = vi.fn();
        render(
            <UploadPanel busy={false} onAnalyze={() => {}} onLoad={onLoad} />
        );

        await userEvent.click(
            screen.getByRole("button", { name: /Load stored graph/i })
        );

        expect(onLoad).toHaveBeenCalledTimes(1);
    });
});
