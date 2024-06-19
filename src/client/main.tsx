import "./styles/index.css";

import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import EditorPage from "./pages/editorPage";

import "../i18n/client_i18nConfig";
import NotFoundPage from "./pages/404";
import AdminPage from "./pages/adminPage";

export default function App(): React.ReactElement {
  // アプリのページ定義

  return (
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/:code" element={<EditorPage />} />
          <Route path="/" element={<EditorPage />} />
          <Route path="/admin" element={<AdminPage />} />

          <Route path="/*/*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
}
const domNode = document.getElementById("root")!;
const root = createRoot(domNode);
root.render(<App />);
