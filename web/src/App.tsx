import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { HomePage } from "./home/HomePage";
import { ClientRoute, JoinHelp } from "./client/ClientApp";

const LoginPage = lazy(() => import("./presenter/LoginPage"));
const SessionsPage = lazy(() => import("./presenter/SessionsPage"));
const WorkshopPage = lazy(() => import("./presenter/WorkshopPage"));

export function App() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Suspense fallback={<p className="wrap" role="status">Loading…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/app/login" element={<LoginPage />} />
          <Route path="/app" element={<SessionsPage />} />
          <Route path="/app/s/:id" element={<WorkshopPage />} />
          <Route path="/join/:code/:token" element={<ClientRoute />} />
          <Route path="/join/:code" element={<JoinHelp />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
    </>
  );
}
