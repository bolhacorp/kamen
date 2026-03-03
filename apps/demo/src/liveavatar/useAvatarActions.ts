import { useCallback } from "react";
import { useLiveAvatarContext } from "./context";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- mode reserved for future behavior
export const useAvatarActions = (_mode: "FULL" | "LITE") => {
  const { sessionRef } = useLiveAvatarContext();

  const interrupt = useCallback(() => {
    return sessionRef.current.interrupt();
  }, [sessionRef]);

  const repeat = useCallback(
    async (message: string) => {
      return sessionRef.current.repeat(message);
    },
    [sessionRef],
  );

  const startListening = useCallback(() => {
    return sessionRef.current.startListening();
  }, [sessionRef]);

  const stopListening = useCallback(() => {
    return sessionRef.current.stopListening();
  }, [sessionRef]);

  return {
    interrupt,
    repeat,
    startListening,
    stopListening,
  };
};
