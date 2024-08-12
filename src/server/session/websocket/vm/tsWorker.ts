import vm from "node:vm";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { ExtensionLoader } from "../extentionLoader.js";
import { fileURLToPath } from "node:url";
import getPort, { portNumbers } from "get-port";
import { exec } from "node:child_process";
import os from "node:os";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { info } from "node:console";
import i18next from "i18next";
import I18NexFsBackend, { type FsBackendOptions } from "i18next-fs-backend";

const { code, sessionValue, serverRootPath, userScript } = workerData;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!parentPort) {
	throw new Error("parentPort is not defined");
}

export type vmMessage = {
	type: "log" | "error" | "openVM" | "info";
	content: string;
	port?: number;
	ip: string;
};

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get("/test", (c) => {
	console.log("Hello, World on vm");
	return c.text("Hello, World!");
});
app.get(
	"/wstest",
	upgradeWebSocket((c) => ({
		onOpen: (event, ws) => {
			ws.send("Hello from server!");
			console.log("Connection opened from client");
		},
		onMessage(event, ws) {
			console.log(`Message from client: ${event.data}`);
			ws.send("Hello from server!");
		},
		onClose: (event) => {
			console.log("Connection closed from client");
			console.log(event);
		},
		onError: (event) => {
			console.error(`Error from client: ${event}`);
		},
	})),
);

const sessionOnStarting = sessionValue;

// i18n configuration
i18next.use(I18NexFsBackend).init<FsBackendOptions>(
	{
		backend: {
			loadPath: "src/i18n/{{lng}}.json",
		},
		fallbackLng: "en",
		preload: ["ja", "en", "zh", "ms"], // Add the languages you want to preload
	},
	(err, t) => {
		if (err) return console.error(err);
		console.log("i18next initialized");
	},
);

const { t } = i18next;

const context = vm.createContext({
	app,
	upgradeWebSocket,
	code,
	sessionOnStarting,
	console: {
		log: (...args: string[]) => {
			const logMessage = args.join(" ");
			console.log(`log from VM: ${logMessage}`);
			parentPort?.postMessage({
				type: "log",
				content: logMessage,
			} as vmMessage);
		},
		error: (...args: string[]) => {
			const logMessage = args.join(" ");
			console.error(`error from VM: ${logMessage}`);
			parentPort?.postMessage({
				type: "error",
				content: logMessage,
			} as vmMessage);
		},
		info: (...args: string[]) => {
			const logMessage = args.join(" ");
			console.info(`info from VM: ${logMessage}`);
			parentPort?.postMessage({
				type: "info",
				content: logMessage,
			} as vmMessage);
		},
	},
	serverRootPath,
	t,
});

function getValidIp() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		if (!interfaces[name]) continue;
		for (const net of interfaces[name]) {
			if (net.family === "IPv4" && !net.internal) {
				return net.address;
			}
		}
	}
	throw new Error("No valid IP address found");
}

function isPortAvailable(ip: string, port: number) {
	return new Promise((resolve, reject) => {
		exec(`netstat -tuln | grep ${ip}:${port}`, (error, stdout, stderr) => {
			if (error) {
				if (stderr) {
					reject(stderr);
				} else {
					resolve(true);
				}
			} else {
				resolve(stdout === "");
			}
		});
	});
}

async function startServer() {
	const ip = getValidIp();
	const port = await getPort({
		port: portNumbers(40000, 50000),
		host: ip,
	});
	const isAvailable = await isPortAvailable(ip, port);

	if (isAvailable) {
		const server = serve({
			fetch: app.fetch,
			port: port,
			hostname: ip,
			overrideGlobalObjects: true,
		});
		injectWebSocket(server);

		console.log(`Server with ws is listening with address: ${ip}:${port}`);
		parentPort?.postMessage({
			type: "openVM",
			port: port,
			ip: ip,
		} as vmMessage);
	} else {
		console.error(`Port ${port} at IP ${ip} is already in use`);
		process.exit(1);
	}
}

startServer();

const extensionsDir = path.resolve(__dirname, "../../../../extensions");
const extensionLoader = new ExtensionLoader(extensionsDir);
await extensionLoader.loadExtensions(context);
const extScript = await extensionLoader.loadScript();
console.log("extScript", extScript);

const script = new vm.Script(`
	${extScript}
  	${userScript}
`);

script.runInContext(context);

app.all("**", (c) => {
	return c.text("Not Found", 404);
});

export default app;