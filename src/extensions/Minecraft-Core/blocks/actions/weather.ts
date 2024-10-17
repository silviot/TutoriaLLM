import { Order, javascriptGenerator } from "blockly/javascript";
export const block = {
	type: "ext_minecraft_change_weather",
	message0: "%{BKY_MINECRAFT_CHANGEWEATHER}",
	args0: [
		{
			type: "field_dropdown",
			name: "WEATHER",
			options: [
				["%{BKY_CLEAR}", "clear"],
				["%{BKY_RAIN}", "rain"],
				["%{BKY_THUNDER}", "thunder"],
			],
		},
	],
	previousStatement: null,
	nextStatement: null,
	colour: "#a855f7",
	tooltip: "",
	helpUrl: "",
};

export function code() {
	javascriptGenerator.forBlock.ext_minecraft_change_weather = (
		block,
		generator,
	) => {
		//dropdown
		const dropdown = block.getFieldValue("WEATHER");
		const code = /* javascript */ `
				function changeWeather() {
				const messageToSend = commandMsg("/weather ${dropdown}");
				wss.send(JSON.stringify(messageToSend));
				}
				changeWeather();
				`;

		return code;
	};
}

export const locale = {
	ja: {
		MINECRAFT_CHANGEWEATHER: "天気を %1 に変更する",
		CLEAR: "晴れ",
		RAIN: "雨",
		THUNDER: "雷",
	},
	en: {
		MINECRAFT_CHANGEWEATHER: "Change weather to %1",
		CLEAR: "Clear",
		RAIN: "Rain",
		THUNDER: "Thunder",
	},
};