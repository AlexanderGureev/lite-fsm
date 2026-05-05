import { StoreInit } from "./StoreInit";

export async function ServerLoad({ children }: React.PropsWithChildren) {
  await new Promise((res) => setTimeout(res, 2000));
  return <StoreInit data={{ id: "user-server" }}>{children}</StoreInit>;
}
