import { redirect } from "next/navigation";
import { WORKSPACE_ROOT_PATH } from "@/lib/rdash/workspace-routes";

export default function Home() {
  redirect(WORKSPACE_ROOT_PATH);
}
