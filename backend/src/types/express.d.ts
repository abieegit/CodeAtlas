import type { AuthenticatedUser } from "../services/auth.service";
import type { RepositoryRecord } from "../services/repositories.service";

/*
 * Express request augmentation (Build 06):
 *  - `user`       set by requireAuth once the access token is verified.
 *  - `repository` set by requireOwnedRepository once ownership is confirmed.
 * Both are absent on public routes.
 */
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
            repository?: RepositoryRecord;
        }
    }
}

export {};
