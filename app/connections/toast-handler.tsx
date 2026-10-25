"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function ConnectionsToastHandler() {
  const searchParams = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      handledRef.current = true;
      if (connected === "meta") {
        toast.success("Successfully connected Facebook & Instagram accounts!");
      } else if (connected === "linkedin") {
        toast.success("Successfully connected LinkedIn account!");
      } else if (connected === "x") {
        toast.success("Successfully connected X account!");
      } else {
        toast.success(`Successfully connected ${connected}!`);
      }
      window.history.replaceState({}, "", "/connections");
    } else if (error) {
      handledRef.current = true;
      toast.error(decodeURIComponent(error));
      window.history.replaceState({}, "", "/connections");
    }
  }, [searchParams]);

  return null;
}
