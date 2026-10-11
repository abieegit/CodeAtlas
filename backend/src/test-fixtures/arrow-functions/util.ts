export const greet = (name: string) => "hi " + name;

export const shout = function () {
    return greet("x").toUpperCase();
};
