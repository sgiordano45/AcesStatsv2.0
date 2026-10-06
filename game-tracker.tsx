import React, { useState } from 'react';
import { Undo2, Save, PlayCircle } from 'lucide-react';

// This would be imported from data.json in production
const ROSTER_DATA = {
  "Green": [
    { name: "Matt Leonardelli", number: "13", position: "3B" },
    { name: "Ryan Moore", number: "34", position: "IF/OF" },
    { name: "Steve Branosky", number: "6", position: "OF" },
    { name: "Ryan Wistreich", number: "21", position: "OF" },
    { name: "James Tierno", number: "5", position: "1B" },
    { name: "Constantine Rose", number: "1", position: "2B" },
    { name: "Chris Krempecke", number: "9", position: "C" },
    { name: "Bill Dillon", number: "12", position: "IF" },
    { name: "Andrew Streaman", number: "18", position: "IF/OF" },
    { name: "Dennis McCabe", number: "22", position: "P" },
    { name: "Jaffer Shahid", number: "7", position: "OF" },
    { name: "Tom Morea", number: "17", position: "C" },
    { name: "Neil Pirone", number: "3", position: "SS" },
    { name: "Joe Biland", number: "15", position: "IF" }
  ],
  "Gold": [
    { name: "Eddie Paulo", number: "24", position: "OF" },
    { name: "Chase Kennedy", number: "8", position: "1B" },
    { name: "David King", number: "11", position: "IF" },
    { name: "Paul Treyman Jr.", number: "16", position: "IF/OF" },
    { name: "Dan Bartilotti", number: "14", position: "C" },
    { name: "Brian Kirchmer", number: "2", position: "2B" },
    { name: "Ken Lynch", number: "19", position: "IF" },
    { name: "Steve Lazarus", number: "20", position: "OF" },
    { name: "Ricardo Costa", number: "23", position: "3B" },
    { name: "Matt Castaldo", number: "10", position: "SS" },
    { name: "Tim O'Grady", number: "4", position: "P" },
    { name: "Matt Wenger", number: "25", position: "IF/OF" },
    { name: "Garrett Quinn", number: "7", position: "OF" }
  ],
  "Blue": [
    { name: "Mike Patricco", number: "15", position: "1B" },
    { name: "Jeremy Alarva", number: "3", position: "IF/OF" },
    { name: "Evan Shanahan", number: "12", position: "OF" },
    { name: "Matt Miranda", number: "9", position: "SS" },
    { name: "Kevin DelleDonne", number: "5", position: "2B" },
    { name: "Jeff Paszkewicz", number: "21", position: "3B" },
    { name: "Nick Barbera", number: "8", position: "C" },
    { name: "Andrew Yasinski", number: "22", position: "OF" },
    { name: "Tommy Perrotta", number: "14", position: "IF" },
    { name: "Greg Ricciardi", number: "10", position: "IF/OF" },
    { name: "Carlos Cabrera", number: "7", position: "P" },
    { name: "Matt Molski", number: "11", position: "IF" },
    { name: "Jeff McMahon", number: "19", position: "OF" },
    { name: "Al Pineda", number: "4", position: "IF" }
  ],
  "Red": [
    { name: "Dan Clark", number: "6", position: "OF" },
    { name: "Ryan Sztybel", number: "18", position: "1B" },
    { name: "Ryan Peters", number: "11", position: "2B" },
    { name: "Chris Medvecky", number: "15", position: "SS" },
    { name: "Kevin Grady", number: "9", position: "3B" },
    { name: "Matt DeAnna", number: "22", position: "IF/OF" },
    { name: "Rob DiGiacomo", number: "5", position: "C" },
    { name: "Sergio Pereira", number: "12", position: "P" },
    { name: "John McCorkell", number: "7", position: "IF" },
    { name: "Tim Byrne", number: "3", position: "OF" },
    { name: "Alex Faustino", number: "14", position: "IF" },
    { name: "Chris Manna", number: "10", position: "OF" },
    { name: "Tom Ramos", number: "19", position: "IF" }
  ],
  "Carolina": [
    { name: "Dan Woodard", number: "4", position: "IF" },
    { name: "Christopher Uhlick", number: "12", position: "2B" },
    { name: "Bert Villanueva", number: "8", position: "SS" },
    { name: "Joe Clemente", number: "21", position: "3B" },
    { name: "Chris Baldwin", number: "15", position: "1B" },
    { name: "Michael Bowman", number: "6", position: "C" },
    { name: "Adam Nord", number: "9", position: "OF" },
    { name: "John Accardi", number: "11", position: "IF/OF" },
    { name: "Derek Garabedian", number: "5", position: "P" },
    { name: "Francis Mabutas", number: "7", position: "IF" },
    { name: "Richard Sawoszczyk", number: "13", position: "OF" },
    { name: "Doug Caracappa", number: "14", position: "IF" },
    { name: "Terry Gardner", number: "10", position: "OF" }
  ],
  "Black": [
    { name: "Will Klippel", number: "18", position: "1B" },
    { name: "Dan Guyton", number: "5", position: "2B" },
    { name: "Matt Wasserman", number: "12", position: "SS" },
    { name: "Billy Sforza", number: "22", position: "3B" },
    { name: "Ryan Stanek", number: "9", position: "C" },
    { name: "Brian Weber", number: "7", position: "P" },
    { name: "Eric Cantagallo", number: "15", position: "OF" },
    { name: "Giovanni Cerullo", number: "3", position: "IF/OF" },
    { name: "John DeNoble", number: "11", position: "IF" },
    { name: "Casey LaCasse", number: "19", position: "OF" },
    { name: "Erik Lund", number: "6", position: "IF" },
    { name: "Jason Atkins", number: "14", position: "OF" },
    { name: "Stephen Becker", number: "8", position: "IF" }
  ],
  "Orange": [
    { name: "Michael Mondon", number: "21", position: "OF" },
    { name: "Jon Avecillas", number: "7", position: "1B" },
    { name: "Andi Hasaj", number: "12", position: "2B" },
    { name: "Matt Zieser", number: "15", position: "SS" },
    { name: "Adam Corbin", number: "9", position: "3B" },
    { name: "Paul DeMartino", number: "5", position: "C" },
    { name: "Vince Voiro", number: "18", position: "P" },
    { name: "Ryan Young", number: "11", position: "IF/OF" },
    { name: "Max Chanoch", number: "3", position: "IF" },
    { name: "Jon Pease", number: "14", position: "OF" },
    { name: "Kenny Yque", number: "8", position: "IF" },
    { name: "Arthur Shevardnadze", number: "6", position: "OF" },
    { name: "Ahmer Khan", number: "10", position: "IF" }
  ],
  "Silver": [
    { name: "Vasco dos Santos", number: "4", position: "IF" },
    { name: "John Bittner", number: "15", position: "1B" },
    { name: "Matthew Murowski", number: "22", position: "2B" },
    { name: "Varoujan Baboomian", number: "9", position: "SS" },
    { name: "Ben Bakaletz", number: "7", position: "3B" },
    { name: "Coady Brown", number: "11", position: "C" },
    { name: "Christopher Lombardo", number: "8", position: "P" },
    { name: "Victor Nunez", number: "18", position: "OF" },
    { name: "Jack Gordon", number: "12", position: "IF/OF" },
    { name: "Nick Silva", number: "5", position: "IF" },
    { name: "Matt Brown", number: "14", position: "OF" },
    { name: "Phil Abramson", number: "6", position: "IF" },
    { name: "James DeTrolio", number: "10", position: "OF" }
  ],
  "Purple": [
    { name: "Joe Scocozza", number: "15", position: "1B" },
    { name: "Chris Gonzalez", number: "9", position: "2B" },
    { name: "Jeff Chrone", number: "3", position: "SS" },
    { name: "Marvin Aleman", number: "21", position: "3B" },
    { name: "Brian Arrigoni", number: "12", position: "C" },
    { name: "Haner Eugenia", number: "7", position: "P" },
    { name: "Jose Amorim", number: "8", position: "IF/OF" },
    { name: "Jimmy Stafford", number: "18", position: "OF" },
    { name: "Ray Capote", number: "11", position: "IF" },
    { name: "John Ward", number: "5", position: "OF" },
    { name: "Chris Delzotti", number: "14", position: "IF" },
    { name: "Daniel Silva", number: "6", position: "OF" },
    { name: "Jose Aleman", number: "10", position: "IF" }
  ],
  "White": [
    { name: "Dan Zoller", number: "8", position: "SS" },
    { name: "David Desiderio", number: "12", position: "2B" },
    { name: "Alex Silverman", number: "15", position: "3B" },
    { name: "Jai Lakhanpal", number: "9", position: "1B" },
    { name: "Marc Stiffler", number: "11", position: "IF" },
    { name: "Ralph Pombo", number: "45", position: "P" },
    { name: "Al Faella", number: "7", position: "C" },
    { name: "Steve Giordano", number: "54", position: "OF" },
    { name: "Luis Durango", number: "5", position: "IF/OF" },
    { name: "Joe Disporto", number: "14", position: "IF" },
    { name: "Rob Guarneri", number: "6", position: "OF" },
    { name: "Don Rinaldo", number: "10", position: "IF" },
    { name: "Steve Murray", number: "3", position: "OF" }
  ]
};

