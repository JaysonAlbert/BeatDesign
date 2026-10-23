export type OrganizationView =
  | 'create'
  | 'group'
  | 'arrange'
  | 'display'
  | 'references'
  | 'move'
  | 'templates'
  | 'usage'
  | 'locate';
export type OrganizationRequest = {
  view: OrganizationView;
  cardIds: string[];
  groupId?: string;
};
export const ORGANIZATION_ACTION = 'beatcanvas:organization-action';
export function openCanvasOrganization(request: OrganizationRequest) {
  window.dispatchEvent(
    new CustomEvent(ORGANIZATION_ACTION, { detail: request })
  );
}

export type ProjectReferenceAsset = {
  id: string;
  filename?: string;
  type: string;
  publicUrl: string;
  width?: number | null;
  height?: number | null;
};
