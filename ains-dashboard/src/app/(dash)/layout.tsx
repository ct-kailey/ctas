import "../../components/ctds/app-shell.css";
import { DashShell } from "./DashShell";

export default function DashLayout({ children }: LayoutProps<"/">) {
  return <DashShell>{children}</DashShell>;
}