// This would be filtered from games.json in production
const FALL_2025_GAMES = [
  { date: "9/11/2025", home: "Silver", away: "Green", gameType: "Regular" },
  { date: "9/11/2025", home: "Carolina", away: "Blue", gameType: "Regular" },
  { date: "9/12/2025", home: "Red", away: "Orange", gameType: "Regular" },
  { date: "9/12/2025", home: "White", away: "Purple", gameType: "Regular" },
  { date: "9/14/2025", home: "Purple", away: "Red", gameType: "Regular" },
  { date: "9/14/2025", home: "Green", away: "White", gameType: "Regular" },
  { date: "9/14/2025", home: "Gold", away: "Silver", gameType: "Regular" },
  { date: "9/14/2025", home: "Carolina", away: "Black", gameType: "Regular" },
  { date: "9/14/2025", home: "Orange", away: "Blue", gameType: "Regular" },
  { date: "9/21/2025", home: "Green", away: "Purple", gameType: "Regular" },
  { date: "9/21/2025", home: "Orange", away: "Carolina", gameType: "Regular" },
  { date: "9/21/2025", home: "White", away: "Silver", gameType: "Regular" },
  { date: "9/21/2025", home: "Gold", away: "Red", gameType: "Regular" },
  { date: "9/21/2025", home: "Blue", away: "Black", gameType: "Regular" },
  { date: "9/28/2025", home: "Silver", away: "Black", gameType: "Regular" },
  { date: "9/28/2025", home: "Green", away: "Red", gameType: "Regular" },
  { date: "9/28/2025", home: "White", away: "Orange", gameType: "Regular" },
  { date: "9/28/2025", home: "Purple", away: "Gold", gameType: "Regular" },
  { date: "10/3/2025", home: "Blue", away: "Carolina", gameType: "Regular" },
  { date: "10/5/2025", home: "Purple", away: "White", gameType: "Regular" },
  { date: "10/5/2025", home: "Black", away: "Blue", gameType: "Regular" },
  { date: "10/5/2025", home: "Carolina", away: "Silver", gameType: "Regular" },
  { date: "10/5/2025", home: "Green", away: "Gold", gameType: "Regular" },
  { date: "10/5/2025", home: "Orange", away: "Red", gameType: "Regular" }
];

