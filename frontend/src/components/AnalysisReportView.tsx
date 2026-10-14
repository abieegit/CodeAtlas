import { useCallback, useEffect, useState } from "react";

import { fetchAnalysisReport, type AnalysisReport } from "../api";

interface Props {
    repository: string;
}

const SEVERITY_STYLES: Record<string, string> = {
    high: "border-red-900/60 text-red-400",
    medium: "border-neutral-700 text-neutral-300",
    low: "border-neutral-800 text-neutral-500"
};

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

            {section.factors.length === 0 ? (
                <p className="text-xs text-neutral-500">
                    No factors were reported for this section.
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {section.factors.map((factor) => (
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
            )}
        </section>
    );
}

export default function AnalysisReportView({ repository }: Props) {

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
                        {repository} &middot; scalability &amp; sustainability
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
                        Analysing the repository graph through the Command
                        Code Provider API — this takes a few seconds…
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

                        {report.recommendations.length > 0 && (
                            <section className="flex flex-col gap-2">
                                <h2 className="text-sm font-semibold text-white">
                                    Recommendations
                                </h2>
                                <ol className="list-inside list-decimal space-y-1 text-xs leading-snug text-neutral-400">
                                    {report.recommendations.map(
                                        (recommendation) => (
                                            <li key={recommendation}>
                                                {recommendation}
                                            </li>
                                        )
                                    )}
                                </ol>
                            </section>
                        )}

                        <p className="text-[10px] text-neutral-600">
                            Generated {report.generatedAt} by {report.model}{" "}
                            via the Command Code Provider API, from the stored
                            graph metrics. AI output — verify before acting.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
