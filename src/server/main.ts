//debug
console.log("main.ts: Loading main app");

//telemetryをアプリ実行前に読み込む
import "./serverTelemetry.js";

import express from "express";
import { verifyRequestOrigin } from "lucia";
import { lucia } from "./auth/index.js";
import ViteExpress from "vite-express";
import { EventEmitter } from "node:events";
import { createProxyMiddleware } from "http-proxy-middleware";
import { getConfig } from "./getConfig.js";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { desc } from "drizzle-orm";

// Initialize express and on the main app
const app = express();

//swaggerの読み込み

const swaggerDefinition = {
	openapi: "3.0.0",
	info: {
		title: "TutoriaLLM API",
		description: "API for TutoriaLLM server",
		version: "1.0.0",
		license: {
			name: "Licensed Under MIT",
		},
		contact: {
			name: "TutoriaLLM",
			url: "https://tutoriallm.com",
		},
	},
	servers: [
		{
			url: "http://localhost:3000",
			description: "Development server",
		},
		{
			url: "https://demo.tutoriallm.com",
			description: "Demo server",
		},
		{
			//ホスト名を取得
			url: `https://${process.env.DOMAIN}`,
			description: "Production server",
		},
	],
};

const options = {
	// failOnErrors: true, // Whether or not to throw when parsing errors. Defaults to false.
	swaggerDefinition,
	apis: ["src/server/**/*.ts"], // Path to the API docs
};
const swaggerSpec = swaggerJSDoc(options);

//開発環境でswaggerを表示
if (process.env.NODE_ENV !== "production") {
	app.get("/swagger.json", (req, res) => {
		res.setHeader("Content-Type", "application/json");
		res.send(swaggerSpec);
	});
	app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

//load config
const config = getConfig();

// Cookieの読み込み
ViteExpress.config({
	ignorePaths: /^\/api|^\/vm/,
});

//POSTリクエストの上限を設定
app.use(express.json({ limit: "5mb" }));

let port = 3000;
let vmPort = 3001;
if (process.env.SERVER_PORT) {
	const basePort = Number.parseInt(process.env.SERVER_PORT, 10); // 10進数として解釈
	if (!Number.isNaN(basePort)) {
		// basePortがNaNでないか確認
		port = basePort;
	}
}
if (process.env.VM_PORT) {
	const basePort = Number.parseInt(process.env.VM_PORT, 10); // 10進数として解釈
	if (!Number.isNaN(basePort)) {
		// basePortがNaNでないか確認
		vmPort = basePort;
	}
}

const serverEmitter = new EventEmitter();

app.use((req, res, next) => {
	if (req.method === "GET") {
		return next();
	}
	const originHeader = req.headers.origin ?? null;
	const hostHeader = req.headers.host ?? null;
	if (
		!originHeader ||
		!hostHeader ||
		!verifyRequestOrigin(originHeader, [hostHeader])
	) {
		return res.status(403).end();
	}
	return next();
});

app.use(async (req, res, next) => {
	const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");
	if (!sessionId) {
		res.locals.user = null;
		res.locals.session = null;
		return next();
	}

	const { session, user } = await lucia.validateSession(sessionId);
	if (session?.fresh) {
		res.appendHeader(
			"Set-Cookie",
			lucia.createSessionCookie(session.id).serialize(),
		);
	}
	if (!session) {
		res.appendHeader(
			"Set-Cookie",
			lucia.createBlankSessionCookie().serialize(),
		);
	}
	res.locals.session = session;
	res.locals.user = user;
	return next();
});

const server = ViteExpress.listen(app, port, () => {
	console.log(`Server running on port ${port}`);
	serverEmitter.emit("server-started", server);
});

// メモリ監視
const monitorMemoryUsage = (interval: number) => {
	setInterval(() => {
		const memoryUsage = process.memoryUsage();
		console.log(
			`プロセスの総使用量: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
		);
		console.log("-------------------------");
	}, interval);
};
if (config.General_Settings.Enable_Memory_Use_Log === true) {
	monitorMemoryUsage(2000);
}

process.on("uncaughtException", (err) => {
	console.log(err);
});

serverEmitter.on("server-started", () => {
	console.log("Server started ----- routes will be added");
	// APIなどのルーティングをサーバー起動後に追加
	import("./apis.js").then((api) => {
		app.use("/api", api.default);
		console.log("API routes added");
	});

	// VMのプロキシを設定
	const vmProxy = createProxyMiddleware({
		target: `http://localhost:${vmPort}`,
		pathFilter: (path) => {
			return path.startsWith("/vm");
		},
		pathRewrite: { "^/vm": "" },
		changeOrigin: true,
		secure: false,
		ws: true,
		logger: console,
		on: {
			close: (res, socket, head) => {
				console.log("root close");
			},
			proxyReq: (proxyReq, req, res) => {
				console.log("root proxyReq");
			},
			error: (err, req, res) => {
				console.log("root error on proxy", err);
			},
			proxyReqWs: (proxyReq, req, socket, options, head) => {
				console.log("root proxyReqWs");
			},
		},
	});
	app.use(vmProxy);
});

export { app, server, vmPort, serverEmitter };