const PLAY_TYPES = [
  { label: '1B', value: 'single', bases: 1, isHit: true },
  { label: '2B', value: 'double', bases: 2, isHit: true },
  { label: '3B', value: 'triple', bases: 3, isHit: true },
  { label: 'HR', value: 'homerun', bases: 4, isHit: true },
  { label: 'BB', value: 'walk', bases: 1, isHit: false },
  { label: 'K', value: 'strikeout', bases: 0, isOut: true, noAdjust: true },
  { label: 'GO', value: 'groundout', bases: 0, isOut: true },
  { label: 'FO', value: 'flyout', bases: 0, isOut: true },
  { label: 'SF', value: 'sacfly', bases: 0, isOut: true },
  { label: 'FC', value: 'fielders_choice', bases: 0, isOut: false },
  { label: 'E', value: 'error', bases: 0, isOut: false },
  { label: 'DP', value: 'doubleplay', bases: 0, outs: 2 },
];

const GameTracker = () => {
  const [setupMode, setSetupMode] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedGame, setSelectedGame] = useState(null);
  const [isHome, setIsHome] = useState(false);
  
  const [gameState, setGameState] = useState({
    inning: 1,
    outs: 0,
    bases: { first: null, second: null, third: null },
    score: { yourTeam: 0, opponent: 0 },
    currentBatter: 0,
    playHistory: [],
    gameActive: true,
    isYourTeamBatting: true
  });

  const [battingOrder, setBattingOrder] = useState([]);
  const [pendingPlay, setPendingPlay] = useState(null);
  const [tempBases, setTempBases] = useState(null);
  const [tempScore, setTempScore] = useState(0);
  const [tempOuts, setTempOuts] = useState(0);
  const [draggedRunner, setDraggedRunner] = useState(null);

  const handleTeamSelect = (team) => {
    setSelectedTeam(team);
    setSelectedGame(null);
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    const teamIsHome = game.home === selectedTeam;
    setIsHome(teamIsHome);
  };

  const startGame = () => {
    if (!selectedTeam || !selectedGame) return;
    
    const roster = ROSTER_DATA[selectedTeam] || [];
    setBattingOrder(roster);
    
    // Set starting state based on home/away
    setGameState({
      inning: 1,
      outs: 0,
      bases: { first: null, second: null, third: null },
      score: { yourTeam: 0, opponent: 0 },
      currentBatter: 0,
      playHistory: [],
      gameActive: true,
      isYourTeamBatting: !isHome // Away team bats first (top of 1st)
    });
    
    setSetupMode(false);
  };

  const currentBatter = battingOrder[gameState.currentBatter];
  const opponentName = selectedGame ? (isHome ? selectedGame.away : selectedGame.home) : 'Opponent';

  const initiatePlay = (playType) => {
    const play = PLAY_TYPES.find(p => p.value === playType);
    if (!play) return;

    if (play.noAdjust) {
      const newState = { ...gameState };
      newState.outs += 1;

      const playRecord = {
        inning: gameState.inning,
        isYourTeam: gameState.isYourTeamBatting,
        batter: currentBatter.name,
        playType: play.value,
        playLabel: play.label,
        outsBefore: gameState.outs,
        outsAfter: newState.outs,
        basesBefore: { ...gameState.bases },
        basesAfter: { ...gameState.bases },
        runsScored: 0,
        timestamp: Date.now()
      };

      newState.currentBatter = (newState.currentBatter + 1) % battingOrder.length;
      newState.playHistory = [...gameState.playHistory, playRecord];
      setGameState(newState);
      return;
    }

    const newBases = { ...gameState.bases };
    let autoScore = 0;
    let autoOuts = 0;

    if (play.bases === 4) {
      if (newBases.third) autoScore++;
      if (newBases.second) autoScore++;
      if (newBases.first) autoScore++;
      autoScore++;
      newBases.first = null;
      newBases.second = null;
      newBases.third = null;
    } else if (play.bases === 3) {
      if (newBases.third) autoScore++;
      if (newBases.second) autoScore++;
      if (newBases.first) autoScore++;
      newBases.third = currentBatter.name;
      newBases.second = null;
      newBases.first = null;
    } else if (play.bases === 2) {
      if (newBases.third) autoScore++;
      if (newBases.second) autoScore++;
      newBases.third = newBases.first;
      newBases.second = currentBatter.name;
      newBases.first = null;
    } else if (play.bases === 1) {
      const isWalk = play.value === 'walk';
      
      if (isWalk) {
        if (newBases.first) {
          if (newBases.second) {
            if (newBases.third) {
              autoScore++;
              newBases.third = newBases.second;
              newBases.second = newBases.first;
              newBases.first = currentBatter.name;
            } else {
              newBases.third = newBases.second;
              newBases.second = newBases.first;
              newBases.first = currentBatter.name;
            }
          } else {
            const runnerOn3rd = newBases.third;
            newBases.second = newBases.first;
            newBases.first = currentBatter.name;
            newBases.third = runnerOn3rd;
          }
        } else {
          newBases.first = currentBatter.name;
        }
      } else {
        const runnersToMove = [];
        if (newBases.third) runnersToMove.push({ runner: newBases.third, from: 'third' });
        if (newBases.second) runnersToMove.push({ runner: newBases.second, from: 'second' });
        if (newBases.first) runnersToMove.push({ runner: newBases.first, from: 'first' });

        newBases.first = currentBatter.name;
        newBases.second = null;
        newBases.third = null;

        runnersToMove.forEach(({runner, from}) => {
          if (from === 'third') {
            autoScore++;
          } else if (from === 'second') {
            newBases.third = runner;
          } else if (from === 'first') {
            newBases.second = runner;
          }
        });
      }
    } else if (play.isOut) {
      autoOuts = 1;
    } else if (play.outs) {
      autoOuts = play.outs;
    } else if (play.value === 'fielders_choice') {
      newBases.first = currentBatter.name;
    } else if (play.value === 'error') {
      newBases.first = currentBatter.name;
    }

    setTempBases(newBases);
    setTempScore(autoScore);
    setTempOuts(autoOuts);
    setPendingPlay({ play, type: playType });
  };

  const adjustRunner = (base, direction) => {
    const newBases = { ...tempBases };
    const runner = newBases[base];
    
    if (!runner) return;

    newBases[base] = null;

    if (direction === 'advance') {
      if (base === 'first') {
        newBases.second = runner;
      } else if (base === 'second') {
        newBases.third = runner;
      } else if (base === 'third') {
        setTempScore(tempScore + 1);
      }
    } else if (direction === 'back') {
      if (base === 'second') {
        newBases.first = runner;
      } else if (base === 'third') {
        newBases.second = runner;
      }
    }

    setTempBases(newBases);
  };

  const handleDragStart = (base) => {
    setDraggedRunner({ base, runner: tempBases[base] });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (targetBase) => {
    if (!draggedRunner) return;

    const newBases = { ...tempBases };
    newBases[draggedRunner.base] = null;

    if (targetBase === 'home') {
      setTempScore(tempScore + 1);
    } else {
      newBases[targetBase] = draggedRunner.runner;
    }

    setTempBases(newBases);
    setDraggedRunner(null);
  };

  const removeRunner = (base) => {
    const newBases = { ...tempBases };
    newBases[base] = null;
    setTempBases(newBases);
    setTempOuts(tempOuts + 1);
  };

  const confirmPlay = () => {
    if (!pendingPlay) return;

    const newState = { ...gameState };
    const play = pendingPlay.play;

    newState.outs += tempOuts;

    const playRecord = {
      inning: gameState.inning,
      isYourTeam: gameState.isYourTeamBatting,
      batter: currentBatter.name,
      playType: play.value,
      playLabel: play.label,
      outsBefore: gameState.outs,
      outsAfter: newState.outs,
      basesBefore: { ...gameState.bases },
      basesAfter: { ...tempBases },
      runsScored: tempScore,
      timestamp: Date.now()
    };

    newState.bases = tempBases;
    newState.score.yourTeam += tempScore;
    newState.currentBatter = (newState.currentBatter + 1) % battingOrder.length;
    newState.playHistory = [...gameState.playHistory, playRecord];

    setGameState(newState);
    setPendingPlay(null);
    setTempBases(null);
    setTempScore(0);
    setTempOuts(0);
  };

  const cancelPlay = () => {
    setPendingPlay(null);
    setTempBases(null);
    setTempScore(0);
    setTempOuts(0);
  };

  const advanceToNextHalfInning = () => {
    const newState = { ...gameState };
    newState.outs = 0;
    newState.bases = { first: null, second: null, third: null };
    
    if (newState.isYourTeamBatting) {
      newState.isYourTeamBatting = false;
    } else {
      newState.inning += 1;
      newState.isYourTeamBatting = true;
    }
    
    setGameState(newState);
  };

  const undoLastPlay = () => {
    if (gameState.playHistory.length === 0) return;

    const newHistory = [...gameState.playHistory];
    const lastPlay = newHistory.pop();

    const newState = {
      ...gameState,
      bases: { ...lastPlay.basesBefore },
      outs: lastPlay.outsBefore,
      score: {
        ...gameState.score,
        yourTeam: gameState.score.yourTeam - (lastPlay.runsScored || 0)
      },
      playHistory: newHistory
    };

    newState.currentBatter = (newState.currentBatter - 1 + battingOrder.length) % battingOrder.length;

    if (lastPlay.outsBefore >= 3 && gameState.outs === 0) {
      if (gameState.isYourTeamBatting && gameState.inning > 1) {
        newState.inning -= 1;
        newState.isYourTeamBatting = false;
      } else if (!gameState.isYourTeamBatting) {
        newState.isYourTeamBatting = true;
      }
      newState.outs = lastPlay.outsBefore;
    }

    setGameState(newState);
  };

  const endGame = () => {
    setGameState({ ...gameState, gameActive: false });
  };

  const displayBases = pendingPlay ? tempBases : gameState.bases;
  const displayScore = pendingPlay ? tempScore : 0;
  const inningOver = gameState.outs >= 3;

  // Setup screen
  if (setupMode) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for comparison
    
    const availableGames = selectedTeam 
      ? FALL_2025_GAMES.filter(g => {
          const gameDate = new Date(g.date);
          return (g.home === selectedTeam || g.away === selectedTeam) && gameDate >= today;
        })
      : [];

    return (
      <div className="max-w-4xl mx-auto p-8 font-sans">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Game Tracker Setup
          </h1>
          <p className="text-lg text-gray-600">2025 Fall Season</p>
        </div>

        {/* Team Selection */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">1. Select Your Team</h2>
          <select 
            value={selectedTeam}
            onChange={(e) => handleTeamSelect(e.target.value)}
            className="w-full p-4 text-lg border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
          >
            <option value="">Choose a team...</option>
            {Object.keys(ROSTER_DATA).sort().map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>

        {/* Game Selection */}
        {selectedTeam && (
          <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">2. Select Game to Track</h2>
            {availableGames.length === 0 ? (
              <p className="text-gray-600 italic">No games found for {selectedTeam} in Fall 2025</p>
            ) : (
              <div className="space-y-3">
                {availableGames.map((game, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleGameSelect(game)}
                    className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                      selectedGame === game 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-300 hover:border-purple-300 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold text-lg">{game.away}</span>
                        <span className="mx-3 text-gray-500">@</span>
                        <span className="font-bold text-lg">{game.home}</span>
                      </div>
                      <div className="text-gray-600">
                        {new Date(game.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {game.home === selectedTeam ? 'Home Game' : 'Away Game'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Start Button */}
        {selectedTeam && selectedGame && (
          <div className="text-center">
            <button
              onClick={startGame}
              className="px-12 py-5 text-xl font-bold bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-xl hover:from-purple-600 hover:to-purple-800 transition-all shadow-lg"
            >
              Start Game Tracker
            </button>
            <p className="mt-4 text-gray-600">
              Tracking: <strong>{selectedTeam}</strong> vs {opponentName}
              <br />
              <span className="text-sm">({isHome ? 'Home' : 'Away'} team)</span>
            </p>
          </div>
        )}
      </div>
    );
  }

  // Game tracking screen
  return (
    <div className="max-w-6xl mx-auto p-5 font-sans">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Live Game Tracker
        </h1>
        <div className="text-lg text-gray-600">
          {selectedTeam} vs {opponentName}
        </div>
        <div className="text-sm text-gray-500">
          {selectedGame?.date} • {isHome ? 'Home' : 'Away'} Game
        </div>
      </div>

      {/* Game Status Bar */}
      <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white p-5 rounded-xl mb-5 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-sm opacity-90">Inning</div>
          <div className="text-2xl font-bold">
            {gameState.isYourTeamBatting ? '▲' : '▼'} {gameState.inning}
          </div>
          <div className="text-xs opacity-75 mt-1">
            {gameState.isYourTeamBatting ? `${selectedTeam} Batting` : `${opponentName} Batting`}
          </div>
        </div>
        <div>
          <div className="text-sm opacity-90">Outs</div>
          <div className="text-2xl font-bold">{gameState.outs}</div>
        </div>
        <div>
          <div className="text-sm opacity-90">{selectedTeam} Score</div>
          <div className="text-2xl font-bold">
            {gameState.score.yourTeam}
          </div>
        </div>
      </div>

      {/* 3 Outs Notice */}
      {inningOver && gameState.gameActive && !pendingPlay && (
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-6 rounded-xl mb-5 text-center">
          <div className="text-2xl font-bold mb-2">
            3 Outs - Side Retired
          </div>
          {gameState.isYourTeamBatting ? (
            <>
              <div className="text-base mb-2 opacity-95">
                {selectedTeam}'s half inning is complete
              </div>
              <div className="text-sm mb-5 opacity-90 italic">
                Click below when {selectedTeam} is back at bat
              </div>
              <button
                onClick={advanceToNextHalfInning}
                className="px-10 py-4 text-lg font-bold border-none rounded-lg cursor-pointer bg-white text-amber-600 shadow-lg hover:shadow-xl transition-all"
              >
                {opponentName} Now Batting ({isHome ? 'Bottom' : 'Top'} {gameState.inning})
              </button>
            </>
          ) : (
            <>
              <div className="text-base mb-2 opacity-95">
                {opponentName}'s half inning is complete
              </div>
              <div className="text-sm mb-5 opacity-90 italic">
                Click below to start tracking {selectedTeam}'s at-bats
              </div>
              <button
                onClick={advanceToNextHalfInning}
                className="px-10 py-4 text-lg font-bold border-none rounded-lg cursor-pointer bg-white text-amber-600 shadow-lg hover:shadow-xl transition-all"
              >
                {selectedTeam} Now Batting ({isHome ? 'Top' : 'Bottom'} {gameState.inning + 1})
              </button>
            </>
          )}
        </div>
      )}

      {/* Opponent batting notice */}
      {!gameState.isYourTeamBatting && !inningOver && (
        <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-6 mb-5 text-center">
          <div className="text-xl font-bold mb-2 text-blue-900">
            {opponentName} is Batting
          </div>
          <div className="text-base text-blue-800 mb-3">
            No tracking needed - wait for 3 outs
          </div>
          <button
            onClick={advanceToNextHalfInning}
            className="px-8 py-3 text-lg font-bold border-none rounded-lg cursor-pointer bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-lg"
          >
            <PlayCircle size={20} className="inline mr-2" /> Back at Bat
          </button>
        </div>
      )}

      {pendingPlay && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-5 text-center">
          <div className="font-bold mb-1 text-amber-900">
            Adjust Base Runners
          </div>
          <div className="text-sm text-amber-800">
            Use arrows • Drag runners to bases or home • Click X to mark runner out
          </div>
        </div>
      )}

      {gameState.isYourTeamBatting && (
        <>
          {/* Baseball Diamond */}
          <div className={`relative w-full max-w-lg mx-auto mb-8 bg-green-800 rounded-xl p-8 ${pendingPlay ? 'border-4 border-amber-400' : ''} ${inningOver && !pendingPlay ? 'opacity-50' : 'opacity-100'}`}>
            <svg viewBox="0 0 400 400" className="w-full h-auto">
              <polygon 
                points="200,80 320,200 200,320 80,200" 
                fill="#8b4513"
                stroke="#fff"
                strokeWidth="3"
              />
              
              <circle 
                cx="200" 
                cy="320" 
                r="25" 
                fill={draggedRunner ? '#10b981' : '#fff'}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop('home')}
                style={{ cursor: draggedRunner ? 'pointer' : 'default' }}
              />
              <text x="200" y="365" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
                HOME
              </text>

              {['first', 'second', 'third'].map((base, idx) => {
                const positions = {
                  first: { cx: 320, cy: 200, labelY: 165, arrowY: 240, arrow1X: 295, arrow2X: 345, removeY: 225 },
                  second: { cx: 200, cy: 80, labelY: 45, arrowY: 120, arrow1X: 175, arrow2X: 225, removeY: 105 },
                  third: { cx: 80, cy: 200, labelY: 165, arrowY: 240, arrow1X: 55, arrow2X: 105, removeY: 225 }
                };
                const pos = positions[base];
                const baseLabel = base === 'first' ? '1B' : base === 'second' ? '2B' : '3B';

                return (
                  <g key={base}>
                    <circle 
                      cx={pos.cx} 
                      cy={pos.cy} 
                      r="32" 
                      fill={displayBases[base] ? '#fbbf24' : '#fff'} 
                      stroke="#000"
                      strokeWidth="2"
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(base)}
                      style={{ cursor: draggedRunner ? 'pointer' : 'default' }}
                    />
                    <text x={pos.cx} y={pos.labelY} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">
                      {baseLabel}
                    </text>
                    {displayBases[base] && (
                      <g>
                        <text 
                          x={pos.cx} 
                          y={pos.cy + 5} 
                          textAnchor="middle" 
                          fill="#000" 
                          fontSize="11" 
                          fontWeight="bold"
                          style={{ cursor: pendingPlay ? 'move' : 'default' }}
                          draggable={pendingPlay}
                          onDragStart={() => handleDragStart(base)}
                        >
                          {displayBases[base].split(' ').pop()}
                        </text>
                        {pendingPlay && (
                          <>
                            <text 
                              x={pos.arrow1X} y={pos.arrowY} 
                              textAnchor="middle" 
                              fill="#fff" 
                              fontSize="18" 
                              fontWeight="bold"
                              style={{ cursor: 'pointer' }}
                              onClick={() => adjustRunner(base, 'back')}
                            >
                              ◀
                            </text>
                            <text 
                              x={pos.arrow2X} y={pos.arrowY} 
                              textAnchor="middle" 
                              fill="#fff" 
                              fontSize="18" 
                              fontWeight="bold"
                              style={{ cursor: 'pointer' }}
                              onClick={() => adjustRunner(base, 'advance')}
                            >
                              ▶
                            </text>
                            <circle
                              cx={pos.cx}
                              cy={pos.removeY}
                              r="8"
                              fill="#ef4444"
                              style={{ cursor: 'pointer' }}
                              onClick={() => removeRunner(base)}
                            />
                            <text
                              x={pos.cx}
                              y={pos.removeY + 4}
                              textAnchor="middle"
                              fill="white"
                              fontSize="10"
                              fontWeight="bold"
                              style={{ pointerEvents: 'none' }}
                            >
                              X
                            </text>
                          </>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {pendingPlay && (displayScore > 0 || tempOuts > 0) && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3 items-center">
                {displayScore > 0 && (
                  <div className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold">
                    +{displayScore} Run{displayScore > 1 ? 's' : ''}
                  </div>
                )}
                {tempOuts > 0 && (
                  <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">
                    +{tempOuts} Out{tempOuts > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          </div>

          {pendingPlay && (
            <div className="flex gap-3 mb-5 justify-center">
              <button
                onClick={confirmPlay}
                className="px-8 py-4 text-lg font-bold border-none rounded-lg cursor-pointer bg-green-600 text-white flex items-center gap-2 hover:bg-green-700 transition-colors"
              >
                <PlayCircle size={20} /> Confirm Play
              </button>
              <button
                onClick={cancelPlay}
                className="px-8 py-4 text-lg font-bold border-2 border-red-500 rounded-lg cursor-pointer bg-white text-red-500 hover:bg-red-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          <div className={`bg-gray-100 p-5 rounded-xl mb-5 text-center ${inningOver ? 'opacity-40' : 'opacity-100'}`}>
            <div className="text-sm text-gray-600 mb-1">Now Batting</div>
            <div className="text-2xl font-bold text-gray-900">
              #{currentBatter?.number} {currentBatter?.name}
            </div>
            <div className="text-base text-gray-600">{currentBatter?.position}</div>
          </div>

          {gameState.gameActive && !pendingPlay && (
            <div className={`grid grid-cols-4 gap-3 mb-8 ${inningOver ? 'opacity-30 pointer-events-none' : ''}`}>
              {PLAY_TYPES.map(play => (
                <button
                  key={play.value}
                  onClick={() => initiatePlay(play.value)}
                  disabled={inningOver}
                  className={`p-4 text-base font-bold border-none rounded-lg cursor-pointer text-white transition-transform hover:scale-105 ${
                    play.isHit ? 'bg-green-600 hover:bg-green-700' : 
                    play.isOut ? 'bg-red-500 hover:bg-red-600' : 
                    'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {play.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!pendingPlay && (
        <div className="flex gap-3 mb-8 justify-center flex-wrap">
          <button
            onClick={undoLastPlay}
            disabled={gameState.playHistory.length === 0}
            className={`px-6 py-3 border-none rounded-lg flex items-center gap-2 ${
              gameState.playHistory.length === 0 
                ? 'bg-gray-300 cursor-not-allowed opacity-50' 
                : 'bg-gray-600 cursor-pointer hover:bg-gray-700'
            } text-white transition-colors`}
          >
            <Undo2 size={18} /> Undo Last Play
          </button>
          
          {gameState.gameActive && (
            <button
              onClick={endGame}
              className="px-6 py-3 border-none rounded-lg cursor-pointer bg-red-600 text-white flex items-center gap-2 hover:bg-red-700 transition-colors"
            >
              <Save size={18} /> End Game
            </button>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-xl font-bold mb-4">Play-by-Play ({selectedTeam} Only)</h2>
        <div className="max-h-80 overflow-y-auto">
          {gameState.playHistory.length === 0 ? (
            <div className="text-center text-gray-400 py-5">
              No plays recorded yet
            </div>
          ) : (
            gameState.playHistory.slice().reverse().map((play) => (
              <div 
                key={play.timestamp}
                className="p-3 border-b border-gray-100 flex justify-between items-center"
              >
                <div className="flex-1">
                  <span className="font-bold text-purple-600">
                    {play.isYourTeam ? '▲' : '▼'} {play.inning}
                  </span>
                  {' • '}
                  <span className="font-bold">{play.batter}</span>
                  {' - '}
                  <span className={`px-2 py-1 rounded text-sm font-bold ${
                    PLAY_TYPES.find(p => p.value === play.playType)?.isHit ? 'bg-green-100 text-green-800' : 
                    PLAY_TYPES.find(p => p.value === play.playType)?.isOut ? 'bg-red-100 text-red-800' : 
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {play.playLabel}
                  </span>
                  {play.runsScored > 0 && (
                    <span className="ml-2 text-green-600 font-bold">
                      +{play.runsScored} run{play.runsScored > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default GameTracker;