export const CONNECTION_PROVIDERS = { slack: 'Slack', discord: 'Discord', google_drive: 'Google Drive', onedrive: 'OneDrive' };
export const normalizeConnectionProvider = value => ['drive', 'gdrive', 'google-drive'].includes(value) ? 'google_drive' : value === 'microsoft' ? 'onedrive' : value;
export const resourceKind = provider => ['google_drive', 'onedrive'].includes(normalizeConnectionProvider(provider)) ? 'folder' : 'channel';
export function matchingConnectors(connectors, connection) {
  if (!connection) return [];
  return (connectors || []).filter(item => item.enabled !== false && normalizeConnectionProvider(item.provider) === normalizeConnectionProvider(connection.provider));
}
export function usableConnectionGrants(grants, source) {
  return (grants || []).filter(grant => grant.usable === true && grant.status === 'active' && (!source || (
    grant.connector_id === source.connector_id && grant.workspace_id === source.workspace_id &&
    normalizeConnectionProvider(grant.provider) === normalizeConnectionProvider(source.provider) &&
    grant.allowed_resources?.some(resource => resource.id === source.external_channel_id)
  )));
}
export function selectedGrantResource(grants, grantId, resourceId) {
  const grant = usableConnectionGrants(grants).find(item => item.id === grantId);
  const resource = grant?.allowed_resources?.find(item => item.id === resourceId);
  return resource ? { grant, resource } : null;
}
export function normalizeGrantResources(resources, provider) {
  const kind = resourceKind(provider), seen = new Set();
  return resources.map(resource => ({ id: resource.id.trim(), label: resource.label.trim(), kind })).filter(resource => {
    if (!resource.id || resource.id.includes('*') || seen.has(resource.id)) return false;
    seen.add(resource.id); return true;
  });
}
