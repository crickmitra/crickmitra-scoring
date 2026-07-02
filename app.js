// CrickMitra Cricket Scoring Application JavaScript
// Handles state management, UI rendering, local sync, and undo/redo operations.

const SYNC_CHANNEL = 'crickmitra_match';
let broadcastChannel;

try {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL);
} catch (e) {
    console.warn('BroadcastChannel not supported. Cross-tab sync will use localStorage events only.', e);
}

// Initial state template
const getInitialState = () => ({
    matchSetup: {
        team1Name: 'Team A',
        team2Name: 'Team B',
        maxOvers: 20,
        tossWinner: 'Team A',
        tossDecision: 'bat',
        team1Players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8', 'Player 9', 'Player 10', 'Player 11'],
        team2Players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8', 'Player 9', 'Player 10', 'Player 11']
    },
    setupComplete: false,
    innings: 1, // 1 or 2
    currentBattingTeam: 'Team A',
    currentBowlingTeam: 'Team B',
    
    // Innings 1 State
    inn1: {
        totalRuns: 0,
        wickets: 0,
        ballsBowled: 0,
        extras: { wide: 0, noball: 0, bye: 0, legbye: 0 },
        battingCard: [],
        bowlingCard: [],
        fallOfWickets: [],
        commentary: [],
        thisOverBalls: [],
        partnership: { runs: 0, balls: 0 }
    },

    // Innings 2 State
    inn2: {
        totalRuns: 0,
        wickets: 0,
        ballsBowled: 0,
        extras: { wide: 0, noball: 0, bye: 0, legbye: 0 },
        battingCard: [],
        bowlingCard: [],
        fallOfWickets: [],
        commentary: [],
        thisOverBalls: [],
        partnership: { runs: 0, balls: 0 }
    },

    target: null, // Runs required to win (inn1.totalRuns + 1)
    strikerIndex: 0,     // Index in battingCard
    nonStrikerIndex: 1,  // Index in battingCard
    currentBowlerIndex: 0, // Index in bowlingCard
    matchEnded: false,
    matchResult: '',
    isChromaMode: 'green', // green, blue, trans (for stream overlay)
    overlayTheme: 'default' // default, carbon, classic, glass, neon
});

// App State
let state = getInitialState();
let undoStack = [];
let redoStack = [];

// Helper to get active innings state
function getActiveInnings() {
    return state.innings === 1 ? state.inn1 : state.inn2;
}

// Push state to undo stack
function pushToUndo() {
    undoStack.push(JSON.stringify(state));
    redoStack = []; // Clear redo on new action
    if (undoStack.length > 50) undoStack.shift(); // Limit size
}

let overlayWindow = null;
let fullscreenWindow = null;
let stadiumWindow = null;
let viewerWindow = null;

function openOverlayPopup() {
    overlayWindow = window.open('overlay.html', 'CrickMitraOverlay', 'width=1920,height=1080');
    setTimeout(() => {
        if (overlayWindow && typeof overlayWindow.updateFromParent === 'function') {
            overlayWindow.updateFromParent(state);
        }
    }, 600);
}

function openFullscreenPopup() {
    fullscreenWindow = window.open('fullscreen.html', 'CrickMitraFullscreen', 'width=1200,height=800');
    setTimeout(() => {
        if (fullscreenWindow && typeof fullscreenWindow.updateFromParent === 'function') {
            fullscreenWindow.updateFromParent(state);
        }
    }, 600);
}

function openStadiumPopup() {
    stadiumWindow = window.open('stadium.html', 'CrickMitraStadium', 'width=1280,height=720');
    setTimeout(() => {
        if (stadiumWindow && typeof stadiumWindow.updateFromParent === 'function') {
            stadiumWindow.updateFromParent(state);
        }
    }, 600);
}

function openViewerPopup() {
    viewerWindow = window.open('viewer.html', 'CrickMitraViewer', 'width=450,height=800');
    setTimeout(() => {
        if (viewerWindow && typeof viewerWindow.updateFromParent === 'function') {
            viewerWindow.updateFromParent(state);
        }
    }, 600);
}

// Change Overlay Theme from Scorer Dashboard
function changeOverlayTheme(themeName) {
    state.overlayTheme = themeName;
    saveAndSync();
}

// Save state and notify other tabs
function saveAndSync() {
    localStorage.setItem('crickmitra_match_state', JSON.stringify(state));
    if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'STATE_UPDATE', state });
    }
    
    // Direct API POST call (for OBS Studio CEF cross-process sync)
    fetch('http://127.0.0.1:8000/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
    }).catch(err => {
        // Fail silently when local server is not running
    });
    
    // Real-time synchronization to opened popup windows
    if (overlayWindow && !overlayWindow.closed) {
        try {
            if (typeof overlayWindow.updateFromParent === 'function') {
                overlayWindow.updateFromParent(state);
            }
        } catch (e) {
            console.warn('Direct popup update failed:', e);
        }
    }
    
    if (fullscreenWindow && !fullscreenWindow.closed) {
        try {
            if (typeof fullscreenWindow.updateFromParent === 'function') {
                fullscreenWindow.updateFromParent(state);
            }
        } catch (e) {
            console.warn('Direct popup update failed:', e);
        }
    }

    if (stadiumWindow && !stadiumWindow.closed) {
        try {
            if (typeof stadiumWindow.updateFromParent === 'function') {
                stadiumWindow.updateFromParent(state);
            }
        } catch (e) {
            console.warn('Direct popup update failed:', e);
        }
    }

    if (viewerWindow && !viewerWindow.closed) {
        try {
            if (typeof viewerWindow.updateFromParent === 'function') {
                viewerWindow.updateFromParent(state);
            }
        } catch (e) {
            console.warn('Direct popup update failed:', e);
        }
    }
}

