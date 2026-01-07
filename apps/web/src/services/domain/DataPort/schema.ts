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
    nodeTypes: ReadonlyArray<{
      readonly nodeId: string;
      readonly typeId: string;
      readonly position: string;
      readonly createdAt: number;
    }>;
    tupleTypeRoles: ReadonlyArray<{
      readonly tupleTypeId: string;
      readonly position: number;
      readonly name: string;
      readonly required: boolean;
      readonly createdAt: number;
    }>;
    tupleTypeRoleAllowedTypes: ReadonlyArray<{
      readonly tupleTypeId: string;
      readonly position: number;
      readonly allowedTypeId: string;
      readonly createdAt: number;
    }>;
    tuples: ReadonlyArray<{
      readonly id: string;
      readonly tupleTypeId: string;
      readonly createdAt: number;
    }>;
    tupleMembers: ReadonlyArray<{
      readonly tupleId: string;
      readonly position: number;
      readonly nodeId: string;
    }>;
  };
}
