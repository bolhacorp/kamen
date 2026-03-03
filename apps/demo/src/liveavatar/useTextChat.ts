import { useCallback } from "react";
import { useLiveAvatarContext } from "./context";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- mode reserved for future behavior
export const useTextChat = (_mode: "FULL" | "LITE") => {
  const { sessionRef } = useLiveAvatarContext();

  const sendMessage = useCallback(
    async (message: string) => {
      return sessionRef.current.message(message);
    },
    [sessionRef],
  );

  return {
    sendMessage,
  };
};
