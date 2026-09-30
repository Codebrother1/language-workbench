declare module "*.woff2?url" {
  const url: string;
  export default url;
}
interface Window {
  workbenchDesktop?: {
    openDataFolder(): Promise<void>;
    openAIStatus(): Promise<{
      configured: boolean;
      source: "desktop" | "environment" | "removed" | "unavailable" | "none";
      canStore: boolean;
    }>;
    saveOpenAIKey(
      key: string,
    ): Promise<{ configured: boolean; source: string; canStore: boolean }>;
    removeOpenAIKey(): Promise<{
      configured: boolean;
      source: string;
      canStore: boolean;
    }>;
  };
}
