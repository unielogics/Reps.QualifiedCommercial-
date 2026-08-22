import { redirect } from "next/navigation";

export default function NewApplicationRedirect() {
  redirect("/?new=1");
}
