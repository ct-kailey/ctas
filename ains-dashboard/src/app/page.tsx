import { Suspense } from "react";
import "../components/ctds/app-shell.css";
import { RealDashboard, DashboardLoading } from "./RealDashboard";

export default function Page() {
  return <Suspense fallback={<DashboardLoading />}><RealDashboard /></Suspense>;
}
