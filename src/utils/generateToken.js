import jwt from "jsonwebtoken";
import {env} from "../config/env.js";


export const signToken = (id) => {
    return jwt.sign({ id }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
};

export const verifyToken = (token) => {
    return jwt.verify(token, env.jwtSecret);
};