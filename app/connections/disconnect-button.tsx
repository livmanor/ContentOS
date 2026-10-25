"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { disconnectAccount } from "./actions";

interface DisconnectButtonProps {
  accountId: string;
  displayName: string | null;
}

export function DisconnectButton({
  accountId,
  displayName,
}: DisconnectButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to disconnect ${displayName || "this account"}?`
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const res = await disconnectAccount(accountId);
      if (res.success) {
        toast.success(
          `Disconnected ${displayName || "account"} successfully`
        );
      } else {
        toast.error(res.error || "Failed to disconnect account");
      }
    } catch {
      toast.error("Failed to disconnect account");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
      onClick={handleDisconnect}
      disabled={isDeleting}
    >
      {isDeleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
      ) : (
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
      )}
      <span>Disconnect</span>
    </Button>
  );
}
