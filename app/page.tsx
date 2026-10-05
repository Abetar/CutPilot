import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import CutPilotHome from "@/components/CutPilotHome";

export default async function HomePage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return <CutPilotHome />;
}
