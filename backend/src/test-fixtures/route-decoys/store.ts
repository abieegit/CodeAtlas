const byId = new Map<string, string>();

export function lookup(key: string) {
    return byId.get(key);
}

export function lookupPath() {
    /* A map lookup whose key happens to start with "/". Not an endpoint. */
    return byId.get("/settings");
}

export function register(anything: { get: (path: string) => unknown }) {
    /* A call on a parameter named neither router nor app. */
    return anything.get("/health");
}
