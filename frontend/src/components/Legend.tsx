import { TYPE_COLORS } from "../nodeStyles";

const ORDER = [
    "Repository",
    "Directory",
    "File",
    "Class",
    "Function",
    "Method"
];

export default function Legend() {
    return (
        <div className="flex flex-wrap gap-3">
            {ORDER.map((type) => (
                <div
                    key={type}
                    className="flex items-center gap-1 text-xs text-slate-600"
                >
                    <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: TYPE_COLORS[type] }}
                    />
                    {type}
                </div>
            ))}
        </div>
    );
}
