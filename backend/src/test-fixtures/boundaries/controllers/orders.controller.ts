import { readOrder, writeOrder } from "../services/order.service";

export function getOrder(request: { params: { id: string } }) {

    if (!request.params.id) {
        throw new Error("missing id");
    }

    return readOrder(request.params.id);
}

export function createOrder(body: { items: string[] }) {

    const stored = writeOrder(body);

    return { ok: true, stored };
}
