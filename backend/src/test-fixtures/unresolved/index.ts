import lodash from "lodash";

export async function load() {
    const mod = await import("./missing");
    return mod;
}
