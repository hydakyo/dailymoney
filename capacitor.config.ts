import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dailymoney.app",
  appName: "Daily Money",
  webDir: "dist",
  plugins: {
    LocalNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"]
    }
  }
};

export default config;
