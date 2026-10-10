import { getUser } from "./userService";

class UserController {
    getProfile(id) {
        const user = getUser(id);
        return user;
    }
}

export default UserController;