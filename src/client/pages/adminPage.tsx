import i18next from "i18next";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import SideBar from "../components/Admin/Sidebar.js";
import Dashboard from "../components/Admin/tabs/Dashboard.js";
import Sessions from "../components/Admin/tabs/Sessions.js";
import Settings from "../components/Admin/tabs/Settings.js";
import Tutorials from "../components/Admin/tabs/Tutorials.js";
import Users from "../components/Admin/tabs/Users.js";
import LoginPopup from "../components/loginOverlay/index.js";
import { LanguageToStart } from "../state.js";
import Training from "../components/Admin/tabs/Training.js";

export default function AdminPage() {
	const languageToStart = useAtomValue(LanguageToStart);
	const [showPopup, setShowPopup] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		const storedLanguage = localStorage.getItem("language") || languageToStart;
		i18next.changeLanguage(storedLanguage);
		console.log("languageToStart", storedLanguage);
	}, [languageToStart]);

	useEffect(() => {
		async function fetchAuthInfo() {
			const response = await fetch("/api/auth/session");
			if (response.status === 200) {
				const authInfo = await response.json();
				console.log("authInfo", authInfo.session);
				setIsAuthenticated(true);
				setShowPopup(false);
			} else {
				console.log("auth failed");
				setIsAuthenticated(false);
				setShowPopup(true);
			}
		}
		fetchAuthInfo();
	}, []);

	useEffect(() => {
		localStorage.setItem("language", languageToStart);
		i18next.changeLanguage(languageToStart);
	}, [languageToStart]);

	const [path, setPath] = useState(window.location.pathname.split("/"));

	return (
		<div className="min-h-screen flex flex-col bg-gray-200 text-gray-800">
			{isAuthenticated ? (
				<div className="w-full h-full max-w-[96rem]">
					<div className="h-full flex w-full">
						<SideBar path={path} />
						<div className="w-full h-full max-h-svh overflow-auto p-2 pt-16 md:p-4">
							<Routes>
								<Route path="/" element={<Dashboard />} />
								<Route path="/users" element={<Users />} />
								<Route path="/tutorials" element={<Tutorials />} />
								<Route path="/sessions" element={<Sessions />} />
								<Route path="/settings" element={<Settings />} />
								<Route path="/training" element={<Training />} />
							</Routes>
						</div>
					</div>
				</div>
			) : (
				<LoginPopup
					langToStart={languageToStart}
					isPopupOpen={showPopup}
					message="You need to login to access this page"
				/>
			)}
		</div>
	);
}
