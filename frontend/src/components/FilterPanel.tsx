import {
    ALL_ENTITY_TYPES,
    ALL_RELATIONSHIP_TYPES,
    FilterState
} from "../graphFilters";

interface Props {
    filters: FilterState;
    onChange: (filters: FilterState) => void;
    directories: string[];
    selectedId: string | null;
}

function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value)
        ? list.filter((entry) => entry !== value)
        : [...list, value];
}

export default function FilterPanel({
    filters,
    onChange,
    directories,
    selectedId
}: Props) {

    return (
        <div className="flex flex-col gap-3 text-xs">

            <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Scope</span>
                <div className="flex overflow-hidden rounded border border-edge">
                    {(["application", "full"] as const).map((scope) => (
                        <button
                            key={scope}
                            className={
                                "px-2 py-1 " +
                                (filters.scope === scope
                                    ? "bg-accent/20 text-accent"
                                    : "text-slate-400 hover:text-slate-200")
                            }
                            onClick={() => onChange({ ...filters, scope })}
                        >
                            {scope === "application" ? "Application" : "Full"}
                        </button>
                    ))}
                </div>
            </div>

            <fieldset>
                <legend className="mb-1 font-semibold text-slate-300">
                    Node types
                </legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {ALL_ENTITY_TYPES.map((type) => (
                        <label
                            key={type}
                            className="flex items-center gap-1 text-slate-400"
                        >
                            <input
                                type="checkbox"
                                checked={filters.nodeTypes.includes(type)}
                                onChange={() =>
                                    onChange({
                                        ...filters,
                                        nodeTypes: toggle(filters.nodeTypes, type)
                                    })
                                }
                            />
                            {type}
                        </label>
                    ))}
                </div>
            </fieldset>

            <fieldset>
                <legend className="mb-1 font-semibold text-slate-300">
                    Relationships
                </legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {ALL_RELATIONSHIP_TYPES.map((type) => (
                        <label
                            key={type}
                            className="flex items-center gap-1 text-slate-400"
                        >
                            <input
                                type="checkbox"
                                checked={filters.relationshipTypes.includes(type)}
                                onChange={() =>
                                    onChange({
                                        ...filters,
                                        relationshipTypes: toggle(
                                            filters.relationshipTypes,
                                            type
                                        )
                                    })
                                }
                            />
                            {type}
                        </label>
                    ))}
                </div>
            </fieldset>

            <label className="flex flex-col gap-1 text-slate-400">
                <span className="font-semibold text-slate-300">Directory</span>
                <select
                    className="rounded border border-edge bg-panelAlt px-2 py-1 text-slate-200"
                    value={filters.directory ?? ""}
                    onChange={(event) =>
                        onChange({
                            ...filters,
                            directory: event.target.value || null
                        })
                    }
                >
                    <option value="">All</option>
                    {directories.map((directory) => (
                        <option key={directory} value={directory}>
                            {directory}
                        </option>
                    ))}
                </select>
            </label>

            <button
                className={
                    "rounded border px-2 py-1 disabled:opacity-40 " +
                    (filters.focusNodeId
                        ? "border-accent text-accent"
                        : "border-edge text-slate-400 hover:text-slate-200")
                }
                disabled={!selectedId && !filters.focusNodeId}
                onClick={() =>
                    onChange({
                        ...filters,
                        focusNodeId: filters.focusNodeId ? null : selectedId
                    })
                }
            >
                {filters.focusNodeId ? "Clear focus" : "Focus selected"}
            </button>
        </div>
    );
}