// Initialize setup cards when setup is complete
function initializeInningsData() {
    const isTeam1Batting = state.currentBattingTeam === state.matchSetup.team1Name;
    const battingPlayers = isTeam1Batting ? state.matchSetup.team1Players : state.matchSetup.team2Players;
    const bowlingPlayers = isTeam1Batting ? state.matchSetup.team2Players : state.matchSetup.team1Players;

    const battingCard = battingPlayers.map((name, index) => ({
        name,
        status: index < 2 ? 'Not Out' : 'DNB', // First 2 are starting batsmen
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0
    }));

    const bowlingCard = bowlingPlayers.map(name => ({
        name,
        overs: 0,
        balls: 0,
        maidens: 0,
        runs: 0,
        wickets: 0
    }));

    const inn = getActiveInnings();
    inn.battingCard = battingCard;
    inn.bowlingCard = bowlingCard;
    state.strikerIndex = 0;
    state.nonStrikerIndex = 1;
    state.currentBowlerIndex = 0;
}

// Format balls to overs string (e.g. 17 balls -> "2.5")
function formatOvers(balls) {
    const overs = Math.floor(balls / 6);
    const remainingBalls = balls % 6;
    return `${overs}.${remainingBalls}`;
}

// Add runs to score
function addRuns(runValue) {
    if (state.matchEnded || !state.setupComplete) return;
    pushToUndo();

    const inn = getActiveInnings();
    const striker = inn.battingCard[state.strikerIndex];
    const bowler = inn.bowlingCard[state.currentBowlerIndex];

    // Update Match Score
    inn.totalRuns += runValue;
    inn.ballsBowled += 1;

    // Update Partnership
    if (!inn.partnership) inn.partnership = { runs: 0, balls: 0 };
    inn.partnership.runs += runValue;
    inn.partnership.balls += 1;

    // Update Batter Stats
    if (striker) {
        striker.runs += runValue;
        striker.balls += 1;
        if (runValue === 4) striker.fours += 1;
        if (runValue === 6) striker.sixes += 1;
    }

    // Update Bowler Stats
    if (bowler) {
        bowler.balls += 1;
        bowler.runs += runValue;
        
        // Update bowler overs count
        const bowlerOvers = Math.floor(bowler.balls / 6);
        const bowlerRemBalls = bowler.balls % 6;
        bowler.overs = `${bowlerOvers}.${bowlerRemBalls}`;
    }

    // Update Over timeline
    inn.thisOverBalls.push({ type: 'run', val: runValue });

    // Generate commentary
    const overStr = formatOvers(inn.ballsBowled);
    const batterName = striker ? striker.name : 'Batsman';
    const bowlerName = bowler ? bowler.name : 'Bowler';
    const runText = runValue === 0 ? 'no run' : `${runValue} run${runValue > 1 ? 's' : ''}`;
    inn.commentary.unshift({
        over: overStr,
        text: `${bowlerName} to ${batterName}, ${runValue === 4 ? 'FOUR!' : runValue === 6 ? 'SIX!' : runText}`,
        type: runValue === 4 ? 'four' : runValue === 6 ? 'six' : 'normal'
    });

    // Check Strike Rotate (odd runs swap strike)
    if (runValue % 2 !== 0) {
        swapStrike();
    }

    // Check Over Complete
    checkOverComplete();
    
    // Check Match Win Condition
    checkMatchStatus();
    
    saveAndSync();
    updateUI();
}

