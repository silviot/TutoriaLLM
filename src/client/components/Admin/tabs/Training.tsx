import React, { useEffect, useState } from "react";
import type { Guide, TrainingData } from "../../../../server/db/schema.js";
import {
	CalendarClock,
	CheckCircle2,
	Ellipsis,
	MessageCircleQuestion,
	Shuffle,
	Trash2,
	UserRound,
} from "lucide-react";

export default function Training() {
	const [trainingData, setTrainingData] = useState<TrainingData | null>(null);
	const [answer, setAnswer] = useState<string>("");
	const [searchText, setSearchText] = useState<string>("");
	const [searchResult, setSearchResult] = useState<string | Guide[] | null>(
		null,
	);

	const fetchTrainingData = () => {
		console.log("Fetching training data...");
		// Fetch data from the API
		fetch("/api/admin/training/data/random")
			.then((response) => {
				if (response.status === 404) {
					throw new Error("Data not found (404)");
				}
				return response.json();
			})
			.then((data: TrainingData) => {
				if (data?.question && data.answer) {
					console.log("Training data fetched:", data);
					setTrainingData(data);
					setAnswer(data.answer); // Set the initial answer
				} else {
					setTrainingData(null); // No valid data available
				}
			})
			.catch((error) => {
				if (error.message === "Data not found (404)") {
					console.error("Error: Data not found (404)");
				} else {
					console.error("Error fetching training data:", error);
				}
			});
	};

	useEffect(() => {
		fetchTrainingData(); // Initial fetch
	}, []);

	const handleConfirm = () => {
		if (!trainingData) return;

		const updatedData = {
			...trainingData,
			metadata: {
				...trainingData.metadata,
				date: new Date().toISOString(), // Update the date

				//answerが変更された場合、authorを更新
				author:
					answer !== trainingData.answer
						? "AI, Edited by Admin"
						: trainingData.metadata.author,
			},
			answer,
		};

		// Send the updated data to the API
		fetch("/api/admin/training/guide/new", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(updatedData),
		})
			.then((response) => response.json())
			.then((data) => {
				console.log("Data successfully updated:", data);
			})
			.catch((error) => console.error("Error updating training data:", error));

		setTrainingData(null); // Clear the data after confirmation

		// Fetch new data
		fetchTrainingData();
	};

	const handleDelete = () => {
		if (!trainingData) return;

		// Send DELETE request to the API
		fetch(`/api/admin/training/data/${trainingData.id}`, {
			method: "DELETE",
		})
			.then((response) => {
				if (response.ok) {
					console.log("Data successfully deleted");
					setTrainingData(null); // Clear the data after deletion
				} else {
					console.error("Error deleting training data");
				}
			})
			.catch((error) => console.error("Error deleting training data:", error));
	};

	const handleSearch = () => {
		if (!searchText) {
			//検索テキストが空の場合、ガイドのリストを取得
			fetch("/api/admin/training/guide/list")
				.then((response) => {
					if (response.status === 404) {
						throw new Error("Guides not found (404)");
					}
					return response.json();
				})
				.then((result) => {
					setSearchResult(result);
				})
				.catch((error) => {
					if (error.message === "Guides not found (404)") {
						console.error("Error: Guides not found (404)");
					} else {
						console.error("Error fetching guides:", error);
					}
				});
			return;
		}

		// Send search request to the API
		fetch("/api/admin/training/guide/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: searchText }),
		})
			.then((response) => {
				if (response.status === 404) {
					throw new Error("Search results not found (404)");
				}
				return response.json();
			})
			.then((result) => {
				setSearchResult(result);
			})
			.catch((error) => {
				if (error.message === "Search results not found (404)") {
					console.error("Error: Search results not found (404)");
				} else {
					console.error("Error fetching search results:", error);
				}
			});
	};

	const renderSearchResults = () => {
		if (typeof searchResult === "string") {
			return <p>{searchResult}</p>;
		}
		if (Array.isArray(searchResult)) {
			return (
				<div className="max-w-6xl">
					{searchResult.map((result) => (
						<div
							key={result.id}
							className="border border-gray-400 rounded-2xl p-2 mb-2"
						>
							<div className="flex items-center gap-3">
								<span className="rounded-full bg-gray-200 p-3">
									<MessageCircleQuestion />
								</span>
								<h3 className="font-semibold text-lg py-2 px-1 rounded-full text-gray-800">
									#{result.id} {result.question}
								</h3>
							</div>
							<p className="text-gray-600">{result.answer}</p>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3 flex-wrap">
									<div className="flex items-center gap-2 text-gray-600">
										<Ellipsis />
										<span className="gap-0.5">
											<p className="text-xs text-gray-500">Session</p>
											<a href={`/${result.metadata?.sessionCode}`}>
												{result.metadata?.sessionCode}
											</a>
										</span>
									</div>{" "}
									<div className="flex items-center gap-2 text-gray-600">
										<UserRound />
										<span className="gap-0.5">
											<p className="text-xs text-gray-500">Author</p>
											<p> {result.metadata?.author}</p>
										</span>
									</div>
									<div className="flex items-center gap-2 text-gray-600">
										<CalendarClock />
										<span className="gap-0.5">
											<p className="text-xs text-gray-500">Date</p>
											<p>
												{" "}
												{new Date(
													result.metadata?.date as string,
												).toLocaleString()}
											</p>
										</span>
									</div>
								</div>
								<div className="flex items-center gap-3">
									<button
										type="button"
										className="text-red-500"
										onClick={() => {
											// Delete the guide
											fetch(`/api/admin/training/guide/${result.id}`, {
												method: "DELETE",
											})
												.then((response) => {
													if (response.ok) {
														console.log("Guide successfully deleted");
														handleSearch();
													} else {
														console.error("Error deleting guide");
													}
												})
												.catch((error) =>
													console.error("Error deleting guide:", error),
												);
										}}
									>
										Delete
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			);
		}
		return null;
	};

	return (
		<div className="overflow-x-auto">
			<div className="w-full h-full flex flex-col justify-center items-center gap-2 p-2">
				{trainingData ? (
					<div className="max-w-6xl bg-gray-300 rounded-2xl flex flex-col justify-between min-h-96 p-3 gap-3 w-full">
						<h2 className="text-2xl font-bold text-center p-3 border-b border-gray-400">
							Training data
						</h2>
						<div className="flex flex-col gap-2 p-2 grow rounded-2xl">
							<h3 className="text-xl font-semibold">Question</h3>
							<p className="text-lg">{trainingData.question}</p>
						</div>
						<div className="flex flex-col gap-2 p-2 grow rounded-2xl border-2 shadow">
							<h3 className="text-xl font-semibold">Answer</h3>
							<textarea
								className="text-lg rounded-xl p-2"
								value={answer}
								onChange={(e) => setAnswer(e.target.value)}
							/>
						</div>
						<div className="flex items-center justify-center w-full gap-2 p-2">
							<button
								className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-2xl"
								type="button"
								onClick={handleConfirm}
							>
								<CheckCircle2 />
							</button>
							<button
								className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-2xl"
								type="button"
								onClick={handleDelete}
							>
								<Trash2 />
							</button>
							<button
								className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-2xl"
								type="button"
								onClick={fetchTrainingData}
							>
								<Shuffle />
							</button>
						</div>
					</div>
				) : (
					<div className="max-w-6xl bg-gray-300 rounded-2xl flex flex-col justify-center items-center  min-h-96 p-3 gap-3 w-full">
						<p className="text-lg font-bold">利用できるデータがありません。</p>
						<button
							className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-2xl mt-3"
							type="button"
							onClick={fetchTrainingData}
						>
							Shuffle
						</button>
					</div>
				)}

				<h2 className="text-xl font-semibold mt-2">Search knowledge</h2>

				<form
					className="mt-5"
					onSubmit={(e) => {
						e.preventDefault();
						handleSearch();
					}}
				>
					<input
						type="text"
						className="border p-2 rounded-2xl w-80"
						placeholder="Search any question..."
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
					/>
					<button
						className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-2xl ml-2"
						type="button"
						onClick={handleSearch}
					>
						Search
					</button>
				</form>
				<div className="mt-5">{renderSearchResults()}</div>
			</div>
		</div>
	);
}
