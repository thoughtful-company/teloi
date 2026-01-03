export interface ExportData {
  version: 1;
  exportedAt: number;
  data: {
    nodes: ReadonlyArray<{
      readonly id: string;
      readonly createdAt: number;
      readonly modifiedAt: number;
    }>;
    parentLinks: ReadonlyArray<{
      readonly childId: string;
      readonly parentId: string | null;
      readonly position: string;
      readonly isHidden: boolean;
      readonly createdAt: number;
    }>;
    textContent: Record<string, string>;
  };
}
