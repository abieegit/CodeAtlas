export function ok(value: number) {
    return value;
}

export function fail(reason: string) {
    return reason;
}

export function store(id: string) {
    return id;
}

export async function loadRemote(id: string) {
    const result = await store(id);
    return result;
}

export function classify(score: number) {

    if (score > 90) {
        ok(score);
    } else if (score > 50) {
        ok(score);
    } else {
        fail("low");
    }

    const label = score > 50 ? "pass" : "fail";

    switch (label) {
        case "pass":
            ok(score);
            break;
        default:
            fail("rejected");
    }

    for (let index = 0; index < score; index++) {
        ok(index);
    }

    try {
        loadRemote(String(score));
    } catch (error) {
        fail(String(error));
    }

    return label;
}

export function recursive(value: number): number {

    if (value <= 0) {
        return 0;
    }

    return recursive(value - 1);
}

export function unresolvable() {
    missingThing();
    return somethingElse(1, 2);
}
