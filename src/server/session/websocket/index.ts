import express from "express";
import expressWs from "express-ws";
import i18next from "i18next";
import FsBackend, { type FsBackendOptions } from "i18next-fs-backend";
import type { Dialogue, SessionValue, WSMessage } from "../../../type.js";
import { updateDialogue } from "../../../utils/dialogueUpdater.js";
import { sessionDB } from "../../db/session.js";
import { invokeLLM } from "../llm/index.js";
import {
	ExecCodeTest,
	SendIsWorkspaceRunning,
	StopCodeTest,
} from "./vm/index.js";
import codeGen from "./codeGen.js";
import { updateStats } from "../../../utils/statsUpdater.js";
import updateDatabase from "./updateDB.js";
import type websocket from "ws";

const websocketserver = express();
const wsServer = expressWs(websocketserver).app;

const clients = new Map<string, websocket>(); // WebSocketクライアントを管理するマップ

// i18n configuration
i18next.use(FsBackend).init<FsBackendOptions>(
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

wsServer.ws("/connect/:code", async (ws, req) => {
	const code = req.params.code;
	const uuid = req.query.uuid as string;
	console.log("new connection request from: ", code);

	try {
		// コードが存在しない場合は接続を拒否
		const value = await sessionDB.get(code);
		if (!value) {
			ws.send("Invalid code");
			ws.close();
			return;
		}
		const data: SessionValue = JSON.parse(value);

		// uuidが一致しない場合は接続を拒否
		if (data.uuid !== uuid) {
			ws.send("Invalid uuid");
			ws.close();
			return;
		}

		// WebSocketクライアントのIDを生成
		const clientId = `${uuid}-${Math.random().toString(36).substr(2, 9)}`;
		clients.set(clientId, ws);

		// クライアントIDをセッションに追加
		if (!data.clients.includes(clientId)) {
			data.clients.push(clientId);
			await sessionDB.set(code, JSON.stringify(data));
			console.log("client connected");
		}

		// Change language based on DB settings
		i18next.changeLanguage(data.language);

		ws.send(JSON.stringify(SendIsWorkspaceRunning(data.isVMRunning)));

		let pongReceived = true;
		// pingを送信する
		const pingTimeMs = 5000;
		const pingInterval = setInterval(() => {
			if (pongReceived) {
				ws.send(JSON.stringify({ request: "ping" } as WSMessage));
				pongReceived = false; // pongが受信されるのを待つ
			} else {
				// pongが受信されなかった場合、接続を切断する
				ws.terminate();
				console.log("ping timeout");
			}
		}, pingTimeMs);

		ws.on("message", async (message) => {
			const messageJson: SessionValue | WSMessage = JSON.parse(
				message.toString(),
			);
			console.log("message received in ws session");

			if ((messageJson as WSMessage).request === "pong") {
				pongReceived = true;
				const currentData = await sessionDB.get(code);
				if (!currentData) {
					return;
				}
				const currentDataJson: SessionValue = JSON.parse(currentData);
				const currentDataJsonWithupdatedStats = updateStats(
					{
						totalConnectingTime:
							currentDataJson.stats.totalConnectingTime + pingTimeMs,
					},
					currentDataJson,
				);
				await sessionDB.set(
					code,
					JSON.stringify(currentDataJsonWithupdatedStats),
				);
				return;
			}

			try {
				const currentData = await sessionDB.get(code);
				if (!currentData) {
					ws.send("Session not found");
					ws.close();
					return;
				}
				const currentDataJson: SessionValue = JSON.parse(currentData);

				// セッションデータが変更されたかをチェック
				const isUpdated =
					JSON.stringify(messageJson) !== JSON.stringify(currentDataJson);
				if (isUpdated) {
					let isRunning = currentDataJson.isVMRunning;

					updateDatabase(code, currentDataJson, clients);

					if ((messageJson as SessionValue).workspace) {
						const messageJson: SessionValue = JSON.parse(message.toString());
						if (currentDataJson.uuid !== messageJson.uuid) {
							ws.send("Invalid uuid");
							ws.close();
						}

						const {
							sessioncode,
							uuid,
							workspace,
							tutorial,
							llmContext,
							dialogue,
							stats,
						} = messageJson;

						async function updateSession() {
							async function updateDialogueLLM(data: SessionValue): Promise<{
								dialogue: Dialogue[];
								isreplying: boolean;
								progress: number;
							}> {
								const lastMessage = data.dialogue[data.dialogue.length - 1];
								if (
									data.dialogue !== currentDataJson.dialogue &&
									data.dialogue.length > 0 &&
									lastMessage.isuser
								) {
									const message = await invokeLLM(messageJson);

									if (message.blockId && message.blockName) {
										console.log(message);
										const response = message.response;
										const newDialogueWithResponse = updateDialogue(
											response,
											messageJson,
											"ai",
										);
										const blockId = message.blockId;
										const newDialogueWithBlockId = updateDialogue(
											blockId,
											newDialogueWithResponse,
											"blockId",
										);
										const blockName = message.blockName;
										const newDialogueWithBlockName = updateDialogue(
											blockName,
											newDialogueWithBlockId,
											"blockName",
										);
										return {
											dialogue: newDialogueWithBlockName.dialogue,
											isreplying: false,
											progress: message.progress,
										};
									}
									if (message.blockId) {
										console.log(message);
										const response = message.response;
										const newDialogueWithResponse = updateDialogue(
											response,
											messageJson,
											"ai",
										);
										const blockId = message.blockId;
										const newDialogueWithBlockId = updateDialogue(
											blockId,
											newDialogueWithResponse,
											"blockId",
										);
										return {
											dialogue: newDialogueWithBlockId.dialogue,
											isreplying: false,
											progress: message.progress,
										};
									}
									if (message.blockName) {
										console.log(message);
										const response = message.response;
										const newDialogueWithResponse = updateDialogue(
											response,
											messageJson,
											"ai",
										);
										const blockName = message.blockName;
										const newDialogueWithBlockName = updateDialogue(
											blockName,
											newDialogueWithResponse,
											"blockName",
										);
										return {
											dialogue: newDialogueWithBlockName.dialogue,
											isreplying: false,
											progress: message.progress,
										};
									}

									if (message) {
										const newDialogue = updateDialogue(
											message.response,
											messageJson,
											"ai",
										);
										return {
											dialogue: newDialogue.dialogue,
											isreplying: false,
											progress: message.progress,
										};
									}
								}
								return {
									dialogue: data.dialogue,
									isreplying: false,
									progress: data.tutorial.progress,
								};
							}

							const llmUpdateNeeded =
								messageJson.dialogue !== currentDataJson.dialogue &&
								messageJson.dialogue.length > 0 &&
								messageJson.dialogue[messageJson.dialogue.length - 1].isuser;

							if (llmUpdateNeeded) {
								const llmUpdatePromise = updateDialogueLLM(messageJson);

								const dataToPut: SessionValue = {
									sessioncode: sessioncode,
									uuid: uuid,
									workspace: workspace,
									dialogue: dialogue,
									isReplying: true,
									createdAt: currentDataJson.createdAt,
									updatedAt: new Date(),
									isVMRunning: currentDataJson.isVMRunning,
									clients: currentDataJson.clients,
									language: currentDataJson.language,
									llmContext: llmContext,
									tutorial: {
										...tutorial,
										progress: currentDataJson.tutorial.progress,
									},
									stats: stats,
								};

								await updateDatabase(code, dataToPut, clients);

								const updatedData = await llmUpdatePromise;

								const latestData = await sessionDB.get(code);
								if (!latestData) {
									return;
								}
								const latestDataJson: SessionValue = JSON.parse(latestData);
								const finalDataToPut: SessionValue = {
									sessioncode: latestDataJson.sessioncode,
									uuid: latestDataJson.uuid,
									workspace: latestDataJson.workspace,
									dialogue: updatedData.dialogue,
									isReplying: updatedData.isreplying,
									createdAt: latestDataJson.createdAt,
									updatedAt: new Date(),
									isVMRunning: latestDataJson.isVMRunning,
									clients: latestDataJson.clients,
									language: latestDataJson.language,
									llmContext: llmContext,
									tutorial: {
										...tutorial,
										progress: updatedData.progress,
									},
									stats: updateStats(
										{
											totalInvokedLLM: latestDataJson.stats.totalInvokedLLM + 1,
										},
										latestDataJson,
									).stats,
								};

								await updateDatabase(code, finalDataToPut, clients);
							} else {
								const dataToPut: SessionValue = {
									sessioncode: sessioncode,
									uuid: uuid,
									workspace: workspace,
									dialogue: dialogue,
									isReplying: false,
									createdAt: currentDataJson.createdAt,
									updatedAt: new Date(),
									isVMRunning: currentDataJson.isVMRunning,
									clients: currentDataJson.clients,
									language: currentDataJson.language,
									llmContext: llmContext,
									tutorial: {
										...tutorial,
										progress: messageJson.tutorial.progress,
									},
									stats: messageJson.stats,
								};

								await updateDatabase(code, dataToPut, clients);
							}
						}

						updateSession()
							.then(() => {
								console.log("Session updated");
							})
							.catch((error) => {
								console.error("Error updating session:", error);
							});
					}

					if ((messageJson as WSMessage).request === "open") {
						const seializedWorkspace = currentDataJson.workspace;

						const generatedCode = await codeGen(
							seializedWorkspace,
							currentDataJson.language,
						);

						if (generatedCode === (undefined || null || "")) {
							isRunning = false;
							currentDataJson.isVMRunning = isRunning;
							await updateDatabase(code, currentDataJson, clients);
							updateDatabase(
								code,
								updateDialogue(
									i18next.t("error.empty_code"),
									currentDataJson,
									"log",
								),
								clients,
							);
							sendToAllClients(
								currentDataJson,
								SendIsWorkspaceRunning(isRunning),
							);
							return;
						}
						console.log("test code received. Executing...");
						const result = await ExecCodeTest(
							code,
							currentDataJson.uuid,
							generatedCode,
							`/vm/${code}`,
							clients,
							updateDatabase,
						);
						if (result === "Valid uuid") {
							console.log("Script is running...");
							isRunning = true;
							currentDataJson.isVMRunning = isRunning;
							await updateDatabase(code, currentDataJson, clients);
							sendToAllClients(
								currentDataJson,
								SendIsWorkspaceRunning(isRunning),
							);
						} else {
							console.log(result);
							isRunning = false;
							currentDataJson.isVMRunning = isRunning;
							await updateDatabase(code, currentDataJson, clients);
							sendToAllClients(
								currentDataJson,
								SendIsWorkspaceRunning(isRunning),
							);
						}
					}

					if ((messageJson as WSMessage).request === "stop") {
						const result = await StopCodeTest(code, uuid);
						console.log(result);
						isRunning = false;
						currentDataJson.isVMRunning = isRunning;

						sendToAllClients(
							currentDataJson,
							SendIsWorkspaceRunning(isRunning),
						);
						const currentDataJsonWithupdatedStats = updateStats(
							{
								totalCodeExecutions:
									currentDataJson.stats.totalCodeExecutions + 1,
							},
							currentDataJson,
						);
						await updateDatabase(
							code,
							currentDataJsonWithupdatedStats,
							clients,
						);
					}
				}
			} catch (error) {
				console.error("Error handling message:", error);
				ws.send("Server error");
			}
		});

		// closeイベントのリスナーを設定
		ws.on("close", async () => {
			clearInterval(pingInterval);
			console.log("disconnected client");
			try {
				const currentData = await sessionDB.get(code);
				if (!currentData) {
					return;
				}
				const currentDataJson: SessionValue = JSON.parse(currentData);
				currentDataJson.clients = currentDataJson.clients.filter(
					(id) => id !== clientId,
				);
				clients.delete(clientId); // マップから削除

				//VMが実行中かつすべてのクライアントが切断された場合、VMを停止する
				console.log(
					currentDataJson.isVMRunning,
					currentDataJson.clients.length,
				);
				if (
					currentDataJson.isVMRunning &&
					currentDataJson.clients.length === 0
				) {
					const result = await StopCodeTest(code, uuid);
					console.log(`${result.message} VM stopped. no clients connected.`);
					currentDataJson.isVMRunning = false;
				}
				await sessionDB.set(code, JSON.stringify(currentDataJson));
			} catch (error) {
				console.error("Error closing connection:", error);
			}
		});
	} catch (error) {
		console.log("Error connecting:", error);
		ws.send("Server error");
		ws.close();
	}
});

// 接続コードを元にUUIDを応答する
wsServer.get("/get/:code", async (req, res) => {
	const code = req.params.code;

	try {
		const value = await sessionDB.get(code).catch(() => null);
		if (!value) {
			res.status(404).send("Session not found");
			return;
		}

		const data: SessionValue = JSON.parse(value);
		if (!data.uuid) {
			res.status(500).send("Session uuid is invalid or not found");
			return;
		}

		res.json({ uuid: data.uuid });
	} catch (error) {
		console.error("Error getting session:", error);
		res.status(500).send("Server error");
	}
});

wsServer.get("/hello", async (req, res) => {
	res.send("hello");
});

function sendToAllClients(session: SessionValue, message?: WSMessage) {
	for (const id of session.clients) {
		if (clients?.has(id)) {
			clients.get(id)?.send(JSON.stringify(message ? message : session));
		}
	}
}

export default websocketserver;