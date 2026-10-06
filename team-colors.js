// TEAM COLORS - Enhanced Version with All Formatting Options (v2.2)
(function() {
  // Create CSS styles
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --team-black: #1a1a1a; --team-green: #2d7d32; --team-red: #d32f2f;
      --team-blue: #1976d2; --team-white: #343a40; --team-orange: #f57c00;
      --team-silver: #757575; --team-purple: #7b1fa2; --team-gold: #CFB53B;
      --team-carolina: #4b9cd3; --team-army: #654321; --team-teal: #008080;
    }
    
    /* span[data-team] inside links: reset so team-text-* !important takes effect */
    a span[data-team] { color: var(--text-dark, #333); text-decoration: none; }
    
    /* Text colors - for inline team names */
    .team-text-black { color: var(--team-black) !important; font-weight: 600 !important; }
    .team-text-green { color: var(--team-green) !important; font-weight: 600 !important; }
    .team-text-red { color: var(--team-red) !important; font-weight: 600 !important; }
    .team-text-blue { color: var(--team-blue) !important; font-weight: 600 !important; }
    .team-text-white { color: var(--team-white) !important; font-weight: 600 !important; text-shadow: 1px 1px 2px rgba(255,255,255,0.8); }
    .team-text-orange { color: var(--team-orange) !important; font-weight: 600 !important; }
    .team-text-silver { color: var(--team-silver) !important; font-weight: 600 !important; }
    .team-text-purple { color: var(--team-purple) !important; font-weight: 600 !important; }
    .team-text-gold { color: var(--team-gold) !important; font-weight: 600 !important; }
    .team-text-carolina { color: var(--team-carolina) !important; font-weight: 600 !important; }
    .team-text-army { color: var(--team-army) !important; font-weight: 600 !important; }
    .team-text-teal { color: var(--team-teal) !important; font-weight: 600 !important; }
    
    /* Badge styles - for tags and labels */
    .team-badge-black { background: var(--team-black) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-green { background: var(--team-green) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-red { background: var(--team-red) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-blue { background: var(--team-blue) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-white { background: white !important; color: var(--team-white) !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; border: 2px solid var(--team-white); }
    .team-badge-orange { background: var(--team-orange) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-silver { background: var(--team-silver) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-purple { background: var(--team-purple) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-gold { background: var(--team-gold) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-carolina { background: var(--team-carolina) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-army { background: var(--team-army) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .team-badge-teal { background: var(--team-teal) !important; color: white !important; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    
    /* Primary colors - for headers, buttons, highlights */
    .team-primary-black { background: var(--team-black) !important; color: white !important; }
    .team-primary-green { background: var(--team-green) !important; color: white !important; }
    .team-primary-red { background: var(--team-red) !important; color: white !important; }
    .team-primary-blue { background: var(--team-blue) !important; color: white !important; }
    .team-primary-white { background: white !important; color: var(--team-white) !important; border: 2px solid var(--team-white) !important; box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important; }
    .team-primary-orange { background: var(--team-orange) !important; color: white !important; }
    .team-primary-silver { background: var(--team-silver) !important; color: white !important; }
    .team-primary-purple { background: var(--team-purple) !important; color: white !important; }
    .team-primary-gold { background: var(--team-gold) !important; color: white !important; }
    .team-primary-carolina { background: var(--team-carolina) !important; color: white !important; }
    .team-primary-army { background: var(--team-army) !important; color: white !important; }
    .team-primary-teal { background: var(--team-teal) !important; color: white !important; }
    
    /* Light backgrounds - for content sections */
    .team-light-black { background: #f5f5f5 !important; color: var(--team-black) !important; border-left: 4px solid var(--team-black) !important; }
    .team-light-green { background: #e8f5e8 !important; color: #1b5e20 !important; border-left: 4px solid var(--team-green) !important; }
    .team-light-red { background: #ffebee !important; color: #b71c1c !important; border-left: 4px solid var(--team-red) !important; }
    .team-light-blue { background: #e3f2fd !important; color: #0d47a1 !important; border-left: 4px solid var(--team-blue) !important; }
    .team-light-white { background: #f8f9fa !important; color: #212529 !important; border-left: 4px solid var(--team-white) !important; border: 1px solid #e9ecef !important; }
    .team-light-orange { background: #fff3e0 !important; color: #e65100 !important; border-left: 4px solid var(--team-orange) !important; }
    .team-light-silver { background: #f5f5f5 !important; color: #424242 !important; border-left: 4px solid var(--team-silver) !important; }
    .team-light-purple { background: #f3e5f5 !important; color: #4a148c !important; border-left: 4px solid var(--team-purple) !important; }
    .team-light-gold { background: #faf8e8 !important; color: #8b7e2b !important; border-left: 4px solid var(--team-gold) !important; }
    .team-light-carolina { background: #e6f3ff !important; color: #1e3a5f !important; border-left: 4px solid var(--team-carolina) !important; }
    .team-light-army { background: #f0ebda !important; color: #3d2914 !important; border-left: 4px solid var(--team-army) !important; }
    .team-light-teal { background: #e0f2f1 !important; color: #004d40 !important; border-left: 4px solid var(--team-teal) !important; }
  `;
  
  // Add CSS to page
  document.head.appendChild(style);
  
  function applyTeamColors() {
    const teams = {
      'black': 'team-text-black', 
      'green': 'team-text-green', 
      'red': 'team-text-red',
      'blue': 'team-text-blue', 
      'white': 'team-text-white', 
      'orange': 'team-text-orange',
      'silver': 'team-text-silver', 
      'purple': 'team-text-purple', 
      'gold': 'team-text-gold',
      'carolina': 'team-text-carolina', 
      'army': 'team-text-army',
      'teal': 'team-text-teal'
    };
    
    let styledCount = 0;

    // ── Explicitly-tagged elements via data-team attribute ──
    // Matches any color keyword found within the full team name value
    // e.g. data-team="Aces White" → matches "white", data-team="Green" → matches "green"
    document.querySelectorAll('[data-team]').forEach(element => {
      const teamValue = element.dataset.team.toLowerCase().trim();
      const matchedColor = Object.keys(teams).find(color => {
        // Match: exact, or color appears as a whole word within the team name
        return teamValue === color || new RegExp('\\b' + color + '\\b').test(teamValue);
      });
      if (matchedColor) {
        element.classList.add(teams[matchedColor]);
        styledCount++;
      }
    });
    
    // Search all text elements for automatic text coloring
    document.querySelectorAll('*').forEach(element => {
      const text = element.textContent || '';
      if (!text || text.length > 100 || element.children.length > 0) return;
      
      Object.keys(teams).forEach(team => {
        const teamName = team.charAt(0).toUpperCase() + team.slice(1);
        const patterns = [
          new RegExp('\\b' + teamName + '\\b', 'g'),
          new RegExp('\\bAces ' + teamName + '\\b', 'g'),
          new RegExp('\\b' + teamName + ' Aces\\b', 'g'),
        ];
        
        patterns.forEach(pattern => {
          if (pattern.test(text)) {
            element.classList.add(teams[team]);
            styledCount++;
          }
        });
      });
    });
    
    // Style table cells specifically
    document.querySelectorAll('td, th').forEach(cell => {
      const text = cell.textContent.trim().toLowerCase();
      Object.keys(teams).forEach(team => {
        if (text === team || text === 'aces ' + team || text === team + ' aces') {
          cell.classList.add(teams[team]);
          styledCount++;
        }
      });
    });
    
    // Auto-apply primary colors to headers containing team names
    document.querySelectorAll('h1, h2, h3, h4').forEach(header => {
      const text = header.textContent.toLowerCase();
      Object.keys(teams).forEach(team => {
        if (text.includes(team + ' team') || text.includes('aces ' + team) || text.includes(team + ' aces')) {
          header.classList.add('team-primary-' + team);
          styledCount++;
        }
      });
    });
    
    // Auto-apply light backgrounds to sections with team-specific content
    document.querySelectorAll('.section, .card, .team-section').forEach(section => {
      const text = section.textContent.toLowerCase();
      Object.keys(teams).forEach(team => {
        // Only apply if section is clearly about one specific team
        const teamMentions = (text.match(new RegExp(team, 'g')) || []).length;
        const totalWords = text.split(' ').length;
        
        // If team is mentioned frequently relative to content size, apply light background
        if (teamMentions > 2 && teamMentions / totalWords > 0.02) {
          section.classList.add('team-light-' + team);
          styledCount++;
        }
      });
    });
    
    if (styledCount > 0) {
      console.log('Applied team colors to ' + styledCount + ' elements');
    }
  }
  
  // Helper functions for manual application
  window.applyTeamStyle = function(element, teamName, variant = 'text') {
    if (!element || !teamName) return;
    
    const team = teamName.toLowerCase().trim();
    const validTeams = ['black', 'green', 'red', 'blue', 'white', 'orange', 'silver', 'purple', 'gold', 'carolina', 'army', 'teal'];
    
    if (!validTeams.includes(team)) {
      console.warn('Unknown team:', team);
      return;
    }
    
    // Remove any existing team classes
    element.classList.forEach(cls => {
      if (cls.startsWith('team-')) {
        element.classList.remove(cls);
      }
    });
    
    // Apply new class based on variant
    let className;
    switch(variant) {
      case 'text':
        className = 'team-text-' + team;
        break;
      case 'badge':
        className = 'team-badge-' + team;
        break;
      case 'primary':
        className = 'team-primary-' + team;
        break;
      case 'light':
        className = 'team-light-' + team;
        break;
      default:
        className = 'team-text-' + team;
    }
    
    element.classList.add(className);
    console.log('Applied', className, 'to element');
  };
  
  // Apply colors when page loads
  document.addEventListener('DOMContentLoaded', applyTeamColors);
  setTimeout(applyTeamColors, 1000);
  setTimeout(applyTeamColors, 3000);
  
  // Make functions available globally for testing and manual use
  window.applyTeamColors = applyTeamColors;
})();