// banner.js - Scrolling Banner for Mountainside Aces
// Usage: Add <div id="news-banner-container"></div> to your HTML and include this script

// Configuration - Edit these to customize the banner
const BANNER_CONFIG = {
  announcements: [
	{ type: 'announcement', text: 'Biland's Unofficial Cornhole Tournament! 2pm on October 4th. Elks Lodge. BYOBags', className: 'news-announcement' },
      { type: 'announcement', text: '🏆 2025 Fall Playoffs starts November 16th!', className: 'news-announcement' },
      { type: 'announcement', text: '⭐ Remember to clean up all trash after your games!', className: 'news-announcement' }
  ],
  currentSeason: "Fall",
  currentYear: "2025",
  recentGamesCount: 5,
  upcomingGamesCount: 5,
  updateInterval: 5 * 60 * 1000, // 5 minutes in milliseconds
  sticky: true  // Toggle this value!
};

let bannerRecentScores = [];
let bannerUpcomingSchedule = [];
let bannerAllGames = [];

// Initialize banner when DOM is ready
function initBanner() {
  const container = document.getElementById('news-banner-container');
  
  if (!container) {
    console.error('Banner container not found. Add <div id="news-banner-container"></div> to your HTML.');
    return;
  }
  
  // Inject banner HTML
  container.innerHTML = `
    <div class="news-banner">
      <div class="news-content" id="newsContent">
        <span class="news-item news-announcement">Loading league updates...</span>
      </div>
    </div>
  `;
  
  // Inject banner CSS
  injectBannerCSS();
  
  // Load data
  loadBannerData();
  
  // Set up auto-refresh
  setInterval(loadBannerData, BANNER_CONFIG.updateInterval);
  
  // Add scroll listener for fixed positioning
  if (BANNER_CONFIG.sticky) {
    let lastScrollTop = 0;
    window.addEventListener('scroll', function() {
      const banner = document.querySelector('.news-banner');
      if (!banner) return;
      
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      if (scrollTop > 0) {
        banner.classList.add('banner-fixed');
        document.body.classList.add('banner-is-fixed');
      } else {
        banner.classList.remove('banner-fixed');
        document.body.classList.remove('banner-is-fixed');
      }
      
      lastScrollTop = scrollTop;
    });
  }
}

function injectBannerCSS() {
  // Check if styles already injected
  if (document.getElementById('banner-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'banner-styles';
  
  style.textContent = `
    /* Scrolling Banner Styles */
    .news-banner {
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
      color: white;
      overflow: hidden;
      white-space: nowrap;
      position: relative;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border-bottom: 3px solid #c23616;
      width: 100%;
      transition: all 0.3s ease;
    }
    
    /* Simple fixed banner approach */
    .banner-fixed {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 9999 !important;
    }

    body.banner-is-fixed {
      padding-top: 60px; /* Adjust based on banner height */
    }
    
    .news-content {
      display: inline-block;
      padding: 12px 0;
      animation: scroll-left 60s linear infinite;
      font-weight: 600;
      font-size: 1.1rem;
    }
    
    .news-item {
      display: inline-block;
      margin-right: 50px;
      padding: 0 20px;
      position: relative;
    }
    
    .news-item::after {
      content: "•";
      position: absolute;
      right: -25px;
      top: 0;
      color: rgba(255,255,255,0.7);
      font-size: 1.2rem;
    }
    
    .news-item:last-child::after {
      display: none;
    }
    
    .news-announcement {
      color: #ffd700;
      font-weight: bold;
    }
    
    .news-score {
      color: #ffffff;
    }
    
    .news-upcoming {
      color: #87ceeb;
      font-weight: 600;
    }
    
    @keyframes scroll-left {
      0% { transform: translateX(25%); }
      100% { transform: translateX(-100%); }
    }
    
    .news-banner:hover .news-content {
      animation-play-state: paused;
    }
    
    @media (max-width: 768px) {
      .news-content {
        font-size: 1rem;
      }
      
      .news-item {
        margin-right: 30px;
        padding: 0 15px;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// Load all banner data
async function loadBannerData() {
  try {
    const [gamesResponse, previewsResponse] = await Promise.all([
      fetch('games.json'),
      fetch('previews.json')
    ]);
    
    if (gamesResponse.ok) {
      bannerAllGames = await gamesResponse.json();
    }
    
    let previews = [];
    if (previewsResponse.ok) {
      previews = await previewsResponse.json();
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get completed games (past games with winners)
    const completedGames = bannerAllGames
      .filter(game => {
        const gameDate = new Date(game.date);
        return game.year === BANNER_CONFIG.currentYear && 
               game.season === BANNER_CONFIG.currentSeason && 
               game.winner && 
               game.winner.trim() !== "" &&
               gameDate < today;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, BANNER_CONFIG.recentGamesCount);

    bannerRecentScores = completedGames.map(game => {
      const gameResult = formatGameResult(game);
      return {
        type: 'score',
        text: gameResult.text,
        className: 'news-score',
        teamColor: gameResult.teamColor
      };
    });
    
    // Get upcoming games from previews.json
    const upcomingGames = previews
      .filter(game => {
        const gameDate = new Date(game.date);
        return gameDate >= today;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, BANNER_CONFIG.upcomingGamesCount);

    bannerUpcomingSchedule = upcomingGames.map(game => {
      const gameResult = formatUpcomingGame(game);
      return {
        type: 'upcoming',
        text: gameResult.text,
        className: 'news-upcoming',
        teamColor: gameResult.teamColor
      };
    });
    
  } catch (error) {
    console.log('Could not load banner data:', error);
    // Fallback data
    bannerRecentScores = [
      { type: 'score', text: '🏆 Blue defeats Orange 12-8 in thriller!', className: 'news-score', teamColor: 'Blue' }
    ];
    bannerUpcomingSchedule = [
      { type: 'upcoming', text: '📅 Gold @ Silver - Oct 15 7:00 PM', className: 'news-upcoming', teamColor: 'Silver' }
    ];
  }
  
  updateNewsBanner();
}

// Format completed game results (winning score always first)
function formatGameResult(game) {
  const homeTeam = game["home team"];
  const awayTeam = game["away team"];
  const homeScore = game["home score"];
  const awayScore = game["away score"];
  const winner = game.winner;
  
  let scoreText;
  if (homeScore === "W" && awayScore === "L") {
    scoreText = `${homeTeam} defeats ${awayTeam}`;
  } else if (homeScore === "L" && awayScore === "W") {
    scoreText = `${awayTeam} defeats ${homeTeam}`;
  } else if (winner === "Tie") {
    scoreText = `${homeTeam} ties ${awayTeam} ${homeScore}-${awayScore}`;
  } else {
    // Determine winner and format with winning score first
    const winnerTeam = winner;
    const loserTeam = winner === homeTeam ? awayTeam : homeTeam;
    
    // Get winning and losing scores
    let winnerScore, loserScore;
    if (winner === homeTeam) {
      winnerScore = homeScore;
      loserScore = awayScore;
    } else {
      winnerScore = awayScore;
      loserScore = homeScore;
    }
    
    scoreText = `${winnerTeam} defeats ${loserTeam} ${winnerScore}-${loserScore}`;
  }
  
  return { text: `⚾ ${scoreText}`, teamColor: winner };
}

// Format upcoming game schedule
function formatUpcomingGame(game) {
  const homeTeam = game["home team"];
  const awayTeam = game["away team"];
  const gameDate = game.date;
  const gameTime = game.time || "";
  
  // Format the date nicely
  const dateObj = new Date(gameDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
  
  // Only show time if it exists and isn't empty
  const timeDisplay = gameTime && gameTime.trim() !== "" ? ` ${gameTime}` : "";
  
  return { 
    text: `📅 ${awayTeam} @ ${homeTeam} - ${formattedDate}${timeDisplay}`,
    teamColor: homeTeam 
  };
}

// Update the banner display
function updateNewsBanner() {
  const newsContent = document.getElementById('newsContent');
  
  if (!newsContent) return;
  
  const allNews = [...BANNER_CONFIG.announcements, ...bannerRecentScores, ...bannerUpcomingSchedule];
  
  if (allNews.length === 0) {
    newsContent.innerHTML = '<span class="news-item news-announcement">🏆 Welcome to Mountainside Aces Statistics Hub!</span>';
    return;
  }
  
  // Map team names to CSS classes for team colors
  const getTeamClass = (teamName) => {
    if (!teamName) return '';
    return teamName.toLowerCase().replace(/\s+/g, '-');
  };
  
  const newsHTML = allNews.map(item => {
    let teamClass = '';
    if (item.teamColor) {
      teamClass = getTeamClass(item.teamColor);
    }
    return `<span class="news-item ${item.className} ${teamClass}">${item.text}</span>`;
  }).join('');
  
  newsContent.innerHTML = newsHTML;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBanner);
} else {
  initBanner();
}