// Add extras (Wide, No Ball, Bye, Leg Bye)
function addExtra(type, runValue = 0) {
    if (state.matchEnded || !state.setupComplete) return;
    pushToUndo();

    const inn = getActiveInnings();
    const striker = inn.battingCard[state.strikerIndex];
    const bowler = inn.bowlingCard[state.currentBowlerIndex];

    if (type === 'WD') {
        // Wide: 1 run to extras, does not count as a ball in the over
        inn.totalRuns += 1 + runValue;
        inn.extras.wide += 1 + runValue;
        if (bowler) bowler.runs += 1 + runValue;
        inn.thisOverBalls.push({ type: 'wide', val: `Wd${runValue > 0 ? '+' + runValue : ''}` });

        // Update Partnership
        if (!inn.partnership) inn.partnership = { runs: 0, balls: 0 };
        inn.partnership.runs += 1 + runValue;

        // Wide runs can cause strike rotation if they run odd runs
        if (runValue % 2 !== 0) {
            swapStrike();
        }

        const overStr = formatOvers(inn.ballsBowled);
        inn.commentary.unshift({
            over: overStr,
            text: `${bowler ? bowler.name : 'Bowler'} bowls a WIDE. ${runValue > 0 ? '+' + runValue + ' runs' : ''}`,
            type: 'extra'
        });

    } else if (type === 'NB') {
        // No Ball: 1 run to extras, does not count as a ball in the over. Batter gets runs if hit, otherwise team gets extras.
        inn.totalRuns += 1 + runValue;
        inn.extras.noball += 1;
        if (bowler) bowler.runs += 1 + runValue;
        
        // If runValue > 0, it means batsman hit it (noball + batsman runs) or bye runs.
        // Let's assume for simplicity: runValue is credited to batsman runs
        if (striker && runValue > 0) {
            striker.runs += runValue;
            striker.balls += 1; // standard: counts as faced ball
        }
        
        inn.thisOverBalls.push({ type: 'noball', val: `Nb${runValue > 0 ? '+' + runValue : ''}` });
        
        // Update Partnership
        if (!inn.partnership) inn.partnership = { runs: 0, balls: 0 };
        inn.partnership.runs += 1 + runValue;
        if (runValue > 0) inn.partnership.balls += 1;

        if (runValue % 2 !== 0) {
            swapStrike();
        }

        const overStr = formatOvers(inn.ballsBowled);
        inn.commentary.unshift({
            over: overStr,
            text: `${bowler ? bowler.name : 'Bowler'} bowls a NO BALL. ${runValue > 0 ? striker.name + ' scores ' + runValue : ''}`,
            type: 'extra'
        });

    } else if (type === 'BYE') {
        // Bye: counts as a ball, does not go to batsman, goes to extras, bowler does NOT get runs conceded
        inn.totalRuns += runValue;
        inn.ballsBowled += 1;
        inn.extras.bye += runValue;
        
        if (striker) striker.balls += 1;
        if (bowler) {
            bowler.balls += 1;
            const bowlerOvers = Math.floor(bowler.balls / 6);
            const bowlerRemBalls = bowler.balls % 6;
            bowler.overs = `${bowlerOvers}.${bowlerRemBalls}`;
        }

        inn.thisOverBalls.push({ type: 'bye', val: `${runValue}B` });

        // Update Partnership
        if (!inn.partnership) inn.partnership = { runs: 0, balls: 0 };
        inn.partnership.runs += runValue;
        inn.partnership.balls += 1;

        if (runValue % 2 !== 0) {
            swapStrike();
        }

        const overStr = formatOvers(inn.ballsBowled);
        inn.commentary.unshift({
            over: overStr,
            text: `${bowler ? bowler.name : 'Bowler'} to ${striker ? striker.name : 'Batsman'}, BYE (${runValue} run${runValue > 1 ? 's' : ''})`,
            type: 'extra'
        });

        checkOverComplete();

    } else if (type === 'LB') {
        // Leg Bye: counts as a ball, does not go to batsman, goes to extras, bowler does NOT get runs conceded
        inn.totalRuns += runValue;
        inn.ballsBowled += 1;
        inn.extras.legbye += runValue;
        
        if (striker) striker.balls += 1;
        if (bowler) {
            bowler.balls += 1;
            const bowlerOvers = Math.floor(bowler.balls / 6);
            const bowlerRemBalls = bowler.balls % 6;
            bowler.overs = `${bowlerOvers}.${bowlerRemBalls}`;
        }

        inn.thisOverBalls.push({ type: 'legbye', val: `${runValue}LB` });

        // Update Partnership
        if (!inn.partnership) inn.partnership = { runs: 0, balls: 0 };
        inn.partnership.runs += runValue;
        inn.partnership.balls += 1;

        if (runValue % 2 !== 0) {
            swapStrike();
        }

        const overStr = formatOvers(inn.ballsBowled);
        inn.commentary.unshift({
            over: overStr,
            text: `${bowler ? bowler.name : 'Bowler'} to ${striker ? striker.name : 'Batsman'}, LEG BYE (${runValue} run${runValue > 1 ? 's' : ''})`,
            type: 'extra'
        });

        checkOverComplete();
    }

    checkMatchStatus();
    saveAndSync();
    updateUI();
}

// Swaps the active striker and non-striker
function swapStrike() {
    const temp = state.strikerIndex;
    state.strikerIndex = state.nonStrikerIndex;
    state.nonStrikerIndex = temp;
}

