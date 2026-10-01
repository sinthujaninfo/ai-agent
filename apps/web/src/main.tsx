import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ChatPage } from "./pages/ChatPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { RunsPage } from "./pages/RunsPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/p/:projectId" element={<ChatPage />} />
          <Route path="/p/:projectId/approvals" element={<ApprovalsPage />} />
          <Route path="/p/:projectId/docs" element={<DocumentsPage />} />
          <Route path="/p/:projectId/runs" element={<RunsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
