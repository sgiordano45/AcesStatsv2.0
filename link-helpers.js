/**
 * Helper functions for creating consistent links across the site
 */

/**
 * Create a player link using ID
 * @param {Object} player - Player object with id and name
 * @returns {string} Player page URL
 */
export function createPlayerLink(player) {
  if (!player) return '#';
  
  // Use ID if available (preferred)
  if (player.id || player.playerId) {
    const id = player.id || player.playerId;
    return `player.html?id=${encodeURIComponent(id)}`;
  }
  
  // Fallback to name
  const name = player.name || player.playerName || player.displayName;
  if (name) {
    return `player.html?name=${encodeURIComponent(name)}`;
  }
  
  return '#';
}

/**
 * Create a team link
 * @param {string|Object} team - Team name or team object
 * @returns {string} Team page URL
 */
export function createTeamLink(team) {
  const teamName = typeof team === 'string' ? team : (team?.name || team?.id);
  if (!teamName) return '#';
  return `team.html?team=${encodeURIComponent(teamName)}`;
}