// Handles wicket fall
function handleWicket(type) {
    if (state.matchEnded || !state.setupComplete) return;
    pushToUndo();

    const inn = getActiveInnings();
    const striker = inn.battingCard[state.strikerIndex];
    const bowler = inn.bowlingCard[state.currentBowlerIndex];

    // Mark batsman out
    if (striker) {
        striker.status = `Out (${type})`;
        striker.balls += 1;
    }

    // Update bowler wickets
    if (bowler && type !== 'Run Out') {
        bowler.wickets += 1;
    }
    
    if (bowler) {
        bowler.balls += 1;
        const bowlerOvers = Math.floor(bowler.balls / 6);
        const bowlerRemBalls = bowler.balls % 6;
        bowler.overs = `${bowlerOvers}.${bowlerRemBalls}`;
    }

    inn.wickets += 1;
    inn.ballsBowled += 1;
    inn.thisOverBalls.push({ type: 'wicket', val: 'W' });
    inn.partnership = { runs: 0, balls: 0 };

    // Fall of wicket details
    const overStr = formatOvers(inn.ballsBowled);
    inn.fallOfWickets.push({
        score: inn.totalRuns,
        wickets: inn.wickets,
        over: overStr,
        batsman: striker ? striker.name : 'Batsman'
    });

    inn.commentary.unshift({
        over: overStr,
        text: `OUT! ${striker ? striker.name : 'Batsman'} is ${type.toLowerCase()}. Bowler: ${bowler ? bowler.name : 'Bowler'}`,
        type: 'out'
    });

    saveAndSync();
    updateUI();

    // Check if innings/match is over
    if (inn.wickets >= 10 || (inn.battingCard.filter(b => b.status === 'DNB').length === 0)) {
        // No batsmen left, end innings
        endInnings();
    } else {
        // Show new batsman select modal
        showNewBatsmanModal();
    }
}

// Show new batsman selection modal
function showNewBatsmanModal() {
    const modal = document.getElementById('new-batsman-modal');
    if (!modal) return;

    const select = document.getElementById('new-batsman-select');
    select.innerHTML = '';

    const inn = getActiveInnings();
    inn.battingCard.forEach((b, index) => {
        if (b.status === 'DNB') {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = b.name;
            select.appendChild(opt);
        }
    });

    modal.classList.add('active');
}

// Confirm new batsman
function selectNewBatsman() {
    const select = document.getElementById('new-batsman-select');
    const index = parseInt(select.value);
    const inn = getActiveInnings();

    if (!isNaN(index) && inn.battingCard[index]) {
        inn.battingCard[index].status = 'Not Out';
        state.strikerIndex = index;
        document.getElementById('new-batsman-modal').classList.remove('active');
        
        checkOverComplete();
        checkMatchStatus();
        saveAndSync();
        updateUI();
    }
}

// Check if current over is finished
function checkOverComplete() {
    const inn = getActiveInnings();
    
    // Count valid balls in this over (ignoring Wides and No Balls)
    const validBallsThisOver = inn.thisOverBalls.filter(b => b.type !== 'wide' && b.type !== 'noball').length;

    if (validBallsThisOver === 6) {
        // Check Bowler Maiden Over
        const bowler = inn.bowlingCard[state.currentBowlerIndex];
        // If bowler conceded 0 runs in the current over's valid balls, mark maiden
        // Quick simple logic: check this over's bowler runs count
        let runsConcededThisOver = 0;
        inn.thisOverBalls.forEach(ball => {
            if (ball.type === 'run') runsConcededThisOver += ball.val;
            if (ball.type === 'wide') {
                // Wide run counts as bowler runs
                const valStr = ball.val.toString();
                const runMatch = valStr.match(/\+(\d+)/);
                const extraVal = runMatch ? parseInt(runMatch[1]) : 0;
                runsConcededThisOver += 1 + extraVal;
            }
            if (ball.type === 'noball') {
                const valStr = ball.val.toString();
                const runMatch = valStr.match(/\+(\d+)/);
                const extraVal = runMatch ? parseInt(runMatch[1]) : 0;
                runsConcededThisOver += 1 + extraVal;
            }
        });
        
        if (runsConcededThisOver === 0 && bowler) {
            bowler.maidens += 1;
        }

        // Save and reset thisOverBalls
        inn.thisOverBalls = [];

        // Swap Strike on Over End
        swapStrike();

        // Check if max overs reached
        const currentOverNumber = Math.floor(inn.ballsBowled / 6);
        if (currentOverNumber >= state.matchSetup.maxOvers) {
            endInnings();
        } else {
            // Show new bowler modal
            showNewBowlerModal();
        }
    }
}

// Show new bowler selection modal
function showNewBowlerModal() {
    const modal = document.getElementById('new-bowler-modal');
    if (!modal) return;

    const select = document.getElementById('new-bowler-select');
    select.innerHTML = '';

    const inn = getActiveInnings();
    inn.bowlingCard.forEach((b, index) => {
        // Allow select anyone except the bowler who just finished (optional standard rule, but let's allow all for flexibility)
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = `${b.name} (${b.overs} Ov, ${b.wickets} W)`;
        if (index === state.currentBowlerIndex) {
            opt.textContent += ' (Just Bowled)';
        }
        select.appendChild(opt);
    });

    // Select different bowler by default if possible
    if (inn.bowlingCard.length > 1) {
        const nextBowler = (state.currentBowlerIndex + 1) % inn.bowlingCard.length;
        select.value = nextBowler;
    }

    modal.classList.add('active');
}

