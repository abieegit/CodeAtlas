import { feature } from "./feature";
import { generated } from "./generated/api";
import { helper } from "../shared/util";

export function run(): string {
    return feature() + generated() + helper();
}
