const BASE = "/api";

export async function loadOrder(id: string) {

    const response = await fetch(`${BASE}/orders/${id}`);

    return response.json();
}

export function submitOrder(payload: { items: string[] }) {

    return fetch(`${BASE}/orders`, {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export function probe(url: string) {
    return fetch(url);
}
