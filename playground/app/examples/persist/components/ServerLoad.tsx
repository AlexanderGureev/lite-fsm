export async function ServerLoad({ children }: React.PropsWithChildren) {
  await new Promise((res) => setTimeout(res, 5000));
  return <div>{children}</div>;
}
