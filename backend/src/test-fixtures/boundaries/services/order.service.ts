export function readOrder(id: string) {
    return { id, total: 0 };
}

export function writeOrder(body: { items: string[] }) {
    return { stored: body.items.length };
}
