import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import AnalysisReportView from "./AnalysisReportView";

import type { AnalysisReport } from "../api";

vi.mock("../api", () => ({
    fetchAnalysisReport: vi.fn()
}));

import { fetchAnalysisReport } from "../api";

const report: AnalysisReport = {
    repository: "demo",
    summary: "A small, well-factored repository.",
    scalability: {
        score: 7.5,
        verdict: "Reasonable",
        factors: [
            {
                title: "Low coupling",
                detail: "Few cross-module imports.",
                severity: "low"
            },
            {
                title: "God file",
                detail: "app.ts holds 40 entities.",
                severity: "high"
            }
        ]
    },
    sustainability: {
        score: 4,
        verdict: "Needs tests",
        factors: [
            {
                title: "No tests",
                detail: "Test-to-source ratio is 0.",
                severity: "high"
            }
        ]
    },
    recommendations: ["Add unit tests.", "Split app.ts."],
    model: "deepseek/deepseek-v4-flash",
    generatedAt: "2026-10-13T00:00:00.000Z"
};

const mockedFetch = vi.mocked(fetchAnalysisReport);

beforeEach(() => {
    mockedFetch.mockReset();
});

describe("AnalysisReportView", () => {

    it("renders the generated report sections", async () => {
        mockedFetch.mockResolvedValue(report);

        render(<AnalysisReportView repository="demo" />);

        expect(
            await screen.findByText("A small, well-factored repository.")
        ).toBeInTheDocument();
        expect(screen.getByText("Scalability")).toBeInTheDocument();
        expect(screen.getByText("Sustainability")).toBeInTheDocument();
        expect(screen.getByText("7.5")).toBeInTheDocument();
        expect(screen.getByText("Low coupling")).toBeInTheDocument();
        expect(screen.getByText("God file")).toBeInTheDocument();
        expect(screen.getByText("Add unit tests.")).toBeInTheDocument();
        expect(screen.getByText(/deepseek\/deepseek-v4-flash/)).toBeInTheDocument();
    });

    it("shows a loading state while generating", () => {
        mockedFetch.mockReturnValue(new Promise(() => undefined));

        render(<AnalysisReportView repository="demo" />);

        expect(screen.getByRole("status")).toHaveTextContent(
            /Analysing the repository graph/i
        );
    });

    it("shows the API error when generation fails", async () => {
        mockedFetch.mockRejectedValue(
            new Error("Command Code API access is not available on this plan (403).")
        );

        render(<AnalysisReportView repository="demo" />);

        expect(await screen.findByRole("alert")).toHaveTextContent(
            /403/
        );
    });

    it("regenerates the report on demand", async () => {
        mockedFetch.mockResolvedValue(report);

        render(<AnalysisReportView repository="demo" />);

        await screen.findByText("A small, well-factored repository.");

        fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

        await waitFor(() => {
            expect(mockedFetch).toHaveBeenCalledTimes(2);
        });
    });
});
