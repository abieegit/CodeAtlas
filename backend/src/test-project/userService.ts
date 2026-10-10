export function getUser(
    id: number
) {

    return {
        id: id,
        name: "Abdullah"
    };
}


export function getUserById(
    id: number
) {

    return getUser(id);
}