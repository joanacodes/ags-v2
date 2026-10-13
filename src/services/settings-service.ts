/**
 * SettingsService — workspace user and report settings.
 */
import workspaceJson from "@/data/workspace.json";
import { delay } from "@/lib/utils";
import type {
  ReportSettings,
  TransitDensityPoint,
  WorkspaceUser,
} from "@/types";

const workspace = workspaceJson as {
  user: WorkspaceUser;
  transitDensity: TransitDensityPoint[];
};

let reportSettings: ReportSettings = {
  includeChartWheel: true,
  technicalAppendix: true,
  aspectTables: false,
  coverPageStyle: "Minimal Dark",
};

export const SettingsService = {
  async getUser(): Promise<WorkspaceUser> {
    await delay(100);
    return workspace.user;
  },

  async getTransitDensity(): Promise<TransitDensityPoint[]> {
    await delay(250);
    return workspace.transitDensity;
  },

  async getReportSettings(): Promise<ReportSettings> {
    await delay(100);
    return reportSettings;
  },

  async updateReportSettings(patch: Partial<ReportSettings>): Promise<ReportSettings> {
    await delay(100);
    reportSettings = { ...reportSettings, ...patch };
    return reportSettings;
  },
};
