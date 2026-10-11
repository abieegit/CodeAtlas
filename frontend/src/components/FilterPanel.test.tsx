import { describe, it, expect, vi } from "vitest";

import { render, screen } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import FilterPanel from "./FilterPanel";

import { defaultFilters } from "../graphFilters";

describe("FilterPanel", () => {

    it("toggles a node type through onChange", async () => {
        const onChange = vi.fn();
        render(
            <FilterPanel
                filters={defaultFilters()}
                onChange={onChange}
                directories={["src"]}
                selectedId={null}
            />
        );

        await userEvent.click(screen.getByLabelText("Function"));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].nodeTypes).not.toContain("Function");
    });

    it("switches scope to full", async () => {
        const onChange = vi.fn();
        render(
            <FilterPanel
                filters={defaultFilters()}
                onChange={onChange}
                directories={[]}
                selectedId={"file:src/app.ts"}
            />
        );

        await userEvent.click(screen.getByRole("button", { name: "Full" }));

        expect(onChange.mock.calls[0][0].scope).toBe("full");
    });

    it("focuses the selected node", async () => {
        const onChange = vi.fn();
        render(
            <FilterPanel
                filters={defaultFilters()}
                onChange={onChange}
                directories={[]}
                selectedId={"file:src/app.ts"}
            />
        );

        await userEvent.click(
            screen.getByRole("button", { name: /Focus selected/i })
        );

        expect(onChange.mock.calls[0][0].focusNodeId).toBe("file:src/app.ts");
    });
});
