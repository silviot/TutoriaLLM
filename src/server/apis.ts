import express from "express";

import admin from "./admin/index.js";
import auth from "./auth/index.js";
import session from "./session/index.js";
import tutorialsAPI from "./tutorials/index.js";
import { getConfigApp } from "./getConfig.js";
import status from "./serverStatus.js";

//debug
console.log("apis.ts: Loading apis app");

const api = express();

api.set("trust proxy", 1 /* number of proxies between user and server */);

// session routes
api.use("/session", session);

// Tutorial routes
api.use("/tutorial", tutorialsAPI);

// config fetch route
api.use("/config", getConfigApp);

// admin routes
api.use("/admin", admin);

// auth routes
api.use("/auth", auth);

//hello world
/**
 * @openapi
 * /api/hello:
 *   get:
 *     description: Returns a hello world message
 *     responses:
 *       200:
 *         description: A hello world message
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Hello, world!
 *       404:
 *         description: Not Found
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Not Found
 */
api.get("/hello", (req, res) => {
	res.send("Hello, world!");
});

//死活監視用のエンドポイント
api.use("/status", status);

// 存在しないルートへのリクエストへは404を返す
api.use("*", (req, res) => {
	res.status(404).send("Not Found");
});

export default api;
