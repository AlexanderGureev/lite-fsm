const playgroundBasePath = process.env.NEXT_PUBLIC_PLAYGROUND_BASE_PATH ?? "";

export const publicAssetPath = (path: `/${string}`) => `${playgroundBasePath}${path}`;
