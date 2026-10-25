"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function disconnectAccount(accountId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return { success: false, error: "Unauthorized. Please log in." };
    }

    // Resolve user's workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!workspace) {
      return { success: false, error: "No workspace found." };
    }

    // Delete the social account row belonging to this workspace
    const { error: deleteError } = await supabase
      .from("social_accounts")
      .delete()
      .eq("id", accountId)
      .eq("workspace_id", workspace.id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePath("/connections");
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to disconnect account";
    return { success: false, error: message };
  }
}
