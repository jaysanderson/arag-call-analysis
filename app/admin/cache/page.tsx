import { redirect } from "next/navigation";

/** Kept so existing links, bookmarks and docs do not break after the operator restructure. */
export default function Page() {
  redirect("/admin/usage");
}
