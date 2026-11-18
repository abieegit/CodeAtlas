import { useCallback, useEffect, useState } from "react";

import { fetchAnalysisReport, type AnalysisReport } from "../api";

interface Props {
    repository: string;
    /** Display name; falls back to the repository id when not provided. */
    repositoryName?: string;
}

const SEVERITY_STYLES: Record<string, string> = {
    high: "border-red-900/60 text-red-400",
    medium: "border-neutral-700 text-neutral-300",
    low: "border-neutral-800 text-neutral-500"
};

function FactorList({
    factors
}: {
    factors: AnalysisReport["scalability"]["factors"];
}) {

    if (factors.length === 0) {
        return (
            <p className="text-xs text-neutral-500">
                Nothing was reported here.
            </p>
        );
    }

    return (
        <ul className="flex flex-col gap-2">
            {factors.map((factor) => (
                <li
                    key={factor.title}
                    className="rounded border border-neutral-900 px-3 py-2"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white">
                            {factor.title}
                        </span>
                        <span
                            className={
                                "ml-auto rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                                (SEVERITY_STYLES[factor.severity] ??
                                    SEVERITY_STYLES.medium)
                            }
                        >
                            {factor.severity}
                        </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-neutral-400">
                        {factor.detail}
                    </p>
                </li>
            ))}
        </ul>
    );
}

function ScoreBlock({
    title,
    section
}: {
    title: string;
    section: AnalysisReport["scalability"];
}) {

    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                <span className="text-lg font-semibold text-white">
                    {section.score.toFixed(1)}
                    <span className="text-xs text-neutral-500">/10</span>
                </span>
                {section.verdict !== "" && (
                    <span className="text-xs text-neutral-400">
                        {section.verdict}
                    </span>
                )}
            </div>

            <FactorList factors={section.factors} />
        </section>
    );
}

function StringList({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {

    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {items.length === 0 ? (
                <p className="text-xs text-neutral-500">
                    Nothing was reported here.
                </p>
            ) : ordered ? (
                <ol className="list-inside list-decimal space-y-1 text-xs leading-snug text-neutral-400">
                    {items.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
            ) : (
                <ul className="list-inside list-disc space-y-1 text-xs leading-snug text-neutral-400">
                    {items.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default function AnalysisReportView({ repository, repositoryName }: Props) {

    const [report, setReport] = useState<AnalysisReport | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {

        setBusy(true);
        setError("");
        setReport(null);

        try {

            const result = await fetchAnalysisReport(repository);

            setReport(result);

        } catch (cause) {

            setError((cause as Error).message);

        } finally {

            setBusy(false);
        }

    }, [repository]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="h-full overflow-y-auto px-8 py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">

                <header className="flex flex-wrap items-baseline gap-2">
                    <h1 className="text-base font-semibold text-white">
                        Analysis Report
                    </h1>
                    <span className="text-xs text-neutral-500">
                        {repositoryName ?? repository} &middot; scalability &amp; sustainability
                    </span>
                    <button
                        className="ml-auto rounded border border-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:border-white hover:text-white disabled:opacity-40"
                        disabled={busy}
                        onClick={() => void load()}
                    >
                        {busy ? "Analysing…" : "Regenerate"}
                    </button>
                </header>

                {busy && (
                    <p className="text-sm text-neutral-400" role="status">
                        Analysing the repository graph through the configured
                        LLM API — this takes a few seconds…
                    </p>
                )}

                {!busy && error !== "" && (
                    <div
                        className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs leading-snug text-red-400"
                        role="alert"
                    >
                        {error}
                    </div>
                )}

                {!busy && report && (
                    <div className="flex flex-col gap-6">

                        <p className="text-sm leading-relaxed text-neutral-300">
                            {report.summary}
                        </p>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <ScoreBlock
                                title="Scalability"
                                section={report.scalability}
                            />
                            <ScoreBlock
                                title="Sustainability"
                                section={report.sustainability}
                            />
                        </div>

                        <StringList
                            title="Architectural strengths"
                            items={report.strengths ?? []}
                        />

                        <section className="flex flex-col gap-2">
                            <h2 className="text-sm font-semibold text-white">
                                Risks &amp; weaknesses
                            </h2>
                            <FactorList factors={report.risks ?? []} />
                        </section>

                        <StringList
                            title="Prioritized recommendations"
                            items={report.recommendations ?? []}
                            ordered
                        />

                        <StringList
                            title="Assessment limitations & uncertainties"
                            items={report.limitations ?? []}
                        />

                        <p className="text-[10px] text-neutral-600">
                            Generated {report.generatedAt} by {report.model}{" "}
                            via the configured LLM API, from the stored graph
                            metrics. AI-assisted assessment — not a guaranteed
                            performance or security audit; verify before
                            acting.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
