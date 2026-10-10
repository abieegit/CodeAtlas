import {
    getUser,
    getUserById
} from "./userService";


class UserController {

    getProfile(id: number) {

        const user =
            getUser(id);

        return user;
    }


    getProfileById(id: number) {

        const user =
            getUserById(id);

        return user;
    }
}


function calculateTotal(
    price: number,
    quantity: number
) {

    return price * quantity;
}


function calculateFinalTotal(
    price: number,
    quantity: number
) {

    const total =
        calculateTotal(
            price,
            quantity
        );

    return total;
}


export default UserController;