import { useRef, useState } from "react";

interface Props {
    busy: boolean;
    onAnalyze: (file: File) => void;
    onLoad: () => void;
}

export default function UploadPanel({ busy, onAnalyze, onLoad }: Props) {

    const inputRef = useRef<HTMLInputElement | null>(null);
    const [fileName, setFileName] = useState("");

    return (
        <div className="flex flex-col gap-3">
            <label className="text-sm font-medium">
                Repository ZIP
            </label>

            <input
                ref={inputRef}
                type="file"
                accept=".zip"
                className="block w-full text-xs"
                onChange={(event) =>
                    setFileName(event.target.files?.[0]?.name ?? "")
                }
            />

            <p className="text-[11px] text-slate-400">
                ZIP archives only (not .rar / .7z).
            </p>

            <button
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy || !fileName}
                onClick={() => {
                    const file = inputRef.current?.files?.[0];
                    if (file) {
                        onAnalyze(file);
                    }
                }}
            >
                {busy ? "Working..." : "Analyze repository"}
            </button>

            <button
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
                disabled={busy}
                onClick={onLoad}
            >
                Load stored graph
            </button>
        </div>
    );
}