// Confirm new bowler
function selectNewBowler() {
    const select = document.getElementById('new-bowler-select');
    const index = parseInt(select.value);
    const inn = getActiveInnings();

    if (!isNaN(index) && inn.bowlingCard[index]) {
        state.currentBowlerIndex = index;
        document.getElementById('new-bowler-modal').classList.remove('active');
        
        saveAndSync();
        updateUI();
    }
}

// End of an Innings
function endInnings() {
    if (state.innings === 1) {
        state.innings = 2;
        state.target = state.inn1.totalRuns + 1;
        
        // Swap Batting/Bowling Roles
        const temp = state.currentBattingTeam;
        state.currentBattingTeam = state.currentBowlingTeam;
        state.currentBowlingTeam = temp;

        // Initialize Innings 2 cards
        initializeInningsData();

        alert(`Innings 1 Complete! ${state.currentBowlingTeam} scored ${state.inn1.totalRuns}/${state.inn1.wickets}.\nTarget for ${state.currentBattingTeam}: ${state.target} runs in ${state.matchSetup.maxOvers} overs.`);
    } else {
        checkMatchStatus(true); // Force match end check
    }
    saveAndSync();
    updateUI();
}

// Check match results
function checkMatchStatus(forceEnd = false) {
    const inn = getActiveInnings();
    
    if (state.innings === 2) {
        const target = state.target;
        
        if (inn.totalRuns >= target) {
            // Chasing team wins
            state.matchEnded = true;
            const wicketsLeft = 10 - inn.wickets;
            state.matchResult = `${state.currentBattingTeam} won by ${wicketsLeft} wicket${wicketsLeft > 1 ? 's' : ''}`;
        } else if (inn.wickets >= 10 || Math.floor(inn.ballsBowled / 6) >= state.matchSetup.maxOvers || forceEnd) {
            // Defending team wins or match tied
            state.matchEnded = true;
            if (inn.totalRuns === target - 1) {
                state.matchResult = 'Match Tied!';
            } else {
                const runsDefended = target - 1 - inn.totalRuns;
                state.matchResult = `${state.currentBowlingTeam} won by ${runsDefended} run${runsDefended > 1 ? 's' : ''}`;
            }
        }
    } else if (forceEnd) {
        state.matchEnded = true;
        state.matchResult = 'Match ended prematurely.';
    }
}

// Undo action
function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify(state));
    state = JSON.parse(undoStack.pop());
    saveAndSync();
    updateUI();
}

// Redo action
function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(state));
    state = JSON.parse(redoStack.pop());
    saveAndSync();
    updateUI();
}

// Reset match completely
function resetMatch() {
    if (confirm('Are you sure you want to reset this match? All data will be lost.')) {
        state = getInitialState();
        undoStack = [];
        redoStack = [];
        saveAndSync();
        updateUI();
    }
}

