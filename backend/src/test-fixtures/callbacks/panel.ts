import { useCallback } from "react";

export function helper(value: number): number {
    return value + 1;
}

export function Panel(props: { onPick: (value: number) => void }) {

    const handlePick = useCallback((value: number) => {

        helper(value);
        helper(value);
        props.onPick(value);

        return value;

    }, [props]);

    const items = [1, 2].map((value) => helper(value));

    const actions = {
        reset() {
            return helper(0);
        }
    };

    return { handlePick, items, actions };
}
