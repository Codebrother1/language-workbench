declare module "*.woff2?url" {
  const url: string;
  export default url;
}
interface Window {
  workbenchDesktop?: { openDataFolder(): Promise<void> };
}