// Load Demo Match Data for testing
function loadDemoMatch() {
    pushToUndo();
    state = getInitialState();
    
    state.matchSetup = {
        team1Name: 'India',
        team2Name: 'Pakistan',
        maxOvers: 20,
        tossWinner: 'India',
        tossDecision: 'bat',
        team1Players: ['Rohit Sharma', 'Yashasvi Jaiswal', 'Virat Kohli', 'Suryakumar Yadav', 'Rishabh Pant', 'Hardik Pandya', 'Ravindra Jadeja', 'Axar Patel', 'Kuldeep Yadav', 'Jasprit Bumrah', 'Arshdeep Singh'],
        team2Players: ['Babar Azam', 'Mohammad Rizwan', 'Fakhar Zaman', 'Usman Khan', 'Iftikhar Ahmed', 'Imad Wasim', 'Shadab Khan', 'Shaheen Afridi', 'Naseem Shah', 'Haris Rauf', 'Mohammad Amir']
    };
    state.setupComplete = true;
    state.innings = 2; // Let's set it in the 2nd innings chase for excitement!
    state.currentBattingTeam = 'Pakistan';
    state.currentBowlingTeam = 'India';
    state.target = 182; // India scored 181/6
    
    // Set up Innings 1 state (India scorecard)
    state.inn1 = {
        totalRuns: 181,
        wickets: 6,
        ballsBowled: 120,
        extras: { wide: 4, noball: 1, bye: 2, legbye: 1 },
        battingCard: [
            { name: 'Rohit Sharma', status: 'Out (Caught)', runs: 38, balls: 24, fours: 4, sixes: 2 },
            { name: 'Yashasvi Jaiswal', status: 'Out (Bowled)', runs: 42, balls: 28, fours: 5, sixes: 1 },
            { name: 'Virat Kohli', status: 'Out (LBW)', runs: 54, balls: 38, fours: 3, sixes: 2 },
            { name: 'Suryakumar Yadav', status: 'Out (Caught)', runs: 22, balls: 14, fours: 2, sixes: 1 },
            { name: 'Rishabh Pant', status: 'Not Out', runs: 12, balls: 9, fours: 1, sixes: 0 },
            { name: 'Hardik Pandya', status: 'Out (Run Out)', runs: 5, balls: 4, fours: 0, sixes: 0 },
            { name: 'Ravindra Jadeja', status: 'Not Out', runs: 0, balls: 3, fours: 0, sixes: 0 },
            { name: 'Axar Patel', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Kuldeep Yadav', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Jasprit Bumrah', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Arshdeep Singh', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 }
        ],
        bowlingCard: [
            { name: 'Shaheen Afridi', overs: '4.0', balls: 24, maidens: 0, runs: 38, wickets: 2 },
            { name: 'Naseem Shah', overs: '4.0', balls: 24, maidens: 0, runs: 32, wickets: 1 },
            { name: 'Mohammad Amir', overs: '4.0', balls: 24, maidens: 0, runs: 28, wickets: 1 },
            { name: 'Haris Rauf', overs: '4.0', balls: 24, maidens: 0, runs: 45, wickets: 1 },
            { name: 'Shadab Khan', overs: '4.0', balls: 24, maidens: 0, runs: 30, wickets: 0 }
        ],
        fallOfWickets: [
            { score: 55, wickets: 1, over: '6.2', batsman: 'Rohit Sharma' },
            { score: 98, wickets: 2, over: '11.4', batsman: 'Yashasvi Jaiswal' },
            { score: 146, wickets: 3, over: '16.1', batsman: 'Suryakumar Yadav' },
            { score: 172, wickets: 4, over: '18.4', batsman: 'Virat Kohli' },
            { score: 181, wickets: 5, over: '19.5', batsman: 'Hardik Pandya' }
        ],
        commentary: [
            { over: '20.0', text: 'End of Innings 1. India finishes at 181/6.', type: 'normal' }
        ],
        thisOverBalls: []
    };

    // Set up Innings 2 state (Pakistan chasing, e.g. 170/4 after 19 overs!)
    state.inn2 = {
        totalRuns: 170,
        wickets: 4,
        ballsBowled: 114, // 19.0 overs
        extras: { wide: 3, noball: 0, bye: 1, legbye: 2 },
        battingCard: [
            { name: 'Babar Azam', status: 'Out (Caught)', runs: 45, balls: 32, fours: 4, sixes: 1 },
            { name: 'Mohammad Rizwan', status: 'Out (LBW)', runs: 58, balls: 44, fours: 5, sixes: 2 },
            { name: 'Fakhar Zaman', status: 'Not Out', runs: 38, balls: 24, fours: 2, sixes: 2 },
            { name: 'Usman Khan', status: 'Out (Bowled)', runs: 12, balls: 8, fours: 1, sixes: 0 },
            { name: 'Iftikhar Ahmed', status: 'Not Out', runs: 11, balls: 6, fours: 1, sixes: 0 },
            { name: 'Imad Wasim', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Shadab Khan', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Shaheen Afridi', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Naseem Shah', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Haris Rauf', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 },
            { name: 'Mohammad Amir', status: 'DNB', runs: 0, balls: 0, fours: 0, sixes: 0 }
        ],
        bowlingCard: [
            { name: 'Jasprit Bumrah', overs: '4.0', balls: 24, maidens: 1, runs: 18, wickets: 2 },
            { name: 'Arshdeep Singh', overs: '3.0', balls: 18, maidens: 0, runs: 35, wickets: 1 },
            { name: 'Hardik Pandya', overs: '4.0', balls: 24, maidens: 0, runs: 42, wickets: 1 },
            { name: 'Ravindra Jadeja', overs: '4.0', balls: 24, maidens: 0, runs: 38, wickets: 0 },
            { name: 'Kuldeep Yadav', overs: '4.0', balls: 24, maidens: 0, runs: 31, wickets: 0 }
        ],
        fallOfWickets: [
            { score: 85, wickets: 1, over: '10.2', batsman: 'Babar Azam' },
            { score: 124, wickets: 2, over: '14.5', batsman: 'Mohammad Rizwan' },
            { score: 148, wickets: 3, over: '17.1', batsman: 'Usman Khan' }
        ],
        commentary: [
            { over: '19.0', text: 'Over ends. Pakistan requires 12 runs off the final over.', type: 'normal' }
        ],
        thisOverBalls: []
    };

    state.strikerIndex = 2; // Fakhar Zaman
    state.nonStrikerIndex = 4; // Iftikhar Ahmed
    state.currentBowlerIndex = 1; // Arshdeep Singh to bowl the final over! (overs: 3.0, balls: 18)

    saveAndSync();
    updateUI();
}

// UI Updating functions (only active on dashboard index.html)
function updateUI() {
    const isDashboard = document.getElementById('dashboard-scorer-panel') !== null;
    if (!isDashboard) return;

    if (!state.setupComplete) {
        document.getElementById('setup-panel').style.display = 'block';
        document.getElementById('dashboard-scorer-panel').style.display = 'none';
        return;
    }

    document.getElementById('setup-panel').style.display = 'none';
    document.getElementById('dashboard-scorer-panel').style.display = 'grid';

    const inn = getActiveInnings();

    // 1. Header & Quick Info
    document.getElementById('display-batting-team').textContent = state.currentBattingTeam;
    document.getElementById('display-bowling-team').textContent = state.currentBowlingTeam;
    document.getElementById('display-innings').textContent = `Innings ${state.innings}`;

    // 2. Score Banner
    document.getElementById('display-score').textContent = `${inn.totalRuns}/${inn.wickets}`;
    document.getElementById('display-overs').textContent = `(${formatOvers(inn.ballsBowled)} Overs)`;
    
    // CRR (Current Run Rate)
    const crr = inn.ballsBowled > 0 ? ((inn.totalRuns / inn.ballsBowled) * 6).toFixed(2) : '0.00';
    document.getElementById('display-crr').textContent = crr;

    // RRR / Target / Result Banner
    const targetBox = document.getElementById('target-rrr-box');
    const resultBox = document.getElementById('match-result-box');
    
    if (state.matchEnded) {
        targetBox.style.display = 'none';
        resultBox.style.display = 'block';
        document.getElementById('display-result').textContent = state.matchResult;
    } else if (state.innings === 2) {
        targetBox.style.display = 'flex';
        resultBox.style.display = 'none';
        
        document.getElementById('display-target').textContent = state.target;
        const runsNeeded = state.target - inn.totalRuns;
        const ballsRemaining = (state.matchSetup.maxOvers * 6) - inn.ballsBowled;
        const rrr = ballsRemaining > 0 ? ((runsNeeded / ballsRemaining) * 6).toFixed(2) : '0.00';
        
        document.getElementById('display-rrr').textContent = rrr;
        document.getElementById('display-runs-needed').textContent = runsNeeded;
        document.getElementById('display-balls-remaining').textContent = ballsRemaining;
    } else {
        targetBox.style.display = 'none';
        resultBox.style.display = 'none';
    }

    // 3. Batting Scorecard Table
    const batBody = document.getElementById('live-batters-body');
    batBody.innerHTML = '';
    
    const striker = inn.battingCard[state.strikerIndex];
    const nonStriker = inn.battingCard[state.nonStrikerIndex];

    if (striker) {
        const sr = striker.balls > 0 ? ((striker.runs / striker.balls) * 100).toFixed(1) : '0.0';
        const row = document.createElement('tr');
        row.className = 'active-row';
        row.innerHTML = `
            <td><span class="striker-dot"></span>${striker.name}</td>
            <td><strong>${striker.runs}</strong></td>
            <td>${striker.balls}</td>
            <td>${striker.fours}</td>
            <td>${striker.sixes}</td>
            <td>${sr}</td>
        `;
        batBody.appendChild(row);
    }
    if (nonStriker) {
        const sr = nonStriker.balls > 0 ? ((nonStriker.runs / nonStriker.balls) * 100).toFixed(1) : '0.0';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${nonStriker.name}</td>
            <td><strong>${nonStriker.runs}</strong></td>
            <td>${nonStriker.balls}</td>
            <td>${nonStriker.fours}</td>
            <td>${nonStriker.sixes}</td>
            <td>${sr}</td>
        `;
        batBody.appendChild(row);
    }

    // 4. Bowling Scorecard Table
    const bowlBody = document.getElementById('live-bowler-body');
    bowlBody.innerHTML = '';
    
    const bowler = inn.bowlingCard[state.currentBowlerIndex];
    if (bowler) {
        const econ = bowler.balls > 0 ? ((bowler.runs / bowler.balls) * 6).toFixed(2) : '0.00';
        const row = document.createElement('tr');
        row.className = 'active-row';
        row.innerHTML = `
            <td>${bowler.name}</td>
            <td><strong>${bowler.overs}</strong></td>
            <td>${bowler.maidens}</td>
            <td>${bowler.runs}</td>
            <td><strong>${bowler.wickets}</strong></td>
            <td>${econ}</td>
        `;
        bowlBody.appendChild(row);
    }

    // 5. Extras Summary
    document.getElementById('display-extras').textContent = 
        `WD: ${inn.extras.wide}, NB: ${inn.extras.noball}, BY: ${inn.extras.bye}, LB: ${inn.extras.legbye}`;

    // 6. Over Timeline Balls
    const ballsTimeline = document.getElementById('display-timeline-balls');
    ballsTimeline.innerHTML = '';
    inn.thisOverBalls.forEach(ball => {
        const bDiv = document.createElement('div');
        bDiv.className = 'timeline-ball';
        
        let valText = ball.val;
        if (ball.type === 'wicket') {
            bDiv.className += ' wicket-ball';
        } else if (ball.type === 'wide' || ball.type === 'noball') {
            bDiv.className += ' extra-ball';
        } else {
            if (ball.val === 4) bDiv.className += ' runs-4';
            if (ball.val === 6) bDiv.className += ' runs-6';
        }
        
        bDiv.textContent = valText;
        ballsTimeline.appendChild(bDiv);
    });

    if (inn.thisOverBalls.length === 0) {
        ballsTimeline.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Ready to bowl</span>';
    }

    // 7. Recent Commentary Logs
    const logBox = document.getElementById('commentary-logs');
    logBox.innerHTML = '';
    
    inn.commentary.slice(0, 10).forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        
        let resultBadge = '';
        if (log.type === 'four') resultBadge = '<span class="log-result four">FOUR</span>';
        if (log.type === 'six') resultBadge = '<span class="log-result six">SIX</span>';
        if (log.type === 'out') resultBadge = '<span class="log-result out">OUT</span>';
        if (log.type === 'extra') resultBadge = '<span class="log-result" style="background-color: var(--warning); color: var(--bg-dark);">EXTRA</span>';

        item.innerHTML = `
            <div>
                <span class="log-over-num">Ov ${log.over}</span>
                <span class="log-text">${log.text}</span>
            </div>
            ${resultBadge}
        `;
        logBox.appendChild(item);
    });

    // 8. Undo/Redo button disable properties
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

// Handle Form Submission for Match Setup
function handleSetupSubmit(e) {
    e.preventDefault();
    pushToUndo();

    const t1 = document.getElementById('team1-name-input').value.trim() || 'Team A';
    const t2 = document.getElementById('team2-name-input').value.trim() || 'Team B';
    const overs = parseInt(document.getElementById('overs-input').value) || 20;
    const toss = document.getElementById('toss-winner-select').value === 'team1' ? t1 : t2;
    const decision = document.getElementById('toss-decision-select').value;

    state.matchSetup.team1Name = t1;
    state.matchSetup.team2Name = t2;
    state.matchSetup.maxOvers = overs;
    state.matchSetup.tossWinner = toss;
    state.matchSetup.tossDecision = decision;

    // Parse player lists
    const t1PlayersText = document.getElementById('team1-players-input').value.trim();
    if (t1PlayersText) {
        state.matchSetup.team1Players = t1PlayersText.split(',').map(name => name.trim()).filter(Boolean);
    }
    const t2PlayersText = document.getElementById('team2-players-input').value.trim();
    if (t2PlayersText) {
        state.matchSetup.team2Players = t2PlayersText.split(',').map(name => name.trim()).filter(Boolean);
    }

    state.setupComplete = true;

    // Determine starting batting/bowling team based on toss & decision
    if (toss === t1) {
        if (decision === 'bat') {
            state.currentBattingTeam = t1;
            state.currentBowlingTeam = t2;
        } else {
            state.currentBattingTeam = t2;
            state.currentBowlingTeam = t1;
        }
    } else {
        if (decision === 'bat') {
            state.currentBattingTeam = t2;
            state.currentBowlingTeam = t1;
        } else {
            state.currentBattingTeam = t1;
            state.currentBowlingTeam = t2;
        }
    }

    initializeInningsData();
    saveAndSync();
    updateUI();
}

// Sync team name drop downs on setup
function handleTeamNamesSetupInput() {
    const t1Input = document.getElementById('team1-name-input');
    const t2Input = document.getElementById('team2-name-input');
    const tossSelect = document.getElementById('toss-winner-select');

    if (t1Input && t2Input && tossSelect) {
        const val1 = t1Input.value.trim() || 'Team A';
        const val2 = t2Input.value.trim() || 'Team B';
        
        tossSelect.options[0].text = val1;
        tossSelect.options[1].text = val2;
    }
}

// Toggles active striker & non-striker manually
function toggleStrikeManually() {
    pushToUndo();
    swapStrike();
    saveAndSync();
    updateUI();
}

// Setup Event Listeners for DOM elements (run once page loads)
window.addEventListener('DOMContentLoaded', () => {
    // Check if we are on dashboard page
    const setupForm = document.getElementById('match-setup-form');
    if (setupForm) {
        setupForm.addEventListener('submit', handleSetupSubmit);
        
        document.getElementById('team1-name-input').addEventListener('input', handleTeamNamesSetupInput);
        document.getElementById('team2-name-input').addEventListener('input', handleTeamNamesSetupInput);

        // Load persisted state if exists
        const saved = localStorage.getItem('crickmitra_match_state');
        if (saved) {
            try {
                state = JSON.parse(saved);
                updateUI();
            } catch (e) {
                console.error('Failed to parse saved match state', e);
            }
        } else {
            updateUI();
        }
    }
});

// Broadcast listener to update state in other tabs (overlay/fullscreen)
if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'STATE_UPDATE') {
            state = event.data.state;
            
            // If on broadcast page (overlay or fullscreen), trigger render
            if (typeof renderOverlay === 'function') {
                renderOverlay();
            }
            if (typeof renderFullscreen === 'function') {
                renderFullscreen();
            }
            // If on main page, update dashboard UI
            updateUI();
        }
    };
}

// Storage event listener fallback (for Safari / older browsers)
window.addEventListener('storage', (event) => {
    if (event.key === 'crickmitra_match_state' && event.newValue) {
        try {
            state = JSON.parse(event.newValue);
            if (typeof renderOverlay === 'function') renderOverlay();
            if (typeof renderFullscreen === 'function') renderFullscreen();
            updateUI();
        } catch (e) {
            console.error('Failed to parse storage event state', e);
        }
    }
});
